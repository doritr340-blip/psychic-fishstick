// The client's side: a small page per Facebook Page that is added to the phone's home screen
// and shows a lock-screen notification for every new Messenger message.
// The inline script avoids backticks and "${" so it can live inside a template literal.

import { STYLE } from './pages.js';
import { INBOX_URL } from './meta.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function clientManifest({ base, pageName }) {
  return {
    name: `התראות: ${pageName}`, short_name: pageName.slice(0, 12), lang: 'he', dir: 'rtl',
    start_url: base, scope: base, display: 'standalone', background_color: '#F5F4FB', theme_color: '#1E8A71',
    icons: [
      { src: '/m/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/m/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/m/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}

export function clientHtml({ base, pageName, pageId }) {
  const inbox = INBOX_URL + pageId;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#1E8A71"><link rel="manifest" href="${esc(base)}manifest.webmanifest"><link rel="apple-touch-icon" href="/m/icon-180.png"><link rel="icon" href="/m/icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(pageName.slice(0, 12))}"><title>התראות: ${esc(pageName)}</title><style>${STYLE}
.hero{background:linear-gradient(135deg,#1E8A71,#3DBB98);color:#fff;border-radius:16px;padding:18px 16px;margin:8px 0 14px}
.hero h1{color:#fff;margin:0 0 .2rem;font-size:1.35rem}.hero p{color:rgba(255,255,255,.9);margin:0}
.item{border-top:1px solid var(--line);padding:10px 0}.item:first-child{border-top:0}
.item b{display:block}.item .t{color:var(--fg2);font-size:.82rem}
a.btn{display:inline-flex;align-items:center;justify-content:center;font-weight:600;border:1px solid var(--accent);background:var(--accent);color:var(--on-accent);border-radius:10px;padding:9px 14px;min-height:44px;text-decoration:none}
.big{width:100%}
</style></head><body><main>
<div class="hero"><p>📩 התראות מהעמוד</p><h1>${esc(pageName)}</h1><p id="hero-st" class="sub" style="color:rgba(255,255,255,.9)">בודקים…</p></div>

<section class="card" id="box"></section>

<section class="card">
  <h2>פניות אחרונות</h2>
  <div id="feed"><p class="sub">עוד אין פניות מאז החיבור.</p></div>
  <div class="row"><a class="btn main big" href="${esc(inbox)}" target="_blank" rel="noopener" style="text-decoration:none">פתיחת תיבת ההודעות</a></div>
</section>
<p class="sub" style="text-align:center">ההתראות נשלחות מהמערכת של מנהלת העמוד. <a href="/m/privacy">פרטיות</a></p>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BASE = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  const API = BASE + 'api/';
  const INBOX = ${JSON.stringify(inbox)};
  const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (() => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } })();
  let dev = ''; try { dev = localStorage.getItem('pa-dev') || ''; } catch (e) {}
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(dev)) {
    dev = btoa(String.fromCharCode.apply(null, Array.from(crypto.getRandomValues(new Uint8Array(18))))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    try { localStorage.setItem('pa-dev', dev); } catch (e) {}
  }
  const b64 = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'), b = atob(t + '='.repeat((4 - t.length % 4) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const post = (a, body) => fetch(API + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const fmt = t => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  let state = { subscribed: false, busy: false, msg: '', ok: false };

  function render(feed) {
    const box = $('#box'); let o = '';
    const btn = (id, label, kind) => '<button class="btn ' + kind + '" id="' + id + '"' + (state.busy ? ' disabled' : '') + '>' + label + '</button>';
    const msg = state.msg ? '<p class="msg ' + (state.ok ? 'ok' : 'bad') + '" role="status">' + esc(state.msg) + '</p>' : '';
    if (isIos && !standalone) { // iPhone: push works only from the home-screen app
      o = '<h2>צעד אחד להפעלה</h2><p>כדי שההתראות יגיעו גם כשהטלפון נעול, מוסיפים את העמוד הזה למסך הבית:</p><ol class="how"><li>לוחצים על כפתור <b>השיתוף</b> בספארי (ריבוע עם חץ למעלה).</li><li>בוחרים <b>הוספה למסך הבית</b> ואז <b>הוסף</b>.</li><li>פותחים את האייקון החדש שנוסף למסך הבית.</li></ol>';
      $('#hero-st').textContent = 'עוד לא הופעל';
    } else if (!PUSH_OK) {
      o = '<h2>הדפדפן הזה לא תומך בהתראות</h2><p class="sub">באייפון צריך iOS 16.4 ומעלה ולפתוח מהאייקון במסך הבית. באנדרואיד כדאי לפתוח בכרום.</p>';
      $('#hero-st').textContent = 'לא נתמך כאן';
    } else if (Notification.permission === 'denied') {
      o = '<h2>ההתראות חסומות</h2><p class="sub">אפשר לאשר אותן בהגדרות של הטלפון, תחת התראות.</p>';
      $('#hero-st').textContent = 'חסום';
    } else if (state.subscribed) {
      o = '<h2>✅ ההתראות פועלות</h2><p class="sub">כל הודעה חדשה במסנג׳ר תקפוץ על המסך הנעול תוך דקה.' + (!standalone && !isIos ? ' כדאי להוסיף את העמוד למסך הבית, כדי שזה יעבוד תמיד.' : '') + '</p>' + msg + '<div class="row">' + btn('test', 'שליחת התראת בדיקה', '') + btn('off', 'כיבוי', 'quiet') + '</div>';
      $('#hero-st').textContent = 'פעיל במכשיר הזה';
    } else {
      o = '<h2>הפעלת התראות</h2><p class="sub">לחיצה אחת, ומעכשיו כל הודעה חדשה בעמוד מגיעה אליך לטלפון.</p>' + msg + '<div class="row">' + btn('on', state.busy ? 'מפעילים…' : 'הפעלת התראות', 'main') + '</div>';
      $('#hero-st').textContent = 'עוד לא הופעל';
    }
    box.innerHTML = o;
    if (feed) $('#feed').innerHTML = feed.length ? feed.map(x => '<div class="item"><span class="t">' + fmt(x.at) + '</span><b>' + esc(x.sender) + '</b><span>' + esc(x.snippet) + '</span></div>').join('') : '<p class="sub">עוד אין פניות מאז החיבור.</p>';
  }
  async function sub() { if (!PUSH_OK) return null; try { const r = await navigator.serviceWorker.ready; return await r.pushManager.getSubscription(); } catch (e) { return null; } }
  async function refresh() {
    let feed = [];
    try { const d = await (await fetch(API + 'feed?deviceId=' + dev)).json(); feed = d.items || []; state.subscribed = !!d.subscribed && !!(await sub()); } catch (e) {}
    render(feed);
  }
  const busy = async fn => { state.busy = true; state.msg = ''; render(); try { await fn(); } finally { state.busy = false; render(); await refresh(); } };
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'on') busy(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { state.msg = 'לא אושרו התראות. אפשר לנסות שוב.'; return; }
        const reg = await navigator.serviceWorker.ready, k = await (await fetch(API + 'key')).json();
        let s = await reg.pushManager.getSubscription();
        if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.publicKey) });
        const r = await post('subscribe', { subscription: s.toJSON(), deviceId: dev });
        if (!r.ok) throw new Error('server');
        state.msg = 'ההתראות הופעלו. אפשר לשלוח בדיקה.'; state.ok = true;
      } catch (err) { state.msg = 'לא הצלחנו להפעיל. כדאי לבדוק שיש אינטרנט ולנסות שוב.'; state.ok = false; }
    });
    if (b.id === 'test') busy(async () => {
      const r = await post('test', { deviceId: dev });
      state.ok = r.ok; state.msg = r.ok ? 'נשלחה התראת בדיקה. אפשר לנעול את הטלפון ולחכות לה.' : 'ההתראה לא נשלחה. אפשר לכבות ולהפעיל מחדש.';
    });
    if (b.id === 'off') busy(async () => {
      try { const s = await sub(); if (s) await s.unsubscribe(); } catch (err) {}
      await post('unsubscribe', { deviceId: dev });
      state.msg = 'ההתראות כובו במכשיר הזה.'; state.ok = true;
    });
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  refresh();
})();
</script></body></html>`;
}

export const CLIENT_SW = `// Shows the alerts the server pushes, and opens the Page inbox when one is tapped.
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).then(res => { caches.open('pa-v1').then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'הודעה חדשה בעמוד', { body: d.body || '', tag: d.tag || undefined, renotify: true, icon: '/m/icon-192.png', badge: '/m/icon-192.png', lang: 'he', dir: 'rtl', data: { url: d.url || '' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.openWindow(url));
});
`;
