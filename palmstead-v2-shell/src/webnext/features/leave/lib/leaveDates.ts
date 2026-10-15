// Leave is booked by Ghana calendar dates, not device-local timestamps.
function validLeaveDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function leaveSelectionYear(dates: string[]): number | null {
  if (!dates.length || dates.some((date) => !validLeaveDate(date))) return null;
  const year = dates[0].slice(0, 4);
  return dates.every((date) => date.startsWith(`${year}-`)) ? Number(year) : null;
}

export function requireLeaveSelectionYear(dates: string[]): number {
  const year = leaveSelectionYear(dates);
  if (year === null) throw new Error('Select valid dates from one calendar year. Submit separate requests for different years.');
  return year;
}

export function leaveWeekdaysInRange(from: string, to: string): string[] {
  if (leaveSelectionYear([from, to]) === null || to < from) return [];
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
