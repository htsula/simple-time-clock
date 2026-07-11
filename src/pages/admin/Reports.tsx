import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ApiError, getReport, type Report } from "../../lib/api";
import {
  presetRange,
  previousYears,
  type DateRange,
} from "../../lib/dateRange";
import { openReportPdf } from "../../lib/reportExport";
import { dayStartIso, formatDurationHours, nextDayStartIso } from "../../lib/time";
import type { AdminOutletContext } from "../Admin";

export default function Reports() {
  const { token, onUnauthorized } = useOutletContext<AdminOutletContext>();
  const [preset, setPreset] = useState("last-week");
  const [dates, setDates] = useState<DateRange>(
    () => presetRange("last-week") ?? { from: "", to: "" }
  );
  const [report, setReport] = useState<Report | null>(null);
  const [firstShiftYear, setFirstShiftYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    },
    [onUnauthorized]
  );

  useEffect(() => {
    if (!dates.from || !dates.to) return;
    let cancelled = false;
    setError(null);
    getReport(token, dayStartIso(dates.from), nextDayStartIso(dates.to))
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        if (data.firstShiftYear !== null) setFirstShiftYear(data.firstShiftYear);
      })
      .catch((err) => {
        if (!cancelled) handleError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [token, dates, handleError]);

  function handlePresetChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    const range = presetRange(value, firstShiftYear);
    if (!range) return;
    setPreset(value);
    setDates(range);
  }

  function handleDateChange(field: "from" | "to", value: string) {
    setPreset("custom");
    setDates((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    if (!exportOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!exportRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [exportOpen]);

  function handleExportPdf() {
    setExportOpen(false);
    if (report) openReportPdf(report, dates);
  }

  const priorYears = previousYears(firstShiftYear);

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Reports</h2>

      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1 text-[0.9rem] text-neutral-500">
          From
          <input
            type="date"
            value={dates.from}
            onChange={(event) => handleDateChange("from", event.target.value)}
            className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.9rem] text-neutral-500">
          To
          <input
            type="date"
            value={dates.to}
            onChange={(event) => handleDateChange("to", event.target.value)}
            className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.9rem] text-neutral-500">
          Range
          <select
            value={preset}
            onChange={handlePresetChange}
            className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          >
            <option value="this-week">This week</option>
            <option value="last-week">Last week</option>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="this-year">This year</option>
            <option value="all-time">All time</option>
            {priorYears.map((year) => (
              <option key={year} value={`year-${year}`}>
                {year}
              </option>
            ))}
            <option value="custom" disabled>
              Custom
            </option>
          </select>
        </label>
        <div className="relative ml-auto" ref={exportRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            disabled={!report}
            onClick={() => setExportOpen((open) => !open)}
            className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 disabled:opacity-50 disabled:cursor-default"
          >
            Export
          </button>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 z-10 mt-1 min-w-40 border border-stone-300 rounded-lg bg-white py-1 shadow-md"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleExportPdf}
                className="block w-full cursor-pointer px-3 py-2 text-left text-stone-800 hover:bg-stone-100"
              >
                PDF document
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-[#a53a3a] mt-2">{error}</p>}

      {report && (
        <>
          <div className="flex divide-x divide-stone-300 border border-stone-300 rounded-[10px] bg-white mt-5">
            <div className="flex-1 px-3.5 py-4 text-center">
              <div className="text-[1.6rem] font-semibold tabular-nums">
                {formatDurationHours(report.totalSeconds)}
              </div>
              <div className="text-[0.9rem] text-neutral-500">Total hours</div>
            </div>
            <div className="flex-1 px-3.5 py-4 text-center">
              <div className="text-[1.6rem] font-semibold tabular-nums">
                {report.totalShifts}
              </div>
              <div className="text-[0.9rem] text-neutral-500">Total shifts</div>
            </div>
          </div>

          <div className="border border-stone-300 rounded-[10px] bg-white mt-4 overflow-hidden">
            {report.employees.length === 0 ? (
              <p className="text-neutral-500 text-center px-3.5 py-3 m-0">
                No shifts in this time frame.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-[0.9rem] text-neutral-500 border-b border-stone-300">
                    <th className="text-left font-normal px-3.5 py-2.5">Name</th>
                    <th className="text-right font-normal px-3.5 py-2.5">Shifts</th>
                    <th className="text-right font-normal px-3.5 py-2.5">Total hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-300">
                  {report.employees.map((employee) => (
                    <tr key={employee.id}>
                      <td className="px-3.5 py-3">{employee.name}</td>
                      <td className="text-right px-3.5 py-3 tabular-nums">
                        {employee.shifts}
                      </td>
                      <td className="text-right px-3.5 py-3 tabular-nums">
                        {formatDurationHours(employee.seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
