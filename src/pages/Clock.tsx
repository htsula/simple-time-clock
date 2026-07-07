import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, getStatus, postClock, type ClockStatus } from "../lib/api";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function Clock() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const employeeId = searchParams.get("employee");

  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeId) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    getStatus(employeeId)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        // Unknown/inactive employee or request failure: back to the ID screen.
        if (!cancelled) navigate("/", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, navigate]);

  if (!employeeId || !status) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-between bg-[#f5f4f1] pt-[max(32px,env(safe-area-inset-top))] pr-6 pb-[max(40px,env(safe-area-inset-bottom))] pl-6 text-center transition-colors duration-300" />
    );
  }

  const clockedIn = status.status === "IN";

  async function handleClock() {
    if (busy || !employeeId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await postClock(employeeId, clockedIn ? "OUT" : "IN");
      setStatus((prev) => (prev ? { ...prev, ...next } : prev));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // State drifted (e.g. clocked from another device): resync.
        try {
          setStatus(await getStatus(employeeId));
        } catch {
          navigate("/", { replace: true });
        }
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  const statusLine = clockedIn
    ? `clocked in since ${formatTime(status.time!)}`
    : status.time
      ? `clocked out at ${formatTime(status.time)}`
      : "not clocked in yet";

  return (
    <main
      className={`flex min-h-dvh flex-col items-center justify-between pt-[max(32px,env(safe-area-inset-top))] pr-6 pb-[max(40px,env(safe-area-inset-bottom))] pl-6 text-center transition-colors duration-300 ${clockedIn ? "bg-clock-in" : "bg-clock-out"}`}
    >
      <header>
        <h1 className="m-0 text-[2rem] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.15)]">
          {status.name}
        </h1>
        <p className="mt-2 text-[1.15rem] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.15)]">
          {statusLine}
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-black/25 px-3 py-2 text-white">
            {error}
          </p>
        )}
      </header>
      <button
        type="button"
        className="aspect-square w-[min(65vw,280px)] cursor-pointer rounded-full border-[6px] border-white/85 bg-white/18 px-4 py-2.5 text-[1.7rem] font-semibold text-white [-webkit-tap-highlight-color:transparent] [text-shadow:0_1px_2px_rgba(0,0,0,0.2)] active:bg-white/35 disabled:cursor-default disabled:opacity-50"
        onClick={handleClock}
        disabled={busy}
      >
        {clockedIn ? "Clock out" : "Clock in"}
      </button>
    </main>
  );
}
