import * as fs from "fs";
import { parse as parseCSV } from "@fast-csv/parse";

export async function loadFipsByZip(
  filepath: string
): Promise<Record<number, number>> {
  const fipsByZip: Record<number, number> = {};

  return new Promise<Record<number, number>>((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(parseCSV({ headers: true }))
      .on("data", (row) => {
        fipsByZip[parseInt(row["ZIP"])] = parseInt(row["STCOUNTYFP"]);
      })
      .on("end", () => resolve(fipsByZip))
      .on("error", (err) => {
        console.log("loadFipsByZip streaming error:", err);
        reject(err);
      });
  });
}

export async function loadDivsByFips(
  filepath: string
): Promise<Record<number, number>> {
  const divsByFips: Record<number, number> = {};

  return new Promise<Record<number, number>>((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(parseCSV({ headers: true, delimiter: " " }))
      .on("data", (row) => {
        divsByFips[parseInt(row["POSTAL_FIPS_ID"])] = parseInt(
          row["CLIMDIV_ID"]
        );
      })
      .on("end", () => resolve(divsByFips))
      .on("error", (err) => {
        console.log("loadDivsByFips streaming error:", err);
        reject(err);
      });
  });
}
