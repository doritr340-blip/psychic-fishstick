// The app's server: static files come from ./public, and /api/d/<device>/... reaches one
// Durable Object per phone. That object keeps the phone's push subscription and a copy of
// its schedule, and wakes itself with an alarm at the minute of each reminder to send it.

import { DurableObject } from 'cloudflare:workers';
import { generateVapidKeys, sendPush } from './webpush.js';
import { dueEvents, localParts, nextDay, notificationFor } from './schedule.js';

const ID_RE = /^[A-Za-z0-9_-]{22,64}$/;
const MAX_BODY = 512 * 1024;
const LATE_MIN = 15; // like the app: a reminder still goes out up to 15 minutes late
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = /^\/api\/d\/([^/]+)\/([a-z]+)$/.exec(url.pathname);
    if (!m) {
      if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
      return env.ASSETS.fetch(request);
    }
    if (!ID_RE.test(m[1])) return json({ error: 'bad_device' }, 400);
    const stub = env.DEVICE.get(env.DEVICE.idFromName(m[1]));
    return stub.fetch(new Request(`https://device/${m[2]}`, { method: request.method, headers: { 'X-Origin': url.origin, 'Content-Type': 'application/json' }, body: request.method === 'POST' ? request.body : undefined }));
  }
};

export class Device extends DurableObject {
  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    let body = {};
    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
      try { body = text ? JSON.parse(text) : {}; } catch (e) { return json({ error: 'bad_json' }, 400); }
    }
    const S = this.ctx.storage;

    if (action === 'key' && request.method === 'GET') return json({ publicKey: (await this.vapid()).publicKey });

    if (action === 'status' && request.method === 'GET') {
      const sub = await S.get('sub');
      return json({ subscribed: !!sub, endpoint: sub ? sub.endpoint : '', nextAt: await S.getAlarm(), lastError: (await S.get('lastError')) || null });
    }

    if (request.method !== 'POST') return json({ error: 'method' }, 405);

    if (action === 'subscribe') {
      const sub = body.subscription;
      const scheme = this.env.ALLOW_HTTP_PUSH === '1' ? /^https?:\/\// : /^https:\/\//; // http only for local tests
      if (!sub || typeof sub.endpoint !== 'string' || !scheme.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'bad_subscription' }, 400);
      await S.put('sub', { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
      await S.put('subject', request.headers.get('X-Origin') || 'https://luz-yomi.workers.dev');
      await S.delete('lastError');
      if (body.data) await S.put('data', body.data);
      await this.reschedule();
      return json({ ok: true, nextAt: await S.getAlarm() });
    }

    if (action === 'sync') {
      if (!body.data || typeof body.data !== 'object') return json({ error: 'bad_data' }, 400);
      await S.put('data', body.data);
      await this.reschedule();
      return json({ ok: true, subscribed: !!(await S.get('sub')), nextAt: await S.getAlarm() });
    }

    if (action === 'test') {
      const r = await this.send({ title: '🔔 ככה נראית תזכורת', body: 'ההתראות פועלות. הן יגיעו בזמן גם כשהטלפון נעול.', tag: 'test' });
      return json(r, r.ok ? 200 : 502);
    }

    if (action === 'unsubscribe') {
      await S.delete('sub');
      await S.deleteAlarm();
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  }

  async alarm() {
    await this.run(Date.now());
    await this.reschedule();
  }

  async vapid() {
    let v = await this.ctx.storage.get('vapid');
    if (!v) { v = await generateVapidKeys(); await this.ctx.storage.put('vapid', v); }
    return v;
  }

  async send(payload) {
    const S = this.ctx.storage, sub = await S.get('sub');
    if (!sub) return { ok: false, error: 'not_subscribed' };
    let r;
    try {
      r = await sendPush(sub, payload, await this.vapid(), (await S.get('subject')) || 'https://luz-yomi.workers.dev');
    } catch (e) {
      r = { ok: false, status: 0, text: String(e && e.message || e) };
    }
    if (r.gone) { await S.delete('sub'); await S.deleteAlarm(); }
    if (!r.ok) await S.put('lastError', { at: Date.now(), status: r.status, text: (r.text || '').slice(0, 300) });
    return r;
  }

  /** Sends every reminder that is due and not sent yet. */
  async run(now) {
    const S = this.ctx.storage;
    const [sub, data] = [await S.get('sub'), await S.get('data')];
    if (!sub || !data) return;
    const day = localParts(now, data.tz);
    let fired = (await S.get('fired')) || { ymd: '', keys: [] };
    if (fired.ymd !== day.ymd) fired = { ymd: day.ymd, keys: [] };

    const out = [];
    for (const e of dueEvents(data, day)) {
      if (fired.keys.includes(e.key)) continue;
      if (day.min >= e.at && day.min - e.at <= LATE_MIN) out.push(notificationFor(e, data, day, false)), fired.keys.push(e.key);
    }
    for (const s of Array.isArray(data.snooze) ? data.snooze : []) {
      if (!s || !s.e || typeof s.e.key !== 'string' || fired.keys.includes(s.e.key)) continue;
      if (s.at <= now && now - s.at < 2 * 3600e3) out.push(notificationFor(s.e, data, day, true)), fired.keys.push(s.e.key);
    }
    if (!out.length) return;
    await S.put('fired', fired);
    for (const n of out) {
      const r = await this.send(n);
      if (r.gone) break;
    }
  }

  /** Sets the alarm to the next reminder (and at least once an hour, as a safety net). */
  async reschedule() {
    const S = this.ctx.storage;
    const [sub, data] = [await S.get('sub'), await S.get('data')];
    if (!sub || !data) { await S.deleteAlarm(); return; }
    const now = Date.now(), day = localParts(now, data.tz);
    const fired = (await S.get('fired')) || { ymd: '', keys: [] };
    const firedToday = fired.ymd === day.ymd ? fired.keys : [];
    const msAt = (minOfDay) => now + ((minOfDay - day.min) * 60 - day.sec) * 1000 + 500;
    let next = now + 3600e3;
    for (const e of dueEvents(data, day)) {
      if (e.at > day.min && !firedToday.includes(e.key)) next = Math.min(next, msAt(e.at));
    }
    for (const e of dueEvents(data, nextDay(day.ymd))) {
      if (e.at >= 0) next = Math.min(next, msAt(e.at + 1440));
    }
    for (const s of Array.isArray(data.snooze) ? data.snooze : []) {
      if (s && s.at > now && s.e && !firedToday.includes(s.e.key)) next = Math.min(next, s.at + 500);
    }
    await S.setAlarm(Math.max(next, now + 1000));
  }
}
