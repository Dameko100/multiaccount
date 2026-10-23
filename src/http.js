'use strict';

class PlatformError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// fetch wrapper that parses JSON when possible and throws on non-2xx.
async function request(fetchImpl, url, options = {}) {
  const res = await fetchImpl(url, options);
  const raw = await res.text();
  let data = raw;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new PlatformError(`HTTP ${res.status}: ${String(detail).slice(0, 300)}`, res.status, data);
  }
  return data;
}

module.exports = { request, PlatformError };
