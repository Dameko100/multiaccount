'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Some refresh tokens rotate (TikTok). The newest one is kept here so .env
// only needs the first one.
const FILE = path.join(__dirname, '..', 'data', 'tokens.json');

function createTokenStore(file = FILE) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  return {
    get: (key) => read()[key],
    set(key, value) {
      const all = read();
      all[key] = value;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(all, null, 2), { mode: 0o600 });
    },
  };
}

module.exports = { createTokenStore };
