// Small helpers around Meta's Graph API: webhook signatures, Messenger and WhatsApp calls,
// and the WhatsApp template that carries each alert.

export const GRAPH_VERSION = 'v23.0';
export const TEMPLATE_NAME = 'messenger_alert';
export const TEMPLATE_LANG = 'he';
export const INBOX_URL = 'https://business.facebook.com/latest/inbox/all?asset_id=';

const enc = new TextEncoder();
const hexBytes = hex => /^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0 ? Uint8Array.from(hex.match(/../g), h => parseInt(h, 16)) : null;

/** Checks Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export async function validSignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const sig = hexBytes(header.slice(7));
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, sig, typeof rawBody === 'string' ? enc.encode(rawBody) : rawBody);
}

/** Israeli local numbers (05X…) become 9725X…; anything else keeps only its digits. */
export function normalizePhone(s) {
  let d = String(s || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (/^0\d{8,9}$/.test(d)) d = '972' + d.slice(1);
  return /^\d{10,15}$/.test(d) ? d : '';
}

/** Template parameters may not contain line breaks, tabs or long runs of spaces. */
export function cleanParam(s, max) {
  const t = String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

/** A readable stand-in for messages that are not plain text. */
export function messageSnippet(message) {
  if (!message) return '';
  if (message.text) return message.text;
  const a = (message.attachments || [])[0];
  if (message.sticker_id) return '👍';
  if (!a) return 'הודעה חדשה';
  return { image: '📷 תמונה', video: '🎬 סרטון', audio: '🎤 הודעה קולית', file: '📎 קובץ', location: '📍 מיקום' }[a.type] || '📎 קובץ מצורף';
}

export class GraphError extends Error {
  constructor(status, body) {
    const e = body && body.error;
    super((e && e.message) || `Graph API ${status}`);
    this.status = status; this.code = e && e.code; this.subcode = e && e.error_subcode;
  }
}

export function graph(base) {
  const root = (base || 'https://graph.facebook.com').replace(/\/$/, '') + '/' + GRAPH_VERSION;
  async function call(method, path, { token, query, body } = {}) {
    const url = new URL(root + path);
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, v);
    if (token) url.searchParams.set('access_token', token);
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new GraphError(res.status, data);
    return data;
  }
  return {
    call,
    /** A short-lived user token becomes a 60-day one; page tokens fetched with it do not expire. */
    longLivedUserToken: (appId, appSecret, token) => call('GET', '/oauth/access_token', { query: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token } }).then(d => d.access_token),
    myPages: token => call('GET', '/me/accounts', { token, query: { fields: 'id,name,access_token', limit: 200 } }).then(d => d.data || []),
    subscribePage: (pageId, pageToken) => call('POST', `/${pageId}/subscribed_apps`, { token: pageToken, query: { subscribed_fields: 'messages' } }),
    unsubscribePage: (pageId, pageToken) => call('DELETE', `/${pageId}/subscribed_apps`, { token: pageToken }),
    senderName: async (psid, pageToken) => {
      const d = await call('GET', `/${psid}`, { token: pageToken, query: { fields: 'first_name,last_name' } });
      return [d.first_name, d.last_name].filter(Boolean).join(' ');
    },
    sendAlert: (phoneId, waToken, to, { pageName, sender, snippet, pageId }) => call('POST', `/${phoneId}/messages`, {
      token: waToken,
      body: {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: TEMPLATE_NAME, language: { code: TEMPLATE_LANG },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: cleanParam(pageName, 60) }, { type: 'text', text: cleanParam(sender, 60) }, { type: 'text', text: cleanParam(snippet, 300) }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(pageId) }] }
          ]
        }
      }
    }),
    createTemplate: (wabaId, waToken) => call('POST', `/${wabaId}/message_templates`, { token: waToken, body: TEMPLATE_DEFINITION }),
    templateStatus: (wabaId, waToken) => call('GET', `/${wabaId}/message_templates`, { token: waToken, query: { name: TEMPLATE_NAME, fields: 'name,status,language,rejected_reason' } }).then(d => (d.data || []).find(t => t.language === TEMPLATE_LANG) || null)
  };
}

export const TEMPLATE_DEFINITION = {
  name: TEMPLATE_NAME,
  language: TEMPLATE_LANG,
  category: 'UTILITY',
  components: [
    {
      type: 'BODY',
      text: '📩 הודעה חדשה בעמוד {{1}}\nמאת: {{2}}\n\n"{{3}}"\n\nכדי לענות, לוחצים על הכפתור למטה.',
      example: { body_text: [['שם העסק', 'ישראל ישראלי', 'היי, יש לכם מקום ביום חמישי?']] }
    },
    {
      type: 'BUTTONS',
      buttons: [{ type: 'URL', text: 'לתשובה במסנג׳ר', url: INBOX_URL + '{{1}}', example: [INBOX_URL + '123456789012345'] }]
    }
  ]
};
