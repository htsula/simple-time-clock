import type { Shift } from "./api";
import { formatDate, formatDurationHHMM, formatTime24 } from "./time";

function shiftSeconds(shift: Shift): number {
  const end = shift.clockOut ? new Date(shift.clockOut).getTime() : Date.now();
  return (end - new Date(shift.clockIn).getTime()) / 1000;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function shiftsToCsv(shifts: Shift[]): string {
  const header = ["Name", "Employee ID", "Date", "Start", "End", "Length"];
  const rows = shifts.map((shift) => [
    shift.employeeName,
    shift.employeeId,
    formatDate(shift.clockIn),
    formatTime24(shift.clockIn),
    shift.clockOut ? formatTime24(shift.clockOut) : "",
    formatDurationHHMM(shiftSeconds(shift)),
  ]);
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function downloadFile(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
