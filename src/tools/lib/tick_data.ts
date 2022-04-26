import * as fs from "fs";
import { parse as parseCSV } from "@fast-csv/parse";

const HOUR_TICK_FOUND = (23 + 7) / 2; // halfway bewteen 7am and 11pm
const MINS_UNTIL_FEEDING = 30;
const MILLIS_PER_HOUR = 60 * 60 * 1000;

export const DeerTick = "Ixodes scapularis";

export enum LifeStage {
  nymph,
  adult,
  larva,
}

export interface TickRecord {
  tickId: string;
  source: string;
  species: string;
  lifeStage: LifeStage;
  year: number;
  month: number;
  day: number;
  zipCode: number;
}

export abstract class TickData {
  records: TickRecord[] = [];

  async processRows(filepath: string) {
    return new Promise<void>((resolve, reject) => {
      fs.createReadStream(filepath)
        .pipe(parseCSV({ headers: true }))
        .on("data", (row) => {
          const record = this._createRecord(row);
          if (record) this.records.push(record);
        })
        .on("end", () => resolve())
        .on("error", (err) => {
          console.log("Streaming error:", err);
          reject(err);
        });
    });
  }

  protected abstract _createRecord(row: any): TickRecord | null;

  protected _norm(value: string): string | null {
    value = value.trim().toLowerCase();
    return value == "" ? null : value;
  }

  protected _toEncounterDate(date: Date, feedingHours: number): Date {
    const utc = date.toUTCString();
    const utcT0 = utc.substring(0, utc.indexOf("T")) + "T00:00:00.000Z";
    const date0 = new Date(utcT0);
    const middayMillis = date0.getTime() + HOUR_TICK_FOUND * MILLIS_PER_HOUR;
    return new Date(middayMillis - feedingHours - MINS_UNTIL_FEEDING);
  }
}
