# ebr — XJTLU e-Bridge (SITS:Vision) CLI

Drive **XJTLU e-Bridge** (`ebridge.xjtlu.edu.cn`, a Tribal **SITS:Vision / e:Vision**
student records system) from the command line — academic records & grades,
component marks, timetables, registration, and *any* screen in the portal.

e-Bridge has no API and is deliberately hostile to scraping. So `ebr` takes the
one approach that actually works: it **attaches, over the Chrome DevTools Protocol
(CDP), to a normal browser that you launched and logged into yourself**, and
drives that live, authenticated session.

> Unofficial, community tool for **your own account**. Not affiliated with or
> endorsed by XJTLU. Use it within the university's acceptable-use policy.

## Why it works this way (and nothing else does)

Two walls, both confirmed by testing, rule out the "normal" approaches:

1. **No session reuse.** SITS binds the session to server-side navigation state
   (the `?<token>` on every URL) — a fresh cookie, even from the same machine
   with full browser headers, is rejected with *"Automatic Logout"*. So you
   cannot replay the session over plain HTTP.
2. **No automated login.** The XJTLU identity provider (`uim.xjtlu.edu.cn`) is a
   SPA behind a slider captcha + anti-bot fingerprinting that **white-screens any
   automation-launched browser** (Playwright, bundled or real-channel).

The way through both: a **normal browser you launch and log into by hand**. The
IdP renders fine (it's a real browser, you solve the captcha), and because it's
the real client that owns the session, SITS happily lets `ebr` drive it via CDP —
no logout, no re-login per command. Navigation in SITS is just following the
token-carrying `<a href>` links on the current page, which is exactly what a
browser (driven over CDP) does.

## Install

macOS, Node ≥ 18, and Microsoft Edge or Google Chrome.

```bash
git clone <this-repo> ebridge-cli
cd ebridge-cli
npm install          # only playwright-core (no browser download)
npm run build
npm link             # exposes the global `ebr` command
```

## Log in (once per session)

```bash
ebr login            # launches a dedicated Edge (debug port 9222, own profile)
```

A browser window opens at e-Bridge. Click **SSO LOGIN** and complete the XJTLU
login **by hand**. Keep that window open — every `ebr` command drives it. When
SITS times out, just log in again in the same window (it's still open).

```bash
ebr login --browser chrome    # use Chrome instead of Edge
ebr login --port 9333         # use a different debug port
```

## Use

```bash
ebr status                    # is the browser up and logged in? which screen?
ebr whoami
ebr menu                      # the current screen's menu / links
ebr map                       # the Site Map — the full inventory of screens
ebr go "<link text>"          # follow any menu/link by its visible text
ebr read [--json]             # dump the current screen's tables (or text)
ebr screenshot [file.png]

# export the transcript to a file (md / csv / json):
ebr transcript -o transcript.md
ebr transcript --format csv -o transcript.csv

# curated shortcuts (navigate + read):
ebr records                   # Full Academic Records (transcript + grades)
ebr marks                     # Component Marks (current-year breakdown)
ebr timetable
ebr registration
ebr academic                  # records by module
```

`--json` prints structured data on stdout (tables as arrays of rows); human
tables go to stderr, so pipes stay clean. `ebr go` + `ebr read` + `ebr map` reach
**every** screen the portal has, now or after a redesign — nothing is hard-coded.

## How it's organized

```
src/
  index.ts     # CLI dispatch
  config.ts    # settings (browser, port, profile) — no secrets stored
  launch.ts    # `ebr login`: spawn a normal browser with a CDP port
  cdp.ts       # attach over CDP; navigate SITS; scrape tables (the core)
  commands.ts  # status/menu/map/go/read + curated shortcuts
skill/SKILL.md # agent operating guide for `ebr`
```

## Honest limitations

- **The browser must stay open and logged in.** `ebr` holds no session of its
  own; it drives the window you logged into. Close it → `ebr` can't work until
  `ebr login` again.
- **SITS sessions are short.** Expect to re-login (in the open window) every so
  often. `ebr status` tells you when it has timed out.
- **A visible window, not headless.** By design — you must be able to log in.
- **macOS first.** Browser paths are set for macOS Edge/Chrome; override with
  `EBR_BROWSER_PATH`. The CDP approach itself is cross-platform.
- **Local debug port.** `ebr login` opens a local CDP port (default 9222); on a
  shared machine, be aware other local processes could attach to it.

## Security & privacy

Nothing secret is stored by `ebr` — the session lives only inside the browser.
Config (browser/port/profile) is in `~/.config/ebridge/` (override `EBR_HOME`).
The tool only ever talks to the local debug port and the site you navigate to.

## License

MIT — see [LICENSE](LICENSE).
