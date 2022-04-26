import { format as formatCsv, type CsvFormatterStream } from "@fast-csv/format";

import type { TickData } from "./lib/tick_data";
import { TickCheckData } from "./lib/tick_check_data";
import { TickReportData } from "./lib/tick_report_data";

const tickCheckFile = "../../../tick-data/TickCheck.csv";
const tickReportFile = "../../../tick-data/TickReport.csv";

const tickCheckData = new TickCheckData(tickCheckFile);
const tickReportData = new TickReportData(tickReportFile);

(async () => {
  await tickCheckData.load();
  await tickReportData.load();

  const stream = formatCsv();
  stream.pipe(process.stdout);

  stream.write(Object.keys(tickCheckData.records[0]));
  writeRecords(stream, tickCheckData);
  writeRecords(stream, tickReportData);
})();

function writeRecords(
  stream: CsvFormatterStream<any, any>,
  data: TickData
): void {
  for (const record of data.records) {
    stream.write(Object.values(record));
  }
}
