export type DateRange = { from: string; to: string };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function mondayOf(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - ((date.getDay() + 6) % 7)
  );
}

function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function presetRange(
  preset: string,
  firstShiftYear: number | null = null
): DateRange | null {
  const today = new Date();
  if (preset === "all-time") {
    const startYear = firstShiftYear ?? today.getFullYear();
    return { from: `${startYear}-01-01`, to: toDateInput(today) };
  }
  if (preset === "this-week" || preset === "last-week") {
    const monday = mondayOf(today);
    if (preset === "last-week") monday.setDate(monday.getDate() - 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { from: toDateInput(monday), to: toDateInput(sunday) };
  }
  if (preset === "this-month" || preset === "last-month") {
    const offset = preset === "last-month" ? -1 : 0;
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    return { from: toDateInput(first), to: toDateInput(last) };
  }
  if (preset === "this-year") return yearRange(today.getFullYear());
  const yearMatch = /^year-(\d{4})$/.exec(preset);
  if (yearMatch) return yearRange(Number(yearMatch[1]));
  return null;
}

export function previousYears(firstShiftYear: number | null): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  if (firstShiftYear !== null) {
    for (let year = currentYear - 1; year >= firstShiftYear; year--) {
      years.push(year);
    }
  }
  return years;
}
