import { DeerTick, LifeStage, TickData } from "./tick_data";

export class TickReportData extends TickData {
  filepath: string;
  feedingHours: Record<string, number>;

  constructor(filepath: string) {
    super();
    this.filepath = filepath;
    // TODO: Get averages from the TickCheck data.
    this.feedingHours = {
      flat: 0,
      "partially fed": 0,
      engorged: 0,
      replete: 0,
    };
  }

  async load() {
    await this.processRows(this.filepath);
    // no need for postprocessing
  }

  protected _createRecord(row: any) {
    const rawSpecies = row["Species"].trim();
    if (rawSpecies !== DeerTick) return null;
    const normLifeStage = this._norm(row["Stage"]);
    if (normLifeStage === null) return null;
    const lifeStage = this._toLifeStage(normLifeStage);
    if (lifeStage == null) return null;
    const feedingState = this._norm(row["Feeding state"]);
    if (feedingState === null) return null;
    const zipcode = parseInt(row["Location Zip"].trim());
    if (isNaN(zipcode) || zipcode < 0 || zipcode >= 100000) {
      return null;
    }
    const rawRemovedDate = this._norm(row["Tick Removed Date"]);
    if (rawRemovedDate === null) return null;
    const rawTickID = row["Tid"].trim();

    let encounterDate: Date;
    try {
      encounterDate = this._toEncounterDate(
        new Date(rawRemovedDate),
        this.feedingHours[feedingState]
      );
    } catch (_err) {
      return null;
    }

    return {
      tickId: rawTickID,
      source: "TickReport",
      species: rawSpecies,
      lifeStage: lifeStage,
      year: encounterDate.getUTCFullYear(),
      month: encounterDate.getUTCMonth(),
      day: encounterDate.getUTCDay(),
      zipCode: zipcode,
    };
  }

  private _toLifeStage(rawLifeStage: string): LifeStage | null {
    switch (rawLifeStage) {
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
}
