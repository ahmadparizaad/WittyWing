// Minimal axios-like wrapper (UMD style) for client-side usage in the extension
// Implements axios.get and axios.post with basic features used in the extension.
(function (global) {
  const axios = {
    get: async function (url, config = {}) {
      const headers = config.headers || {};
      const withCredentials = !!config.withCredentials;
      const response = await fetch(url, { method: 'GET', headers: headers, credentials: withCredentials ? 'include' : 'omit' });
      const data = await response.json().catch(() => null);
      return { status: response.status, statusText: response.statusText, data };
    },
    post: async function (url, body, config = {}) {
      const headers = Object.assign({'Content-Type': 'application/json'}, config.headers || {});
      const withCredentials = !!config.withCredentials;
      const response = await fetch(url, { method: 'POST', headers, credentials: withCredentials ? 'include' : 'omit', body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      return { status: response.status, statusText: response.statusText, data };
    }
  };
  global.axios = axios;
})(window);
