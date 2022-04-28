import { LifeStage } from "./tick_occurrence";
import { DeerTick, TickData } from "./tick_data";

export class TickReportData extends TickData {
  filepath: string;
  avgFeedingHours: Record<string, Record<string, number>>;

  constructor(filepath: string) {
    super();
    this.filepath = filepath;
    // Derived from TickCheck data.
    this.avgFeedingHours = {
      larva: {
        unengorged: 3,
        "semi-engorged": 37,
        "fully engorged": 98,
      },
      nymph: {
        unengorged: 4,
        "semi-engorged": 33,
        "fully engorged": 99,
      },
      adult: {
        unengorged: 7,
        "semi-engorged": 57,
        "fully engorged": 99,
      },
    };
  }

  async load() {
    await this.processRows(this.filepath);
    // no need for postprocessing
  }

  protected _createRecord(row: any) {
    const tickID = row["Tid"].trim();
    const species = row["Species"].trim();
    if (species !== DeerTick) return null;
    const normLifeStage = this._norm(row["Stage"]);
    if (normLifeStage === null) return null;
    const lifeStage = this._toLifeStage(normLifeStage);
    if (lifeStage == null) return null;
    const normFeedingState = this._norm(row["Feeding state"]);
    if (normFeedingState === null) return null;
    const feedingHours = this._toFeedingHours(lifeStage, normFeedingState);
    if (feedingHours == null) return null;
    const zipCode = parseInt(row["Location Zip Code"].trim());
    if (isNaN(zipCode) || zipCode < 0 || zipCode >= 100000) {
      return null;
    }
    const rawRemovedDate = this._norm(row["Tick Removed Date"]);
    if (rawRemovedDate === null) return null;

    let encounterDate: Date;
    try {
      encounterDate = this._toEncounterDate(
        new Date(rawRemovedDate),
        feedingHours
      );
    } catch (_err) {
      return null;
    }

    return {
      tickID,
      source: "TickReport",
      species,
      lifeStage: lifeStage,
      year: encounterDate.getUTCFullYear(),
      month: encounterDate.getUTCMonth() + 1, // 1 - 12
      day: encounterDate.getUTCDate(), // 1 - 31
      zipCode: zipCode,
    };
  }

  private _toLifeStage(normLifeStage: string): LifeStage | null {
    switch (normLifeStage) {
      case "larva":
        return LifeStage.larva;
      case "nymph":
        return LifeStage.nymph;
      case "adult":
        return LifeStage.adult;
      default:
        return null;
    }
  }

  private _toFeedingHours(
    lifeStage: LifeStage,
    normFeedingState: string
  ): number | null {
    const lifeStageHours = this.avgFeedingHours[lifeStage];
    switch (normFeedingState) {
      case "flat":
        return lifeStageHours["unengorged"];
      case "partially fed":
        return lifeStageHours["semi-engorged"];
      case "engorged":
        return Math.round(
          (lifeStageHours["semi-engorged"] + lifeStageHours["fully engorged"]) /
            2
        );
      case "replete":
        return lifeStageHours["fully engorged"];
      default:
        return null;
    }
  }
}
