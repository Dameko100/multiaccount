#!/usr/bin/env node
'use strict';
// Obtiene el refresh token que necesitan YouTube y TikTok.
//   npm run auth -- youtube   (cliente OAuth de tipo "App de escritorio" en Google Cloud)
//   npm run auth -- tiktok    (usa TIKTOK_REDIRECT_URI, la misma registrada en tu app de TikTok)
const http = require('node:http');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { loadEnv } = require('../src/config');
const { createTokenStore } = require('../src/tokens');
loadEnv();

const env = process.env;
const need = (...keys) => {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) { console.error(`Faltan en .env: ${missing.join(', ')}`); process.exit(1); }
};

async function postForm(url, params) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(JSON.stringify(data));
  return data;
}

async function youtube() {
  need('YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET');
  const state = crypto.randomBytes(8).toString('hex');
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  console.log('\nAbre este enlace, entra con la cuenta del canal y acepta:\n\n' + url + '\n');
  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      if (!q.get('code') && !q.get('error')) { res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(q.get('error') ? 'Autorización cancelada.' : 'Listo. Vuelve a la terminal.');
      server.close();
      if (q.get('state') !== state) reject(new Error('El parámetro state no coincide.'));
      else if (q.get('error')) reject(new Error(q.get('error')));
      else resolve(q.get('code'));
    });
  });
  const data = await postForm('https://oauth2.googleapis.com/token', {
    code, client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, redirect_uri: redirect, grant_type: 'authorization_code',
  });
  if (!data.refresh_token) throw new Error('Google no devolvió refresh_token. Revoca el acceso en myaccount.google.com/permissions y repite.');
  console.log(`\nAñade esto a .env:\n\nYOUTUBE_REFRESH_TOKEN=${data.refresh_token}\n`);
}

async function tiktok() {
  need('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI');
  const state = crypto.randomBytes(8).toString('hex');
  const url = 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    scope: 'user.info.basic,video.publish,video.upload',
    response_type: 'code',
    redirect_uri: env.TIKTOK_REDIRECT_URI,
    state,
  });
  console.log('\nAbre este enlace, entra con la cuenta de TikTok y acepta:\n\n' + url + '\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await rl.question('Después te redirigirá a tu TIKTOK_REDIRECT_URI. Pega aquí la URL completa de esa página:\n> ');
  rl.close();
  const q = new URL(pasted.trim()).searchParams;
  if (q.get('state') !== state) throw new Error('El parámetro state no coincide.');
  const data = await postForm('https://open.tiktokapis.com/v2/oauth/token/', {
    client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code: q.get('code'), grant_type: 'authorization_code', redirect_uri: env.TIKTOK_REDIRECT_URI,
  });
  createTokenStore().set('tiktok_refresh_token', data.refresh_token);
  console.log(`\nAñade esto a .env (también queda guardado en data/tokens.json):\n\nTIKTOK_REFRESH_TOKEN=${data.refresh_token}\n`);
}

const which = process.argv[2];
const run = { youtube, tiktok }[which];
if (!run) { console.error('Uso: npm run auth -- youtube | tiktok'); process.exit(1); }
run().catch((err) => { console.error('Error:', err.message); process.exit(1); });
