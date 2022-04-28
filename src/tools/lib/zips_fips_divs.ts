import * as fs from "fs";
import { parse as parseCSV } from "@fast-csv/parse";

export interface ZipFipsDiv {
  zipCode: number;
  countyFips: number;
  climateDivision: number;
}

export async function loadCodes(filepath: string): Promise<ZipFipsDiv[]> {
  const entries: ZipFipsDiv[] = [];

  return new Promise<ZipFipsDiv[]>((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(parseCSV({ headers: true }))
      .on("data", (row) => {
        entries.push({
          zipCode: row["POSTAL_FIPS_ID"],
          countyFips: row["NCDC_FIPS_ID"],
          climateDivision: row["CLIMDIV_ID"],
        });
      })
      .on("end", () => resolve(entries))
      .on("error", (err) => {
        console.log("Streaming error:", err);
        reject(err);
      });
  });
}

export async function loadCodesByZip(
  filepath: string
): Promise<Record<number, ZipFipsDiv>> {
  const entries = await loadCodes(filepath);
  const codesByZip: Record<number, ZipFipsDiv> = {};
  for (const entry of entries) {
    codesByZip[entry.zipCode] = entry;
  }
  return codesByZip;
}
