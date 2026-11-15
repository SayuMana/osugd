# osugd

A log of guest difficulties: the map each one went on, its status, and its star rating
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

## Credit

Built by [SayuMana](https://osu.ppy.sh/users/12602650).

Written by vibe coding. The code was generated with [Hermes Agent](https://hermes-agent.nousresearch.com) by Nous Research, running the DeepSeek V4.1 Flash model. I set the direction, reviewed the output, and made the product decisions.
