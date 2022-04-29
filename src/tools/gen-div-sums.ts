import * as path from "path";

import { LifeStage } from "./lib/tick_occurrence";
import { loadOccurrences } from "./lib/tick_occurrence";
import { loadFipsByZip, loadDivsByFips } from "./lib/zips_fips_divs";

const zipsFipsFile = path.join(
  __dirname,
  "../../tick-data/ZIP-COUNTY-FIPS_2018-03 data-world.csv"
);
const fipsDivsFile = path.join(__dirname, "../../tick-data/noaa-fips-divs.txt");
const occurrenceFile = path.join(
  __dirname,
  "../../tick-data/tick-occurrences.csv"
);
const daysByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface DivisionSummary {
  source: string;
  lifeStage: LifeStage;
  year: number;
  climateDivision: number;
  // indexed first by month (0-11) and then by quarter of month (0-3)
  counts: number[][];
}

type DataByDivision = Record<number, DivisionSummary>;
type DataByYear = Record<number, DataByDivision>;
type DataByLifeStage = Record<string, DataByYear>;
type DataBySource = Record<string, DataByLifeStage>;

const data: DataBySource = {};
let unrecognizedZipCodes: number[] = [];
let unrecognizedFips: number[] = [];

async function generateData() {
  const fipsByZip = await loadFipsByZip(zipsFipsFile);
  const divsByFips = await loadDivsByFips(fipsDivsFile);
  const occurrences = await loadOccurrences(occurrenceFile);

  for (const occurrence of occurrences) {
    let sourceData = data[occurrence.source];
    if (!sourceData) {
      sourceData = {};
      data[occurrence.source] = sourceData;
    }

    let lifeStageData = sourceData[occurrence.lifeStage];
    if (!lifeStageData) {
      lifeStageData = {};
      sourceData[occurrence.lifeStage] = lifeStageData;
    }

    let yearData = lifeStageData[occurrence.year];
    if (!yearData) {
      yearData = {};
      lifeStageData[occurrence.year] = yearData;
    }

    const fips = fipsByZip[occurrence.zipCode];
    if (!fips) {
      unrecognizedZipCodes.push(occurrence.zipCode);
      continue;
    }

    const climateDivision = divsByFips[fips];
    if (!climateDivision) {
      unrecognizedFips.push(fips);
      continue;
    }

    let divisionData = yearData[climateDivision];
    if (!divisionData) {
      const counts: number[][] = [];
      for (let i = 0; i < 12; ++i) {
        counts.push([0, 0, 0, 0]);
      }
      divisionData = {
        source: occurrence.source,
        lifeStage: occurrence.lifeStage,
        year: occurrence.year,
        climateDivision: climateDivision,
        // indexed first by month (0-11) and then by quarter of month (0-3)
        counts,
      };
      yearData[climateDivision] = divisionData;
    }

    let daysInMonth = daysByMonth[occurrence.month - 1];
    if (occurrence.month == 2 /* February */) {
      if (
        occurrence.year % 400 == 0 ||
        (occurrence.year % 4 == 0 && occurrence.year % 100 != 0)
      ) {
        daysInMonth = 29;
      }
    }
    const monthOffset = Math.floor((4 * (occurrence.day - 1)) / daysInMonth);
    ++divisionData.counts[occurrence.month - 1][monthOffset];
  }
}

function printData() {
  for (const [source, sourceData] of Object.entries(data)) {
    for (const [lifeStage, lifeStageData] of Object.entries(sourceData)) {
      for (const [year, yearData] of Object.entries(lifeStageData)) {
        for (const [division, summary] of Object.entries(yearData)) {
          const counts = summary.counts
            .map((month) => month.join(","))
            .join(",");
          console.log(`${source},${lifeStage},${year},${division},${counts}`);
        }
      }
    }
  }
}

(async () => {
  await generateData();
  printData();
  console.log();
  console.log(
    `${unrecognizedZipCodes.length} records with unrecognized zip codes`
  );
  if (unrecognizedZipCodes.length > 0) {
    console.log("  e.g.", unrecognizedZipCodes.slice(0, 10).join(", "));
  }
  console.log(`${unrecognizedFips.length} records with unrecognized fips`);
  if (unrecognizedFips.length > 0) {
    console.log("  e.g.", unrecognizedFips.slice(0, 10).join(", "));
  }
})();
