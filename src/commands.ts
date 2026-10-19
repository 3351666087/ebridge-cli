import * as fs from "fs";
import { EbrSession, EbrError } from "./cdp";
import { emit, note, human, table, isJson } from "./output";

function renderTables(tables: string[][][]): void {
  if (isJson()) return;
  if (!tables.length) { note("(no tables on this screen)"); return; }
  tables.forEach((rows, i) => {
    if (tables.length > 1) note(`\n[table ${i + 1}]`);
    const w: number[] = [];
    for (const r of rows) r.forEach((c, j) => { w[j] = Math.max(w[j] || 0, c.length); });
    const fmt = (r: string[]) => r.map((c, j) => c.padEnd(Math.min(w[j], 40)).slice(0, 40)).join("  ");
    rows.forEach((r, ri) => {
      note(fmt(r));
      if (ri === 0) note(w.map((x) => "-".repeat(Math.min(x, 40))).join("  "));
    });
  });
}

export async function status(sess: EbrSession): Promise<void> {
  const i = await sess.info();
  emit(i);
  human(
    (i.loggedOut ? "SITS session TIMED OUT — log in again in the window." :
      i.authed ? `Logged in${i.userName ? " as " + i.userName : ""}.` : "Not authenticated — log in in the e-Bridge window.") +
    `\nscreen: ${i.screen || "?"} | ${i.title}\n${i.url}`
  );
}

export async function whoami(sess: EbrSession): Promise<void> {
  const i = await sess.ensureAuthed();
  emit({ userName: i.userName, screen: i.screen, url: i.url });
  human(`${i.userName || "(name not found)"} — current screen: ${i.screen}`);
}

export async function menu(sess: EbrSession): Promise<void> {
  await sess.ensureAuthed();
  const links = await sess.links();
  const nav = links.filter((l) => !l.external && l.text && !/^(Skip navigation|Go to top)$/i.test(l.text));
  const rows = nav.map((l) => ({ text: l.text, screen: sess.screenCode(l.href) || (l.js ? "(js)" : ""), target: l.href ? l.href.replace(/\?.*$/, "").replace("https://ebridge.xjtlu.edu.cn/urd/sits.urd/run/", "…/") : "" }));
  emit(nav);
  table(rows, ["text", "screen"]);
  const ext = links.filter((l) => l.external);
  if (ext.length) { human(`\nexternal links: ${ext.map((l) => l.text).join(", ")}`); }
  human(`\nFollow one with:  ebr go "<text>"`);
}

export async function map(sess: EbrSession): Promise<void> {
  await sess.ensureAuthed();
  const site = await sess.findLink("Site Map");
  if (!site) { await sess.ensureHome(); }
  await sess.go("Site Map");
  const links = await sess.links();
  const nav = links.filter((l) => !l.external && l.href && !/^(Skip navigation|Go to top|Home Page|Logout)$/i.test(l.text));
  const rows = nav.map((l) => ({ screen: sess.screenCode(l.href), text: l.text }));
  emit(nav);
  table(rows, ["screen", "text"]);
  human(`\n${rows.length} screen(s) in the site map. Open one with:  ebr go "<text>"`);
}

export async function go(sess: EbrSession, target: string): Promise<void> {
  await sess.ensureAuthed();
  const i = await sess.go(target);
  const tables = await sess.tables();
  emit({ screen: i.screen, title: i.title, url: i.url, tables });
  human(`→ ${i.title} (${i.screen})`);
  renderTables(tables);
}

export async function read(sess: EbrSession): Promise<void> {
  const i = await sess.ensureAuthed();
  const tables = await sess.tables();
  if (tables.length) {
    emit({ screen: i.screen, title: i.title, url: i.url, tables });
    human(`${i.title} (${i.screen})`);
    renderTables(tables);
  } else {
    const text = await sess.mainText();
    emit({ screen: i.screen, title: i.title, url: i.url, text });
    human(`${i.title} (${i.screen})\n\n${text.slice(0, 4000)}`);
  }
}

export async function screenshot(sess: EbrSession, file?: string): Promise<void> {
  await sess.ensureAuthed();
  const out = file || `ebridge-${Date.now()}.png`;
  await sess.screenshot(out);
  emit({ saved: out });
  note(`Saved ${out}`);
}

/** Curated: follow a path of menu links (from Home) then read the destination. */
export async function curated(sess: EbrSession, path: string[]): Promise<void> {
  await sess.ensureAuthed();
  await sess.ensureHome();
  for (const step of path) {
    const link = await sess.findLink(step);
    if (!link) throw new EbrError(`Could not find "${step}" here. Try: ebr map  (or ebr menu)`);
    await sess.go(step);
  }
  await read(sess);
}
