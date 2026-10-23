'use strict';

// Ready-to-use marketing copy for Limited Sniper. Claims match the product
// README: no promised success rates, and the Roblox ToS risk stays visible
// where auto-buy is mentioned.
const LINK = 'https://limitedsniper.app';

const templates = [
  {
    id: 'launch-es',
    lang: 'es',
    name: 'Presentación (ES)',
    title: 'Limited Sniper: monitor local de limiteds de Roblox',
    text: '🎯 ¿Cansado de perderte limiteds de Roblox a buen precio?\n\nLimited Sniper vigila el marketplace en tiempo real desde tu PC y te avisa en cuanto un limited baja a tu precio objetivo. Tu cookie nunca sale de tu ordenador.',
    hashtags: ['Roblox', 'RobloxLimiteds', 'LimitedSniper'],
  },
  {
    id: 'launch-en',
    lang: 'en',
    name: 'Launch (EN)',
    title: 'Limited Sniper: a local-first monitor for Roblox limiteds',
    text: '🎯 Tired of missing Roblox limiteds at a good price?\n\nLimited Sniper watches the marketplace in real time from your own PC and alerts you the moment a limited drops to your target price. Your cookie never leaves your machine.',
    hashtags: ['Roblox', 'RobloxLimiteds', 'LimitedSniper'],
  },
  {
    id: 'free-vs-pro-es',
    lang: 'es',
    name: 'Free vs Pro (ES)',
    title: 'Limited Sniper Free vs Pro',
    text: '🆓 Gratis: 1 limited vigilado.\n💎 Pro: limiteds ilimitados, multicuenta, webhooks de Discord, auto-buy y polling desde 500 ms.\n\nPro desde $4.99 / 7 días, $9.99 / mes o $69.99 de por vida. Sin renovación automática.',
    hashtags: ['Roblox', 'LimitedSniper'],
  },
  {
    id: 'free-vs-pro-en',
    lang: 'en',
    name: 'Free vs Pro (EN)',
    title: 'Limited Sniper Free vs Pro',
    text: '🆓 Free: track 1 limited.\n💎 Pro: unlimited items, multi-account, Discord webhooks, auto-buy and polling from 500 ms.\n\nPro from $4.99 / 7 days, $9.99 / month or $69.99 lifetime. No auto-renewal.',
    hashtags: ['Roblox', 'LimitedSniper'],
  },
  {
    id: 'privacy-es',
    lang: 'es',
    name: 'Privacidad / local-first (ES)',
    title: 'Tu cookie de Roblox se queda en tu PC',
    text: '🔒 Limited Sniper funciona 100% en tu ordenador: tu .ROBLOSECURITY se guarda cifrada en tu disco y solo se envía a Roblox, nunca a nuestros servidores.\n\nDashboard en tiempo real con watchlist, actividad, presupuesto y registro de compras.',
    hashtags: ['Roblox', 'Privacidad', 'LimitedSniper'],
  },
  {
    id: 'speed-en',
    lang: 'en',
    name: 'Speed (EN)',
    title: 'How fast is Limited Sniper?',
    text: '⚡ Automatic ms mode adapts polling to your watchlist, keeps a Roblox CSRF token pre-warmed and reuses keep-alive connections, so the normal buy path is a single POST.\n\nNo magic: the floor is your round-trip to Roblox. A wired connection = less jitter.',
    hashtags: ['Roblox', 'RobloxTrading', 'LimitedSniper'],
  },
  {
    id: 'discord-es',
    lang: 'es',
    name: 'Alertas en Discord (ES)',
    title: 'Alertas de limiteds en tu Discord',
    text: '🔔 Con Limited Sniper Pro recibes las bajadas de precio y las compras directamente en tu servidor de Discord vía webhook. Vigila desde el móvil lo que tu PC está monitorizando.',
    hashtags: ['Roblox', 'Discord', 'LimitedSniper'],
  },
];

module.exports = { templates, LINK };
