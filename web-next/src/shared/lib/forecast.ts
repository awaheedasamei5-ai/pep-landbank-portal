// 3-month linear-regression forecast, ported from index.html's
// forecastNextMonth() (also independently duplicated in this session's
// own managementReportLogic.ts before being extracted here) -- "not
// enough history" (fewer than 2 of the 3 months have any real value)
// returns null rather than a misleadingly confident number from mostly
// zeros.
export function linearForecastNextMonth(monthlyValues: [number, number, number]): number | null {
  if (monthlyValues.filter((v) => v > 0).length < 2) return null;
  const n = 3;
  const xMean = 1;
  const yMean = monthlyValues.reduce((a, b) => a + b, 0) / n;
  let numer = 0;
  let den = 0;
  [0, 1, 2].forEach((x, i) => {
    numer += (x - xMean) * (monthlyValues[i] - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den ? numer / den : 0;
  return Math.max(0, Math.round(yMean + slope * (3 - xMean)));
}
