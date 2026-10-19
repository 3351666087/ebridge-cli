import { chromium, Browser, Page } from "playwright-core";
import { Config } from "./config";
import { debug } from "./output";

export class EbrError extends Error {
  constructor(msg: string) { super(msg); this.name = "EbrError"; }
}

export interface PageInfo {
  url: string;
  title: string;
  screen: string; // SITS screen code from the URL, e.g. SIW_PORTAL
  userName?: string;
  authed: boolean;
  loggedOut: boolean;
}

export interface LinkInfo {
  text: string;
  href: string; // absolute (empty if JS-only)
  js: boolean; // true if a javascript:/onclick link
  external: boolean; // points outside ebridge
}

const AUTHED_EVAL = `(function(){
  var pw=document.querySelector('input[name="PASSWORD.DUMMY.MENSYS.1"]');
  var txt=(document.body?document.body.innerText:'');
  var out={
    url:location.href, title:document.title,
    loggedOut:/Automatic Logout|EVL_020/.test(txt),
    hasLogin: !!pw,
    inRun:/\\/urd\\/sits\\.urd\\/run\\//.test(location.href),
    textLen:txt.length
  };
  var m=txt.match(/^\\s*Skip navigation\\s*([^\\n(]{1,40})\\s*\\(Logout\\)/m);
  out.userName=m?m[1].trim():null;
  return out;
})()`;

export class EbrSession {
  private constructor(public browser: Browser, public page: Page, public cfg: Config) {}

  static async connect(cfg: Config, opts: { open?: boolean } = {}): Promise<EbrSession> {
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cfg.port}`, { timeout: 4000 });
    } catch (e) {
      throw new EbrError(
        `No e-Bridge browser is running on port ${cfg.port}. Start it with:\n  ebr login`
      );
    }
    // Find a tab already on ebridge; else optionally open one.
    let page: Page | undefined;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (new RegExp(cfg.baseUrl.replace(/^https?:\/\//, "").replace(/\./g, "\\.")).test(p.url())) { page = p; break; }
      }
      if (page) break;
    }
    if (!page) {
      if (!opts.open) {
        throw new EbrError(`No e-Bridge tab is open in the browser. Run 'ebr login' and log in, then retry.`);
      }
      const ctx = browser.contexts()[0] || (await browser.newContext());
      page = await ctx.newPage();
      await page.goto(cfg.baseUrl + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    return new EbrSession(browser, page, cfg);
  }

  async close(): Promise<void> {
    // Detach only — never close the user's browser.
    try { await this.browser.close(); } catch { /* ignore (CDP detach) */ }
  }

  screenCode(url: string): string {
    const m = url.match(/\/run\/([A-Za-z_]+)(?:\.[a-z_]+)?/);
    return m ? m[1].toUpperCase() : "";
  }

  async info(): Promise<PageInfo> {
    const r: any = await this.page.evaluate(AUTHED_EVAL);
    const authed = !r.hasLogin && r.inRun && !r.loggedOut && r.textLen > 400;
    return {
      url: r.url, title: r.title, screen: this.screenCode(r.url),
      userName: r.userName || undefined, authed, loggedOut: !!r.loggedOut,
    };
  }

  async ensureAuthed(): Promise<PageInfo> {
    const i = await this.info();
    if (i.loggedOut) throw new EbrError("The SITS session has timed out (Automatic Logout). Log in again in the e-Bridge window (or run: ebr login).");
    if (!i.authed) throw new EbrError("Not on an authenticated e-Bridge screen. Log in in the e-Bridge window, then retry.");
    return i;
  }

  async links(): Promise<LinkInfo[]> {
    const host = this.cfg.baseUrl.replace(/^https?:\/\//, "");
    const raw: any[] = await this.page.evaluate(`(function(){
      return [].slice.call(document.querySelectorAll('a')).map(function(a){
        var href=a.getAttribute('href')||'';
        return {
          text:(a.textContent||'').replace(/\\s+/g,' ').trim(),
          abs: (href && href.indexOf('javascript:')!==0 && href[0]!=='#') ? a.href : '',
          js: href.indexOf('javascript:')===0 || !!a.getAttribute('onclick')
        };
      }).filter(function(x){return x.text;});
    })()`);
    const seen = new Set<string>();
    const out: LinkInfo[] = [];
    for (const r of raw) {
      const key = (r.abs || r.text) + "|" + r.text;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: r.text, href: r.abs, js: !!r.js, external: !!r.abs && !r.abs.includes(host) });
    }
    return out;
  }

  /** Find the best link matching the given visible text (case-insensitive). */
  async findLink(text: string): Promise<LinkInfo | null> {
    const links = await this.links();
    const q = text.toLowerCase().trim();
    return (
      links.find((l) => l.text.toLowerCase() === q) ||
      links.find((l) => l.text.toLowerCase().startsWith(q)) ||
      links.find((l) => l.text.toLowerCase().includes(q)) ||
      null
    );
  }

  /** Navigate by following a link (by visible text or an absolute href). */
  async go(target: string): Promise<PageInfo> {
    let href = target;
    if (!/^https?:\/\//.test(target)) {
      const link = await this.findLink(target);
      if (!link) throw new EbrError(`No link matching "${target}" on the current screen. Try: ebr menu`);
      if (!link.href) {
        // JS-only link: click it by text.
        await this.page.locator("a", { hasText: link.text }).first().click({ timeout: 8000 }).catch(() => {});
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});
        return this.info();
      }
      href = link.href;
    }
    await this.page.goto(href, { waitUntil: "domcontentloaded" });
    return this.info();
  }

  /** Make sure the main portal menu is available (go Home if needed). */
  async ensureHome(): Promise<void> {
    const link = await this.findLink("Home Page");
    if (link && link.href) { await this.page.goto(link.href, { waitUntil: "domcontentloaded" }); }
  }

  /** Extract every data table on the current screen as rows of cells. */
  async tables(): Promise<string[][][]> {
    return this.page.evaluate(`(function(){
      return [].slice.call(document.querySelectorAll('table')).map(function(t){
        return [].slice.call(t.querySelectorAll('tr')).map(function(tr){
          return [].slice.call(tr.querySelectorAll('th,td')).map(function(c){return (c.innerText||'').replace(/\\s+/g,' ').trim();});
        }).filter(function(r){return r.some(function(c){return c;});});
      }).filter(function(t){return t.length>0 && t.some(function(r){return r.length>1;});});
    })()`) as Promise<string[][][]>;
  }

  async mainText(): Promise<string> {
    return this.page.evaluate(`(function(){
      var el=document.querySelector('#sv-content,#content,main,.sv-content')||document.body;
      return (el?el.innerText:'').replace(/\\n{3,}/g,'\\n\\n').trim();
    })()`) as Promise<string>;
  }

  async screenshot(file: string): Promise<void> {
    await this.page.screenshot({ path: file, fullPage: true });
  }
}
