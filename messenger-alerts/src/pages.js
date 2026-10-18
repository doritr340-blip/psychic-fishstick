// Shared styles and the privacy policy page, served as plain HTML from the Worker.

export const STYLE = `
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
.steps{display:flex;gap:4px;margin:6px 0 2px}.steps i{flex:1;height:6px;border-radius:3px;background:var(--line)}.steps i.on{background:var(--accent)}.steps i.done{background:var(--ok)}
.now{border:2px solid var(--accent)}
ol.how{margin:.4rem 0;padding-inline-start:1.3rem}ol.how li{margin:.35rem 0}
.done-list{list-style:none;margin:0;padding:0}.done-list li{padding:4px 0}
a{color:var(--accent-ink)}
.hint{background:var(--bg);border-radius:10px;padding:10px 12px;font-size:.92rem;margin-top:10px}
`;

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
