import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { adminLogin, adminLogout } from "../lib/api";

const TOKEN_KEY = "adminToken";

export type AdminOutletContext = {
  token: string;
  onUnauthorized: () => void;
};

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

  async function handleLogoutClick() {
    if (!token) return;
    try {
      await adminLogout(token);
    } catch {
      // Token is cleared locally regardless.
    }
    handleLogout();
  }

  return (
    <main className="font-sans antialiased min-h-dvh px-4 py-6 flex justify-center bg-stone-100 text-[17px] leading-[1.45] text-stone-800">
      {token ? (
        <div className="w-full max-w-3xl">
          <header className="flex items-center justify-between mb-5">
            <h1 className="text-[1.6rem] font-semibold">Admin</h1>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-1 text-[#3a6ea5] underline"
              onClick={handleLogoutClick}
            >
              Log out
            </button>
          </header>

          <nav className="flex gap-2 mb-6">
            <AdminTab to="/admin/employees" label="Employees" />
            <AdminTab to="/admin/shifts" label="Shifts" />
            <AdminTab to="/admin/reports" label="Reports" />
          </nav>

          <Outlet
            context={
              { token, onUnauthorized: handleLogout } satisfies AdminOutletContext
            }
          />
        </div>
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </main>
  );
}

function AdminTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3.5 py-1.5 no-underline ${
          isActive
            ? "bg-[#3a6ea5] text-white"
            : "text-neutral-500 hover:text-stone-800"
        }`
      }
    >
      {label}
    </NavLink>
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
