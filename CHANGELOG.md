# Changelog

What changed in osugd, newest first. Dates are the day the change went live.

## 2026-11-16

### Added

- Player search in the header. On desktop it sits left of the settings gear; on mobile it is an icon next to the avatar that opens a full-width search bar. Results are limited to accounts that have not hidden their profile.
- Grouping for the GD log: **Flat**, **Month**, **Star** (whole stars, `Unrated` last) and **Host** (A–Z). The choice is saved per account under Settings → Grouping and is what Reset filters returns to.
- A `Group order` control that follows the grouping: newest/oldest for month and flat, heaviest/lightest for star, Z→A / A→Z for host.
- Every log row prints its own date under the artist, in all four groupings.
- Sync button on the GD log, next to Filters.
- Search in the log by map title, artist or host.
- Delete on GD Track board cards, with the same inline `Delete? Yes / No` used in History.
- `/u/<name>` now answers with that profile's own link preview (`SayuMana's guest difficulties · osugd`, `99 GDs · 35 mappers · 3.92★ average`).
- Landing page shows the owner's GD count and a `View <name>'s log` button, so a first-time visitor can reach the public profile.
- First-run import: the empty log explains that osugd pulls every beatmap you are credited on from osu!, offers `Import my GDs from osu!`, and reports how many landed. The dashboard shows the same prompt for an account with no entries.
- `CHANGELOG.md`, this file.

### Changed

- Star ratings are coloured with osu!'s own difficulty spectrum: `#4FC0FF` easy, `#7CFF4F` normal, `#F6F05C` hard, `#FF4E6F` insane, `#C645B8` expert, `#6563DE` expert+.
- Difficulty on the Add track dialog is typed, not picked from a fixed list, so Muzukashii, Salad and other mode-specific names fit.
- "dropped" is no longer offered when adding a track; it stays available on cards that already exist.
- A guest opening `/log`, `/summary` or `/track` lands on the owner's public copy of that page instead of the homepage.
- The login banner describes what an account gets: your own GD log and track board.
- Tab titles follow the page inside `/u/`: profile log reads `osugd | Guest difficulties`.

### Fixed

- Usernames made only of digits (`789`) could not be opened as `/u/789`; the numeric segment was always read as an osu id.
- The mapper column disappeared from the log below 720px, and the mobile card had no room for it.
- The status filter behaved backwards: picking one status from the all-selected state turned that status off instead of narrowing to it.
- `+1 this month` on the dashboard is now a link to `/log?month=YYYY-MM`, and that view opens every status so the month is not empty.

### Security

- Player search requires a session, and accounts with `profile_public = false` never appear in it.
- Admin privilege is re-checked against the database on every privileged request, so removing someone from `ADMIN_OSU_IDS` takes effect immediately instead of after the 30-day cookie expires.
- Database errors are logged on the server and answered with a generic message; Supabase text naming tables and constraints no longer reaches the client.
- Rate limiting counts in Upstash Redis when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set, so the limit holds across serverless instances. Without them it falls back to in-memory per process.
- Response headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`.

## 2026-11-14

### Added

- osugd goes multi-user. Every account owns its GD log, summary, track board and settings; `owner_id` comes from the session, and there is no single owner id in the environment any more.
- Admin mode: an admin can turn the toggle on in Settings and then add or delete GDs and tracks on someone else's pages, the way a GMT works on osu!. Role says who may moderate, the toggle says whether they are doing it right now.
- Public profile pages at `/u/<name>`, with `/summary`, `/log` and `/track` underneath, all read-only.
- Visibility toggles per account: GD log, GD track, summary and the whole profile.
- `Copy link to share` on the log, summary, track board and profile.
- Daily status sync, in-process locally and through Vercel Cron in production.

### Changed

- Settings moved from a nav item to a gear next to the profile, and every account can reach it, not only the owner.
- Empty log and private log are different states in the UI; a private log no longer reads as an empty one.

## 2026-11-13

### Added

- First version: GD log with month grouping, column sorting, mode icons and filters; summary with stat tiles, sparklines and a mapper list; GD track board with a history tab; osu! OAuth login; Supabase storage; deployed on Vercel.
