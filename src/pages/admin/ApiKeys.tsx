import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ApiError,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  renameApiKey,
  renameSession,
  revokeSession,
  type AdminSession,
  type ApiKey,
  type ApiKeyAccess,
} from "../../lib/api";
import type { AdminOutletContext } from "../Admin";

const ACCESS_LABEL: Record<ApiKeyAccess, string> = {
  read: "Read only",
  full: "Full access",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function RenameForm({
  label,
  placeholder,
  value,
  allowEmpty,
  onChange,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder?: string;
  value: string;
  allowEmpty: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex gap-2 w-full flex-wrap"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        type="text"
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        maxLength={100}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="flex-1 border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-stone-800 min-w-0"
      />
      <button
        type="submit"
        disabled={!allowEmpty && !value.trim()}
        className="cursor-pointer border border-[#3a6ea5] rounded-lg bg-[#3a6ea5] px-3 py-1.5 text-[0.9rem] text-white disabled:opacity-50 disabled:cursor-default"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
      >
        Cancel
      </button>
    </form>
  );
}

export default function ApiKeys() {
  const { token, onUnauthorized, onLogout } = useOutletContext<AdminOutletContext>();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [newName, setNewName] = useState("");
  const [newAccess, setNewAccess] = useState<ApiKeyAccess>("read");
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  // Only one row (key or session) is in edit mode at a time.
  const [editing, setEditing] = useState<{ kind: "key" | "session"; id: number } | null>(null);
  const [editName, setEditName] = useState("");
  const [toDelete, setToDelete] = useState<ApiKey | null>(null);
  const [toRevoke, setToRevoke] = useState<AdminSession | null>(null);
  const [busy, setBusy] = useState(false);

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

  const refresh = useCallback(async () => {
    try {
      const data = await listApiKeys(token);
      setKeys(data.keys);
      // The current session is listed first; the rest stay newest first.
      setSessions([
        ...data.sessions.filter((s) => s.current),
        ...data.sessions.filter((s) => !s.current),
      ]);
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
    setError(null);
    try {
      const created = await createApiKey(token, newName, newAccess);
      setCreatedKey({ name: created.name, key: created.key });
      setCopyState("idle");
      setNewName("");
      setNewAccess("read");
      await refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function startEdit(key: ApiKey) {
    setEditing({ kind: "key", id: key.id });
    setEditName(key.name);
  }

  function startEditSession(session: AdminSession) {
    setEditing({ kind: "session", id: session.id });
    setEditName(session.name ?? "");
  }

  async function handleRename(key: ApiKey) {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    try {
      await renameApiKey(token, key.id, name);
      setEditing(null);
      await refresh();
    } catch (err) {
      handleError(err);
    }
  }

  async function handleRenameSession(session: AdminSession) {
    setError(null);
    try {
      // An empty name clears the session's name.
      await renameSession(token, session.id, editName.trim());
      setEditing(null);
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
      await deleteApiKey(token, toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!toRevoke) return;
    setBusy(true);
    setError(null);
    try {
      await revokeSession(token, toRevoke.id);
      setToRevoke(null);
      await refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">API Keys</h2>

      <form className="flex gap-2 flex-wrap" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Key name"
          aria-label="API key name"
          maxLength={100}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          className="flex-2 border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
        />
        <select
          aria-label="Access level"
          value={newAccess}
          onChange={(event) => setNewAccess(event.target.value as ApiKeyAccess)}
          className="flex-1 border border-stone-300 rounded-lg bg-white px-3 py-2.5 text-stone-800 min-w-0"
        >
          <option value="read">Read only</option>
          <option value="full">Full access</option>
        </select>
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="cursor-pointer border border-[#3a6ea5] rounded-lg bg-[#3a6ea5] px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-default"
        >
          Add
        </button>
      </form>
      {error && <p className="text-[#a53a3a] mt-2">{error}</p>}

      {createdKey && (
        <div className="mt-4 border-2 border-[#3a6e4a] rounded-[10px] bg-white p-4" role="status">
          <p className="font-semibold mb-1">New key created: {createdKey.name}</p>
          <p className="text-neutral-500 mb-3">
            Copy this key now. It won't be shown again.
          </p>
          <code className="block font-mono text-[0.9rem] break-all bg-stone-100 rounded-lg px-3 py-2.5 select-all">
            {createdKey.key}
          </code>
          <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
            <span className="text-[0.9rem]">
              {copyState === "copied" && (
                <span className="text-[#3a6e4a]">Copied to clipboard</span>
              )}
              {copyState === "failed" && (
                <span className="text-[#a53a3a]">Couldn't copy. Select the key and copy it manually.</span>
              )}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="cursor-pointer border border-[#3a6ea5] rounded-lg bg-[#3a6ea5] px-3 py-1.5 text-[0.9rem] text-white"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
              >
                Dismiss
              </button>
            </span>
          </div>
        </div>
      )}

      <h3 className="text-lg font-semibold mt-6 mb-3">API keys</h3>
      <ul className="list-none m-0 p-0 border border-stone-300 rounded-[10px] bg-white divide-y divide-stone-300">
        {keys.map((key) => (
          <li
            key={key.id}
            className="flex items-center justify-between gap-3 px-3.5 py-3 flex-wrap"
          >
            {editing?.kind === "key" && editing.id === key.id ? (
              <RenameForm
                label={`New name for ${key.name}`}
                value={editName}
                allowEmpty={false}
                onChange={setEditName}
                onSubmit={() => handleRename(key)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                  <span className="break-all">{key.name}</span>
                  <span className="text-xs uppercase tracking-[0.04em] bg-[#3a6ea5]/15 text-[#3a6ea5] rounded px-1.5 py-0.5">
                    {ACCESS_LABEL[key.access]}
                  </span>
                  <span className="font-mono text-neutral-500 text-[0.9rem]">{key.prefix}…</span>
                  <span className="text-neutral-500 text-[0.9rem]">
                    {formatDate(key.createdAt)}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Rename ${key.name}`}
                    onClick={() => startEdit(key)}
                    className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${key.name}`}
                    onClick={() => setToDelete(key)}
                    className="cursor-pointer border border-[#a53a3a] rounded-lg bg-[#a53a3a] px-3 py-1.5 text-[0.9rem] text-white"
                  >
                    Delete
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
        {keys.length === 0 && (
          <li className="flex items-center justify-center gap-3 px-3.5 py-3 flex-wrap text-neutral-500">
            No API keys yet.
          </li>
        )}
      </ul>

      <h3 className="text-lg font-semibold mt-6 mb-3">Sessions</h3>
      <ul className="list-none m-0 p-0 border border-stone-300 rounded-[10px] bg-white divide-y divide-stone-300">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex items-center justify-between gap-3 px-3.5 py-3 flex-wrap"
          >
            {editing?.kind === "session" && editing.id === session.id ? (
              <RenameForm
                label={`New name for session from ${formatDate(session.createdAt)}`}
                placeholder="Session name"
                value={editName}
                allowEmpty
                onChange={setEditName}
                onSubmit={() => handleRenameSession(session)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                  {session.name ? (
                    <>
                      <span className="break-all">{session.name}</span>
                      <span className="text-neutral-500 text-[0.9rem]">
                        {formatDate(session.createdAt)}
                      </span>
                    </>
                  ) : (
                    <span>{formatDate(session.createdAt)}</span>
                  )}
                  {session.current && (
                    <span className="text-xs uppercase tracking-[0.04em] bg-[#3a6ea5]/15 text-[#3a6ea5] rounded px-1.5 py-0.5">
                      Logged in as
                    </span>
                  )}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Rename session ${session.name ?? `from ${formatDate(session.createdAt)}`}`}
                    onClick={() => startEditSession(session)}
                    className="cursor-pointer border border-stone-300 rounded-lg bg-white px-3 py-1.5 text-[0.9rem] text-stone-800"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={
                      session.current
                        ? "Revoke this session and log out"
                        : `Revoke session ${session.name ?? `from ${formatDate(session.createdAt)}`}`
                    }
                    onClick={() =>
                      session.current ? onLogout() : setToRevoke(session)
                    }
                    className="cursor-pointer border border-[#a53a3a] rounded-lg bg-[#a53a3a] px-3 py-1.5 text-[0.9rem] text-white"
                  >
                    Revoke
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
        {sessions.length === 0 && (
          <li className="flex items-center justify-center gap-3 px-3.5 py-3 flex-wrap text-neutral-500">
            No sessions.
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
              Anything using this key will stop working immediately. This cannot be undone.
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toRevoke && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-100">
            <h2 className="text-xl mb-3">Revoke this session?</h2>
            <p className="text-neutral-500 mb-5">
              The session {toRevoke.name ? `"${toRevoke.name}" ` : ""}started {formatDate(toRevoke.createdAt)} will be logged out immediately.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setToRevoke(null)}
                className="cursor-pointer border border-stone-300 rounded-lg bg-white px-4 py-2.5 text-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleRevoke}
                className="cursor-pointer border border-[#a53a3a] rounded-lg bg-[#a53a3a] px-4 py-2.5 text-white disabled:opacity-50 disabled:cursor-default"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
