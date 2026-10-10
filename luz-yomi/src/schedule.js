// Mirrors the reminder rules of the app (dueEvents in public/index.html), so the server
// fires the same reminders the open app would, and turns each one into notification text.

const pad = n => String(n).padStart(2, '0');
const toMin = t => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

const TAG_EMOJI = { 'טיפול': '💪', 'ארוחה': '🍽️', 'תרופות': '💊', 'מים': '💧', 'נשימה': '🌬️', 'ביקור': '👋', 'מנוחה': '😌', 'בדיקה': '🩺', 'תרגול': '🏋️', 'אחר': '📌' };
const DUR = { 15: 'רבע שעה', 30: 'חצי שעה', 45: '45 דק׳', 60: 'שעה', 90: 'שעה וחצי', 120: 'שעתיים' };

function fmtIn(m) {
  if (m <= 0) return 'עכשיו';
  if (m === 1) return 'בעוד דקה';
  if (m < 60) return `בעוד ${m} דקות`;
  const h = Math.floor(m / 60), r = m % 60;
  const hs = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  if (!r) return `בעוד ${hs}`;
  return r === 1 ? `בעוד ${hs} ודקה` : `בעוד ${hs} ו-${r} דקות`;
}

/** Wall-clock date and time in the given IANA time zone. */
export function localParts(ms, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  } catch (e) {
    return localParts(ms, 'Asia/Jerusalem');
  }
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const y = +p.year, mo = +p.month, d = +p.day, h = +p.hour % 24;
  return { ymd: `${y}-${pad(mo)}-${pad(d)}`, y, mo, d, dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), min: h * 60 + (+p.minute), sec: +p.second };
}

/** The calendar day after `ymd`, with its weekday. */
export function nextDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return { ymd: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
}

function activeOn(it, day) {
  if (it.until && it.repeat !== 'date' && day.ymd > it.until) return false;
  if (it.repeat === 'date') return it.date === day.ymd;
  if (it.repeat === 'days') return (it.days || []).includes(day.dow);
  return true;
}
function slotsOf(it) {
  if (it.mode !== 'every') return [toMin(it.time)];
  const a = toMin(it.from), b = toMin(it.to), out = [];
  if (b < a || !(it.every > 0)) return out;
  for (let m = a; m <= b; m += it.every) out.push(m);
  return out;
}
function cheerPick(data, day) {
  const c = data.cheers || {};
  const L = (c.lines || []).map((l, i) => ({ t: String(l).trim(), by: String((c.by || [])[i] || '').trim() })).filter(x => x.t);
  if (!L.length) return null;
  return L[Math.floor(Date.UTC(day.y, day.mo - 1, day.d) / 864e5) % L.length];
}

/** Every reminder of one day: { key, at (minute of day), kind, item?, slot?, nag? }. */
export function dueEvents(data, day) {
  const out = [];
  const doneL = (data.done && data.done[day.ymd]) || [], off = (data.nagoff && data.nagoff[day.ymd]) || [];
  // "Postpone" in the app: a new time for today only, or "not today"
  const moves = (data.moves && data.moves[day.ymd]) || {}, skips = (data.skips && data.skips[day.ymd]) || [];
  for (const it0 of data.items || []) {
    if (!activeOn(it0, day) || skips.includes(it0.id)) continue;
    const it = it0.mode === 'time' && /^\d\d:\d\d$/.test(moves[it0.id] || '') ? Object.assign({}, it0, { time: moves[it0.id] }) : it0;
    if (it.nag && doneL.includes(it.id)) continue;
    for (const m of slotsOf(it)) out.push({ key: `i:${it.id}@${m}`, at: it.mode === 'time' ? m - (it.lead || 0) : m, kind: 'item', item: it, slot: m });
    if (it.mode === 'time' && it.nag && !off.includes(it.id)) {
      const m0 = toMin(it.time);
      for (let k = 1, m = m0 + it.nag; m <= 21 * 60; k++, m += it.nag) out.push({ key: `n:${it.id}@${m}`, at: m, kind: 'item', item: it, slot: m0, nag: k });
    }
    if (it.mode === 'time' && it.tag === 'טיפול' && data.afterAsk !== false) {
      const end = toMin(it.time) + (it.duration || 45);
      if (end < 23 * 60) out.push({ key: `a:${it.id}@${end}`, at: end, kind: 'after', item: it });
    }
  }
  const c = data.cheers || {};
  if (c.on !== false && cheerPick(data, day) && /^\d\d:\d\d$/.test(c.time || '')) out.push({ key: 'c@' + c.time, at: toMin(c.time), kind: 'cheer' });
  if (data.hasProgram && day.dow === 6) out.push({ key: 'w@' + day.ymd, at: 19 * 60, kind: 'week' });
  return out;
}

/** The notification for one reminder, worded like the in-app alert. */
export function notificationFor(e, data, day, snoozed) {
  const tag = e.key.replace(/~.*$/, '');
  if (e.kind === 'cheer') {
    const p = cheerPick(data, day);
    return { title: '☀️ החיזוק של היום', body: p ? p.t + (p.by ? ` — ${p.by}` : '') : '', tag };
  }
  if (e.kind === 'week') return { title: '📊 סיכום השבוע מוכן', body: 'אפשר לפתוח ולראות איך עבר השבוע.', tag };
  const it = e.item || {};
  if (e.kind === 'after') return { title: `💪 ${it.title} הסתיים`, body: 'קיבלת משהו לתרגל? אפשר להוסיף את זה ללו״ז, עם תזכורת שחוזרת עד שמסמנים שבוצע.', tag };
  let label;
  if (snoozed) label = 'תזכורת חוזרת';
  else if (e.nag) label = `עוד לא סומן שבוצע · ${it.time}`;
  else if (it.mode === 'every') label = `תזכורת · ${fromMin(e.slot)}`;
  else label = `${it.time} · ${fmtIn(e.slot - e.at)}`;
  const meta = [it.place, it.mode === 'time' && it.duration ? DUR[it.duration] || `${it.duration} דק׳` : ''].filter(Boolean).join(' · ');
  const body = [label, meta, (it.note || '').split('\n')[0].slice(0, 180)].filter(Boolean).join('\n');
  return { title: `${TAG_EMOJI[it.tag] || '📌'} ${it.title}`, body, tag };
}
