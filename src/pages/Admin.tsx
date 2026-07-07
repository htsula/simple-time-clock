import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  adminLogin,
  adminLogout,
  createEmployee,
  deleteEmployee,
  listEmployees,
  setEmployeeActive,
  type Employee,
} from "../lib/api";

const TOKEN_KEY = "adminToken";

export default function Admin() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );

  function handleLogin(newToken: string) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  return (
    <main className="font-sans antialiased min-h-dvh px-4 py-6 flex justify-center bg-stone-100 text-[17px] leading-[1.45] text-stone-800">
      {token ? (
        <EmployeePanel token={token} onLogout={handleLogout} />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </main>
  );
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [adminId, setAdminId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await adminLogin(adminId.trim());
      onLogin(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="self-center flex flex-col gap-5 w-full max-w-[320px] text-center">
      <h1 className="text-[1.6rem] font-semibold">Admin</h1>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="Admin employee ID"
          aria-label="Admin employee ID"
          value={adminId}
          onChange={(event) => setAdminId(event.target.value)}
          className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
        />
        <button
          type="submit"
          disabled={busy || !adminId.trim()}
          className="cursor-pointer border border-[#3a6ea5] rounded-lg bg-[#3a6ea5] px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-default"
        >
          Log in
        </button>
      </form>
      {error && <p className="text-[#a53a3a] mt-2">{error}</p>}
    </div>
  );
}

function EmployeePanel({
  token,
  onLogout,
}: {
  token: string;
  onLogout: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    },
    [onLogout]
  );

  const refresh = useCallback(async () => {
    try {
      setEmployees(await listEmployees(token));
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const created = await createEmployee(token, newName, newId.trim());
      setMessage(`Added ${created.name} with ID ${created.id}`);
      setNewName("");
      setNewId("");
      await refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetActive(employee: Employee, active: boolean) {
    setError(null);
    try {
      await setEmployeeActive(token, employee.id, active);
      await refresh();
    } catch (err) {
      handleError(err);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEmployee(token, toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoutClick() {
    try {
      await adminLogout(token);
    } catch {
      // Token is cleared locally regardless.
    }
    onLogout();
  }

  const visible = showInactive ? employees : employees.filter((e) => e.active);

  return (
    <div className="w-full max-w-140">
      <header className="flex items-center justify-between mb-5">
        <h1 className="text-[1.6rem] font-semibold">Employees</h1>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-1 text-[#3a6ea5] underline"
          onClick={handleLogoutClick}
        >
          Log out
        </button>
      </header>

      <form className="flex gap-2" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Name"
          aria-label="Employee name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          className="flex-2 border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="ID (optional)"
          aria-label="Employee ID (optional)"
          value={newId}
          onChange={(event) => setNewId(event.target.value)}
          className="flex-1 border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="cursor-pointer border border-[#3a6ea5] rounded-lg bg-[#3a6ea5] px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-default"
        >
          Add
        </button>
      </form>
      {message && <p className="text-[#3a6e4a] mt-2">{message}</p>}
      {error && <p className="text-[#a53a3a] mt-2">{error}</p>}

      <label className="flex items-center gap-2 mt-5 mb-3 text-neutral-500 select-none">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(event) => setShowInactive(event.target.checked)}
          className="border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
        />
        Show inactive employees
      </label>

      <ul className="list-none m-0 p-0 border border-stone-300 rounded-[10px] bg-white divide-y divide-stone-300">
        {visible.map((employee) => (
          <li
            key={employee.id}
            className="flex items-center justify-between gap-3 px-3.5 py-3 flex-wrap"
          >
            <span className="flex items-baseline gap-2 flex-wrap">
              <span
                className={employee.active ? undefined : "text-neutral-500"}
              >
                {employee.name}
              </span>
              <span className="text-neutral-500 text-[0.9rem]">
                #{employee.id}
              </span>
              {employee.isAdmin && (
                <span className="text-xs uppercase tracking-[0.04em] bg-[#3a6ea5]/15 text-[#3a6ea5] rounded px-1.5 py-0.5">
                  admin
                </span>
              )}
              {!employee.active && (
                <span className="text-xs uppercase tracking-[0.04em] bg-stone-300 text-neutral-500 rounded px-1.5 py-0.5">
                  inactive
                </span>
              )}
            </span>
            <span className="flex gap-2">
              {employee.active ? (
                <button
                  type="button"
                  onClick={() => handleSetActive(employee, false)}
                  className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
                >
                  Deactivate
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSetActive(employee, true)}
                    className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
                  >
                    Activate
                  </button>
                  {!employee.isAdmin && (
                    <button
                      type="button"
                      onClick={() => setToDelete(employee)}
                      className="cursor-pointer border border-[#a53a3a] rounded-lg bg-[#a53a3a] px-3 py-1.5 text-[0.9rem] text-white"
                    >
                      Permanently delete
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="flex items-center justify-center gap-3 px-3.5 py-3 flex-wrap text-neutral-500">
            No employees yet.
          </li>
        )}
      </ul>

      {toDelete && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-100">
            <h2 className="text-xl mb-3">Delete {toDelete.name}?</h2>
            <p className="text-neutral-500 mb-5">
              This permanently deletes {toDelete.name} (#{toDelete.id}) and{" "}
              <strong>all of their shift data</strong>. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setToDelete(null)}
                className="cursor-pointer border border-stone-300 rounded-lg bg-white px-4 py-2.5 text-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDelete}
                className="cursor-pointer border border-[#a53a3a] rounded-lg bg-[#a53a3a] px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-default"
              >
                Permanently delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
