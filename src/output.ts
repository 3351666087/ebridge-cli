let jsonMode = false;
export function setJsonMode(on: boolean) { jsonMode = on; }
export function isJson() { return jsonMode; }

export function emit(data: unknown): void {
  if (jsonMode) process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
export function note(msg: string): void {
  process.stderr.write(msg + "\n");
}
export function human(msg: string): void {
  if (!jsonMode) note(msg);
}
export function debug(...a: unknown[]): void {
  if (process.env.EBR_DEBUG) process.stderr.write("[ebr] " + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n");
}

export function table(rows: Record<string, unknown>[], columns?: string[]): void {
  if (jsonMode || !rows.length) { if (!rows.length) note("(no rows)"); return; }
  const cols = columns || Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").replace(/\n/g, " ").length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(w[i])).join("  ");
  note(fmt(cols));
  note(fmt(w.map((x) => "-".repeat(Math.min(x, 60)))));
  for (const r of rows) note(fmt(cols.map((c) => String(r[c] ?? "").replace(/\n/g, " ").slice(0, 80))));
}
