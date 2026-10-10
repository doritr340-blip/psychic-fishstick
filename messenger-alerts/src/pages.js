// The management page and the privacy policy, served as plain HTML from the Worker.

const STYLE = `
:root{--bg:#F5F4FB;--fg:#26243A;--fg2:#67647D;--line:#E7E5F1;--card:#FFFFFF;--accent:#6A5AE0;--accent-ink:#5442C9;--on-accent:#FFFFFF;--ok:#1E8A71;--ok-bg:#E6F6F0;--bad:#C2453D;--bad-bg:#FFE8E4;--field:#FFFFFF}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14131C;--fg:#ECEAF6;--fg2:#A9A6BE;--line:#2D2B3C;--card:#1E1D2A;--accent:#6A5BE2;--accent-ink:#B4AAFF;--ok:#3DBB98;--ok-bg:#1B2C27;--bad:#F08A80;--bad-bg:#3D2722;--field:#14131C}}
:root[data-theme="dark"]{--bg:#14131C;--fg:#ECEAF6;--fg2:#A9A6BE;--line:#2D2B3C;--card:#1E1D2A;--accent:#6A5BE2;--accent-ink:#B4AAFF;--ok:#3DBB98;--ok-bg:#1B2C27;--bad:#F08A80;--bad-bg:#3D2722;--field:#14131C}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:46rem;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.6rem;margin:.2rem 0 1rem}
h2{font-size:1.15rem;margin:0 0 .6rem}
p{margin:.3rem 0}
.sub{color:var(--fg2);font-size:.92rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
label{display:block;font-weight:600;font-size:.92rem;margin:.7rem 0 .25rem}
input,textarea{width:100%;font:inherit;color:inherit;background:var(--field);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
input:focus,textarea:focus,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:10px;padding:9px 14px;cursor:pointer;min-height:44px}
button.main{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
button.danger{color:var(--bad)}
button:disabled{opacity:.55;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.copy{display:flex;gap:8px;align-items:center}
.copy code{flex:1;min-width:0;overflow-wrap:anywhere;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;direction:ltr;text-align:left;font-size:.88rem}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.82rem;font-weight:600}
.pill.ok{background:var(--ok-bg);color:var(--ok)}.pill.bad{background:var(--bad-bg);color:var(--bad)}.pill.wait{background:var(--bg);color:var(--fg2)}
.page{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}
.page:first-of-type{border-top:0;padding-top:0;margin-top:0}
.log{list-style:none;margin:0;padding:0;font-size:.9rem}
.log li{padding:6px 0;border-bottom:1px solid var(--line)}
.log time{color:var(--fg2);font-size:.82rem;margin-inline-end:6px}
.msg{min-height:1.4em;margin-top:8px;font-size:.92rem}
.msg.bad{color:var(--bad)}.msg.ok{color:var(--ok)}
.ltr{direction:ltr;text-align:left}
details summary{cursor:pointer;font-weight:600}
`;

export const ADMIN_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>התראות מסנג׳ר</title><style>${STYLE}</style></head><body><main>
<h1>📩 התראות מסנג׳ר לוואטסאפ</h1>
<div id="login" class="card" hidden>
  <h2>כניסה</h2>
  <label for="pw">סיסמה</label><input id="pw" type="password" autocomplete="current-password">
  <div class="row"><button class="main" id="go">כניסה</button></div>
  <p class="msg" id="login-msg" role="alert"></p>
</div>
<div id="app" hidden>
  <section class="card">
    <h2>1. הגדרות חיבור למטא</h2>
    <p class="sub">את הערכים האלה מעתיקים מהאפליקציה שפתחת ב־Meta for Developers. הסודות נשמרים בשרת ולא מוצגים שוב.</p>
    <label for="appId">App ID</label><input id="appId" class="ltr" inputmode="numeric">
    <label for="appSecret">App Secret <span class="sub" id="appSecret-st"></span></label><input id="appSecret" class="ltr" type="password" placeholder="השאירי ריק כדי לא לשנות">
    <label for="waToken">טוקן קבוע לוואטסאפ (System User) <span class="sub" id="waToken-st"></span></label><input id="waToken" class="ltr" type="password" placeholder="השאירי ריק כדי לא לשנות">
    <label for="waPhoneId">Phone number ID</label><input id="waPhoneId" class="ltr" inputmode="numeric">
    <label for="wabaId">WhatsApp Business Account ID</label><input id="wabaId" class="ltr" inputmode="numeric">
    <div class="row"><button class="main" id="save-cfg">שמירה</button></div>
    <p class="msg" id="cfg-msg" role="status"></p>
  </section>

  <section class="card">
    <h2>2. כתובת ה־Webhook</h2>
    <p class="sub">מדביקים את שני הערכים האלה באפליקציה במטא, גם במסנג׳ר וגם בוואטסאפ.</p>
    <label>Callback URL</label><div class="copy"><code id="hook"></code><button data-copy="hook">העתקה</button></div>
    <label>Verify token</label><div class="copy"><code id="vtok"></code><button data-copy="vtok">העתקה</button></div>
    <label>מדיניות פרטיות (Privacy Policy URL)</label><div class="copy"><code id="priv"></code><button data-copy="priv">העתקה</button></div>
  </section>

  <section class="card">
    <h2>3. תבנית ההודעה בוואטסאפ</h2>
    <p class="sub">מטא צריכה לאשר את נוסח ההתראה פעם אחת. האישור לוקח בדרך כלל בין כמה דקות לכמה שעות.</p>
    <p>מצב: <span id="tpl-st" class="pill wait">לא נבדק</span></p>
    <div class="row"><button id="tpl-check">בדיקת מצב</button><button class="main" id="tpl-create">שליחת התבנית לאישור</button></div>
    <p class="msg" id="tpl-msg" role="status"></p>
  </section>

  <section class="card">
    <h2>4. חיבור דף של לקוח</h2>
    <p class="sub">מדביקים כאן טוקן משתמש מ־Graph API Explorer, עם ההרשאות pages_show_list, pages_messaging, pages_manage_metadata ו־pages_read_engagement. המערכת תציג את כל הדפים שאת מנהלת.</p>
    <label for="utok">טוקן משתמש</label><textarea id="utok" class="ltr" rows="2"></textarea>
    <div class="row"><button class="main" id="load">טעינת הדפים שלי</button></div>
    <p class="msg" id="load-msg" role="status"></p>
    <div id="avail"></div>
  </section>

  <section class="card">
    <h2>דפים מחוברים</h2>
    <div id="pages"><p class="sub">עוד לא חובר אף דף.</p></div>
  </section>

  <section class="card">
    <details><summary>יומן אחרון</summary><ul class="log" id="log"></ul></details>
  </section>
</div>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let pw = ''; try { pw = sessionStorage.getItem('m-pw') || ''; } catch (e) {}
  const ERR = { unauthorized: 'הסיסמה שגויה', no_admin_password: 'עוד לא הוגדרה סיסמה (ADMIN_PASSWORD) ב־Cloudflare', no_numbers: 'צריך לפחות מספר וואטסאפ תקין אחד', unknown_page: 'הדף לא נמצא. כדאי לטעון את הדפים מחדש', missing_token: 'צריך להדביק טוקן', wa_not_configured: 'קודם ממלאים את הגדרות הוואטסאפ בשלב 1' };
  async function api(action, body) {
    const r = await fetch('/m/api/' + action, { method: body ? 'POST' : 'GET', headers: { 'X-Admin-Password': pw, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(ERR[d.error] || d.message || 'משהו השתבש'); e.code = d.error; throw e; }
    return d;
  }
  const say = (id, text, ok) => { const el = $(id); el.textContent = text || ''; el.className = 'msg' + (text ? (ok ? ' ok' : ' bad') : ''); };
  const fmt = t => t ? new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  function render(s) {
    $('#appId').value = s.cfg.appId; $('#waPhoneId').value = s.cfg.waPhoneId; $('#wabaId').value = s.cfg.wabaId;
    $('#appSecret-st').textContent = s.cfg.hasAppSecret ? '(שמור ✓)' : ''; $('#waToken-st').textContent = s.cfg.hasWaToken ? '(שמור ✓)' : '';
    $('#hook').textContent = s.webhookUrl; $('#vtok').textContent = s.verifyToken; $('#priv').textContent = s.privacyUrl;
    $('#avail').innerHTML = s.available.length ? s.available.map(p => '<div class="page"><p><b>' + esc(p.name) + '</b></p><label for="n-' + esc(p.id) + '">מספרי וואטסאפ להתראות (מופרדים בפסיק)</label><input id="n-' + esc(p.id) + '" class="ltr" inputmode="tel" placeholder="050-1234567"><div class="row"><button class="main" data-connect="' + esc(p.id) + '">חיבור הדף</button></div></div>').join('') : '';
    $('#pages').innerHTML = s.pages.length ? s.pages.map(p => '<div class="page"><p><b>' + esc(p.name) + '</b> <span class="pill ' + (p.on ? 'ok' : 'wait') + '">' + (p.on ? 'פעיל' : 'מושהה') + '</span></p><p class="sub">' + p.count + ' התראות' + (p.lastAlert ? ' · אחרונה ' + fmt(p.lastAlert) : '') + '</p><label for="e-' + esc(p.id) + '">מספרי וואטסאפ</label><input id="e-' + esc(p.id) + '" class="ltr" inputmode="tel" value="' + esc(p.numbers.map(n => '+' + n).join(', ')) + '"><div class="row"><button data-save="' + esc(p.id) + '">שמירת מספרים</button><button data-test="' + esc(p.id) + '">שליחת בדיקה</button><button data-toggle="' + esc(p.id) + '" data-on="' + p.on + '">' + (p.on ? 'השהיה' : 'הפעלה') + '</button><button class="danger" data-off="' + esc(p.id) + '">ניתוק</button></div><p class="msg" id="m-' + esc(p.id) + '" role="status"></p></div>').join('') : '<p class="sub">עוד לא חובר אף דף.</p>';
    $('#log').innerHTML = s.log.map(l => '<li><time>' + fmt(l.at) + '</time>' + (l.kind === 'error' ? '⚠️ ' : l.kind === 'sent' ? '✅ ' : '') + esc(l.text) + '</li>').join('') || '<li class="sub">אין עדיין רשומות</li>';
  }
  async function refresh() { render(await api('state')); }

  async function start() {
    try { await refresh(); $('#login').hidden = true; $('#app').hidden = false; }
    catch (e) { $('#app').hidden = true; $('#login').hidden = false; if (pw) say('#login-msg', e.message); }
  }
  $('#go').onclick = () => { pw = $('#pw').value; try { sessionStorage.setItem('m-pw', pw); } catch (e) {} start(); };
  $('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#go').click(); });

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
  $('#save-cfg').onclick = e => busy(e.target, async () => {
    try { await api('config', { appId: $('#appId').value, appSecret: $('#appSecret').value, waToken: $('#waToken').value, waPhoneId: $('#waPhoneId').value, wabaId: $('#wabaId').value }); $('#appSecret').value = ''; $('#waToken').value = ''; await refresh(); say('#cfg-msg', 'נשמר', true); }
    catch (err) { say('#cfg-msg', err.message); }
  });
  const TPL = { APPROVED: ['מאושרת', 'ok'], PENDING: ['ממתינה לאישור', 'wait'], REJECTED: ['נדחתה', 'bad'], PAUSED: ['מושהית', 'bad'], DISABLED: ['מושבתת', 'bad'] };
  const tpl = create => async e => busy(e.target, async () => {
    try {
      const d = await api('template', { create }), t = d.template, st = t ? (TPL[t.status] || [t.status, 'wait']) : ['עוד לא נשלחה', 'wait'];
      $('#tpl-st').textContent = st[0]; $('#tpl-st').className = 'pill ' + st[1];
      say('#tpl-msg', t && t.rejected_reason && t.rejected_reason !== 'NONE' ? 'סיבת הדחייה: ' + t.rejected_reason : '', false);
      await refresh();
    } catch (err) { say('#tpl-msg', err.message); }
  });
  $('#tpl-check').onclick = tpl(false); $('#tpl-create').onclick = tpl(true);
  $('#load').onclick = e => busy(e.target, async () => {
    try { const d = await api('load-pages', { userToken: $('#utok').value }); $('#utok').value = ''; await refresh(); say('#load-msg', d.count ? 'נמצאו ' + d.count + ' דפים. בוחרים דף, מוסיפים מספר ומחברים.' : 'לא נמצאו דפים בחשבון הזה', !!d.count); }
    catch (err) { say('#load-msg', err.message); }
  });

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.copy) { try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); b.textContent = 'הועתק'; setTimeout(() => { b.textContent = 'העתקה'; }, 1500); } catch (err) {} return; }
    const id = b.dataset.connect || b.dataset.save || b.dataset.test || b.dataset.toggle || b.dataset.off; if (!id) return;
    const msg = '#m-' + CSS.escape(id);
    await busy(b, async () => {
      try {
        if (b.dataset.connect) { await api('connect', { pageId: id, numbers: $('#n-' + CSS.escape(id)).value }); await refresh(); return; }
        if (b.dataset.save) { await api('update', { pageId: id, numbers: $('#e-' + CSS.escape(id)).value }); await refresh(); say(msg, 'נשמר', true); return; }
        if (b.dataset.test) { await api('test', { pageId: id }); say(msg, 'נשלחה הודעת בדיקה. היא אמורה להגיע בתוך כמה שניות.', true); await refresh(); return; }
        if (b.dataset.toggle) { await api('update', { pageId: id, on: b.dataset.on !== 'true' }); await refresh(); return; }
        if (b.dataset.off) { if (!confirm('לנתק את הדף? ההתראות שלו ייפסקו.')) return; await api('disconnect', { pageId: id }); await refresh(); }
      } catch (err) { const el = $(msg); if (el) say(msg, err.message); else alert(err.message); }
    });
  });
  start();
})();
</script></body></html>`;

export const PRIVACY_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מדיניות פרטיות</title><style>${STYLE}</style></head><body><main>
<h1>מדיניות פרטיות</h1>
<section class="card">
<p>השירות שולח לבעלי עסקים התראה בוואטסאפ כשנכנסת הודעה חדשה לדף הפייסבוק העסקי שלהם במסנג׳ר.</p>
<h2>איזה מידע עובר בשירות</h2>
<p>כשמישהו שולח הודעה לדף, השירות מקבל ממטא את תוכן ההודעה, את מזהה השולח בדף ואת שמו. המידע הזה נשלח בהתראה אחת למספרי הוואטסאפ שבעל העסק הגדיר, ולא משמש לשום מטרה אחרת.</p>
<h2>מה נשמר</h2>
<p>השירות לא שומר את תוכן ההודעות. נשמרים רק: שם הדף, מספרי הוואטסאפ לקבלת התראות, מזהה השיחה ושעת ההתראה האחרונה (כדי לא לשלוח כמה התראות על אותה שיחה), ויומן טכני קצר של 80 הרשומות האחרונות.</p>
<h2>שיתוף עם צד שלישי</h2>
<p>המידע לא נמכר ולא מועבר לאף גורם, מלבד מטא (פייסבוק ו־WhatsApp), שדרכה ההתראות נשלחות.</p>
<h2>מחיקת מידע</h2>
<p>ניתוק הדף מהשירות מוחק את הגדרותיו. לבקשה למחיקת מידע אפשר לפנות לבעלת השירות דרך הדף העסקי שממנו התקבלה ההתראה.</p>
</section>
<section class="card ltr" lang="en" dir="ltr">
<h2>Privacy Policy (English)</h2>
<p>This service sends business owners a WhatsApp alert when a new Messenger message reaches their Facebook Page. It receives the message text, the sender's page-scoped ID and name from Meta, and forwards them once to the WhatsApp numbers the business configured. Message contents are not stored. The service keeps only the page name, the alert phone numbers, the time of the last alert per conversation (to avoid duplicate alerts) and a short technical log of the last 80 entries. Data is not sold or shared with anyone except Meta, through which alerts are delivered. Disconnecting a page deletes its settings.</p>
</section>
</main></body></html>`;
