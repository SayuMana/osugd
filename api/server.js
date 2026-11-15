import express from "express";
import crypto from "node:crypto";
import { db } from "./lib/db.js";
import { getToken, getGuestSets, getBeatmapset, dateOf } from "./lib/osu.js";
import { osuGet } from "./lib/osu.js";

const {
  OSU_CLIENT_ID,
  OSU_CLIENT_SECRET,
  OSU_REDIRECT_URI,
  SESSION_SECRET,
  WEB_ORIGIN = "http://localhost:5173",
  PORT = 3001,
} = process.env;

const app = express();

// kolom mode ditambahkan di migrasi 006; sebelum itu semua tulisan mode dilewati
let HAS_MODE = false;
db.from("gd_entries").select("game_mode").limit(1).then(({ error }) => {
  HAS_MODE = !error;
});
const MODE_KEYS = ["osu", "taiko", "fruits", "mania"];
const TRACK_STATUSES = ["accepted", "priority", "in_progress", "dropped"];
const trackStatusOf = (v) => (TRACK_STATUSES.includes(v) ? v : "accepted");
const withMode = (s) => (HAS_MODE ? `${s},game_mode` : s);

// preferensi filter default milik owner; dipakai /log dan /summary untuk semua pengunjung
let HAS_PREFS = false;
db.from("user_settings").select("default_mode").limit(1).then(({ error }) => {
  HAS_PREFS = !error;
});
const STATUS_KEYS = ["ranked", "loved", "qualified", "pending", "wip", "graveyard"];

async function ownerDefaults(ownerId) {
  if (!HAS_PREFS) return { mode: "all", statuses: [] };
  const { data } = await db
    .from("user_settings")
    .select("default_mode,default_statuses")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return {
    mode: data?.default_mode || "all",
    statuses: Array.isArray(data?.default_statuses) ? data.default_statuses : [],
  };
}
const modeOf = (b) => {
  const m = b?.mode || b?.game_mode;
  return HAS_MODE && m ? { game_mode: m } : {};
};
app.use(express.json());

// di belakang proxy host (Render/Vercel) supaya req.ip bukan IP proxy
app.set("trust proxy", 1);

// rate limit in-memory per IP; cukup untuk satu proses, tidak perlu dependency
const LIMITS = {
  read: { max: 120, window: 60_000 },
  osu: { max: 20, window: 60_000 },
};
const hits = new Map();

function limit(bucket) {
  const { max, window } = LIMITS[bucket];
  return (req, res, next) => {
    // owner tidak dibatasi, biar import dan refresh sendiri tidak kena
    if (readSession(req)?.role === "admin") return next();

    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const rec = hits.get(key);

    if (!rec || now > rec.resetAt) {
      if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
      hits.set(key, { n: 1, resetAt: now + window });
      return next();
    }

    rec.n += 1;
    if (rec.n > max) {
      res.setHeader("Retry-After", String(Math.ceil((rec.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Try again in a moment." });
    }
    next();
  };
}

const b64 = (s) => Buffer.from(s).toString("base64url");
const mac = (payload) => crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");

function safeEqual(a, b) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// error database: detailnya masuk log server, klien cuma dapat pesan umum
const SAFE_ERR = "Something broke on our side. Try again.";
const dbFail = (res, e) => {
  console.error("db:", e?.message || e);
  return res.status(500).json({ error: SAFE_ERR });
};
const dbThrow = (e) => {
  console.error("db:", e?.message || e);
  return new Error(SAFE_ERR);
};

function setSession(res, data) {
  const payload = b64(JSON.stringify({ ...data, exp: Date.now() + 30 * 864e5 }));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `sid=${payload}.${mac(payload)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${secure}`
  );
}

function readSession(req) {
  const raw = (req.headers.cookie || "")
    .split("; ")
    .find((c) => c.startsWith("sid="))
    ?.slice(4);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(mac(payload), sig)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  return data.exp > Date.now() ? data : null;
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

const secureFlag = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

app.get("/api/auth/login", (req, res) => {
  // state nyangkut di cookie; callback wajib cocok, biar tidak bisa dipaksa login ke akun orang lain
  const state = crypto.randomBytes(16).toString("base64url");
  res.setHeader("Set-Cookie", `oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secureFlag()}`);

  const url = new URL("https://osu.ppy.sh/oauth/authorize");
  url.searchParams.set("client_id", OSU_CLIENT_ID);
  url.searchParams.set("redirect_uri", OSU_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/api/auth/callback", async (req, res) => {
  if (req.query.error) return res.status(400).send("osu denied the login");

  const sentState = (req.headers.cookie || "")
    .split("; ")
    .find((c) => c.startsWith("oauth_state="))
    ?.slice("oauth_state=".length);
  if (!sentState || req.query.state !== sentState) {
    return res.status(400).send("Login state mismatch. Start again from the login button.");
  }
  res.setHeader("Set-Cookie", `oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag()}`);
  const body = new URLSearchParams({
    client_id: OSU_CLIENT_ID,
    client_secret: OSU_CLIENT_SECRET,
    code: String(req.query.code || ""),
    grant_type: "authorization_code",
    redirect_uri: OSU_REDIRECT_URI,
  });
  const tokenRes = await fetch("https://osu.ppy.sh/oauth/token", { method: "POST", body });
  if (!tokenRes.ok) return res.status(502).send("token exchange failed");
  const token = await tokenRes.json();
  const meRes = await fetch("https://osu.ppy.sh/api/v2/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) return res.status(502).send("profile fetch failed");
  const me = await meRes.json();

  const adminIds = (process.env.ADMIN_OSU_IDS || "").split(",").map((s) => s.trim());
  const role = adminIds.includes(String(me.id)) ? "admin" : "user";

  const upsert = await db.from("users").upsert(
    { osu_id: me.id, username: me.username, avatar_url: me.avatar_url, role },
    { onConflict: "osu_id" }
  );
  if (upsert.error) return res.status(502).send("user upsert failed");

  await db
    .from("user_settings")
    .upsert({ owner_id: me.id }, { onConflict: "owner_id", ignoreDuplicates: true });

  setSession(res, { osu_id: me.id, username: me.username, avatar: me.avatar_url, role });
  res.redirect(WEB_ORIGIN);
});

app.get("/api/me", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.json(null);
  if (s.role !== "admin") return res.json({ ...s, admin_mode: false });

  const { data } = await db
    .from("user_settings")
    .select("admin_mode")
    .eq("owner_id", s.osu_id)
    .maybeSingle();
  res.json({ ...s, admin_mode: data?.admin_mode === true });
});

// data siapa yang disentuh: diri sendiri, atau user lain kalau admin mode nyala
async function actorId(req, s) {
  const q = String(req.query.user || "").trim();
  if (!q || s?.role !== "admin") return s.osu_id;

  const { data: set } = await db
    .from("user_settings")
    .select("admin_mode")
    .eq("owner_id", s.osu_id)
    .maybeSingle();
  if (set?.admin_mode !== true) return s.osu_id;

  const base = db.from("users").select("osu_id");
  const { data: u } = /^\d+$/.test(q)
    ? await base.eq("osu_id", Number(q)).maybeSingle()
    : await base.ilike("username", q.replace(/[\%_]/g, (c) => "\\" + c)).maybeSingle();
  return u?.osu_id ?? s.osu_id;
}


app.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

// cari pemilik data: ?user=<nama|id> untuk tampilan publik, kalau tidak ada pakai yang login
async function resolveOwner(req) {
  const s = readSession(req);
  const q = String(req.query.user || "").trim();

  if (q) {
    const base = db.from("users").select("osu_id,username,role");
    const { data: u } = /^\d+$/.test(q)
      ? await base.eq("osu_id", Number(q)).maybeSingle()
      : await base.ilike("username", q.replace(/[\\%_]/g, (c) => "\\" + c)).maybeSingle();
    if (!u) return { error: "notfound" };
    return { s, owner: u, isSelf: s?.osu_id === u.osu_id };
  }

  if (!s) return { error: "auth" };
  return { s, owner: { osu_id: s.osu_id, username: s.username, role: s.role }, isSelf: true };
}

app.get("/api/gd", limit("read"), async (req, res) => {
  const r = await resolveOwner(req);
  if (r.error === "auth") return res.status(401).json({ error: "Log in first." });
  if (r.error) return res.status(404).json({ error: "That user has not logged in here." });

  const { s, owner, isSelf } = r;
  const ownerId = owner.osu_id;
  const privileged = isSelf || s?.role === "admin";

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const isPublic = settings?.gd_log_public ?? true;
  if (!privileged && isPublic === false) return res.status(403).json({ error: "private" });

  let q = db
    .from("gd_entries")
    .select(withMode("id,beatmapset_id,beatmap_id,artist,title,diff_name,host,map_status,star_rating,gd_date,note,is_archived,source"))
    .eq("owner_id", ownerId)
    .order("gd_date", { ascending: false });
  if (!privileged || req.query.archived !== "1") q = q.eq("is_archived", false);

  const { data, error } = await q;
  if (error) return dbFail(res, error);
  // catatan pribadi: jangan pernah ikut ke pengunjung
  const entries = privileged ? data : (data || []).map(({ note, ...rest }) => rest);
  res.json({ entries, defaults: await ownerDefaults(ownerId), user: owner.username });
});

app.get("/api/users/:osuId", limit("read"), async (req, res) => {
  const s = readSession(req);
  // terima osu id maupun username, biar link bisa dibaca (/u/sayumana)
  const raw = String(req.params.osuId || "").trim().slice(0, 64);
  if (!raw) return res.status(400).json({ error: "Bad user id." });

  const base = db.from("users").select("osu_id,username,avatar_url,role");
  const { data: user } = /^\d+$/.test(raw)
    ? await base.eq("osu_id", Number(raw)).maybeSingle()
    : await base.ilike("username", raw.replace(/[\\%_]/g, (c) => "\\" + c)).maybeSingle();
  if (!user) return res.status(404).json({ error: "That user has not logged in here." });

  const id = user.osu_id;
  const isSelf = s?.osu_id === id;
  const privileged = isSelf || s?.role === "admin";
  const PAGE = 20;
  const page = Math.max(0, Number(req.query.page) || 0);

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("owner_id", id)
    .maybeSingle();
  const logPublic = settings?.gd_log_public ?? true;

  // profil bisa disembunyikan dari orang lain
  if (settings?.profile_public === false && !privileged) {
    return res.status(403).json({ error: "This profile is private." });
  }

  const statuses = privileged
    ? ["pending", "accepted", "in_progress", "done", "rejected", "on_hold"]
    : ["pending", "accepted", "in_progress", "done"];

  // log milik user itu sendiri, bukan filter host lagi
  let gdsP = Promise.resolve({ data: [], count: 0 });
  if (logPublic || privileged) {
    gdsP = db
      .from("gd_entries")
      .select(
        withMode("id,beatmapset_id,beatmap_id,artist,title,diff_name,host,map_status,star_rating,gd_date"),
        { count: "exact" }
      )
      .eq("owner_id", id)
      .eq("is_archived", false)
      .order("gd_date", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
  }

  const reqsP = db
    .from("requests")
    .select("id,beatmapset_id,artist,title,requested_diff,status,created_at")
    .eq("requester_id", id)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(20);

  const [{ data: gdsData, count }, { data: reqs }] = await Promise.all([gdsP, reqsP]);
  const gds = gdsData || [];
  const gdsTotal = count ?? 0;

  res.json({
    user: { osu_id: user.osu_id, username: user.username, avatar_url: user.avatar_url, is_self: isSelf },
    gds,
    gds_total: gdsTotal,
    requests: reqs || [],
    log_public: logPublic,
    track_public: settings?.gd_track_public !== false,
    summary_public: settings?.summary_public !== false,
    page,
    page_size: PAGE,
  });
});

app.get("/api/summary", limit("read"), async (req, res) => {
  const r = await resolveOwner(req);
  if (r.error === "auth") return res.status(401).json({ error: "Log in first." });
  if (r.error) return res.status(404).json({ error: "That user has not logged in here." });

  const { s, owner, isSelf } = r;
  const ownerId = owner.osu_id;
  const privileged = isSelf || s?.role === "admin";

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  // kolom summary_public menyusul; sebelum ada, ikut visibility log
  const isPublic = settings?.summary_public ?? settings?.gd_log_public ?? true;
  if (!privileged && isPublic === false) return res.status(403).json({ error: "private" });

  const { data, error } = await db
    .from("gd_entries")
    .select(withMode("id,host,host_id,map_status,star_rating,gd_date"))
    .eq("owner_id", ownerId)
    .eq("is_archived", false)
    .order("gd_date", { ascending: false });
  if (error) return dbFail(res, error);
  res.json({ entries: data, names: await mapperNames(data), defaults: await ownerDefaults(ownerId), user: owner.username });
});

const NAMES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// nama mapper diambil dari cache; yang belum ada / basi diisi maksimal 5 per request
async function mapperNames(entries) {
  const ids = [...new Set(entries.map((e) => e.host_id).filter(Boolean))];
  if (!ids.length) return {};

  const { data } = await db.from("mapper_names").select("*").in("osu_id", ids);
  const map = {};
  for (const r of data || []) {
    map[r.osu_id] = {
      username: r.username,
      previous: r.previous || [],
      show: r.show_previous !== false,
      at: new Date(r.fetched_at).getTime(),
    };
  }

  const stale = ids.filter((id) => !map[id] || Date.now() - map[id].at > NAMES_TTL_MS).slice(0, 5);
  if (!stale.length) return map;

  const token = await getToken();
  for (const id of stale) {
    try {
      const u = await osuGet(`/users/${id}/osu`, token);
      const row = {
        osu_id: id,
        username: u.username,
        previous: u.previous_usernames || [],
        show_previous: true,
        fetched_at: new Date().toISOString(),
      };
      await db.from("mapper_names").upsert(row);
      map[id] = { username: row.username, previous: row.previous, show: true, at: Date.now() };
    } catch {
      // akun hilang / limit: pakai nama yang tersimpan di entry
    }
  }
  return map;
}

async function resolveLink(token, raw, ownerId) {
  const setMatch = String(raw).match(/beatmapsets\/(\d+)/);
  const diffMatch = String(raw).match(/(?:#\w+\/|\/beatmaps\/)(\d+)/);
  const set = setMatch ? Number(setMatch[1]) : null;
  const diff = diffMatch ? Number(diffMatch[1]) : null;
  if (!set && !diff) throw new Error("Not an osu! beatmap link.");

  let full;
  try {
    if (set) full = await getBeatmapset(set, token);
    else {
      const b = await osuGet(`/beatmaps/${diff}`, token);
      full = await getBeatmapset(b.beatmapset_id, token);
    }
  } catch (e) {
    if (/404/.test(e.message)) throw new Error("That beatmap does not exist on osu!.");
    throw e;
  }

  const all = full.beatmaps || [];
  const mine = all.filter((b) => (b.owners || []).some((o) => o.id === ownerId));
  return { full, all, mine, wanted: diff };
}

async function insertEntry(ownerId, full, pick) {
  const row = {
    owner_id: ownerId,
    beatmapset_id: full.id,
    beatmap_id: pick.id,
    artist: full.artist,
    title: full.title,
    diff_name: pick.version,
    ...modeOf(pick),
    host: full.creator,
    host_id: full.user_id ?? null,
    map_status: full.status,
    star_rating: pick.difficulty_rating != null ? Number(pick.difficulty_rating.toFixed(2)) : null,
    gd_date: dateOf(full),
    source: "manual",
    synced_at: new Date().toISOString(),
  };
  const up = await db
    .from("gd_entries")
    .upsert(row, { onConflict: "owner_id,beatmap_id" })
    .select("id,gd_date")
    .single();
  if (up.error) throw dbThrow(up.error);
  return up.data;
}

const PUBLISHED = new Set(["ranked", "approved", "loved", "qualified"]);

app.post("/api/gd/batch", limit("osu"), async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const lines = String(req.body?.text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!lines.length) return res.status(400).json({ error: "Paste at least one link." });

  try {
    const token = await getToken();
    const results = [];

    for (let i = 0; i < lines.length; i += 2) {
      const group = lines.slice(i, i + 2);
      const out = await Promise.all(
        group.map(async (line) => {
          try {
            const { full, all, mine, wanted } = await resolveLink(token, line, ownerId);

            if (PUBLISHED.has(full.status)) {
              return {
                line,
                ok: false,
                message: `${full.title} is already ${full.status}. Published GDs come from the import.`,
              };
            }

            if (mine.length) {
              // satu set bisa punya beberapa diff milik user ini: masukkan semuanya
              const ids = [];
              let gd_date = null;
              for (const pick of mine) {
                const saved = await insertEntry(ownerId, full, pick);
                if (saved?.id) ids.push(saved.id);
                if (!gd_date && saved?.gd_date) gd_date = saved.gd_date;
              }
              const label =
                mine.length === 1
                  ? mine[0].version
                  : `${mine.length} diffs (${mine.map((b) => b.version).join(", ")})`;
              return {
                line,
                ok: true,
                id: ids[0] ?? null,
                ids,
                gd_date,
                message: `${full.title} · ${label} · ${full.status}`,
              };
            }

            const pick = all.find((b) => b.id === wanted) || all[0];
            if (!pick) return { line, ok: false, message: "This set has no difficulties." };

            const owners = pick.owners || [];
            if (owners.length) {
              return {
                line,
                ok: false,
                message: `${full.title} (${pick.version}) is credited to ${owners
                  .map((o) => o.username)
                  .join(" + ")}, not you.`,
              };
            }

            return {
              line,
              ok: false,
              needsConfirm: true,
              beatmapset_id: full.id,
              beatmap_id: pick.id,
              message: `${full.title} (${pick.version}) has no mapper credit. Is this your GD?`,
            };
          } catch (e) {
            return { line, ok: false, message: e.message };
          }
        })
      );
      results.push(...out);
    }

    res.json({
      results,
      added: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.patch("/api/gd/:id", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const patch = {};
  if (typeof req.body?.note === "string") patch.note = req.body.note.slice(0, 500);
  if (typeof req.body?.is_archived === "boolean") {
    patch.is_archived = req.body.is_archived;
    patch.archived_at = req.body.is_archived ? new Date().toISOString() : null;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update." });

  const { data, error } = await db
    .from("gd_entries")
    .update(patch)
    .eq("id", Number(req.params.id))
    .eq("owner_id", ownerId)
    .select("id,note,is_archived");
  if (error) return dbFail(res, error);
  if (!data?.length) return res.status(404).json({ error: "Entry not found." });
  res.json({ ok: true, entry: data[0] });
});

app.delete("/api/gd/:id", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const id = Number(req.params.id);
  const del = await db.from("gd_entries").delete().eq("id", id).eq("owner_id", ownerId);
  if (del.error) return dbFail(res, del.error);

  const { data: still } = await db.from("gd_entries").select("id").eq("id", id).maybeSingle();
  if (still) return res.status(404).json({ error: "Entry not found." });
  res.json({ ok: true });
});

app.post("/api/gd/:id/resync", limit("osu"), async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const id = Number(req.params.id);
  const { data: row } = await db
    .from("gd_entries")
    .select("id,beatmapset_id,beatmap_id")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!row) return res.status(404).json({ error: "Entry not found." });
  if (!row.beatmapset_id) return res.status(400).json({ error: "This entry has no beatmap link to sync." });

  try {
    const token = await getToken();
    const full = await getBeatmapset(row.beatmapset_id, token);
    const diff = (full.beatmaps || []).find((b) => b.id === row.beatmap_id);
    const patch = {
      map_status: full.status,
      artist: full.artist,
      title: full.title,
      host: full.creator,
      host_id: full.user_id ?? null,
      ...modeOf(diff),
      synced_at: new Date().toISOString(),
    };
    if (diff) {
      patch.diff_name = diff.version;
      patch.star_rating =
        diff.difficulty_rating != null ? Number(diff.difficulty_rating.toFixed(2)) : null;
    }

    const { error } = await db.from("gd_entries").update(patch).eq("id", id).eq("owner_id", ownerId);
    if (error) throw dbThrow(error);
    res.json({ ok: true, status: full.status, message: `${full.title} is ${full.status} now.` });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/settings", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const { data, error } = await db
    .from("user_settings")
    .select("*")
    .eq("owner_id", s.osu_id)
    .maybeSingle();
  if (error) return dbFail(res, error);

  if (data) return res.json(data);

  const { data: created, error: createError } = await db
    .from("user_settings")
    .insert({ owner_id: s.osu_id })
    .select("*")
    .single();
  if (createError) return dbFail(res, createError);
  res.json(created);
});

const SETTINGS_BOOLS = ["gd_log_public", "gd_track_public", "summary_public", "profile_public", "queue_open", "sync_enabled", "admin_mode"];

app.patch("/api/settings", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const patch = {};
  for (const key of SETTINGS_BOOLS) {
    if (typeof req.body?.[key] === "boolean") patch[key] = req.body[key];
  }
  if (req.body?.cooldown_days != null) {
    patch.cooldown_days = Math.min(30, Math.max(0, Number(req.body.cooldown_days) || 0));
  }
  if (req.body?.max_active != null) {
    patch.max_active = Math.min(10, Math.max(1, Number(req.body.max_active) || 1));
  }
  if (typeof req.body?.rules_md === "string") patch.rules_md = req.body.rules_md.slice(0, 5000);
  if (HAS_PREFS) {
    if (typeof req.body?.default_mode === "string") {
      const m = req.body.default_mode;
      patch.default_mode = m === "all" || MODE_KEYS.includes(m) ? m : "all";
    }
    if (Array.isArray(req.body?.default_statuses)) {
      patch.default_statuses = req.body.default_statuses.filter((x) => STATUS_KEYS.includes(x));
    }
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update." });

  const { data, error } = await db
    .from("user_settings")
    .update(patch)
    .eq("owner_id", s.osu_id)
    .select("*")
    .single();
  if (error) return dbFail(res, error);
  res.json(data);
});

// fitur request belum dideploy: mati di production, nyala kalau REQUESTS_ENABLED=1
const REQUESTS_ON = process.env.REQUESTS_ENABLED === "1" || process.env.NODE_ENV !== "production";
app.use(["/api/requests", "/api/request"], (req, res, next) => {
  if (!REQUESTS_ON) return res.status(503).json({ error: "Requests are not open yet." });
  next();
});

app.get("/api/request/resolve", limit("osu"), async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  try {
    const token = await getToken();
    const { full, all } = await resolveLink(token, String(req.query.url || ""), s.osu_id);
    res.json({
      beatmapset_id: full.id,
      artist: full.artist,
      title: full.title,
      host: full.creator,
      mode: (all[0] && all[0].mode) || null,
      status: full.status,
      diffs: all.map((b) => ({
        id: b.id,
        version: b.version,
        star: b.difficulty_rating,
        owners: (b.owners || []).map((o) => o.username),
      })),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/requests", limit("read"), async (req, res) => {
  const r = await resolveOwner(req);
  if (r.error === "auth") return res.status(401).json({ error: "Log in first." });
  if (r.error) return res.status(404).json({ error: "That user has not logged in here." });

  const { s, owner, isSelf } = r;
  const ownerId = owner.osu_id;
  const privileged = isSelf || s?.role === "admin";

  const { data: list, error } = await db
    .from("requests")
    .select(withMode("id,requester_id,beatmapset_id,beatmap_id,artist,title,diff_name,host,requested_diff,note,status,created_at"))
    .eq("owner_id", ownerId)
    .in("status", ["pending", "accepted", "in_progress", "on_hold", "done"])
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return dbFail(res, error);

  const ids = [...new Set((list || []).map((r) => r.requester_id))];
  let names = {};
  if (ids.length) {
    const { data: users } = await db.from("users").select("osu_id,username").in("osu_id", ids);
    names = Object.fromEntries((users || []).map((u) => [u.osu_id, u.username]));
  }

  const requests = (list || []).map(({ note, ...r }) => ({
    ...r,
    ...(privileged ? { note } : {}),
    requester: names[r.requester_id] || "someone",
  }));

  let mine = [];
  if (s) {
    const { data } = await db
      .from("requests")
      .select("id,beatmapset_id,artist,title,requested_diff,status,note,admin_note,archived_reason,created_at")
      .eq("requester_id", s.osu_id)
      .order("created_at", { ascending: false })
      .limit(20);
    mine = data || [];
  }

  let archived = [];
  if (s?.role === "admin") {
    const { data } = await db
      .from("requests")
      .select("id,requester_id,beatmapset_id,artist,title,requested_diff,note,archived_reason,archived_at")
      .eq("owner_id", ownerId)
      .eq("status", "rejected")
      .order("archived_at", { ascending: false })
      .limit(40);
    archived = data || [];
  }

  const { data: ownerUser } = await db
    .from("users")
    .select("username")
    .eq("osu_id", ownerId)
    .maybeSingle();

  const { data: settings } = await db
    .from("user_settings")
    .select("max_active")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const { count: used } = await db
    .from("gd_tracks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("track_status", ["accepted", "queued", "in_progress", "on_hold"]);

  res.json({
    requests,
    mine,
    archived,
    owner: ownerUser?.username ?? null,
    slots: { max: settings?.max_active ?? 3, used: used ?? 0 },
  });
});

app.post("/api/requests", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const ownerId = await actorId(req, s);
  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (settings?.queue_open === false) return res.status(400).json({ error: "The queue is closed." });
  if (settings?.rules_md && !req.body?.rules_accepted) {
    return res.status(400).json({ error: "Read the rules first." });
  }

  const beatmapsetId = Number(req.body?.beatmapset_id);
  const beatmapId = Number(req.body?.beatmap_id);
  if (!beatmapsetId || !beatmapId) return res.status(400).json({ error: "Pick a difficulty." });

  const { data: dup } = await db
    .from("requests")
    .select("id")
    .eq("requester_id", s.osu_id)
    .eq("beatmap_id", beatmapId)
    .in("status", ["pending", "accepted", "in_progress", "on_hold"])
    .maybeSingle();
  if (dup) return res.status(400).json({ error: "You already requested this map." });

  const cooldown = settings?.cooldown_days ?? 1;
  if (cooldown > 0) {
    const since = new Date(Date.now() - cooldown * 864e5).toISOString();
    const { count } = await db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", s.osu_id)
      .gte("created_at", since);
    if (count > 0) {
      return res.status(400).json({ error: `Cooldown: one request every ${cooldown} day(s).` });
    }
  }

  const maxActive = settings?.max_active ?? 3;
  const { count: activeCount } = await db
    .from("gd_tracks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("track_status", ["queued", "in_progress", "on_hold"]);
  if ((activeCount ?? 0) >= maxActive) {
    return res.status(400).json({ error: "All slots are full right now." });
  }

  try {
    const token = await getToken();
    const full = await getBeatmapset(beatmapsetId, token);
    const diff = (full.beatmaps || []).find((b) => b.id === beatmapId);
    if (!diff) return res.status(400).json({ error: "That difficulty is not in this set." });

    const { data: created, error } = await db
      .from("requests")
      .insert({
        owner_id: ownerId,
        requester_id: s.osu_id,
        beatmapset_id: beatmapsetId,
        beatmap_id: beatmapId,
        artist: full.artist,
        title: full.title,
        diff_name: diff.version,
        ...(HAS_MODE && MODE_KEYS.includes(req.body?.mode) ? { game_mode: req.body.mode } : modeOf(diff)),
        host: full.creator,
        requested_diff: String(req.body?.requested_diff || diff.version).slice(0, 40),
        priority: "normal",
        note: typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null,
        rules_accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw dbThrow(error);
    res.json({ ok: true, id: created.id });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.patch("/api/requests/:id", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const ownerId = await actorId(req, s);
  const id = Number(req.params.id);
  const action = String(req.body?.action || "");

  const { data: row } = await db
    .from("requests")
    .select("id,requester_id,beatmapset_id,beatmap_id,artist,title,diff_name,host,note,status")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!row) return res.status(404).json({ error: "Request not found." });

  if (action === "consider") {
    const { error } = await db.from("requests").update({ status: "on_hold" }).eq("id", id);
    if (error) return dbFail(res, error);
    return res.json({ ok: true, status: "on_hold" });
  }

  if (action === "reject") {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    const { error } = await db
      .from("requests")
      .update({
        status: "rejected",
        archived_at: new Date().toISOString(),
        archived_reason: reason || null,
      })
      .eq("id", id);
    if (error) return dbFail(res, error);
    return res.json({ ok: true, status: "rejected" });
  }

  if (action === "accept") {
    if (row.status === "accepted") return res.status(409).json({ error: "Already accepted." });

    const { data: settings } = await db
      .from("user_settings")
      .select("max_active")
      .eq("owner_id", ownerId)
      .maybeSingle();
    const maxActive = settings?.max_active ?? 3;
    const { count } = await db
      .from("gd_tracks")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .in("track_status", ["accepted", "queued", "in_progress", "on_hold"]);
    if ((count ?? 0) >= maxActive) return res.status(400).json({ error: "All slots are full." });

    const { data: user } = await db
      .from("users")
      .select("username")
      .eq("osu_id", row.requester_id)
      .maybeSingle();

    const { error: trackError } = await db.from("gd_tracks").insert({
      owner_id: ownerId,
      request_id: row.id,
      beatmapset_id: row.beatmapset_id,
      beatmap_id: row.beatmap_id,
      artist: row.artist,
      title: row.title,
      diff_name: row.diff_name,
      ...modeOf(row),
      host: row.host,
      requester_name: user?.username ?? null,
      track_status: "accepted",
      note: row.note,
    });
    if (trackError) return res.status(409).json({ error: trackError.message });

    const { error } = await db.from("requests").update({ status: "accepted" }).eq("id", id);
    if (error) return dbFail(res, error);
    return res.json({ ok: true, status: "accepted" });
  }

  res.status(400).json({ error: "Unknown action." });
});

app.post("/api/requests/:id/restore", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const ownerId = await actorId(req, s);
  const { error } = await db
    .from("requests")
    .update({ status: "pending", archived_at: null, archived_reason: null })
    .eq("id", Number(req.params.id))
    .eq("owner_id", ownerId);
  if (error) return dbFail(res, error);
  res.json({ ok: true });
});

app.get("/api/tracks", limit("read"), async (req, res) => {
  const r = await resolveOwner(req);
  if (r.error === "auth") return res.status(401).json({ error: "Log in first." });
  if (r.error) return res.status(404).json({ error: "That user has not logged in here." });

  const { s, owner, isSelf } = r;
  const ownerId = owner.osu_id;
  const privileged = isSelf || s?.role === "admin";

  const { data: settings } = await db
    .from("user_settings")
    .select("gd_track_public")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!privileged && settings?.gd_track_public === false) {
    return res.status(403).json({ error: "The track board is private." });
  }

  const history = req.query.history === "1";
  const PAGE = 20;
  const page = Math.max(0, Number(req.query.page) || 0);

  let query = db
    .from("gd_tracks")
    .select(
      withMode("id,beatmapset_id,artist,title,diff_name,host,requester_name,track_status,note,created_at,updated_at,done_at"),
      { count: "exact" }
    )
    .eq("owner_id", ownerId);

  query = history
    ? query
        .in("track_status", ["done", "dropped"])
        .order("done_at", { ascending: false, nullsFirst: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
    : query
        .in("track_status", ["accepted", "priority", "queued", "in_progress", "on_hold"])
        .order("updated_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);

  const { data, error, count } = await query;
  if (error) return dbFail(res, error);

  const tracks = privileged ? data || [] : (data || []).map(({ note, ...rest }) => rest);
  res.json({ tracks, history, total: count ?? 0, page, page_size: PAGE });
});

app.post("/api/tracks", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const ownerId = await actorId(req, s);

  // mode beatmap: banyak link sekaligus, difficulty per map
  const items = Array.isArray(req.body?.items)
    ? req.body.items
        .map((it) => ({ link: String(it?.link || "").trim(), diff: String(it?.diff_name || "").slice(0, 100) }))
        .filter((it) => it.link)
        .slice(0, 20)
    : [];

  if (items.length) {
    const token = await getToken();
    const requester = String(req.body?.requester_name || "").trim().slice(0, 60) || null;
    const note = String(req.body?.note || "").trim().slice(0, 500) || null;
    const added = [];
    const failed = [];

    for (const item of items) {
      const link = item.link;
      try {
        const { full, all, mine, wanted } = await resolveLink(token, link, ownerId);
        const pick = mine.find((b) => b.id === wanted) || mine[0] || all.find((b) => b.id === wanted) || all[0];
        if (!pick) throw new Error("This set has no difficulties.");

        const { data, error } = await db
          .from("gd_tracks")
          .insert({
            owner_id: ownerId,
            beatmapset_id: full.id,
            beatmap_id: pick.id,
            ...(HAS_MODE && pick.mode ? { game_mode: pick.mode } : {}),
            artist: full.artist.slice(0, 200),
            title: full.title.slice(0, 200),
            diff_name: item.diff || pick.version.slice(0, 100),
            host: full.creator,
            requester_name: requester,
            note,
            track_status: trackStatusOf(req.body?.track_status),
          })
          .select("id")
          .single();
        if (error) throw dbThrow(error);
        added.push(data.id);
      } catch (e) {
        failed.push({ link, error: e.message });
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    return res.json({ ok: true, added: added.length, failed });
  }
  const artist = String(req.body?.artist || "").trim();
  const title = String(req.body?.title || "").trim();
  const diff = String(req.body?.diff_name || "").trim();
  if (!artist || !title || !diff) {
    return res.status(400).json({ error: "Artist, title and difficulty are required." });
  }

  const { data: ownerUser } = await db
    .from("users")
    .select("username")
    .eq("osu_id", ownerId)
    .maybeSingle();

  // link opsional: dipakai kalau map-nya sudah diupload, biar cover dan id-nya nyambung
  const ids = {};
  const link = typeof req.body?.link === "string" ? req.body.link.trim() : "";
  if (link) {
    try {
      const token = await getToken();
      const { full, all, mine, wanted } = await resolveLink(token, link, ownerId);
      const pick =
        mine.find((b) => b.id === wanted) ||
        mine[0] ||
        all.find((b) => b.id === wanted) ||
        all[0];
      if (!pick) return res.status(400).json({ error: "This set has no difficulties." });
      ids.beatmapset_id = full.id;
      ids.beatmap_id = pick.id;
      Object.assign(ids, modeOf(pick));
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const { data, error } = await db
    .from("gd_tracks")
    .insert({
      owner_id: ownerId,
      ...ids,
      artist: artist.slice(0, 200),
      title: title.slice(0, 200),
      diff_name: diff.slice(0, 100),
      host: ownerUser?.username ?? "manual",
      requester_name: String(req.body?.requester_name || "").trim().slice(0, 60) || null,
      note: String(req.body?.note || "").trim().slice(0, 500) || null,
      track_status: trackStatusOf(req.body?.track_status),
    })
    .select("id")
    .single();
  if (error) return dbFail(res, error);

  res.json({ ok: true, id: data.id });
});

app.delete("/api/tracks/:id", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const ownerId = await actorId(req, s);
  const id = Number(req.params.id);
  const { data, error } = await db
    .from("gd_tracks")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) return dbFail(res, error);
  if (!data?.length) return res.status(404).json({ error: "Track not found." });
  res.json({ ok: true });
});

app.patch("/api/tracks/:id", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });

  const ownerId = await actorId(req, s);
  const id = Number(req.params.id);
  const status = req.body?.track_status;

  const { data: track } = await db
    .from("gd_tracks")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!track) return res.status(404).json({ error: "Track not found." });

  const patch = { updated_at: new Date().toISOString() };
  if (typeof req.body?.note === "string") patch.note = req.body.note.slice(0, 500);
  if (status) {
    if (!["accepted", "priority", "queued", "in_progress", "on_hold", "dropped", "done"].includes(status)) {
      return res.status(400).json({ error: "Unknown status." });
    }
    patch.track_status = status;
    if (status !== "done") patch.done_at = null;
  }

  if (status === "done") {
    patch.done_at = new Date().toISOString();

    // link dipakai kalau ada; kalau tidak, pakai beatmapset yang sudah tersimpan di track
    const link = typeof req.body?.link === "string" ? req.body.link.trim() : "";
    if (!link && !track.beatmapset_id) {
      return res.status(400).json({ error: "Beatmap link is required to mark a track done." });
    }

    let resolved;
    try {
      const token = await getToken();
      if (link) {
        resolved = await resolveLink(token, link, ownerId);
      } else {
        const full = await getBeatmapset(track.beatmapset_id, token);
        const all = full.beatmaps || [];
        resolved = {
          full,
          all,
          mine: all.filter((b) => (b.owners || []).some((o) => o.id === ownerId)),
          wanted: track.beatmap_id,
        };
      }
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    let pick =
      resolved.mine.find((b) => b.id === resolved.wanted) ||
      resolved.mine.find((b) => b.id === track.beatmap_id) ||
      resolved.mine[0];

    if (!pick) {
      const fallback = resolved.all.find((b) => b.id === resolved.wanted) || resolved.all[0];
      if (!fallback) return res.status(400).json({ error: "This set has no difficulties." });

      const owners = fallback.owners || [];
      if (owners.length) {
        return res.status(400).json({
          error: `${resolved.full.title} (${fallback.version}) is credited to ${owners
            .map((o) => o.username)
            .join(" + ")}, not you.`,
        });
      }

      if (req.body?.confirm !== true) {
        return res.status(409).json({
          needsConfirm: true,
          error: `${resolved.full.title} (${fallback.version}) has no mapper credit. Is this your GD?`,
        });
      }
      pick = fallback;
    }

    track.beatmapset_id = resolved.full.id;
    track.beatmap_id = pick.id;
    patch.beatmapset_id = resolved.full.id;
    patch.beatmap_id = pick.id;
    patch.artist = resolved.full.artist;
    patch.title = resolved.full.title;
    patch.diff_name = pick.version;
    patch.host = resolved.full.creator;

    const { data: existing } = await db
      .from("gd_entries")
      .select("id")
      .eq("track_id", id)
      .maybeSingle();

    if (!existing) {
      // map yang sudah ada di log (misal hasil import) cukup disambungkan, tidak diinsert ulang
      let dup = null;
      if (track.beatmap_id) {
        const { data } = await db
          .from("gd_entries")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("beatmap_id", track.beatmap_id)
          .maybeSingle();
        dup = data;
      }

      if (dup) {
        await db.from("gd_entries").update({ track_id: id }).eq("id", dup.id);
      } else {
        const mapStatus = resolved.full.status || "pending";
        const star = pick.difficulty_rating != null ? Number(Number(pick.difficulty_rating).toFixed(2)) : null;

        const { error } = await db.from("gd_entries").insert({
          owner_id: ownerId,
          beatmapset_id: resolved.full.id,
          beatmap_id: pick.id,
          artist: resolved.full.artist,
          title: resolved.full.title,
          diff_name: pick.version,
          ...modeOf(pick),
          host: resolved.full.creator,
          map_status: mapStatus,
          star_rating: star,
          note: track.note,
          gd_date: new Date().toISOString().slice(0, 10),
          source: track.request_id ? "request" : "manual",
          track_id: id,
          synced_at: new Date().toISOString(),
        });
        if (error) return dbFail(res, error);
      }
    }
  }

  const { error } = await db.from("gd_tracks").update(patch).eq("id", id);
  if (error) return dbFail(res, error);
  res.json({ ok: true, track_status: patch.track_status ?? track.track_status });
});

app.post("/api/gd/force", limit("osu"), async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const set = Number(req.body?.beatmapset_id);
  const diff = Number(req.body?.beatmap_id);
  if (!set || !diff) return res.status(400).json({ error: "Missing beatmap ids." });

  try {
    const token = await getToken();
    const full = await getBeatmapset(set, token);
    const pick = (full.beatmaps || []).find((b) => b.id === diff);
    if (!pick) return res.status(404).json({ error: "That difficulty is not in this set." });

    const saved = await insertEntry(ownerId, full, pick);
    res.json({
      ok: true,
      id: saved?.id ?? null,
      gd_date: saved?.gd_date ?? null,
      message: `${full.title} (${pick.version}) · ${full.status}`,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const CHUNK = 10;
const CONCURRENCY = 3;
const SYNC_BATCH = 12;
const SYNC_CONCURRENCY = 3;

async function runSync(ownerId) {
  const { data: rows, error } = await db
    .from("gd_entries")
    .select("id,beatmapset_id,beatmap_id")
    .eq("owner_id", ownerId)
    .not("beatmapset_id", "is", null)
    .order("synced_at", { ascending: true, nullsFirst: true })
    .limit(160);
  if (error) throw dbThrow(error);

  const bySet = new Map();
  for (const r of rows || []) {
    if (!bySet.has(r.beatmapset_id)) bySet.set(r.beatmapset_id, []);
    bySet.get(r.beatmapset_id).push(r);
  }

  const sets = [...bySet.keys()].slice(0, SYNC_BATCH);
  const token = await getToken();
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < sets.length; i += SYNC_CONCURRENCY) {
    const group = sets.slice(i, i + SYNC_CONCURRENCY);
    await Promise.all(
      group.map(async (setId) => {
        try {
          const full = await getBeatmapset(setId, token);
          const diffs = new Map((full.beatmaps || []).map((b) => [b.id, b]));
          for (const row of bySet.get(setId)) {
            const b = diffs.get(row.beatmap_id);
            const patch = {
              map_status: full.status,
              artist: full.artist,
              title: full.title,
              host: full.creator,
              host_id: full.user_id ?? null,
              ...modeOf(b),
              synced_at: new Date().toISOString(),
            };
            if (b) {
              patch.diff_name = b.version;
              patch.star_rating =
                b.difficulty_rating != null ? Number(b.difficulty_rating.toFixed(2)) : null;
            }
            const up = await db.from("gd_entries").update(patch).eq("id", row.id);
            if (up.error) failed++;
            else updated++;
          }
        } catch {
          // gagal satu set, nilai lama dipertahankan
          failed++;
        }
      })
    );
  }

  return {
    sets: sets.length,
    updated,
    failed,
    remaining: Math.max(0, bySet.size - sets.length),
  };
}

app.post("/api/sync", limit("osu"), async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const { data: settings } = await db
    .from("user_settings")
    .select("sync_enabled")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (settings?.sync_enabled === false) return res.json({ skipped: true });

  try {
    res.json(await runSync(s.osu_id));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/cron/sync", async (req, res) => {
  // secret kosong bikin header "Bearer undefined" lolos, jadi wajib diset
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(404).end();
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(given, secret)) return res.status(401).end();

  const { data: rows } = await db
    .from("user_settings")
    .select("owner_id")
    .neq("sync_enabled", false);
  const results = [];
  for (const row of rows || []) {
    try {
      results.push(await runSync(row.owner_id));
    } catch (e) {
      results.push({ error: e.message });
    }
  }
  res.json({
    users: results.length,
    sets: results.reduce((a, r) => a + (r.sets || 0), 0),
    updated: results.reduce((a, r) => a + (r.updated || 0), 0),
    failed: results.filter((r) => r.error).length,
  });
});

app.post("/api/import", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const ownerId = await actorId(req, s);

  const offset = Math.max(0, Number(req.query.offset) || 0);
  try {
    const token = await getToken();
    const page = await getGuestSets(s.osu_id, offset, CHUNK, token);
    if (!Array.isArray(page)) throw new Error("unexpected guest response");

    let total = null;
    if (offset === 0) {
      const profile = await osuGet(`/users/${s.osu_id}`, token);
      total = profile.guest_beatmapset_count ?? null;
    }

    const existing = await db
      .from("gd_entries")
      .select("beatmapset_id")
      .eq("owner_id", ownerId)
      .not("beatmapset_id", "is", null);
    if (existing.error) throw dbThrow(existing.error);
    const seen = new Set((existing.data || []).map((r) => r.beatmapset_id));

    const todo = page.filter((set) => !seen.has(set.id));
    const rows = [];
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const batch = todo.slice(i, i + CONCURRENCY);
      const sets = await Promise.all(batch.map((set) => getBeatmapset(set.id, token)));
      for (const full of sets) {
        const diffs = (full.beatmaps || []).filter((b) =>
          (b.owners || []).some((o) => o.id === s.osu_id)
        );
        for (const b of diffs) {
          rows.push({
            owner_id: s.osu_id,
            beatmapset_id: full.id,
            beatmap_id: b.id,
            artist: full.artist,
            title: full.title,
            diff_name: b.version,
            ...modeOf(b),
            host: full.creator,
            host_id: full.user_id ?? null,
            map_status: full.status,
            star_rating: b.difficulty_rating != null ? Number(b.difficulty_rating.toFixed(2)) : null,
            gd_date: dateOf(full),
            source: "import",
            synced_at: new Date().toISOString(),
          });
        }
      }
    }

    if (rows.length) {
      const up = await db.from("gd_entries").upsert(rows, { onConflict: "owner_id,beatmap_id" });
      if (up.error) throw dbThrow(up.error);
    }

    res.json({
      imported: rows.length,
      scanned: page.length,
      done: page.length < CHUNK,
      nextOffset: offset + page.length,
      total,
    });
  } catch (e) {
    res.status(502).json({ error: e.message, nextOffset: offset });
  }
});

app.get("/api/dashboard", async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "Log in first." });
  const isOwner = true;
  const ownerId = await actorId(req, s);

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const queue = {
    open: settings?.queue_open ?? true,
    cooldown_days: settings?.cooldown_days ?? 1,
    max_active: settings?.max_active ?? 3,
    rules: settings?.rules_md ?? "",
  };

  const STUCK_DAYS = 7;
  const daysSince = (iso) =>
    iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;

  if (isOwner) {
    const activeStatuses = ["accepted", "queued", "in_progress", "on_hold"];

    const [entries, recent, slots, pending, activeTracks] = await Promise.all([
      db.from("gd_entries").select("host,map_status,gd_date,synced_at").eq("owner_id", ownerId).eq("is_archived", false),
      db
        .from("gd_entries")
        .select(withMode("id,beatmapset_id,beatmap_id,title,artist,diff_name,map_status,gd_date"))
        .eq("owner_id", ownerId)
        .eq("is_archived", false)
        .order("gd_date", { ascending: false })
        .limit(5),
      db
        .from("gd_tracks")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .in("track_status", activeStatuses),
      db
        .from("requests")
        .select(withMode("id,title,artist,status,created_at"))
        .eq("owner_id", ownerId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5),
      db
        .from("gd_tracks")
        .select(withMode("id,title,diff_name,track_status,created_at"))
        .eq("owner_id", ownerId)
        .in("track_status", activeStatuses)
        .order("created_at", { ascending: true })
        .limit(5),
    ]);

    const rows = entries.data ?? [];
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const hosts = new Set();
    const counts = new Map();
    let ranked = 0;
    let thisMonthCount = 0;
    let lastSync = null;

    for (const r of rows) {
      if (r.host) hosts.add(r.host);
      if (r.map_status === "ranked") ranked++;
      const key = r.gd_date ? String(r.gd_date).slice(0, 7) : null;
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (key === thisMonth) thisMonthCount++;
      if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
    }

    // bulan kosong tetap diisi supaya grafiknya tidak bolong; klien yang memilih rentang
    const months = [];
    const first = [...counts.keys()].sort()[0] ?? thisMonth;
    let [yy, mm] = first.split("-").map(Number);
    for (let guard = 0; guard < 240; guard++) {
      const key = `${yy}-${String(mm).padStart(2, "0")}`;
      months.push({ key, count: counts.get(key) || 0 });
      if (yy === now.getFullYear() && mm === now.getMonth() + 1) break;
      mm++;
      if (mm > 12) {
        mm = 1;
        yy++;
      }
    }

    return res.json({
      role: "admin",
      queue,
      status: {
        slots_used: slots.count ?? 0,
        slots_max: queue.max_active,
        last_sync: lastSync,
        sync_days: daysSince(lastSync),
      },
      stats: { total: rows.length, ranked, mappers: hosts.size, this_month: thisMonthCount },
      todo: {
        requests: (pending.data ?? []).map((r) => ({ ...r, days: daysSince(r.created_at) ?? 0 })),
        // track yang baru dibuka bukan hal yang perlu ditindak; ambil yang sudah lama nyangkut
        tracks: (activeTracks.data ?? []).map((t) => ({ ...t, days: daysSince(t.created_at) ?? 0 })),
      },
      recent: recent.data ?? [],
      months,
      years: [...new Set(months.map((m) => m.key.slice(0, 4)))],
    });
  }

  const mine = s
    ? await db
        .from("requests")
        .select("id,title,artist,requested_diff,status,created_at")
        .eq("requester_id", s.osu_id)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const list = mine.data ?? [];
  let cooldown = null;
  if (s && list.length) {
    const nextAt = new Date(new Date(list[0].created_at).getTime() + queue.cooldown_days * 86400000);
    cooldown = { days_left: Math.max(0, Math.ceil((nextAt.getTime() - Date.now()) / 86400000)) };
  }

  res.json({ role: s ? "user" : "guest", queue, requests: list, cooldown });
});

if (!process.env.VERCEL) {
  // sync harian; di Vercel timer ini mati, pakai cron eksternal ke /api/cron/sync
  const autoSync = async () => {
    const { data: rows } = await db
      .from("user_settings")
      .select("owner_id")
      .neq("sync_enabled", false);
    for (const row of rows || []) {
      try {
        await runSync(row.owner_id);
      } catch (e) {
        console.error("auto sync:", row.owner_id, e.message);
      }
    }
  };
  setTimeout(autoSync, 60_000).unref();
  setInterval(autoSync, 24 * 3600_000).unref();

  app.listen(PORT, () => console.log(`api listening on ${PORT}`));
}

export default app;
