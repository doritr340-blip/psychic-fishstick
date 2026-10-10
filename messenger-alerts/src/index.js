// Messenger → WhatsApp alerts. Everything lives under /m:
//   /m/webhook   Meta calls this for new Messenger messages (and WhatsApp delivery statuses)
//   /m/admin     the management page (password = the ADMIN_PASSWORD secret)
//   /m/api/...   what the management page calls
//   /m/privacy   the privacy policy Meta asks for
// One Durable Object ("hub") keeps the settings, the connected pages and a short log.

import { DurableObject } from 'cloudflare:workers';
import { graph, messageSnippet, normalizePhone, validSignature, GraphError, TEMPLATE_NAME } from './meta.js';
import { ADMIN_HTML, PRIVACY_HTML } from './pages.js';

const REPEAT_WINDOW = 10 * 60e3; // one alert per conversation per 10 minutes
const LOG_MAX = 80;
const MAX_BODY = 256 * 1024;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const html = s => new Response(s, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });

async function sameSecret(a, b) {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let d = 0; for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

export async function handleAlerts(request, env) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/m';
  const hub = () => env.ALERTS.get(env.ALERTS.idFromName('hub'));

  if (path === '/m' || path === '/m/admin') return html(ADMIN_HTML);
  if (path === '/m/privacy') return html(PRIVACY_HTML);

  if (path === '/m/webhook') {
    if (request.method === 'GET') return hub().fetch(new Request('https://hub/verify' + url.search));
    if (request.method === 'POST') {
      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY) return new Response('too large', { status: 413 });
      return hub().fetch(new Request('https://hub/event', { method: 'POST', headers: { 'X-Hub-Signature-256': request.headers.get('X-Hub-Signature-256') || '' }, body }));
    }
    return new Response('method', { status: 405 });
  }

  const m = /^\/m\/api\/([a-z-]+)$/.exec(path);
  if (m) {
    if (!env.ADMIN_PASSWORD) return json({ error: 'no_admin_password' }, 503);
    if (!(await sameSecret(request.headers.get('X-Admin-Password') || '', env.ADMIN_PASSWORD))) return json({ error: 'unauthorized' }, 401);
    const body = request.method === 'POST' ? await request.text() : undefined;
    if (body && body.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    return hub().fetch(new Request('https://hub/api/' + m[1], { method: request.method, headers: { 'Content-Type': 'application/json', 'X-Origin': url.origin }, body }));
  }
  return json({ error: 'not_found' }, 404);
}

export class AlertsHub extends DurableObject {
  get api() { return graph(this.env.GRAPH_BASE); }

  async cfg() {
    let c = await this.ctx.storage.get('cfg');
    if (!c) {
      const b = crypto.getRandomValues(new Uint8Array(18));
      c = { verifyToken: btoa(String.fromCharCode(...b)).replace(/[+/=]/g, '') };
      await this.ctx.storage.put('cfg', c);
    }
    return c;
  }
  async pages() { return (await this.ctx.storage.get('pages')) || {}; }
  async log(kind, text, extra) {
    const L = (await this.ctx.storage.get('log')) || [];
    L.unshift({ at: Date.now(), kind, text: String(text).slice(0, 300), ...(extra || {}) });
    await this.ctx.storage.put('log', L.slice(0, LOG_MAX));
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/verify') return this.verify(url.searchParams);
      if (url.pathname === '/event') return await this.event(request);
      if (url.pathname.startsWith('/api/')) return await this.admin(url.pathname.slice(5), request);
    } catch (e) {
      await this.log('error', e.message || String(e));
      return json({ error: e instanceof GraphError ? 'graph' : 'server', message: e.message }, e instanceof GraphError ? 502 : 500);
    }
    return json({ error: 'not_found' }, 404);
  }

  /** Meta's one-time check when the webhook URL is saved in the app dashboard. */
  async verify(q) {
    const c = await this.cfg();
    if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === c.verifyToken) {
      await this.log('info', 'Meta אישרה את כתובת ה־Webhook');
      return new Response(q.get('hub.challenge') || '', { headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }

  async event(request) {
    const raw = await request.arrayBuffer(), c = await this.cfg();
    if (!(await validSignature(raw, request.headers.get('X-Hub-Signature-256'), c.appSecret))) {
      await this.log('warn', 'התקבלה בקשה בלי חתימה תקינה של Meta, והיא נדחתה');
      return new Response('bad signature', { status: 401 });
    }
    let body; try { body = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { return new Response('bad json', { status: 400 }); }

    if (body.object === 'page') {
      for (const entry of body.entry || []) for (const ev of entry.messaging || []) await this.onMessage(String(entry.id), ev, c);
    } else if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) for (const ch of entry.changes || []) {
        for (const st of (ch.value && ch.value.statuses) || []) {
          if (st.status === 'failed') await this.log('error', `וואטסאפ לא מסר הודעה ל־${st.recipient_id}: ${((st.errors || [])[0] || {}).title || 'שגיאה'}`);
        }
      }
    }
    return new Response('ok');
  }

  async onMessage(pageId, ev, c) {
    const msg = ev.message;
    if (!msg || msg.is_echo || !ev.sender || String(ev.sender.id) === pageId) return;
    const pages = await this.pages(), p = pages[pageId];
    if (!p || !p.on || !p.numbers.length) return;

    const psid = String(ev.sender.id), tk = `seen:${pageId}:${psid}`, now = Date.now();
    const last = (await this.ctx.storage.get(tk)) || 0;
    if (now - last < REPEAT_WINDOW) return; // the client already got an alert for this conversation
    await this.ctx.storage.put(tk, now);

    if (!c.waToken || !c.waPhoneId) { await this.log('error', `הודעה ל־${p.name}, אבל הגדרות הוואטסאפ חסרות`); return; }
    let sender = '';
    try { sender = await this.api.senderName(psid, p.token); } catch (e) { /* the name is optional */ }
    const alert = { pageName: p.name, sender: sender || 'פנייה חדשה', snippet: messageSnippet(msg), pageId };
    let sent = 0;
    for (const to of p.numbers) {
      try { await this.api.sendAlert(c.waPhoneId, c.waToken, to, alert); sent++; }
      catch (e) { await this.log('error', `שליחה ל־${to} נכשלה: ${e.message}`); }
    }
    if (sent) await this.log('sent', `${p.name}: התראה על הודעה מ${alert.sender} נשלחה ל־${sent} מספרים`);
    pages[pageId].lastAlert = now; pages[pageId].count = (p.count || 0) + 1;
    await this.ctx.storage.put('pages', pages);
  }

  async admin(action, request) {
    const S = this.ctx.storage, c = await this.cfg();
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const origin = request.headers.get('X-Origin') || '';

    if (action === 'state') {
      const pages = await this.pages();
      return json({
        webhookUrl: origin + '/m/webhook', privacyUrl: origin + '/m/privacy', verifyToken: c.verifyToken,
        cfg: { appId: c.appId || '', waPhoneId: c.waPhoneId || '', wabaId: c.wabaId || '', hasAppSecret: !!c.appSecret, hasWaToken: !!c.waToken },
        pages: Object.entries(pages).map(([id, p]) => ({ id, name: p.name, numbers: p.numbers, on: p.on, count: p.count || 0, lastAlert: p.lastAlert || 0 })),
        available: ((await S.get('available')) || []).filter(x => !pages[x.id]).map(x => ({ id: x.id, name: x.name })),
        log: (await S.get('log')) || []
      });
    }

    if (action === 'config') {
      const next = { ...c };
      for (const k of ['appId', 'waPhoneId', 'wabaId']) if (typeof body[k] === 'string') next[k] = body[k].trim();
      for (const k of ['appSecret', 'waToken']) if (typeof body[k] === 'string' && body[k].trim()) next[k] = body[k].trim();
      await S.put('cfg', next);
      return json({ ok: true });
    }

    if (action === 'load-pages') {
      let token = String(body.userToken || '').trim();
      if (!token) return json({ error: 'missing_token' }, 400);
      if (c.appId && c.appSecret) {
        try { token = await this.api.longLivedUserToken(c.appId, c.appSecret, token); } catch (e) { /* a long-lived token passes through as is */ }
      }
      const list = await this.api.myPages(token);
      await S.put('available', list.map(x => ({ id: String(x.id), name: x.name, token: x.access_token })));
      return json({ ok: true, count: list.length });
    }

    if (action === 'connect') {
      const avail = (await S.get('available')) || [], a = avail.find(x => x.id === String(body.pageId));
      if (!a) return json({ error: 'unknown_page' }, 400);
      const numbers = parseNumbers(body.numbers);
      if (!numbers.length) return json({ error: 'no_numbers' }, 400);
      await this.api.subscribePage(a.id, a.token);
      const pages = await this.pages();
      pages[a.id] = { name: a.name, token: a.token, numbers, on: true, count: 0, connectedAt: Date.now() };
      await S.put('pages', pages);
      await this.log('info', `העמוד ${a.name} חובר`);
      return json({ ok: true });
    }

    const pages = await this.pages(), p = pages[String(body.pageId)];
    if (['update', 'disconnect', 'test'].includes(action) && !p) return json({ error: 'unknown_page' }, 400);

    if (action === 'update') {
      if (body.numbers != null) { const n = parseNumbers(body.numbers); if (!n.length) return json({ error: 'no_numbers' }, 400); p.numbers = n; }
      if (typeof body.on === 'boolean') p.on = body.on;
      await S.put('pages', pages);
      return json({ ok: true });
    }

    if (action === 'disconnect') {
      try { await this.api.unsubscribePage(String(body.pageId), p.token); } catch (e) { /* the page may already be gone */ }
      delete pages[String(body.pageId)];
      await S.put('pages', pages);
      await this.log('info', `העמוד ${p.name} נותק`);
      return json({ ok: true });
    }

    if (action === 'test') {
      if (!c.waToken || !c.waPhoneId) return json({ error: 'wa_not_configured' }, 400);
      const errors = [];
      for (const to of p.numbers) {
        try { await this.api.sendAlert(c.waPhoneId, c.waToken, to, { pageName: p.name, sender: 'בדיקה', snippet: 'זו הודעת בדיקה. ככה תיראה התראה על הודעה חדשה במסנג׳ר.', pageId: String(body.pageId) }); }
        catch (e) { errors.push(`${to}: ${e.message}`); }
      }
      await this.log(errors.length ? 'error' : 'sent', errors.length ? `בדיקה ל־${p.name} נכשלה: ${errors.join('; ')}` : `נשלחה הודעת בדיקה ל־${p.name}`);
      return json({ ok: !errors.length, errors }, errors.length ? 502 : 200);
    }

    if (action === 'template') {
      if (!c.waToken || !c.wabaId) return json({ error: 'wa_not_configured' }, 400);
      let t = await this.api.templateStatus(c.wabaId, c.waToken);
      if (!t && body.create) { await this.api.createTemplate(c.wabaId, c.waToken); t = await this.api.templateStatus(c.wabaId, c.waToken); await this.log('info', `התבנית ${TEMPLATE_NAME} נשלחה לאישור של Meta`); }
      return json({ ok: true, template: t });
    }

    return json({ error: 'not_found' }, 404);
  }
}

function parseNumbers(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[,;\n]+/);
  return [...new Set(list.map(normalizePhone).filter(Boolean))].slice(0, 5);
}
