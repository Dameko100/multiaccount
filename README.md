# Multiaccount · publicador para Limited Sniper

Escribe un post una vez y publícalo **a la vez** en las redes donde promocionamos
[Limited Sniper](https://limitedsniper.app): X, Bluesky, Mastodon, Threads, Instagram,
Facebook, LinkedIn, Reddit, Telegram y Discord.

- **Vista previa por red**: ajusta el texto al límite de cada una (X cuenta los enlaces como
  23 caracteres, Bluesky 300, Threads 500…). El enlace nunca se corta; si no cabe, se quitan
  primero los hashtags y después se acorta el texto.
- **Edición por plataforma**: puedes cambiar el texto solo para una red.
- **Publicación en paralelo**: si una red falla, las demás se publican igual; verás qué falló y por qué.
- **Simular**: comprueba qué se enviaría sin publicar nada.
- **Plantillas** de Limited Sniper en español e inglés (Free vs Pro, privacidad, velocidad, Discord…).
- **Historial** con enlaces a cada publicación (`data/history.json`).
- Sin dependencias: solo Node.js 20 o superior.

## Uso rápido

```bash
cp .env.example .env     # rellena solo las redes que vayas a usar
npm start                # abre http://127.0.0.1:4545
```

Desde la terminal:

```bash
npm run post -- --list                                   # redes configuradas y plantillas
npm run post -- --template launch-es --dry-run           # simular una plantilla
npm run post -- "¡Nueva versión!" -p x,bluesky,discord   # publicar en redes concretas
npm run post -- "Texto" --image https://…/captura.png --tags "Roblox LimitedSniper"
```

Sin `-p` publica en todas las redes configuradas.

> El servidor escucha solo en `127.0.0.1` porque guarda las credenciales de todas las cuentas.
> No lo expongas a internet sin añadir autenticación.

## Credenciales por plataforma

| Red | Variables en `.env` | Cómo obtenerlas | Notas |
|---|---|---|---|
| X | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | [Developer Portal](https://developer.x.com/en/portal/dashboard) → app con permisos *Read and write* → regenera los Access Token después de cambiar permisos | Solo texto. El plan gratuito de la API tiene un cupo mensual de posts bajo. |
| Bluesky | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Ajustes → [App Passwords](https://bsky.app/settings/app-passwords) | Enlaces y hashtags clicables, tarjeta del enlace o imagen. |
| Mastodon | `MASTODON_INSTANCE`, `MASTODON_ACCESS_TOKEN` | Preferencias → Desarrollo → Nueva aplicación (scopes `write:statuses`, `write:media`) | |
| Threads | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` | [Threads API](https://developers.facebook.com/docs/threads/get-started) (`threads_basic`, `threads_content_publish`) | |
| Instagram | `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` | Cuenta Business/Creator + [Graph API](https://developers.facebook.com/docs/instagram-platform/content-publishing) (`instagram_content_publish`) | **Requiere imagen** (URL pública https). Los enlaces del texto no son clicables. |
| Facebook | `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` | Token de página con `pages_manage_posts` | Publica en la página, no en perfiles personales. |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN` | App con `w_member_social` (perfil) o `w_organization_social` (página) | `LINKEDIN_AUTHOR_URN` = `urn:li:person:…` o `urn:li:organization:…`. Texto + tarjeta del enlace. |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`, `REDDIT_SUBREDDIT` | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → app tipo *script* | Post de texto, sin hashtags. Respeta las reglas de autopromoción de cada subreddit. |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Crea el bot con @BotFather y hazlo administrador del canal | Con imagen el texto se limita a 1024 caracteres. |
| Discord | `DISCORD_WEBHOOK_URL` | Ajustes del canal → Integraciones → Webhooks | |

TikTok y YouTube no están incluidos: sus APIs solo publican vídeo y exigen una auditoría de la app.

## Buenas prácticas

- Usa **Simular** antes de publicar algo nuevo.
- Las plantillas no prometen compras garantizadas: el README de Limited Sniper avisa de que la
  compra depende de Roblox y de la red, y de que automatizar compras va contra los Términos de Roblox.
  Mantén ese tono para no chocar con las normas de cada red.
- No publiques el mismo texto muchas veces seguidas: X, Reddit y Threads penalizan el contenido repetido.

## Desarrollo

```bash
npm test
```

Cada red es un módulo en `src/platforms/` con `id`, límites (`rules`), variables necesarias y
una función `publish`. Para añadir una red, crea el módulo y regístralo en `src/platforms/index.js`.
