// The management page: a step-by-step setup guide plus the controls for connected Pages.
// The inline script avoids backticks and "${" so it can live inside this template literal.

import { STYLE } from './pages.js';

export const ADMIN_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>התראות מהעמודים</title><link rel="icon" href="/m/icon-192.png"><style>${STYLE}</style></head><body><main>
<h1>📩 התראות מהעמודים</h1>

<div id="setup" class="card" hidden>
  <h2>ברוכה הבאה! בוחרים סיסמה</h2>
  <p class="sub">זו הפעם הראשונה שנכנסים לכאן. הסיסמה תשמור על עמוד הניהול. לפחות 8 תווים.</p>
  <label for="np1">סיסמה</label><input id="np1" type="password" autocomplete="new-password">
  <label for="np2">שוב את אותה סיסמה</label><input id="np2" type="password" autocomplete="new-password">
  <div class="row"><button class="main" id="setup-go">שמירת הסיסמה</button></div>
  <p class="msg" id="setup-msg" role="alert"></p>
</div>

<div id="login" class="card" hidden>
  <h2>כניסה</h2>
  <label for="pw">סיסמה</label><input id="pw" type="password" autocomplete="current-password">
  <div class="row"><button class="main" id="go">כניסה</button></div>
  <p class="msg" id="login-msg" role="alert"></p>
</div>

<div id="app" hidden>
  <div class="card now">
    <p class="sub" id="step-count"></p>
    <div class="steps" id="steps" aria-hidden="true"></div>
    <h2 id="step-title" style="margin-top:.6rem"></h2>
    <div id="step-body"></div>
  </div>

  <section class="card" id="sec-app" hidden>
    <h2>פרטי האפליקציה במטא</h2>
    <label for="appId">App ID</label><input id="appId" class="ltr" inputmode="numeric">
    <label for="appSecret">App Secret <span class="sub" id="appSecret-st"></span></label><input id="appSecret" class="ltr" type="password" placeholder="השאירי ריק כדי לא לשנות">
    <div class="row"><button class="main" id="save-cfg">שמירה</button></div>
    <p class="msg" id="app-msg" role="status"></p>
  </section>

  <section class="card" id="sec-pages" hidden>
    <h2>חיבור הדפים</h2>
    <label for="utok">הטוקן מ־Graph API Explorer</label><textarea id="utok" class="ltr" rows="2"></textarea>
    <div class="row"><button class="main" id="load">טעינת הדפים שלי</button></div>
    <p class="msg" id="load-msg" role="status"></p>
    <div id="avail"></div>
  </section>

  <section class="card" id="sec-connected">
    <h2>דפים מחוברים</h2>
    <p class="sub" id="poll-st"></p>
    <div id="pages"><p class="sub">עוד לא חובר אף דף.</p></div>
  </section>

  <section class="card">
    <details id="all"><summary>כל השלבים</summary><ul class="done-list" id="done-list"></ul><p class="sub">לחיצה על שלב פותחת אותו שוב.</p></details>
  </section>

  <section class="card">
    <details><summary>יומן אחרון</summary><ul class="log" id="log"></ul></details>
  </section>
  <div id="copybox" hidden class="card"><p class="sub">ההעתקה האוטומטית לא עבדה כאן. אפשר לסמן את הטקסט ולהעתיק ידנית.</p><textarea id="copyarea" rows="8" readonly></textarea><div class="row"><button id="copy-close">סגירה</button></div></div>
</div>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ext = (href, text) => '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
  let pw = ''; try { pw = sessionStorage.getItem('m-pw') || ''; } catch (e) {}
  let S = null, forced = '';
  const ERR = { unauthorized: 'הסיסמה שגויה', unknown_page: 'הדף לא נמצא. כדאי לטעון את הדפים מחדש', missing_token: 'צריך להדביק טוקן', need_app: 'קודם ממלאים App ID ו־App Secret בשלב 1. בלי זה הטוקן פג אחרי שעה.', short_password: 'הסיסמה קצרה מדי. צריך לפחות 8 תווים', already_set: 'כבר נבחרה סיסמה. אפשר להיכנס איתה', needs_setup: 'צריך לבחור סיסמה', no_devices: 'עוד לא חובר מכשיר לדף הזה. קודם מתקינים אצל הלקוח (שלב 3).', graph: 'מטא החזירה שגיאה' };
  async function api(action, body) {
    const r = await fetch('/m/api/' + action, { method: body ? 'POST' : 'GET', headers: { 'X-Admin-Password': pw, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error === 'graph' ? ERR.graph + ': ' + (d.message || '') : (ERR[d.error] || d.message || 'משהו השתבש')); e.code = d.error; throw e; }
    return d;
  }
  const say = (id, text, ok) => { const el = $(id); if (!el) return; el.textContent = text || ''; el.className = 'msg' + (text ? (ok ? ' ok' : ' bad') : ''); };
  const fmt = t => t ? new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const ago = t => { if (!t) return 'עוד לא'; const s = Math.round((Date.now() - t) / 1000); return s < 90 ? 'לפני ' + s + ' שניות' : s < 5400 ? 'לפני ' + Math.round(s / 60) + ' דקות' : fmt(t); };
  const PERMS = 'pages_show_list, pages_messaging, pages_manage_metadata, pages_read_engagement';

  const STEPS = [
    { id: 'app', sec: 'sec-app', title: 'פותחים אפליקציה במטא', done: s => !!(s.cfg.appId && s.cfg.hasAppSecret), how: () => [
      'נכנסים ל־' + ext('https://developers.facebook.com/apps', 'Meta for Developers') + ' ומתחברים עם הפייסבוק שלך. עדיף ממחשב.',
      'לוחצים <b>Create App</b>. אם שואלים למה האפליקציה משמשת (Use cases), בוחרים <b>Other</b>. אם שואלים סוג, בוחרים <b>Business</b>.',
      'נותנים שם, למשל "התראות מהעמודים", ולוחצים <b>Create app</b>. אם מבקשים לבחור Business portfolio, בוחרים את שלך או מדלגים.',
      'בתפריט שבצד: <b>App settings</b> ואז <b>Basic</b>.',
      'מעתיקים לשדות למטה את <b>App ID</b> ואת <b>App Secret</b> (ליד ה־Secret לוחצים <b>Show</b>), ולוחצים <b>שמירה</b>.'
    ], note: 'זה הכול במטא. לא צריך להוסיף מוצרים, Webhooks או אישורים.' },
    { id: 'pages', sec: 'sec-pages', title: 'מחברים את הדפים', done: s => s.pages.length > 0, how: () => [
      'נכנסים ל־' + ext('https://developers.facebook.com/tools/explorer/', 'Graph API Explorer') + '.',
      'בצד ימין, תחת <b>Meta App</b>, בוחרים את האפליקציה שפתחת. תחת <b>User or Page</b> בוחרים <b>User Token</b>.',
      'לוחצים <b>Add a permission</b> ומסמנים ארבע הרשאות: <b class="ltr">' + PERMS + '</b>.',
      'לוחצים <b>Generate Access Token</b>. בחלון של פייסבוק מאשרים, ומסמנים את <b>כל הדפים</b> של הלקוחות.',
      'מעתיקים את הטוקן שמופיע בשדה <b>Access Token</b>, מדביקים אותו למטה ולוחצים <b>טעינת הדפים שלי</b>.',
      'ליד כל דף של לקוח לוחצים <b>חיבור</b>.'
    ], note: 'הטוקן מהאקספלורר תקף לשעה. המערכת ממירה אותו לטוקן קבוע, ולכן חשוב ששלב 1 מולא קודם. אם ההרשאה pages_messaging לא מופיעה ברשימה, מוסיפים לאפליקציה את המוצר Messenger ומנסים שוב.' },
    { id: 'install', sec: '', title: 'מתקינים אצל הלקוח', done: s => s.pages.some(p => p.devices > 0), how: () => [
      'ליד כל דף מחובר למטה יש כפתור <b>העתקת הודעה ללקוח</b>. ההודעה כוללת את הקישור ושלוש הוראות קצרות.',
      'שולחים אותה ללקוח בוואטסאפ.',
      'הלקוח פותח את הקישור, מוסיף למסך הבית ולוחץ "הפעלת התראות". מרגע זה כל הודעה במסנג׳ר קופצת לו על המסך הנעול.',
      'כשהלקוח סיים, ליד הדף יופיע "מכשיר אחד מחובר".'
    ], note: 'אפשר לחבר כמה מכשירים לאותו דף, למשל גם את הטלפון שלך.' },
    { id: 'test', sec: '', title: 'בודקים שהכול עובד', done: s => !!s.testedAt || s.pages.some(p => p.count > 0), how: () => [
      'ליד הדף לוחצים <b>שליחת בדיקה</b>. בטלפון של הלקוח אמורה לקפוץ התראה תוך שניות.',
      'בדיקה אמיתית: שולחים הודעה במסנג׳ר לדף (מכל חשבון פייסבוק). תוך דקה מגיעה התראה עם שם הפונה ותוכן ההודעה.'
    ] }
  ];

  function clientMessage(p) {
    return 'היי! הכנתי לך התראות על כל הודעה שנכנסת לעמוד הפייסבוק "' + p.name + '".\\n\\n' +
      '1. פותחים את הקישור הזה בטלפון (באייפון בספארי, באנדרואיד בכרום):\\n' + p.link + '\\n\\n' +
      '2. מוסיפים למסך הבית: באייפון לוחצים על כפתור השיתוף ובוחרים "הוספה למסך הבית". באנדרואיד, בתפריט ⋮ בוחרים "הוספה למסך הבית".\\n\\n' +
      '3. פותחים את האייקון החדש ולוחצים "הפעלת התראות".\\n\\n' +
      'זהו! מעכשיו כל הודעה במסנג׳ר תקפוץ לך על המסך, עם כפתור לתשובה.';
  }
  async function copyText(text, btn, label) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'הועתק ✓'; setTimeout(() => { btn.textContent = label; }, 1500); }
    catch (e) { $('#copyarea').value = text; $('#copybox').hidden = false; $('#copyarea').focus(); $('#copyarea').select(); }
  }

  function stepState(s) {
    const firstOpen = STEPS.findIndex(x => !x.done(s));
    const cur = forced ? STEPS.findIndex(x => x.id === forced) : firstOpen;
    return cur < 0 ? STEPS.length : cur;
  }
  function renderStep(s) {
    const cur = stepState(s);
    $('#steps').innerHTML = STEPS.map((x, i) => '<i class="' + (x.done(s) ? 'done' : i === cur ? 'on' : '') + '"></i>').join('');
    for (const x of STEPS) if (x.sec) $('#' + x.sec).hidden = true;
    if (cur >= STEPS.length) {
      $('#step-count').textContent = 'כל השלבים הושלמו';
      $('#step-title').textContent = '🎉 הכול עובד';
      $('#step-body').innerHTML = '<p>המערכת קוראת את תיבות ההודעות כל דקה ושולחת התראה על כל פנייה חדשה. לקוח חדש מחברים בשלב 2, ומתקינים אצלו בשלב 3.</p>';
    } else {
      const x = STEPS[cur];
      $('#step-count').textContent = 'שלב ' + (cur + 1) + ' מתוך ' + STEPS.length + (x.done(s) ? ' · הושלם ✓' : '');
      $('#step-title').textContent = x.title;
      $('#step-body').innerHTML = '<ol class="how">' + x.how().map(l => '<li>' + l + '</li>').join('') + '</ol>' + (x.note ? '<p class="hint">' + x.note + '</p>' : '') +
        '<div class="row">' + (cur > 0 ? '<button data-goto="' + STEPS[cur - 1].id + '">→ לשלב הקודם</button>' : '') + (x.done(s) && cur < STEPS.length - 1 ? '<button class="main" data-goto="' + STEPS[cur + 1].id + '">לשלב הבא ←</button>' : '') + '</div>';
      if (x.sec) $('#' + x.sec).hidden = false;
    }
    $('#done-list').innerHTML = STEPS.map((x, i) => '<li><button data-goto="' + x.id + '">' + (x.done(s) ? '✅ ' : '⬜ ') + (i + 1) + '. ' + x.title + '</button></li>').join('');
  }

  function pageCard(p) {
    const st = p.tokenBad ? ['צריך חיבור מחדש', 'bad'] : !p.on ? ['מושהה', 'wait'] : p.devices ? ['פעיל', 'ok'] : ['מחכה להתקנה אצל הלקוח', 'wait'];
    const devs = p.devices === 1 ? 'מכשיר אחד מחובר' : p.devices + ' מכשירים מחוברים';
    return '<div class="page"><p><b>' + esc(p.name) + '</b> <span class="pill ' + st[1] + '">' + st[0] + '</span></p>' +
      '<p class="sub">' + devs + ' · ' + p.count + ' התראות' + (p.lastAlert ? ' · אחרונה ' + fmt(p.lastAlert) : '') + ' · נבדק ' + ago(p.lastPoll) + '</p>' +
      (p.err ? '<p class="msg bad">' + esc(p.err) + '</p>' : '') +
      '<div class="row"><button class="main" data-msg="' + esc(p.id) + '">העתקת הודעה ללקוח</button><button data-link="' + esc(p.id) + '">העתקת הקישור</button><button data-test="' + esc(p.id) + '">שליחת בדיקה</button><button data-toggle="' + esc(p.id) + '" data-on="' + p.on + '">' + (p.on ? 'השהיה' : 'הפעלה') + '</button><button data-relink="' + esc(p.id) + '">קישור חדש</button><button class="danger" data-off="' + esc(p.id) + '">ניתוק</button></div>' +
      '<p class="msg" id="m-' + esc(p.id) + '" role="status"></p></div>';
  }

  function render(s) {
    S = s;
    $('#appId').value = s.cfg.appId; $('#appSecret-st').textContent = s.cfg.hasAppSecret ? '(שמור ✓)' : '';
    $('#avail').innerHTML = s.available.length ? '<p class="sub">דפים שאפשר לחבר:</p>' + s.available.map(p => '<div class="page"><p><b>' + esc(p.name) + '</b></p><div class="row"><button class="main" data-connect="' + esc(p.id) + '">חיבור</button></div><p class="msg" id="m-' + esc(p.id) + '" role="status"></p></div>').join('') : '';
    $('#poll-st').textContent = s.pages.length ? 'המערכת קוראת את תיבות ההודעות כל דקה · בדיקה אחרונה: ' + ago(s.pollAt) : '';
    $('#pages').innerHTML = s.pages.length ? s.pages.map(pageCard).join('') : '<p class="sub">עוד לא חובר אף דף.</p>';
    $('#log').innerHTML = s.log.map(l => '<li><time>' + fmt(l.at) + '</time>' + (l.kind === 'error' ? '⚠️ ' : l.kind === 'sent' ? '✅ ' : '') + esc(l.text) + '</li>').join('') || '<li class="sub">אין עדיין רשומות</li>';
    renderStep(s);
  }
  async function refresh() { render(await api('state')); }

  function show(which) { for (const id of ['setup', 'login', 'app']) $('#' + id).hidden = id !== which; }
  async function start() {
    try {
      const a = await api('auth-status');
      if (a.needsSetup) { show('setup'); return; }
      if (!pw) { show('login'); return; }
      await refresh(); show('app');
    } catch (e) { show('login'); if (pw) say('#login-msg', e.message); }
  }
  const keep = v => { pw = v; try { sessionStorage.setItem('m-pw', pw); } catch (e) {} };
  $('#setup-go').onclick = async () => {
    const a = $('#np1').value, b = $('#np2').value;
    if (a !== b) { say('#setup-msg', 'שתי הסיסמאות לא זהות'); return; }
    try { await api('setup', { password: a }); keep(a); await start(); } catch (e) { say('#setup-msg', e.message); }
  };
  $('#go').onclick = () => { keep($('#pw').value); start(); };
  $('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#go').click(); });
  $('#copy-close').onclick = () => { $('#copybox').hidden = true; };

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
  $('#save-cfg').onclick = e => busy(e.target, async () => {
    try { await api('config', { appId: $('#appId').value, appSecret: $('#appSecret').value }); $('#appSecret').value = ''; forced = ''; await refresh(); say('#app-msg', 'נשמר ✓', true); }
    catch (err) { say('#app-msg', err.message); }
  });
  $('#load').onclick = e => busy(e.target, async () => {
    try {
      const d = await api('load-pages', { userToken: $('#utok').value }); $('#utok').value = ''; await refresh();
      say('#load-msg', (d.count ? 'נמצאו ' + d.count + ' דפים.' : 'לא נמצאו דפים בחשבון הזה.') + (d.refreshed ? ' הגישה ל־' + d.refreshed + ' דפים מחוברים חודשה.' : '') + (d.longLived ? '' : ' שימי לב: הטוקן לא הומר לקבוע, כדאי לבדוק את App ID ו־Secret.'), !!d.count && d.longLived);
    } catch (err) { say('#load-msg', err.message); }
  });

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.goto) { forced = b.dataset.goto; renderStep(S); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const id = b.dataset.connect || b.dataset.msg || b.dataset.link || b.dataset.test || b.dataset.toggle || b.dataset.relink || b.dataset.off; if (!id) return;
    const p = (S.pages || []).find(x => x.id === id), msg = '#m-' + CSS.escape(id);
    if (b.dataset.msg && p) { copyText(clientMessage(p), b, 'העתקת הודעה ללקוח'); return; }
    if (b.dataset.link && p) { copyText(p.link, b, 'העתקת הקישור'); return; }
    await busy(b, async () => {
      try {
        if (b.dataset.connect) { await api('connect', { pageId: id }); forced = ''; await refresh(); return; }
        if (b.dataset.test) { const d = await api('test', { pageId: id }); await refresh(); say(msg, 'נשלחה בדיקה ל־' + d.sent + ' מכשירים. היא אמורה לקפוץ תוך שניות.', true); return; }
        if (b.dataset.toggle) { await api('update', { pageId: id, on: b.dataset.on !== 'true' }); await refresh(); return; }
        if (b.dataset.relink) { if (!confirm('ליצור קישור חדש? הקישור הישן יפסיק לעבוד, והלקוח יצטרך להתקין מחדש.')) return; await api('relink', { pageId: id }); await refresh(); return; }
        if (b.dataset.off) { if (!confirm('לנתק את הדף? ההתראות שלו ייפסקו.')) return; await api('disconnect', { pageId: id }); await refresh(); }
      } catch (err) { say(msg, err.message); }
    });
  });
  setInterval(() => { if (document.visibilityState === 'visible' && !$('#app').hidden) refresh().catch(() => {}); }, 30000);
  start();
})();
</script></body></html>`;
