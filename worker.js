// One Worker for everything in this repository:
//   /m/...  Messenger → WhatsApp alerts (messenger-alerts/)
//   else    the לו״ז יומי app and its push reminders (luz-yomi/)

import luz, { Device } from './luz-yomi/src/worker.js';
import { handleAlerts, AlertsHub } from './messenger-alerts/src/index.js';

export { Device, AlertsHub };

export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/m' || path.startsWith('/m/')) return handleAlerts(request, env, ctx);
    return luz.fetch(request, env, ctx);
  }
};
