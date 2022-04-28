import { LifeStage } from "./tick_occurrence";
import { MILLIS_PER_HOUR, TickData, DeerTick } from "./tick_data";

const MAX_ORDER_FOUND_DATE_DIFF_DAYS = 4;

interface IncompleteRecord {
  tickID: string;
  foundDate: Date | null;
  species: string;
  lifeStage: LifeStage;
  engorgementLabel: string;
  engorgementHours: number;
  orderDate: Date;
  zipCode: number;
}

export class TickCheckData extends TickData {
  // hours indexed by stage and then engorgement label
  avgFeedingHours: Record<string, Record<string, number>> = {};
  // millis diff indexed by stage and then engorgement label
  avgOrderDiffMillis: Record<string, Record<string, number>> = {};

  _filepath: string;
  // totals indexed by stage and then engorgement label
  _totalFeedingHoursAndRecords: Record<string, Record<string, number[]>> = {};
  _totalOrderDiffAndRecords: Record<string, Record<string, number[]>> = {};
  _incompleteRecords: IncompleteRecord[] = [];

  constructor(filepath: string) {
    super();
    this._filepath = filepath;
    for (const lifeStage of Object.keys(LifeStage)) {
      this._totalFeedingHoursAndRecords[lifeStage] = {
        unengorged: [0, 0],
        "semi-engorged": [0, 0],
        "fully engorged": [0, 0],
      };
      this._totalOrderDiffAndRecords[lifeStage] = {
        unengorged: [0, 0],
        "semi-engorged": [0, 0],
        "fully engorged": [0, 0],
      };
    }
  }

  async load() {
    // Load all of the TickCheck data rows.

    await this.processRows(this._filepath);

    // Determine average feeding time as a function of life stage and
    // engorgement label. I'll use this information to estimate engorgement
    // durations in TickReport data, which only provides engorgement labels.

    for (const lifeStage of Object.keys(LifeStage)) {
      for (const [engorgementLabel, totals] of Object.entries(
        this._totalFeedingHoursAndRecords[lifeStage]
      )) {
        let lifeStageHours = this.avgFeedingHours[lifeStage];
        if (!lifeStageHours) {
          lifeStageHours = {};
          this.avgFeedingHours[lifeStage] = lifeStageHours;
        }
        lifeStageHours[engorgementLabel] = Math.round(totals[0] / totals[1]);
      }
    }

    // Determine average time between time order placed and time tick was
    // discovered as a function of life stage and engorgement label. I'll
    // use this information to estimate tick encounter time in TickCheck
    // records that do not provide a tick encounter time.

    for (const lifeStage of Object.keys(LifeStage)) {
      for (const [engorgementLabel, totals] of Object.entries(
        this._totalOrderDiffAndRecords[lifeStage]
      )) {
        let lifeStageDiffs = this.avgOrderDiffMillis[lifeStage];
        if (!lifeStageDiffs) {
          lifeStageDiffs = {};
          this.avgOrderDiffMillis[lifeStage] = lifeStageDiffs;
        }
        lifeStageDiffs[engorgementLabel] = Math.round(totals[0] / totals[1]);
      }
    }

    // Generate complete records from incomplete records using the
    // above-established averages as estimates.

    for (const record of this._incompleteRecords) {
      let estimatedFoundDate = record.foundDate;
      if (!estimatedFoundDate) {
        estimatedFoundDate = new Date(
          record.orderDate.getTime() -
            this.avgOrderDiffMillis[record.lifeStage][record.engorgementLabel]
        );
      }
      let engorgementHours = record.engorgementHours;
      if (record.engorgementLabel != "unengorged" && !engorgementHours) {
        const lifeStageHours = this.avgFeedingHours[record.lifeStage];
        engorgementHours = lifeStageHours[record.engorgementLabel];
      }
      const encounterDate = this._toEncounterDate(
        estimatedFoundDate,
        engorgementHours
      );
      this.records.push({
        tickID: record.tickID,
        source: "TickCheck",
        species: record.species,
        lifeStage: record.lifeStage,
        year: encounterDate.getUTCFullYear(),
        month: encounterDate.getUTCMonth() + 1,
        day: encounterDate.getUTCDate(),
        zipCode: record.zipCode,
      });
    }

    // Assign engorgement hour estimates to engorged specimens without them.

    // for (const record of this.records) {
    //   if (record.
    // }
  }

  printInfo() {
    console.log(
      "avgFeedingHours:",
      JSON.stringify(this.avgFeedingHours, undefined, "  ")
    );
    const avgOrderDiffHours = Object.assign({}, this.avgOrderDiffMillis);
    for (const lifeStage of Object.keys(LifeStage)) {
      for (const [engorgementLabel, millis] of Object.entries(
        avgOrderDiffHours[lifeStage]
      )) {
        avgOrderDiffHours[lifeStage][engorgementLabel] = Math.round(
          millis / MILLIS_PER_HOUR
        );
      }
    }
    console.log(
      "avgOrderDiffHours:",
      JSON.stringify(avgOrderDiffHours, undefined, "  ")
    );
  }

  protected _createRecord(row: any) {
    // Extract basic data from the row, returning null if it does not
    // meet the minimum requirements, in order ignore the data.

    const tickID = row["tick_id"].trim();
    const orderCreatedAt = this._norm(row["order_created_at"]);
    if (orderCreatedAt === null) return null;
    const species = row["tick_type_binomial_name"].trim();
    if (species !== DeerTick) return null;
    let engorgementLabel = this._norm(row["engorgement_level"]);
    if (engorgementLabel == null || engorgementLabel == "undetermined") {
      return null;
    }
    const normLifeStage = this._norm(row["life_stage"]);
    if (normLifeStage === null) return null;
    const lifeStage = this._toLifeStage(normLifeStage);
    if (lifeStage == null) return null;
    const zipCode = parseInt(row["zip"].trim());
    if (isNaN(zipCode) || zipCode < 0 || zipCode >= 100000) {
      return null;
    }
    const rawFoundDate = this._norm(row["tick_found_date"]);
    let foundDate: Date | null = null;
    if (rawFoundDate !== null) {
      try {
        foundDate = new Date(rawFoundDate);
      } catch (err) {
        // ignore parse error; foundDate will remain null
      }
    }

    // Determine the tick engorgement time.

    const rawEngorgementTime = row["engorgement_time"].trim();
    let engorgementHours = 0;
    if (engorgementLabel === "unengorged" && rawEngorgementTime === "") {
      // TickCheck folks said unengorged means between 0 and 7 hours.
      engorgementHours = 3.5;
    } else {
      engorgementHours = parseInt(rawEngorgementTime);
      if (
        isNaN(engorgementHours) ||
        engorgementHours < 0 ||
        engorgementHours > 100
      ) {
        return null;
      }
    }

    // Track engorgement time as a function of engorgement label. It seems
    // that engorgement is not always provided, so ignore zeros except for
    // unengorged specimens, which are assumed to have accurate hours.

    if (engorgementHours > 0 || engorgementLabel == "unengorged") {
      const engorgementTotals =
        this._totalFeedingHoursAndRecords[lifeStage][engorgementLabel];
      if (engorgementTotals !== undefined) {
        engorgementTotals[0] += engorgementHours;
        ++engorgementTotals[1];
      }
    }

    // Track difference between found date and order date as a function of
    // engorgement time.

    if (foundDate !== null) {
      const timeDiffTotals =
        this._totalOrderDiffAndRecords[lifeStage][engorgementLabel];
      if (timeDiffTotals !== undefined) {
        const orderFoundDiffMillis =
          new Date(orderCreatedAt).getTime() - foundDate.getTime();
        if (
          orderFoundDiffMillis >
          MAX_ORDER_FOUND_DATE_DIFF_DAYS * 24 * MILLIS_PER_HOUR
        ) {
          // ignore apparently bad data
          return null;
        }
        timeDiffTotals[0] += orderFoundDiffMillis;

        ++timeDiffTotals[1];
      }
    }

    // Collect records that lack found dates or engorgment hours for
    // processing later when these can be estimated.

    if (!rawFoundDate || !engorgementHours) {
      if (engorgementLabel !== null) {
        this._incompleteRecords.push({
          tickID,
          foundDate,
          species,
          lifeStage,
          engorgementLabel,
          engorgementHours,
          orderDate: new Date(orderCreatedAt),
          zipCode,
        });
      }
      return null;
    }

    // Determine the encounter date as a function of found date and
    // estimated engorgement time.

    let encounterDate: Date;
    try {
      encounterDate = this._toEncounterDate(
        new Date(rawFoundDate),
        engorgementHours
      );
    } catch (_err) {
      return null;
    }

    // Return a complete TickCheck record.

    return {
      tickID: tickID,
      source: "TickCheck",
      species: species,
      lifeStage,
      year: encounterDate.getUTCFullYear(),
      month: encounterDate.getUTCMonth() + 1, // 1 - 12
      day: encounterDate.getUTCDate(), // 1 - 31
      zipCode,
    };
  }

  private _toLifeStage(rawLifeStage: string): LifeStage | null {
    switch (rawLifeStage) {
      case "larvae":
        return LifeStage.larva;
      case "nymph":
        return LifeStage.nymph;
      case "adult female":
        return LifeStage.adult;
      case "adult male":
        return LifeStage.adult;
      default:
        return null;
    }
  }
}
