function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function formatTime24(iso: string): string {
  const date = new Date(iso);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDurationHHMM(totalSeconds: number): string {
  const totalMinutes = Math.floor(Math.max(totalSeconds, 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${pad2(totalMinutes % 60)}`;
}

export function formatDurationHours(totalSeconds: number): string {
  return (Math.max(totalSeconds, 0) / 3600).toFixed(2);
}

export function isoToDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return `${day}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

export function dayStartIso(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

export function nextDayStartIso(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  start.setDate(start.getDate() + 1);
  return start.toISOString();
}
