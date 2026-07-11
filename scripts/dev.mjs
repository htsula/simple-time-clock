// Runs the whole local dev stack with one command: the API server
// (scripts/dev-server.mjs, in-memory Postgres on :3000) and the Vite UI
// (:5173, which proxies /api to the API server). Starting the UI alone gives
// a 502 on every /api call because nothing answers on :3000.
//
//   npm run dev
//
// Ctrl+C stops both. If either process exits on its own, the other is torn
// down too, so a crashed API server never leaves the UI half-working.

import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

const services = [
  { name: "api", argv: ["scripts/dev-server.mjs"] },
  { name: "ui", argv: ["node_modules/vite/bin/vite.js"] },
];

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    // taskkill /T tears down the whole tree (Vite spawns an esbuild helper);
    // child.kill alone would orphan it on Windows.
    if (isWindows) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500);
}

for (const { name, argv } of services) {
  const child = spawn(process.execPath, argv, { stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.log(`\n[dev] ${name} exited (${code ?? 0}) — stopping the rest.`);
      shutdown(code ?? 0);
    }
  });
}

// Ctrl+C reaches the children directly (they share this console), but handle
// it here too so the survivor is cleaned up on non-Windows and edge cases.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
