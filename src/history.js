'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 200;

function createHistory(file = path.join(__dirname, '..', 'data', 'history.json')) {
  function read() {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  }
  function add(entry) {
    const list = [entry, ...read()].slice(0, MAX_ENTRIES);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 2));
    return entry;
  }
  return { read, add };
}

module.exports = { createHistory };
