// Small helpers around Meta's Graph API: exchanging tokens, listing Pages and reading a Page's inbox.

export const GRAPH_VERSION = 'v23.0';
export const INBOX_URL = 'https://business.facebook.com/latest/inbox/all?asset_id=';

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
    /** A short-lived user token (about an hour) becomes a 60-day one; Page tokens fetched with it do not expire. */
    longLivedUserToken: (appId, appSecret, token) => call('GET', '/oauth/access_token', { query: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token } }).then(d => d.access_token),
    myPages: token => call('GET', '/me/accounts', { token, query: { fields: 'id,name,access_token', limit: 200 } }).then(d => d.data || []),
    /** The Page's most recently active Messenger conversations, each with its latest messages. */
    conversations: (pageId, pageToken) => call('GET', `/${pageId}/conversations`, {
      token: pageToken,
      query: { platform: 'messenger', limit: 15, fields: 'id,updated_time,messages.limit(5){id,message,from,created_time,attachments{mime_type,name}}' }
    }).then(d => d.data || [])
  };
}

/** Meta's timestamps ("2026-10-19T10:00:00+0000") as milliseconds; 0 when missing. */
export const parseTime = s => { const t = Date.parse(s || ''); return Number.isFinite(t) ? t : 0; };

/** A readable one-liner for a conversation message. */
export function snippetOf(m) {
  if (!m) return '';
  const t = String(m.message || '').replace(/\s+/g, ' ').trim();
  if (t) return t.length > 160 ? t.slice(0, 159).trimEnd() + '…' : t;
  const a = m.attachments && m.attachments.data && m.attachments.data[0];
  const mime = (a && a.mime_type) || '';
  if (mime.startsWith('image/')) return '📷 תמונה';
  if (mime.startsWith('video/')) return '🎬 סרטון';
  if (mime.startsWith('audio/')) return '🎤 הודעה קולית';
  if (a) return '📎 קובץ מצורף';
  return 'הודעה חדשה';
}
