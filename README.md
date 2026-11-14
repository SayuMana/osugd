# osugd

A log of the guest difficulties I have mapped for osu! beatmaps. Each entry keeps the map, the difficulty, its status, and its star rating.

Live at https://osugd.vercel.app

## What it does

- **GD log**: every guest difficulty, grouped by month, with filters for year, status, and mode. Click a column header to sort.
- **Summary**: totals, star rating spread, GDs per year, and mappers, using the same filters.
- **GD track**: a board for work in progress, from accepted to done. Marking a track done writes it into the log.
- **Settings**: public toggles for the log, the track board, and the summary, plus the default filters every visitor sees.

Only the owner can write. Everyone else gets read access, and only to the parts left public.

## Stack

- API: Express on Node, Supabase (Postgres), osu! API v2
- Web: React, Vite, Tailwind v4
- Deploy: Vercel, with a daily cron that refreshes map status from osu

## Run locally

Two terminals.

API:

```bash
cd api
cp .env.example .env   # fill in the values
npm install
npm run dev
```

Web:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to port 3001, so the API has to run first.

## Environment

| Variable | What it is |
| --- | --- |
| `WEB_ORIGIN` | Where the browser app lives. Login redirects back here. |
| `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET` | Credentials from your osu! OAuth app. |
| `OSU_REDIRECT_URI` | Must match the redirect URI registered on the osu! app. |
| `SESSION_SECRET` | Signs the session cookie. Changing it logs everyone out. |
| `OWNER_OSU_ID` | The osu! account that owns the log. |
| `ADMIN_OSU_IDS` | Comma separated osu! ids allowed to write. |
| `CRON_SECRET` | Bearer token for `/api/cron/sync`. Leave it empty and that endpoint returns 404. |
| `REQUESTS_ENABLED` | The request queue is off in production unless this is `1`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase project and service key. Server side only. |

## Credit

Built by [SayuMana](https://osu.ppy.sh/users/12602650).

Written by vibe coding. The code was generated with [Hermes Agent](https://hermes-agent.nousresearch.com) by Nous Research, running the DeepSeek V4.1 Flash model. I set the direction, reviewed the output, and made the product decisions.
