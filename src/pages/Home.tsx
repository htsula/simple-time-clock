import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const [employeeId, setEmployeeId] = useState("");
  const navigate = useNavigate();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const id = employeeId.trim();
    if (!id) return;
    navigate(`/clock?employee=${encodeURIComponent(id)}`);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-stone-100 p-6 text-neutral-800">
      <h1 className="text-[1.6rem] font-semibold">Time Clock</h1>
      <form
        className="flex w-full max-w-[320px] flex-col gap-3"
        onSubmit={handleSubmit}
      >
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          placeholder="Employee ID"
          aria-label="Employee ID"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className="min-w-0 rounded-lg border border-stone-300 bg-white p-3.5 text-center text-[1.3rem]"
        />
        <button
          type="submit"
          disabled={!employeeId.trim()}
          className="cursor-pointer rounded-lg border border-[#3a6ea5] bg-[#3a6ea5] p-3.5 text-[1.1rem] text-white disabled:cursor-default disabled:opacity-50"
        >
          Submit
        </button>
      </form>
    </main>
  );
}
