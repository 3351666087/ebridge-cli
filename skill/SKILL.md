---
name: ebridge
description: Operate XJTLU e-Bridge (ebridge.xjtlu.edu.cn, a Tribal SITS:Vision / e:Vision student records system) from the command line via the `ebr` CLI — academic records & grades, component marks, timetables, registration, and any portal screen. Works by attaching over CDP to a normal browser the user launched and logged into themselves.
---

# XJTLU e-Bridge (`ebr`) — agent operating guide

Drives **XJTLU e-Bridge** (`https://ebridge.xjtlu.edu.cn`), the university's
**SITS:Vision** student records system, via the `ebr` CLI. Source & install:
`~/ebridge-cli`.

## The model (important)

e-Bridge has **no API** and resists scraping two ways: the session can't be
replayed over HTTP (server-side `?<token>` navigation state → "Automatic
Logout"), and the SSO identity provider white-screens automation-launched
browsers. So `ebr` attaches **over CDP to a normal browser the user launched and
logged into by hand**, and drives that live session. Consequences:

- The user must have run `ebr login` and completed SSO in that window, and the
  window must stay open. If not, commands fail with a clear "log in" message.
- SITS sessions are short; when it times out the user re-logs-in in that same
  window. `ebr status` reports this.
- Navigation = following the current screen's token-carrying links. Always
  navigate from the live page (don't cache URLs/tokens).

## Contract

- **`ebr` is the single tool.** Every action is `ebr …`.
- **`--json`** gives machine output on stdout (tables as arrays of rows); human
  tables go to stderr.
- **Discover, don't assume.** `ebr map` (Site Map) lists every screen; `ebr menu`
  lists the current screen's links. Use them before assuming a screen exists.
- **Writes are real.** Submitting forms / clicking action controls in SITS
  (registration choices, module selection, MC applications…) are real actions on
  the user's record — confirm with the user first; prefer reading.

## 1. Make sure the session is live

```bash
ebr status --json
```

If it reports not authenticated / timed out, tell the user to run `ebr login`
(or to log in again in the already-open e-Bridge window), then retry.

## 2. Read anything

```bash
ebr whoami
ebr menu                      # links on the current screen
ebr map                       # the full screen inventory (Site Map)
ebr go "Academic Records"     # follow a link by its visible text (substring ok)
ebr go "Full Academic Records"
ebr read --json               # scrape the current screen's tables (or text)
ebr screenshot out.png
```

Navigation is stateful: each command acts on the browser's *current* screen, and
`ebr go` moves it. To reach a nested screen, follow the path step by step (e.g.
`ebr go "Academic Records"` then `ebr go "Full Academic Records"`), or use a
curated shortcut.

## 3. Curated shortcuts (navigate from Home + read)

| Task | Command |
|------|---------|
| Transcript + grades | `ebr records --json` |
| Component marks (this year) | `ebr marks --json` |
| Timetable landing / key dates | `ebr timetable --json` |
| Registration | `ebr registration --json` |
| Records by module | `ebr academic --json` |

Each follows a known path of menu links (Home → …) then dumps tables. For
anything not covered, use `ebr map` to find the screen and `ebr go "<text>"`.

## 4. Debugging

- `ebr status` → "timed out" means re-login in the window; "not authenticated"
  means log in in the window.
- `EBR_DEBUG=1 ebr <cmd>` traces what it does.
- `ebr screenshot` to see what the current screen actually shows.
- Config (browser/port/profile) lives in `~/.config/ebridge/`; no secrets stored.

## Install / update

```bash
cd ~/ebridge-cli && npm install && npm run build && npm link   # global `ebr`
```
