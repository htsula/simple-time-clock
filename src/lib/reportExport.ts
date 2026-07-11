import type { Report } from "./api";
import { formatDurationHours } from "./time";

function escapeHtml(value: string | number): string {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] as string
  );
}

function formatRangeDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildReportHtml(
  report: Report,
  range: { from: string; to: string }
): string {
  const period = `${formatRangeDate(range.from)} – ${formatRangeDate(range.to)}`;
  const generatedOn = new Date().toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

  const rows = report.employees
    .map(
      (employee) => `
        <tr>
          <td class="name">${escapeHtml(employee.name)}</td>
          <td class="num">${escapeHtml(employee.shifts)}</td>
          <td class="num">${escapeHtml(formatDurationHours(employee.seconds))}</td>
        </tr>`
    )
    .join("");

  const body =
    report.employees.length === 0
      ? `<p class="empty">No shifts were recorded in this period.</p>`
      : `
        <table>
          <thead>
            <tr>
              <th class="name">Employee</th>
              <th class="num">Shifts</th>
              <th class="num">Total hours</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td class="name">Total</td>
              <td class="num">${escapeHtml(report.totalShifts)}</td>
              <td class="num">${escapeHtml(formatDurationHours(report.totalSeconds))}</td>
            </tr>
          </tfoot>
        </table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Time Report — ${escapeHtml(period)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    color: #1c1917;
    background: #f5f5f4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    max-width: 760px;
    margin: 0 auto;
    padding: 48px;
    background: #ffffff;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 3px solid #3a6ea5;
    padding-bottom: 18px;
  }
  .brand { font-size: 1.55rem; font-weight: 700; letter-spacing: -0.01em; }
  .brand span { color: #3a6ea5; }
  .doc-meta { text-align: right; font-size: 0.8rem; color: #78716c; line-height: 1.5; }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 28px 0 2px; }
  .period { color: #57534e; font-size: 0.95rem; margin: 0 0 24px; }
  .summary {
    display: flex;
    gap: 16px;
    margin-bottom: 28px;
  }
  .stat {
    flex: 1;
    border: 1px solid #e7e5e4;
    border-radius: 10px;
    padding: 18px 20px;
    background: #fafaf9;
  }
  .stat .value { font-size: 1.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat .label { font-size: 0.8rem; color: #78716c; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  thead th {
    text-align: left;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #78716c;
    font-weight: 600;
    padding: 10px 12px;
    border-bottom: 2px solid #e7e5e4;
  }
  tbody td { padding: 11px 12px; border-bottom: 1px solid #f0efed; }
  tbody tr:nth-child(even) td { background: #fafaf9; }
  tfoot td {
    padding: 12px;
    border-top: 2px solid #e7e5e4;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .name { font-weight: 500; }
  thead .num, tfoot .num { text-align: right; }
  .empty { color: #78716c; padding: 24px 0; text-align: center; }
  footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e7e5e4;
    font-size: 0.78rem;
    color: #a8a29e;
    display: flex;
    justify-content: space-between;
  }
  @media print {
    body { background: #ffffff; }
    /* Zero page margin makes Chromium omit the default URL/date/page headers;
       the margin is restored as content padding instead. */
    .sheet { padding: 18mm; max-width: none; }
    @page { margin: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="brand">Time<span>Clock</span></div>
      <div class="doc-meta">
        <div>Hours Report</div>
        <div>Generated ${escapeHtml(generatedOn)}</div>
      </div>
    </header>

    <h1>Hours Report</h1>
    <p class="period">${escapeHtml(period)}</p>

    <div class="summary">
      <div class="stat">
        <div class="value">${escapeHtml(formatDurationHours(report.totalSeconds))}</div>
        <div class="label">Total hours</div>
      </div>
      <div class="stat">
        <div class="value">${escapeHtml(report.totalShifts)}</div>
        <div class="label">Total shifts</div>
      </div>
    </div>

    ${body}

    <footer>
      <span>TimeClock hours report</span>
      <span>${escapeHtml(period)}</span>
    </footer>
  </div>
</body>
</html>`;
}

export function openReportPdf(
  report: Report,
  range: { from: string; to: string }
): void {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildReportHtml(report, range));
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before invoking the print dialog.
  win.setTimeout(() => win.print(), 250);
}
