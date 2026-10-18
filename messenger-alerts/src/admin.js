// The management page: a step-by-step setup guide plus the controls for connected Pages.
// The inline script avoids backticks and "${" so it can live inside this template literal.

import { STYLE } from './pages.js';

export const ADMIN_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>התראות מסנג׳ר</title><style>${STYLE}</style></head><body><main>
<h1>📩 התראות מסנג׳ר לוואטסאפ</h1>

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
    <div class="row"><button class="main" data-save-cfg="app">שמירה</button></div>
    <p class="msg" id="app-msg" role="status"></p>
  </section>

  <section class="card" id="sec-wa" hidden>
    <h2>פרטי הוואטסאפ</h2>
    <label for="waPhoneId">Phone number ID</label><input id="waPhoneId" class="ltr" inputmode="numeric">
    <label for="wabaId">WhatsApp Business Account ID</label><input id="wabaId" class="ltr" inputmode="numeric">
    <label for="waToken">הטוקן הקבוע (System User) <span class="sub" id="waToken-st"></span></label><input id="waToken" class="ltr" type="password" placeholder="השאירי ריק כדי לא לשנות">
    <div class="row"><button class="main" data-save-cfg="wa">שמירה</button></div>
    <p class="msg" id="wa-msg" role="status"></p>
  </section>

  <section class="card" id="sec-hook" hidden>
    <h2>שני הערכים להדבקה במטא</h2>
    <label>Callback URL</label><div class="copy"><code id="hook"></code><button data-copy="hook">העתקה</button></div>
    <label>Verify token</label><div class="copy"><code id="vtok"></code><button data-copy="vtok">העתקה</button></div>
    <p>מצב: <span id="hook-st" class="pill wait">מטא עוד לא בדקה</span></p>
    <div class="row"><button id="hook-check">בדיקה</button></div>
  </section>

  <section class="card" id="sec-tpl" hidden>
    <h2>תבנית ההודעה</h2>
    <p>מצב: <span id="tpl-st" class="pill wait">לא נבדק</span></p>
    <div class="row"><button class="main" id="tpl-create">שליחת התבנית לאישור</button><button id="tpl-check">בדיקת מצב</button></div>
    <p class="msg" id="tpl-msg" role="status"></p>
  </section>

  <section class="card" id="sec-pages" hidden>
    <h2>חיבור דפים של לקוחות</h2>
    <label for="utok">הטוקן מ־Graph API Explorer</label><textarea id="utok" class="ltr" rows="2"></textarea>
    <div class="row"><button class="main" id="load">טעינת הדפים שלי</button></div>
    <p class="msg" id="load-msg" role="status"></p>
    <div id="avail"></div>
  </section>

  <section class="card" id="sec-connected">
    <h2>דפים מחוברים</h2>
    <div id="pages"><p class="sub">עוד לא חובר אף דף.</p></div>
  </section>

  <section class="card">
    <details id="all"><summary>כל השלבים וההגדרות</summary><ul class="done-list" id="done-list"></ul><p class="sub">לחיצה על שלב פותחת אותו שוב.</p></details>
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
  const ext = (href, text) => '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
  let pw = ''; try { pw = sessionStorage.getItem('m-pw') || ''; } catch (e) {}
  let S = null, forced = '';
  const ERR = { unauthorized: 'הסיסמה שגויה', no_numbers: 'צריך לפחות מספר וואטסאפ תקין אחד', unknown_page: 'הדף לא נמצא. כדאי לטעון את הדפים מחדש', missing_token: 'צריך להדביק טוקן', wa_not_configured: 'קודם ממלאים את פרטי הוואטסאפ', short_password: 'הסיסמה קצרה מדי. צריך לפחות 8 תווים', already_set: 'כבר נבחרה סיסמה. אפשר להיכנס איתה', needs_setup: 'צריך לבחור סיסמה' };
  async function api(action, body) {
    const r = await fetch('/api/' + action, { method: body ? 'POST' : 'GET', headers: { 'X-Admin-Password': pw, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(ERR[d.error] || d.message || 'משהו השתבש'); e.code = d.error; throw e; }
    return d;
  }
  const say = (id, text, ok) => { const el = $(id); if (!el) return; el.textContent = text || ''; el.className = 'msg' + (text ? (ok ? ' ok' : ' bad') : ''); };
  const fmt = t => t ? new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const STEPS = [
    { id: 'app', sec: 'sec-app', title: 'פותחים אפליקציה במטא', done: s => !!(s.cfg.appId && s.cfg.hasAppSecret), how: () => [
      'נכנסים ל־' + ext('https://developers.facebook.com/apps', 'Meta for Developers') + ' ומתחברים עם הפייסבוק שלך.',
      'לוחצים <b>Create App</b> (יצירת אפליקציה). אם מבקשים לבחור למה היא משמשת, בוחרים את האפשרויות של <b>Messenger</b> ושל <b>WhatsApp</b>. אם מבקשים סוג, בוחרים <b>Business</b>.',
      'נותנים לה שם, למשל "התראות ללקוחות", ומסיימים.',
      'בתפריט שבצד נכנסים ל־<b>App settings</b> ואז <b>Basic</b>.',
      'מעתיקים לשדות למטה את <b>App ID</b> ואת <b>App Secret</b> (ליד ה־Secret לוחצים <b>Show</b>), ולוחצים <b>שמירה</b>.'
    ] },
    { id: 'wa', sec: 'sec-wa', title: 'מחברים את מספר הוואטסאפ', done: s => !!(s.cfg.waPhoneId && s.cfg.wabaId && s.cfg.hasWaToken), how: () => [
      'באפליקציה שפתחת, בתפריט שבצד: <b>WhatsApp</b> ואז <b>API Setup</b>.',
      'לוחצים <b>Add phone number</b>, מכניסים את המספר הייעודי ומאמתים אותו בקוד שמגיע ב־SMS. זה צריך להיות מספר שלא מחובר לאפליקציית וואטסאפ.',
      'באותו עמוד מעתיקים לשדות למטה את <b>Phone number ID</b> ואת <b>WhatsApp Business Account ID</b>.',
      'עכשיו הטוקן הקבוע: נכנסים ל־' + ext('https://business.facebook.com/settings/system-users', 'System users') + ' בהגדרות העסק, ולוחצים <b>Add</b>. נותנים שם ובוחרים <b>Admin</b>.',
      'על המשתמש החדש לוחצים <b>Assign assets</b>, ומוסיפים את האפליקציה ואת חשבון הוואטסאפ עם <b>Full control</b>.',
      'לוחצים <b>Generate new token</b>, בוחרים את האפליקציה, מסמנים <b>whatsapp_business_messaging</b> ו־<b>whatsapp_business_management</b>, ומעתיקים את הטוקן לשדה למטה.',
      'לוחצים <b>שמירה</b>.'
    ], note: 'בהמשך צריך גם להוסיף אמצעי תשלום ב־' + ext('https://business.facebook.com/wa/manage/home/', 'WhatsApp Manager') + '. בלי זה מטא לא תשלח התראות.' },
    { id: 'hook', sec: 'sec-hook', title: 'מחברים את מטא לשרת', done: s => !!s.progress.webhookVerifiedAt, how: () => [
      'באפליקציה במטא, בתפריט שבצד: <b>Messenger</b> ואז <b>Messenger API Settings</b>.',
      'באזור <b>Configure webhooks</b> מדביקים את <b>Callback URL</b> ואת <b>Verify token</b> מלמטה, ולוחצים <b>Verify and save</b>.',
      'ברשימת השדות (Webhook fields) מסמנים <b>messages</b>.',
      'אחר כך בתפריט: <b>WhatsApp</b> ואז <b>Configuration</b>. ליד <b>Webhook</b> לוחצים <b>Edit</b>, מדביקים את אותם שני ערכים ושומרים. ברשימה מסמנים <b>messages</b>.',
      'חוזרים לכאן ולוחצים <b>בדיקה</b>.'
    ] },
    { id: 'tpl', sec: 'sec-tpl', title: 'שולחים את נוסח ההתראה לאישור', done: s => s.progress.template === 'APPROVED' || s.progress.template === 'PENDING', how: () => [
      'לוחצים <b>שליחת התבנית לאישור</b>. את הנוסח כבר כתבתי.',
      'מטא בודקת אותו, בדרך כלל תוך דקות עד כמה שעות.',
      'מדי פעם לוחצים <b>בדיקת מצב</b>, עד שמופיע <b>מאושרת</b>. אפשר בינתיים להמשיך לשלב הבא.'
    ] },
    { id: 'pages', sec: 'sec-pages', title: 'מחברים את הדפים של הלקוחות', done: s => s.pages.length > 0, how: () => [
      'נכנסים ל־' + ext('https://developers.facebook.com/tools/explorer/', 'Graph API Explorer') + '.',
      'בצד ימין, תחת <b>Meta App</b>, בוחרים את האפליקציה שלך. תחת <b>User or Page</b> בוחרים <b>User Token</b>.',
      'ב־<b>Permissions</b> מוסיפים: <b>pages_show_list</b>, <b>pages_messaging</b>, <b>pages_manage_metadata</b>, <b>pages_read_engagement</b>.',
      'לוחצים <b>Generate Access Token</b> ומאשרים. בחלון של פייסבוק מסמנים את כל הדפים של הלקוחות.',
      'מעתיקים את הטוקן שמופיע, מדביקים אותו למטה ולוחצים <b>טעינת הדפים שלי</b>.',
      'ליד כל דף כותבים את מספר הוואטסאפ של הלקוח ולוחצים <b>חיבור הדף</b>.'
    ] },
    { id: 'test', sec: '', title: 'בודקים שהכול עובד', done: s => !!s.progress.lastPageEvent, how: () => [
      'ליד אחד הדפים המחוברים לוחצים <b>שליחת בדיקה</b>. בוואטסאפ של הלקוח אמורה להגיע הודעה תוך כמה שניות.',
      'עכשיו בדיקה אמיתית: מהפייסבוק הפרטי שלך שולחים הודעה במסנג׳ר לאחד הדפים המחוברים. גם אז אמורה להגיע התראה.'
    ], note: 'עד שמטא מאשרת את האפליקציה (App Review), התראות יגיעו רק על הודעות ממך ומאנשים שיש להם תפקיד באפליקציה. כשהכול עובד, נגיש יחד את הבקשה לאישור.' }
  ];

  function stepState(s) {
    const firstOpen = STEPS.findIndex(x => !x.done(s));
    const cur = forced ? STEPS.findIndex(x => x.id === forced) : firstOpen;
    return { cur: cur < 0 ? STEPS.length : cur, firstOpen };
  }
  function renderStep(s) {
    const { cur } = stepState(s);
    $('#steps').innerHTML = STEPS.map((x, i) => '<i class="' + (x.done(s) ? 'done' : i === cur ? 'on' : '') + '"></i>').join('');
    for (const x of STEPS) if (x.sec) $('#' + x.sec).hidden = true;
    if (cur >= STEPS.length) {
      $('#step-count').textContent = 'כל השלבים הושלמו';
      $('#step-title').textContent = '🎉 הכול מחובר';
      $('#step-body').innerHTML = (s.progress.template === 'PENDING' ? '<p class="hint">התבנית עדיין ממתינה לאישור של מטא. עד שהיא מאושרת, התראות לא יוצאות. כדאי ללחוץ "בדיקת מצב" בשלב 4 מדי פעם.</p>' : '') + '<p>ההתראות פועלות. השלב האחרון הוא אישור של מטא (App Review), כדי שהתראות יגיעו גם על הודעות של לקוחות אמיתיים. נעשה אותו יחד.</p>';
    } else {
      const x = STEPS[cur];
      $('#step-count').textContent = 'שלב ' + (cur + 1) + ' מתוך ' + STEPS.length + (x.id === 'tpl' && s.progress.template === 'PENDING' ? ' · ממתין לאישור של מטא' : x.done(s) ? ' · הושלם ✓' : '');
      $('#step-title').textContent = x.title;
      $('#step-body').innerHTML = '<ol class="how">' + x.how().map(l => '<li>' + l + '</li>').join('') + '</ol>' + (x.note ? '<p class="hint">' + x.note + '</p>' : '') +
        '<div class="row">' + (cur > 0 ? '<button data-goto="' + STEPS[cur - 1].id + '">→ לשלב הקודם</button>' : '') + (x.done(s) && cur < STEPS.length - 1 ? '<button class="main" data-goto="' + STEPS[cur + 1].id + '">לשלב הבא ←</button>' : '') + '</div>';
      if (x.sec) $('#' + x.sec).hidden = false;
    }
    $('#done-list').innerHTML = STEPS.map((x, i) => '<li><button data-goto="' + x.id + '">' + (x.done(s) ? '✅ ' : '⬜ ') + (i + 1) + '. ' + x.title + '</button></li>').join('');
  }

  function render(s) {
    S = s;
    $('#appId').value = s.cfg.appId; $('#waPhoneId').value = s.cfg.waPhoneId; $('#wabaId').value = s.cfg.wabaId;
    $('#appSecret-st').textContent = s.cfg.hasAppSecret ? '(שמור ✓)' : ''; $('#waToken-st').textContent = s.cfg.hasWaToken ? '(שמור ✓)' : '';
    $('#hook').textContent = s.webhookUrl; $('#vtok').textContent = s.verifyToken;
    $('#hook-st').textContent = s.progress.webhookVerifiedAt ? 'מטא אישרה ✓' : 'מטא עוד לא בדקה'; $('#hook-st').className = 'pill ' + (s.progress.webhookVerifiedAt ? 'ok' : 'wait');
    const TPL = { APPROVED: ['מאושרת ✓', 'ok'], PENDING: ['ממתינה לאישור', 'wait'], REJECTED: ['נדחתה', 'bad'], PAUSED: ['מושהית', 'bad'], DISABLED: ['מושבתת', 'bad'] };
    const ts = s.progress.template ? (TPL[s.progress.template] || [s.progress.template, 'wait']) : ['עוד לא נשלחה', 'wait'];
    $('#tpl-st').textContent = ts[0]; $('#tpl-st').className = 'pill ' + ts[1];
    $('#avail').innerHTML = s.available.map(p => '<div class="page"><p><b>' + esc(p.name) + '</b></p><label for="n-' + esc(p.id) + '">מספר הוואטסאפ של הלקוח (אפשר כמה, מופרדים בפסיק)</label><input id="n-' + esc(p.id) + '" class="ltr" inputmode="tel" placeholder="050-1234567"><div class="row"><button class="main" data-connect="' + esc(p.id) + '">חיבור הדף</button></div><p class="msg" id="m-' + esc(p.id) + '" role="status"></p></div>').join('');
    $('#pages').innerHTML = s.pages.length ? s.pages.map(p => '<div class="page"><p><b>' + esc(p.name) + '</b> <span class="pill ' + (p.on ? 'ok' : 'wait') + '">' + (p.on ? 'פעיל' : 'מושהה') + '</span></p><p class="sub">' + p.count + ' התראות' + (p.lastAlert ? ' · אחרונה ' + fmt(p.lastAlert) : '') + '</p><label for="e-' + esc(p.id) + '">מספרי וואטסאפ</label><input id="e-' + esc(p.id) + '" class="ltr" inputmode="tel" value="' + esc(p.numbers.map(n => '+' + n).join(', ')) + '"><div class="row"><button data-save="' + esc(p.id) + '">שמירת מספרים</button><button data-test="' + esc(p.id) + '">שליחת בדיקה</button><button data-toggle="' + esc(p.id) + '" data-on="' + p.on + '">' + (p.on ? 'השהיה' : 'הפעלה') + '</button><button class="danger" data-off="' + esc(p.id) + '">ניתוק</button></div><p class="msg" id="m-' + esc(p.id) + '" role="status"></p></div>').join('') : '<p class="sub">עוד לא חובר אף דף.</p>';
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

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
  async function saveCfg(which, btn) {
    const body = which === 'app' ? { appId: $('#appId').value, appSecret: $('#appSecret').value } : { waPhoneId: $('#waPhoneId').value, wabaId: $('#wabaId').value, waToken: $('#waToken').value };
    await busy(btn, async () => {
      try { await api('config', body); $('#appSecret').value = ''; $('#waToken').value = ''; forced = ''; await refresh(); say('#' + which + '-msg', 'נשמר ✓', true); }
      catch (err) { say('#' + which + '-msg', err.message); }
    });
  }
  const tpl = create => async e => busy(e.target, async () => {
    try { const d = await api('template', { create }); const t = d.template; say('#tpl-msg', t && t.rejected_reason && t.rejected_reason !== 'NONE' ? 'סיבת הדחייה: ' + t.rejected_reason : (create && t ? 'נשלחה לאישור' : ''), !(t && t.status === 'REJECTED')); forced = ''; await refresh(); }
    catch (err) { say('#tpl-msg', err.message); }
  });
  $('#tpl-check').onclick = tpl(false); $('#tpl-create').onclick = tpl(true);
  $('#hook-check').onclick = e => busy(e.target, async () => { forced = ''; await refresh(); });
  $('#load').onclick = e => busy(e.target, async () => {
    try { const d = await api('load-pages', { userToken: $('#utok').value }); $('#utok').value = ''; await refresh(); say('#load-msg', d.count ? 'נמצאו ' + d.count + ' דפים. ליד כל דף כותבים מספר ולוחצים חיבור.' : 'לא נמצאו דפים בחשבון הזה', !!d.count); }
    catch (err) { say('#load-msg', err.message); }
  });

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.goto) { forced = b.dataset.goto; renderStep(S); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (b.dataset.saveCfg) { saveCfg(b.dataset.saveCfg, b); return; }
    if (b.dataset.copy) { try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); b.textContent = 'הועתק ✓'; setTimeout(() => { b.textContent = 'העתקה'; }, 1500); } catch (err) {} return; }
    const id = b.dataset.connect || b.dataset.save || b.dataset.test || b.dataset.toggle || b.dataset.off; if (!id) return;
    const msg = '#m-' + CSS.escape(id);
    await busy(b, async () => {
      try {
        if (b.dataset.connect) { await api('connect', { pageId: id, numbers: $('#n-' + CSS.escape(id)).value }); forced = ''; await refresh(); return; }
        if (b.dataset.save) { await api('update', { pageId: id, numbers: $('#e-' + CSS.escape(id)).value }); await refresh(); say(msg, 'נשמר ✓', true); return; }
        if (b.dataset.test) { await api('test', { pageId: id }); await refresh(); say(msg, 'נשלחה הודעת בדיקה. היא אמורה להגיע תוך כמה שניות.', true); return; }
        if (b.dataset.toggle) { await api('update', { pageId: id, on: b.dataset.on !== 'true' }); await refresh(); return; }
        if (b.dataset.off) { if (!confirm('לנתק את הדף? ההתראות שלו ייפסקו.')) return; await api('disconnect', { pageId: id }); await refresh(); }
      } catch (err) { say(msg, err.message); }
    });
  });
  start();
})();
</script></body></html>`;
