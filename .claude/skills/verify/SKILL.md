---
name: verify
description: Build, run, and drive the time-clock app end-to-end for verification
---

# Verifying time-clock changes

## Build + run (full stack, no external DB)

```powershell
npm run build   # tsc -b && vite build → dist/
$env:PORT='3111'; $env:PGLITE_DATA_DIR='<scratch dir>\pgdata'; node server.mjs   # run in background
```

`server.mjs` serves dist/ with SPA fallback AND the real api/ handlers against
embedded PGlite — one process, fresh DB per scratch dir.

## Seed data via API

Fresh DB bootstrap: while no admin exists, ANY 1–18 digit employeeId logs in.

```powershell
$tok = (Invoke-RestMethod -Method Post -Uri http://localhost:3111/api/admin/login -ContentType 'application/json' -Body '{"employeeId":"99999999"}').token
Invoke-RestMethod -Method Post -Uri http://localhost:3111/api/admin/employees -Headers @{Authorization="Bearer $tok"} -ContentType 'application/json' -Body '{"name":"Test User","id":"12345678"}'
# clock in/out without the UI:
Invoke-RestMethod -Method Post -Uri http://localhost:3111/api/clock -ContentType 'application/json' -Body '{"employeeId":"12345678","action":"IN"}'
```

Employee-facing page: `/clock/<id>` (path param; legacy `?employee=` redirects there).

## Drive the rendered SPA headless (no playwright package installed)

A Playwright Chromium lives at
`C:\Users\htsul\AppData\Local\ms-playwright\chromium-1129\chrome-win\chrome.exe`.

Gotcha: on Windows, `& chrome --dump-dom` returns nothing (process detaches).
Use Start-Process with redirected stdout:

```powershell
Start-Process -FilePath $chrome -ArgumentList '--headless','--disable-gpu','--no-sandbox','--no-first-run','--virtual-time-budget=8000','--dump-dom','http://localhost:3111/clock/12345678' -RedirectStandardOutput "$env:TEMP\dom.html" -RedirectStandardError "$env:TEMP\chr.err" -NoNewWindow -Wait
```

The dumped DOM contains the React-rendered markup ("Test User", "Clock in" /
"Clock out", or the Home page's "Employee ID" input) — grep it to tell which
page/state rendered. `--dump-dom` can't click; for state changes, mutate via
the API and re-dump.
