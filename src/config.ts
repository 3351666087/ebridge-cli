import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Persisted settings for the e-Bridge CLI. No secrets live here — the session
 *  lives entirely inside the browser we attach to. */
export interface Config {
  /** which browser `ebr login` launches */
  browser: "edge" | "chrome";
  /** CDP remote-debugging port we launch + attach to */
  port: number;
  /** dedicated browser profile dir (keeps it separate from the daily browser) */
  profileDir: string;
  baseUrl: string;
  savedAt?: string;
}

export function homeDir(): string {
  const override = process.env.EBR_HOME;
  if (override) return override;
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? path.join(xdg, "ebridge") : path.join(os.homedir(), ".config", "ebridge");
}

function ensureHome(): string {
  const d = homeDir();
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

const BROWSER_PATHS: Record<string, string> = {
  edge: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
};

export function browserBinary(browser: string): string {
  if (process.env.EBR_BROWSER_PATH) return process.env.EBR_BROWSER_PATH;
  return BROWSER_PATHS[browser] || BROWSER_PATHS.edge;
}

export function defaultConfig(): Config {
  return {
    browser: (process.env.EBR_BROWSER as any) || "edge",
    port: process.env.EBR_PORT ? parseInt(process.env.EBR_PORT, 10) : 9222,
    profileDir: path.join(homeDir(), "cdp-profile"),
    baseUrl: process.env.EBR_BASE_URL || "https://ebridge.xjtlu.edu.cn",
  };
}

export function loadConfig(): Config {
  try {
    const raw = fs.readFileSync(path.join(homeDir(), "config.json"), "utf8");
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(cfg: Config): void {
  ensureHome();
  const p = path.join(homeDir(), "config.json");
  fs.writeFileSync(p, JSON.stringify({ ...cfg, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
