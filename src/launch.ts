import * as fs from "fs";
import { spawn } from "child_process";
import { chromium } from "playwright-core";
import { Config, browserBinary } from "./config";
import { note, debug } from "./output";

async function portAlive(port: number): Promise<boolean> {
  try {
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2500 });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch (or reuse) a NORMAL browser with a remote-debugging port and a
 * dedicated profile, pointed at e-Bridge. The user completes SSO there by hand
 * — because it is a normal, user-launched browser the identity provider renders
 * fine (no anti-bot white-screen), and because it is the real client that owns
 * the session, SITS lets us drive it over CDP without logging out.
 */
export async function login(cfg: Config): Promise<{ launched: boolean }> {
  if (await portAlive(cfg.port)) {
    note(`A browser is already running on port ${cfg.port}.`);
    note(`→ In that window, open ${cfg.baseUrl}/ and complete the XJTLU SSO login if you haven't.`);
    return { launched: false };
  }
  const bin = browserBinary(cfg.browser);
  if (!fs.existsSync(bin)) {
    throw new Error(`Browser not found: ${bin}\nSet EBR_BROWSER_PATH, or EBR_BROWSER=chrome|edge.`);
  }
  fs.mkdirSync(cfg.profileDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${cfg.port}`,
    `--user-data-dir=${cfg.profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    `${cfg.baseUrl}/`,
  ];
  debug("launching", bin, args.join(" "));
  const child = spawn(bin, args, { detached: true, stdio: "ignore" });
  child.unref();
  note(`Launched ${cfg.browser} (debug port ${cfg.port}).`);
  note(`→ In the window that just opened: click "SSO LOGIN" and complete the XJTLU login.`);
  note(`  Keep that window open — every 'ebr' command drives it. Re-login there when the SITS session times out.`);
  return { launched: true };
}
