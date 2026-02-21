// Minimal axios-like wrapper (ESM) for background service worker (module)
export const axios = {
  get: async function (url, config = {}) {
    const headers = config.headers || {};
    const withCredentials = !!config.withCredentials;
    const timeout = config.timeout || 0;
    const signal = config.signal;
    let controller;
    let signalToUse = signal;
    if (!signalToUse && timeout > 0) {
      controller = new AbortController();
      signalToUse = controller.signal;
      setTimeout(() => controller.abort(), timeout);
    }
    const response = await fetch(url, { method: 'GET', headers: headers, credentials: withCredentials ? 'include' : 'omit', signal: signalToUse });
    const data = await response.json().catch(() => null);
    return { status: response.status, statusText: response.statusText, data };
  },
  post: async function (url, body, config = {}) {
    const headers = Object.assign({'Content-Type': 'application/json'}, config.headers || {});
    const withCredentials = !!config.withCredentials;
    const timeout = config.timeout || 0;
    const signal = config.signal;
    let controller;
    let signalToUse = signal;
    if (!signalToUse && timeout > 0) {
      controller = new AbortController();
      signalToUse = controller.signal;
      setTimeout(() => controller.abort(), timeout);
    }
    const response = await fetch(url, { method: 'POST', headers, credentials: withCredentials ? 'include' : 'omit', body: JSON.stringify(body), signal: signalToUse });
    const data = await response.json().catch(() => null);
    return { status: response.status, statusText: response.statusText, data };
  }
};
