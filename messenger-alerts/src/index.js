// Messenger → phone alerts for clients' Facebook Pages, under /m of the main Worker:
//   /m, /m/admin              the management page (its password is chosen on the first visit,
//                             or comes from an ADMIN_PASSWORD secret if one is set)
//   /m/api/...                what the management page calls
//   /m/c/<page>/<secret>/     a client's app: added to the home screen once, it shows a
//                             lock-screen notification for every new Messenger message
//   /m/privacy                the privacy policy
// One Durable Object ("hub") keeps the settings and the connected Pages. About once a minute it
// reads each Page's inbox with the admin's own Page token (no webhook, so no App Review) and
// pushes a Web Push notification to the devices connected to that Page.

import { DurableObject } from 'cloudflare:workers';
import { generateVapidKeys, sendPush } from '../../luz-yomi/src/webpush.js';
import { graph, snippetOf, parseTime, GraphError, INBOX_URL } from './meta.js';
import { PRIVACY_HTML, STYLE } from './pages.js';
import { ADMIN_HTML } from './admin.js';
import { clientHtml, clientManifest, CLIENT_SW } from './client.js';

const POLL_MS = 60e3;            // how often each Page's inbox is read
const REPEAT_WINDOW = 10 * 60e3; // one alert per conversation per 10 minutes
const RATE_BACKOFF = 5 * 60e3;   // pause after Meta asks to slow down
const FEED_MAX = 30;
const LOG_MAX = 80;
const MAX_BODY = 256 * 1024;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const html = (s, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });
const randomId = n => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
const GONE_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>הקישור לא פעיל</title><style>${STYLE}</style></head><body><main><section class="card"><h2>הקישור הזה כבר לא פעיל</h2><p class="sub">אפשר לבקש קישור חדש ממנהלת העמוד.</p></section></main></body></html>`;

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function sameSecret(a, b) {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let d = 0; for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

export async function handleAlerts(request, env) {
  const url = new URL(request.url), path = url.pathname, p = path.replace(/\/+$/, '') || '/m';
  const hub = () => env.ALERTS.get(env.ALERTS.idFromName('hub'));

  if (p === '/m' || p === '/m/admin') return html(ADMIN_HTML);
  if (p === '/m/privacy') return html(PRIVACY_HTML);

  const c = /^\/m\/c\/(\d+)\/([A-Za-z0-9_-]+)(?:\/(.*))?$/.exec(path);
  if (c) {
    const [, pageId, secret, rest] = c;
    if (rest === undefined) return Response.redirect(url.origin + path + '/', 302); // the app lives at the slash-terminated URL
    if (rest === 'sw.js') return new Response(CLIENT_SW, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
    const api = /^api\/([a-z-]+)$/.exec(rest);
    const action = rest === '' ? 'page' : rest === 'manifest.webmanifest' ? 'manifest' : api ? api[1] : '';
    if (!action) return json({ error: 'not_found' }, 404);
    const body = request.method === 'POST' ? await request.text() : undefined;
    if (body && body.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    return hub().fetch(new Request(`https://hub/client/${pageId}/${secret}/${action}${url.search}`, { method: request.method, headers: { 'Content-Type': 'application/json', 'X-Origin': url.origin, 'X-UA': (request.headers.get('User-Agent') || '').slice(0, 160) }, body }));
  }

  const m = /^\/m\/api\/([a-z-]+)$/.exec(p);
  if (m) {
    const open = m[1] === 'auth-status' || m[1] === 'setup', given = request.headers.get('X-Admin-Password') || '';
    if (!open && env.ADMIN_PASSWORD && !(await sameSecret(given, env.ADMIN_PASSWORD))) return json({ error: 'unauthorized' }, 401);
    const body = request.method === 'POST' ? await request.text() : undefined;
    if (body && body.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    // Without an ADMIN_PASSWORD secret, the hub checks the password chosen on the first visit.
    const headers = { 'Content-Type': 'application/json', 'X-Origin': url.origin, 'X-Env-Password': env.ADMIN_PASSWORD ? '1' : '' };
    if (!open && !env.ADMIN_PASSWORD) headers['X-Admin-Password'] = given;
    return hub().fetch(new Request('https://hub/api/' + m[1], { method: request.method, headers, body }));
  }
  return json({ error: 'not_found' }, 404);
}

export class AlertsHub extends DurableObject {
  get api() { return graph(this.env.GRAPH_BASE); }
  async cfg() { return (await this.ctx.storage.get('cfg')) || {}; }
  async pages() { return (await this.ctx.storage.get('pages')) || {}; }
  savePages(p) { return this.ctx.storage.put('pages', p); }
  async log(kind, text) {
    const L = (await this.ctx.storage.get('log')) || [];
    L.unshift({ at: Date.now(), kind, text: String(text).slice(0, 300) });
    await this.ctx.storage.put('log', L.slice(0, LOG_MAX));
  }
  async vapid() {
    let v = await this.ctx.storage.get('vapid');
    if (!v) { v = await generateVapidKeys(); await this.ctx.storage.put('vapid', v); }
    return v;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      let m;
      if ((m = /^\/api\/([a-z-]+)$/.exec(url.pathname))) return await this.admin(m[1], request);
      if ((m = /^\/client\/(\d+)\/([A-Za-z0-9_-]+)\/([a-z-]+)$/.exec(url.pathname))) return await this.client(m[1], m[2], m[3], request, url);
    } catch (e) {
      await this.log('error', e.message || String(e));
      return json({ error: e instanceof GraphError ? 'graph' : 'server', message: e.message }, e instanceof GraphError ? 502 : 500);
    }
    return json({ error: 'not_found' }, 404);
  }

  async alarm() {
    try { await this.pollAll(); } finally { await this.schedule(true); }
  }

  /** Keeps the minute alarm running while there is a Page to watch. */
  async schedule(fromAlarm) {
    const S = this.ctx.storage, pages = await this.pages();
    if (!Object.values(pages).some(p => p.on && !p.tokenBad)) { await S.deleteAlarm(); return; }
    if (fromAlarm || (await S.getAlarm()) == null) await S.setAlarm(Date.now() + (fromAlarm ? POLL_MS : 1000));
  }

  /** Reads every watched Page's inbox once and alerts on messages that arrived since the last read. */
  async pollAll() {
    const pages = await this.pages(), now = Date.now();
    for (const [id, p] of Object.entries(pages)) {
      if (!p.on || p.tokenBad || (p.backoffUntil || 0) > now) continue;
      let convs;
      try { convs = await this.api.conversations(id, p.token); }
      catch (e) {
        p.lastPoll = now;
        const code = e instanceof GraphError ? e.code : 0, prev = p.err;
        if (code === 190 || code === 102 || code === 10 || code === 200) { p.tokenBad = true; p.err = 'הגישה לדף פגה או בוטלה. מדביקים טוקן חדש בשלב 2 ולוחצים "טעינת הדפים".'; }
        else if ([4, 17, 32, 613, 80001, 80006].includes(code)) { p.backoffUntil = now + RATE_BACKOFF; p.err = 'מטא ביקשה להאט. ממשיכים בעוד 5 דקות.'; }
        else p.err = e.message || String(e);
        if (p.err !== prev) await this.log('error', `${p.name}: ${p.err}`);
        continue;
      }
      p.lastPoll = now; p.err = ''; p.backoffUntil = 0;
      // Meta's timestamps are whole seconds, so time alone cannot tell two messages from the same
      // second apart: anything near the watermark is also checked against the message ids seen so far.
      const messagesOf = c => (c.messages && c.messages.data) || [];
      let newest = p.lastSeen || 0;
      for (const c of convs) newest = Math.max(newest, parseTime(c.updated_time));
      p.seen = p.seen || []; p.recent = p.recent || {};
      if (!p.lastSeen) { // first read: remember where the inbox stands, no alerts for old messages
        p.lastSeen = newest || Math.floor(now / 1000) * 1000;
        for (const c of convs) for (const m of messagesOf(c)) p.seen.push(m.id);
        continue;
      }
      const since = p.lastSeen - 1000;
      for (const c of convs) {
        if (parseTime(c.updated_time) < since) continue;
        const inbound = messagesOf(c).filter(m => m.id && !p.seen.includes(m.id) && parseTime(m.created_time) >= since && m.from && String(m.from.id) !== id);
        for (const m of messagesOf(c)) if (m.id && parseTime(m.created_time) >= since && !p.seen.includes(m.id)) p.seen.push(m.id);
        if (!inbound.length) continue;
        inbound.sort((a, b) => parseTime(b.created_time) - parseTime(a.created_time));
        if ((p.recent[c.id] || 0) > now - REPEAT_WINDOW) continue;
        p.recent[c.id] = now;
        const m = inbound[0];
        await this.alert(id, p, { sender: (m.from && m.from.name) || 'פנייה חדשה', snippet: snippetOf(m), conv: c.id, at: parseTime(m.created_time) || now });
      }
      p.lastSeen = Math.max(p.lastSeen, newest);
      if (p.seen.length > 300) p.seen = p.seen.slice(-300);
      for (const [k, t] of Object.entries(p.recent)) if (t < now - REPEAT_WINDOW) delete p.recent[k];
    }
    await this.savePages(pages);
    await this.ctx.storage.put('pollAt', now);
  }

  async alert(pageId, p, a) {
    const r = await this.pushAll(p, { title: `📩 ${p.name}`, body: `${a.sender}: ${a.snippet}`, tag: 'c-' + a.conv, url: INBOX_URL + pageId });
    p.count = (p.count || 0) + 1; p.lastAlert = Date.now();
    const key = 'feed:' + pageId, feed = (await this.ctx.storage.get(key)) || [];
    feed.unshift({ at: a.at, sender: a.sender, snippet: a.snippet, conv: a.conv });
    await this.ctx.storage.put(key, feed.slice(0, FEED_MAX));
    await this.log('sent', `${p.name}: פנייה מ${a.sender}, נשלחה ל־${r.sent} מכשירים${r.failed ? ` (${r.failed} נכשלו)` : ''}`);
  }

  /** Pushes one payload to the Page's devices (or to one device), forgetting devices that are gone. */
  async pushAll(p, payload, onlyDevice) {
    const v = await this.vapid(), subject = (await this.cfg()).subject || 'https://workers.dev';
    const out = { sent: 0, failed: 0, errors: [] };
    for (const [id, d] of Object.entries(p.devices || {})) {
      if (onlyDevice && id !== onlyDevice) continue;
      let r;
      try { r = await sendPush(d.sub, payload, v, subject); } catch (e) { r = { ok: false, status: 0, text: String((e && e.message) || e) }; }
      if (r.ok) out.sent++; else { out.failed++; out.errors.push(`${r.status}: ${(r.text || '').slice(0, 120)}`); }
      if (r.gone) delete p.devices[id];
    }
    return out;
  }

  async client(pageId, secret, action, request, url) {
    const pages = await this.pages(), p = pages[pageId], base = `/m/c/${pageId}/${secret}/`;
    if (!p || !(await sameSecret(secret, p.secret))) return action === 'page' ? html(GONE_HTML, 404) : json({ error: 'not_found' }, 404);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const dev = String(body.deviceId || url.searchParams.get('deviceId') || '');

    if (action === 'page') return html(clientHtml({ base, pageName: p.name, pageId }));
    if (action === 'manifest') return new Response(JSON.stringify(clientManifest({ base, pageName: p.name })), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (action === 'key') return json({ publicKey: (await this.vapid()).publicKey });
    if (action === 'feed') return json({ name: p.name, items: (await this.ctx.storage.get('feed:' + pageId)) || [], devices: Object.keys(p.devices || {}).length, subscribed: !!(p.devices || {})[dev], lastPoll: p.lastPoll || 0, needsReconnect: !!p.tokenBad });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (!DEVICE_RE.test(dev)) return json({ error: 'bad_device' }, 400);

    if (action === 'subscribe') {
      const s = body.subscription, scheme = this.env.ALLOW_HTTP_PUSH === '1' ? /^https?:\/\// : /^https:\/\//; // http only for local tests
      if (!s || typeof s.endpoint !== 'string' || !scheme.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) return json({ error: 'bad_subscription' }, 400);
      p.devices = p.devices || {};
      const fresh = !p.devices[dev];
      p.devices[dev] = { sub: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, at: Date.now(), ua: request.headers.get('X-UA') || '' };
      const c = await this.cfg();
      if (!c.subject) await this.ctx.storage.put('cfg', { ...c, subject: request.headers.get('X-Origin') || '' });
      await this.savePages(pages); await this.schedule();
      if (fresh) await this.log('info', `מכשיר חדש חובר להתראות של ${p.name}`);
      return json({ ok: true, devices: Object.keys(p.devices).length });
    }
    if (action === 'unsubscribe') { if (p.devices) delete p.devices[dev]; await this.savePages(pages); return json({ ok: true }); }
    if (action === 'test') {
      if (!(p.devices || {})[dev]) return json({ error: 'not_subscribed' }, 400);
      const r = await this.pushAll(p, { title: `📩 ${p.name}`, body: 'ככה תיראה התראה על הודעה חדשה במסנג׳ר. ההתראות פועלות.', tag: 'test', url: INBOX_URL + pageId }, dev);
      await this.savePages(pages);
      if (r.sent) await this.ctx.storage.put('testedAt', Date.now());
      return json({ ok: r.sent > 0, errors: r.errors }, r.sent > 0 ? 200 : 502);
    }
    return json({ error: 'not_found' }, 404);
  }

  async admin(action, request) {
    const S = this.ctx.storage, c = await this.cfg();
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const origin = request.headers.get('X-Origin') || '';
    const envPassword = request.headers.get('X-Env-Password') === '1', auth = await S.get('auth');

    if (action === 'auth-status') return json({ needsSetup: !envPassword && !auth });
    if (action === 'setup') {
      if (envPassword || auth) return json({ error: 'already_set' }, 409);
      const pw = String(body.password || '');
      if (pw.length < 8) return json({ error: 'short_password' }, 400);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await S.put('auth', { salt: btoa(String.fromCharCode(...salt)), hash: await passwordHash(pw, salt) });
      await this.log('info', 'נבחרה סיסמה לעמוד הניהול');
      return json({ ok: true });
    }
    if (!envPassword) {
      if (!auth) return json({ error: 'needs_setup' }, 401);
      const salt = Uint8Array.from(atob(auth.salt), ch => ch.charCodeAt(0));
      if (!(await sameSecret(await passwordHash(request.headers.get('X-Admin-Password') || '', salt), auth.hash))) return json({ error: 'unauthorized' }, 401);
    }

    if (action === 'state') {
      await this.schedule();
      const pages = await this.pages();
      return json({
        origin, cfg: { appId: c.appId || '', hasAppSecret: !!c.appSecret },
        pollAt: (await S.get('pollAt')) || 0, testedAt: (await S.get('testedAt')) || 0,
        pages: Object.entries(pages).map(([id, p]) => ({ id, name: p.name, on: p.on, devices: Object.keys(p.devices || {}).length, count: p.count || 0, lastAlert: p.lastAlert || 0, lastPoll: p.lastPoll || 0, err: p.err || '', tokenBad: !!p.tokenBad, link: `${origin}/m/c/${id}/${p.secret}/` })),
        available: ((await S.get('available')) || []).filter(x => !pages[x.id]).map(x => ({ id: x.id, name: x.name })),
        log: (await S.get('log')) || []
      });
    }

    if (action === 'config') {
      const next = { ...c };
      if (typeof body.appId === 'string') next.appId = body.appId.trim();
      if (typeof body.appSecret === 'string' && body.appSecret.trim()) next.appSecret = body.appSecret.trim();
      await S.put('cfg', next);
      return json({ ok: true });
    }

    if (action === 'load-pages') {
      let token = String(body.userToken || '').trim();
      if (!token) return json({ error: 'missing_token' }, 400);
      if (!c.appId || !c.appSecret) return json({ error: 'need_app' }, 400);
      let longLived = true;
      try { token = await this.api.longLivedUserToken(c.appId, c.appSecret, token); } catch (e) { longLived = false; }
      const list = await this.api.myPages(token);
      await S.put('available', list.map(x => ({ id: String(x.id), name: x.name, token: x.access_token })));
      // Pages that are already connected get the fresh token, which also repairs an expired one.
      const pages = await this.pages(); let refreshed = 0;
      for (const x of list) {
        const p = pages[String(x.id)];
        if (!p) continue;
        p.token = x.access_token; p.name = x.name; refreshed++;
        if (p.tokenBad) { p.tokenBad = false; p.err = ''; await this.log('info', `הגישה לדף ${p.name} חודשה`); }
      }
      if (refreshed) { await this.savePages(pages); await this.schedule(); }
      return json({ ok: true, count: list.length, longLived, refreshed });
    }

    if (action === 'connect') {
      const a = ((await S.get('available')) || []).find(x => x.id === String(body.pageId));
      if (!a) return json({ error: 'unknown_page' }, 400);
      const pages = await this.pages();
      pages[a.id] = { name: a.name, token: a.token, on: true, secret: randomId(18), connectedAt: Date.now(), devices: {}, count: 0, lastSeen: 0, recent: {} };
      await this.savePages(pages); await this.schedule();
      await this.log('info', `העמוד ${a.name} חובר`);
      return json({ ok: true });
    }

    if (action === 'poll-now') { await this.pollAll(); await this.schedule(); return json({ ok: true, pollAt: (await S.get('pollAt')) || 0 }); }

    const pages = await this.pages(), p = pages[String(body.pageId)];
    if (!p) return json({ error: 'unknown_page' }, 400);

    if (action === 'update') {
      if (typeof body.on === 'boolean') p.on = body.on;
      await this.savePages(pages); await this.schedule();
      return json({ ok: true });
    }
    if (action === 'relink') {
      p.secret = randomId(18); p.devices = {};
      await this.savePages(pages);
      await this.log('info', `נוצר קישור חדש לעמוד ${p.name}; המכשירים הקודמים נותקו`);
      return json({ ok: true });
    }
    if (action === 'disconnect') {
      delete pages[String(body.pageId)];
      await this.savePages(pages); await S.delete('feed:' + body.pageId); await this.schedule();
      await this.log('info', `העמוד ${p.name} נותק`);
      return json({ ok: true });
    }
    if (action === 'test') {
      if (!Object.keys(p.devices || {}).length) return json({ error: 'no_devices' }, 400);
      const r = await this.pushAll(p, { title: `📩 ${p.name}`, body: 'בדיקה ממנהלת העמוד: ככה תיראה התראה על הודעה חדשה במסנג׳ר.', tag: 'test', url: INBOX_URL + body.pageId });
      await this.savePages(pages);
      if (r.sent) await S.put('testedAt', Date.now());
      await this.log(r.sent ? 'sent' : 'error', `בדיקה ל־${p.name}: ${r.sent} נשלחו${r.failed ? `, ${r.failed} נכשלו` : ''}`);
      return json({ ok: r.sent > 0, sent: r.sent, failed: r.failed, errors: r.errors }, r.sent > 0 ? 200 : 502);
    }
    return json({ error: 'not_found' }, 404);
  }
}
