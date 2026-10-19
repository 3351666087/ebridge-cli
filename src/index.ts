#!/usr/bin/env node
import { loadConfig, saveConfig, Config } from "./config";
import { EbrSession, EbrError } from "./cdp";
import { login } from "./launch";
import * as cmd from "./commands";
import { setJsonMode, emit, note, isJson, debug } from "./output";

function parse(argv: string[]) {
  const positionals: string[] = [];
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    let key: string | null = null;
    if (t.startsWith("--")) key = t.slice(2);
    else if (t.startsWith("-") && t.length > 1 && isNaN(Number(t))) key = t.slice(1);
    if (key) {
      const bool = ["json", "debug", "help"].includes(key);
      if (!bool && i + 1 < argv.length && !argv[i + 1].startsWith("--")) opts[key] = argv[++i];
      else opts[key] = true;
    } else positionals.push(t);
  }
  return { positionals, opts };
}

const USAGE = `ebr — XJTLU e-Bridge (SITS:Vision) CLI

  How it works: a normal browser you launch and log into yourself; every command
  attaches to it over CDP and drives the live, authenticated SITS session.

  Setup / session:
    ebr login [--browser edge|chrome] [--port 9222]
                          launch the browser; log in via SSO in that window
    ebr status [--json]   is the browser up and logged in? which screen?
    ebr whoami

  Navigate & read (works on anything, present or future):
    ebr menu              list the current screen's menu / links
    ebr map               open the Site Map — the full inventory of screens
    ebr go "<link text>"  follow a menu/link by its visible text
    ebr read [--json]     dump the current screen's tables (or text)
    ebr screenshot [file]

  Curated shortcuts (navigate + read):
    ebr records           Full Academic Records (transcript + grades)
    ebr marks             Component Marks (current year breakdown)
    ebr timetable
    ebr registration
    ebr academic          records by module

  Globals: --json · --debug · EBR_HOME, EBR_PORT, EBR_BROWSER, EBR_DEBUG`;

async function withSession<T>(cfg: Config, open: boolean, fn: (s: EbrSession) => Promise<T>): Promise<T> {
  const s = await EbrSession.connect(cfg, { open });
  try { return await fn(s); } finally { await s.close(); }
}

async function main(): Promise<number> {
  const { positionals, opts } = parse(process.argv.slice(2));
  if (opts.json) setJsonMode(true);
  if (opts.debug) process.env.EBR_DEBUG = "1";
  const cfg = loadConfig();
  if (typeof opts.port === "string") cfg.port = parseInt(opts.port, 10);
  if (opts.browser === "chrome" || opts.browser === "edge") cfg.browser = opts.browser;
  saveConfig(cfg);

  const command = positionals[0];
  if (!command || command === "help" || opts.help) { note(USAGE); return 0; }

  switch (command) {
    case "login": {
      await login(cfg);
      return 0;
    }
    case "status": return withSession(cfg, false, (s) => cmd.status(s)).then(() => 0);
    case "whoami": return withSession(cfg, true, (s) => cmd.whoami(s)).then(() => 0);
    case "menu": return withSession(cfg, true, (s) => cmd.menu(s)).then(() => 0);
    case "map": return withSession(cfg, true, (s) => cmd.map(s)).then(() => 0);
    case "go":
    case "click": {
      const target = positionals.slice(1).join(" ");
      if (!target) throw new Error('Usage: ebr go "<link text>"');
      return withSession(cfg, true, (s) => cmd.go(s, target)).then(() => 0);
    }
    case "read": return withSession(cfg, true, (s) => cmd.read(s)).then(() => 0);
    case "screenshot": return withSession(cfg, true, (s) => cmd.screenshot(s, positionals[1])).then(() => 0);
    case "records": return withSession(cfg, true, (s) => cmd.curated(s, ["Academic Records", "Full Academic Records"])).then(() => 0);
    case "marks": return withSession(cfg, true, (s) => cmd.curated(s, ["Academic Records", "Component Marks"])).then(() => 0);
    case "timetable": return withSession(cfg, true, (s) => cmd.curated(s, ["Timetables"])).then(() => 0);
    case "registration": return withSession(cfg, true, (s) => cmd.curated(s, ["Registration"])).then(() => 0);
    case "academic": return withSession(cfg, true, (s) => cmd.curated(s, ["Academic Records", "by Module"])).then(() => 0);
    default:
      note(`Unknown command: ${command}\n\n` + USAGE);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (err instanceof EbrError) {
      note(err.message);
      if (isJson()) emit({ error: "ebr", message: err.message });
      process.exit(3);
    }
    note("Error: " + (err instanceof Error ? err.message : String(err)));
    if (isJson()) emit({ error: "general", message: String(err) });
    process.exit(1);
  });
