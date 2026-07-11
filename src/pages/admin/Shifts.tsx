import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ApiError,
  deleteShift,
  listEmployees,
  listShifts,
  updateShift,
  type Employee,
  type Shift,
} from "../../lib/api";
import {
  datetimeLocalToIso,
  dayStartIso,
  formatDate,
  formatDurationHHMM,
  formatTime24,
  isoToDatetimeLocal,
  nextDayStartIso,
} from "../../lib/time";
import { presetRange, previousYears } from "../../lib/dateRange";
import { downloadFile, shiftsToCsv } from "../../lib/export";
import type { AdminOutletContext } from "../Admin";

function shiftSeconds(shift: Shift): number {
  const end = shift.clockOut ? new Date(shift.clockOut).getTime() : Date.now();
  return (end - new Date(shift.clockIn).getTime()) / 1000;
}

export default function Shifts() {
  const { token, onUnauthorized } = useOutletContext<AdminOutletContext>();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [preset, setPreset] = useState("custom");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [firstShiftYear, setFirstShiftYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Shift | null>(null);
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
    listEmployees(token).then(setEmployees).catch(handleError);
  }, [token, handleError]);

  const requestIdRef = useRef(0);
  const fetchShifts = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const employee = employeeId.trim();
      const result = await listShifts(token, {
        employee: employee || undefined,
        from: fromDate ? dayStartIso(fromDate) : undefined,
        to: toDate ? nextDayStartIso(toDate) : undefined,
      });
      // Ignore a response that a newer request has already superseded.
      if (requestId !== requestIdRef.current) return;
      setShifts(result);
      if (result.length > 0) {
        const earliest = Math.min(
          ...result.map((shift) => new Date(shift.clockIn).getFullYear())
        );
        setFirstShiftYear((prev) => (prev === null ? earliest : Math.min(prev, earliest)));
      }
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      handleError(err);
    }
  }, [token, employeeId, fromDate, toDate, handleError]);

  useEffect(() => {
    const timer = setTimeout(fetchShifts, 300);
    return () => clearTimeout(timer);
  }, [fetchShifts]);

  const activeEmployees = useMemo(
    () =>
      employees
        .filter((employee) => employee.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );

  const selectedEmployee = activeEmployees.some(
    (employee) => employee.id === employeeId.trim()
  )
    ? employeeId.trim()
    : "";

  function handlePresetChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    const range = presetRange(value, firstShiftYear);
    if (!range) return;
    setPreset(value);
    setFromDate(range.from);
    setToDate(range.to);
  }

  function handleModalSaved() {
    setEditing(null);
    fetchShifts();
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

  function handleExportCsv() {
    setExportOpen(false);
    downloadFile("shifts.csv", shiftsToCsv(shifts), "text/csv;charset=utf-8");
  }

  const priorYears = previousYears(firstShiftYear);

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Shifts</h2>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            aria-label="Select employee"
            value={selectedEmployee}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          >
            <option value="">All employees</option>
            {activeEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} (#{employee.id})
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Employee ID"
            aria-label="Employee ID"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-36 border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          />
          <div className="relative ml-auto" ref={exportRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              disabled={shifts.length === 0}
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
                  onClick={handleExportCsv}
                  className="block w-full cursor-pointer px-3 py-2 text-left text-stone-800 hover:bg-stone-100"
                >
                  CSV spreadsheet
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 text-neutral-500">
          From
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(event) => {
              setPreset("custom");
              setFromDate(event.target.value);
            }}
            className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          />
        </label>
        <label className="flex items-center gap-2 text-neutral-500">
          To
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(event) => {
              setPreset("custom");
              setToDate(event.target.value);
            }}
            className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
          />
        </label>
        <label className="flex items-center gap-2 text-neutral-500">
          Range
          <select
            aria-label="Date range"
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
        </div>
      </div>
      {error && <p className="text-[#a53a3a] mt-2">{error}</p>}

      <div className="mt-5 border border-stone-300 rounded-[10px] bg-white overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-300 text-neutral-500 text-[0.9rem]">
              <th className="px-3.5 py-3 font-medium">Name</th>
              <th className="px-3.5 py-3 font-medium">Date</th>
              <th className="px-3.5 py-3 font-medium">Start</th>
              <th className="px-3.5 py-3 font-medium">End</th>
              <th className="px-3.5 py-3 font-medium">Length</th>
              <th className="px-3.5 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-300">
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <td className="px-3.5 py-3 whitespace-nowrap">
                  {shift.employeeName}
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap">
                  {formatDate(shift.clockIn)}
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap">
                  {formatTime24(shift.clockIn)}
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap">
                  {shift.clockOut ? (
                    formatTime24(shift.clockOut)
                  ) : (
                    <span title="Still clocked in">
                      <svg
                        viewBox="0 0 10 10"
                        className="inline-block h-2.5 w-2.5 animate-pulse"
                        role="img"
                        aria-label="Still clocked in"
                      >
                        <circle cx="5" cy="5" r="4" fill="#3a6e4a" />
                      </svg>
                    </span>
                  )}
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap">
                  {formatDurationHHMM(shiftSeconds(shift))}
                </td>
                <td className="px-3.5 py-3 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(shift)}
                    className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {shifts.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3.5 py-3 text-center text-neutral-500"
                >
                  No shifts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditShiftModal
          shift={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={handleModalSaved}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
}

function EditShiftModal({
  shift,
  token,
  onClose,
  onSaved,
  onUnauthorized,
}: {
  shift: Shift;
  token: string;
  onClose: () => void;
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const [start, setStart] = useState(() => isoToDatetimeLocal(shift.clockIn));
  const [end, setEnd] = useState(() =>
    shift.clockOut ? isoToDatetimeLocal(shift.clockOut) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [armedDelete, setArmedDelete] = useState(false);

  function handleModalError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      onUnauthorized();
    } else {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!start) {
      setError("Start time is required");
      return;
    }
    if (end && new Date(end).getTime() <= new Date(start).getTime()) {
      setError("End time must be after start time");
      return;
    }
    setBusy(true);
    try {
      await updateShift(token, shift.id, {
        clockIn: datetimeLocalToIso(start),
        clockOut: end ? datetimeLocalToIso(end) : null,
      });
      onSaved();
    } catch (err) {
      handleModalError(err);
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!armedDelete) {
      setArmedDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteShift(token, shift.id);
      onSaved();
    } catch (err) {
      handleModalError(err);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl p-6 w-full max-w-100">
        <h2 className="text-xl mb-1">Edit shift</h2>
        <p className="text-neutral-500 mb-4">
          {shift.employeeName} (#{shift.employeeId})
        </p>
        <form className="flex flex-col gap-3" onSubmit={handleSave}>
          <label className="flex flex-col gap-1 text-neutral-500">
            Start
            <input
              type="datetime-local"
              aria-label="Start time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
            />
          </label>
          <label className="flex flex-col gap-1 text-neutral-500">
            End
            <input
              type="datetime-local"
              aria-label="End time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
            />
          </label>
          <p className="text-neutral-500 text-[0.9rem]">
            Leave End empty to reopen the shift (still clocked in).
          </p>
          {error && <p className="text-[#a53a3a]">{error}</p>}
          <div className="flex items-center justify-between gap-2.5 flex-wrap mt-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className={`cursor-pointer border border-[#a53a3a] rounded-lg px-4 py-2.5 disabled:opacity-50 disabled:cursor-default ${
                armedDelete
                  ? "bg-[#a53a3a] text-white"
                  : "bg-white text-[#a53a3a]"
              }`}
            >
              {armedDelete ? "Really delete?" : "Delete shift"}
            </button>
            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="cursor-pointer border border-stone-300 rounded-lg bg-white px-4 py-2.5 text-stone-800 disabled:opacity-50 disabled:cursor-default"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="cursor-pointer border border-[#3a6ea5] rounded-lg bg-[#3a6ea5] px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-default"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
