import * as fs from "fs";
import { parse as parseCSV } from "@fast-csv/parse";

export enum LifeStage {
  nymph = "nymph",
  adult = "adult",
  larva = "larva",
}

export interface TickOccurrence {
  tickID: string;
  source: string;
  species: string;
  lifeStage: LifeStage;
  year: number;
  month: number;
  day: number;
  zipCode: number;
}

export async function loadOccurrences(
  filepath: string
): Promise<TickOccurrence[]> {
  const occurrences: TickOccurrence[] = [];

  return new Promise<TickOccurrence[]>((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(parseCSV({ headers: true }))
      .on("data", (row) => occurrences.push(row))
      .on("end", () => resolve(occurrences))
      .on("error", (err) => {
        console.log("Streaming error:", err);
        reject(err);
      });
  });
}
