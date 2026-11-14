const API = "https://osu.ppy.sh/api/v2";

let cached = { token: null, exp: 0 };

export async function getToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const body = new URLSearchParams({
    client_id: process.env.OSU_CLIENT_ID,
    client_secret: process.env.OSU_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "public",
  });
  const r = await fetch("https://osu.ppy.sh/oauth/token", { method: "POST", body });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_TRIES = 3;
const MAX_WAIT_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function osuGet(path, token) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.json();

    if (attempt >= MAX_TRIES || !RETRY_STATUS.has(r.status)) {
      throw new Error(`osu ${r.status} on ${path}`);
    }

    // hormati Retry-After kalau osu kirim, kalau tidak backoff 2s lalu 4s
    const retryAfter = Number(r.headers.get("retry-after")) * 1000;
    await sleep(Math.min(MAX_WAIT_MS, retryAfter > 0 ? retryAfter : 2000 * 2 ** (attempt - 1)));
  }
}

export async function getGuestSets(userId, offset, limit, token) {
  return osuGet(`/users/${userId}/beatmapsets/guest?limit=${limit}&offset=${offset}`, token);
}

export async function getBeatmapset(id, token) {
  return osuGet(`/beatmapsets/${id}`, token);
}

export function dateOf(set) {
  const iso = set.ranked_date || set.submitted_date || set.last_updated;
  return iso ? iso.slice(0, 10) : null;
}
