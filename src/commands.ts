import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EbrSession, EbrError } from "./cdp";
import { emit, note, human, table, isJson } from "./output";

function csvCell(s: string): string {
  s = s ?? "";
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(modules: any[]): string {
  const head = ["period", "code", "title", "moduleType", "credit", "mark", "grade", "attempt", "component", "componentType", "weight", "componentMark"];
  const lines = [head.join(",")];
  for (const m of modules) {
    if (m.components && m.components.length) {
      for (const c of m.components) {
        lines.push([m.period, m.code, m.title, m.moduleType, m.credit, m.mark, m.grade, m.attempt, c.component, c.type, c.weight, c.mark].map(csvCell).join(","));
      }
    } else {
      lines.push([m.period, m.code, m.title, m.moduleType, m.credit, m.mark, m.grade, m.attempt, "", "", "", ""].map(csvCell).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

function toMarkdown(modules: any[], title: string, who?: string): string {
  const out: string[] = [];
  out.push(`# Academic Transcript — XJTLU e-Bridge`);
  out.push("");
  if (who) out.push(`**Student:** ${who}  `);
  out.push(`**Source:** ${title}  `);
  out.push(`**Exported:** ${new Date().toISOString().slice(0, 10)} (unofficial — generated from Full Academic Records)`);
  out.push("");
  out.push(`| Period | Code | Module | Type | Credit | Mark | Grade | Attempt |`);
  out.push(`|---|---|---|---|---:|---:|:---:|:---:|`);
  for (const m of modules) {
    out.push(`| ${m.period} | ${m.code} | ${m.title} | ${m.moduleType} | ${m.credit} | ${m.mark} | ${m.grade} | ${m.attempt} |`);
  }
  out.push("");
  out.push(`## Component marks`);
  for (const m of modules) {
    if (!m.components || !m.components.length) continue;
    out.push("");
    out.push(`### ${m.code} — ${m.title} (${m.mark} ${m.grade})`);
    out.push(`| Component | Type | Weight | Mark |`);
    out.push(`|---|---|---:|---:|`);
    for (const c of m.components) out.push(`| ${c.component} | ${c.type} | ${c.weight} | ${c.mark} |`);
  }
  out.push("");
  return out.join("\n");
}

export async function transcript(sess: EbrSession, opts: { format?: string; out?: string }): Promise<void> {
  const who = (await sess.ensureAuthed()).userName;
  await sess.ensureHome();
  for (const step of ["Academic Records", "Full Academic Records"]) {
    const l = await sess.findLink(step);
    if (!l) throw new EbrError(`Could not find "${step}". Try: ebr map`);
    await sess.go(step);
  }
  const data = await sess.extractTranscript();
  if (data.error || !data.modules.length) {
    throw new EbrError(`Could not read the transcript table (${data.error || "0 modules"}). Check with: ebr read`);
  }
  const fmt = (opts.format || "md").toLowerCase();
  let content: string, ext: string;
  if (fmt === "csv") { content = toCsv(data.modules); ext = "csv"; }
  else if (fmt === "json") { content = JSON.stringify({ student: who, source: data.title, exportedAt: new Date().toISOString(), modules: data.modules }, null, 2); ext = "json"; }
  else { content = toMarkdown(data.modules, data.title, who); ext = "md"; }
  const outPath = opts.out || path.join(os.homedir(), `ebridge-transcript.${ext}`);
  fs.writeFileSync(outPath, content);
  emit({ saved: outPath, format: fmt, modules: data.modules.length, student: who });
  note(`Exported ${data.modules.length} modules → ${outPath}`);
}

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
