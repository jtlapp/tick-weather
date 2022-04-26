import { LifeStage, TickData, DeerTick } from "./tick_data";

interface DatelessRecord {
  tickId: string;
  species: string;
  lifeStage: LifeStage;
  engorgement: string;
  orderDate: Date;
  zipCode: number;
}

export class TickCheckData extends TickData {
  avgFeedingHours: Record<string, number> = {};

  _filepath: string;
  _totalFeedingHoursAndRecords: Record<string, number[]>;
  _totalOrderDiffAndRecords: Record<string, number[]>;
  _datelessRecords: DatelessRecord[] = [];

  constructor(filepath: string) {
    super();
    this._filepath = filepath;
    this._totalFeedingHoursAndRecords = {
      unengorged: [0, 0],
      "semi-engorged": [0, 0],
      "fully engorged": [0, 0],
    };
    this._totalOrderDiffAndRecords = {
      unengorged: [0, 0],
      "semi-engorged": [0, 0],
      "fully engorged": [0, 0],
    };
  }

  async load() {
    await this.processRows(this._filepath);

    for (const [engorgement, totals] of Object.entries(
      this._totalFeedingHoursAndRecords
    )) {
      this.avgFeedingHours[engorgement] = Math.round(totals[0] / totals[1]);
    }

    const avgOrderDiffMillis: Record<string, number> = {};
    for (const [engorgement, totals] of Object.entries(
      this._totalOrderDiffAndRecords
    )) {
      avgOrderDiffMillis[engorgement] = Math.round(totals[0] / totals[1]);
    }

    for (const record of this._datelessRecords) {
      const encounterDate = new Date(
        record.orderDate.getTime() - avgOrderDiffMillis[record.engorgement]
      );
      this.records.push({
        tickId: record.tickId,
        source: "TickCheck",
        species: record.species,
        lifeStage: record.lifeStage,
        year: encounterDate.getUTCFullYear(),
        month: encounterDate.getUTCMonth(),
        day: encounterDate.getUTCDay(),
        zipCode: record.zipCode,
      });
    }
  }

  protected _createRecord(row: any) {
    const rawTickID = row["Tid"].trim();
    const orderCreatedAt = this._norm(row["order_created_at"]);
    if (orderCreatedAt === null) return null;
    const rawSpecies = row["tick_type_binomial_name"].trim();
    if (rawSpecies !== DeerTick) return null;
    const normLifeStage = this._norm(row["tick_type_binomial_name"]);
    if (normLifeStage === null) return null;
    const normEngorgement = this._norm(row["engorgement_level"]);
    const normEngorgementTime = this._norm(row["engorgement_time"]);
    let engorgementTime = 0;
    if (normEngorgementTime === null || normEngorgementTime === "0") {
      engorgementTime = 3.5;
      if (normEngorgement !== "unengorged") {
        throw Error("Violates assumption that null or 0 time is unengorged");
      }
    } else {
      engorgementTime = parseInt(normEngorgementTime);
      if (
        isNaN(engorgementTime) ||
        engorgementTime < 0 ||
        engorgementTime > 100
      ) {
        return null;
      }
    }
    const lifeStage = this._toLifeStage(normLifeStage);
    if (lifeStage == null) return null;
    const zipcode = parseInt(row["zip"].trim());
    if (isNaN(zipcode) || zipcode < 0 || zipcode >= 100000) {
      return null;
    }
    const rawFoundDate = this._norm(row["tick_found_date"]);
    let foundDate: Date | null = null;
    if (rawFoundDate !== null) {
      try {
        foundDate = new Date(rawFoundDate);
      } catch (err) {
        // ignore
      }
    }

    if (normEngorgement !== null) {
      const engorgementTotals =
        this._totalFeedingHoursAndRecords[normEngorgement];
      if (engorgementTotals !== undefined) {
        engorgementTotals[0] += engorgementTime;
        ++engorgementTotals[1];
      }
      if (foundDate !== null) {
        const timeDiffTotals = this._totalOrderDiffAndRecords[normEngorgement];
        if (timeDiffTotals !== undefined) {
          timeDiffTotals[0] +=
            new Date(orderCreatedAt).getTime() - foundDate.getTime();
          ++timeDiffTotals[1];
        }
      }
    }

    if (rawFoundDate === null) {
      if (normEngorgement !== null) {
        this._datelessRecords.push({
          tickId: rawTickID,
          species: rawSpecies,
          lifeStage: lifeStage,
          engorgement: normEngorgement,
          orderDate: new Date(orderCreatedAt),
          zipCode: zipcode,
        });
      }
      return null;
    } else {
      let encounterDate: Date;
      try {
        encounterDate = this._toEncounterDate(
          new Date(rawFoundDate),
          engorgementTime
        );
      } catch (_err) {
        return null;
      }

      return {
        tickId: rawTickID,
        source: "TickCheck",
        species: rawSpecies,
        lifeStage: lifeStage,
        year: encounterDate.getUTCFullYear(),
        month: encounterDate.getUTCMonth(),
        day: encounterDate.getUTCDay(),
        zipCode: zipcode,
      };
    }
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
