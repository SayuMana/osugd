import crypto from "node:crypto";
import { db } from "./lib/db.js";

const B = "http://localhost:3001";
const ATT = 999999;

const sign = (o) => {
  const p = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + 3600000 })).toString("base64url");
  return p + "." + crypto.createHmac("sha256", process.env.SESSION_SECRET).update(p).digest("base64url");
};
const ATT_C = sign({ osu_id: ATT, username: "attacker", role: "user" });
const ADM_C = sign({ osu_id: 12602650, username: "SayuMana", role: "admin" });

const call = async (path, cookie, opts = {}) => {
  const r = await fetch(B + path, {
    ...opts,
    headers: {
      ...(cookie ? { Cookie: `sid=${cookie}` } : {}),
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { j = t.slice(0, 60); }
  return [r.status, j];
};

const out = [];
const check = (name, got, want) => {
  const ok = Array.isArray(want) ? want.includes(got) : got === want;
  out.push(`${ok ? "PASS" : "FAIL"}  ${name}  (${got}, mau ${want})`);
};

// --- siapkan akun penyerang yang tidak punya data
await db.from("gd_entries").delete().eq("owner_id", ATT);
await db.from("user_settings").delete().eq("owner_id", ATT);
await db.from("users").delete().eq("osu_id", ATT);
await db.from("users").insert({ osu_id: ATT, username: "attacker", role: "user" });
await db.from("user_settings").insert({ owner_id: ATT });

const { data: victimRows } = await db.from("gd_entries").select("id,note,owner_id").eq("owner_id", 26705942).limit(1);
const victim = victimRows?.[0];
const { data: ownRows } = await db.from("gd_entries").select("id,note").eq("owner_id", 12602650).limit(1);
const own = ownRows?.[0];
const { data: vTrack } = await db.from("gd_tracks").select("id,owner_id").eq("owner_id", 26705942).limit(1);
const { data: oTrack } = await db.from("gd_tracks").select("id,owner_id").eq("owner_id", 12602650).limit(1);

// --- 1. tamu
check("guest GET /api/gd", (await call("/api/gd", null))[0], 401);
check("guest GET /api/settings", (await call("/api/settings", null))[0], 401);
check("guest GET /api/dashboard", (await call("/api/dashboard", null))[0], 401);
for (const [m, p] of [["POST", "/api/gd/batch"], ["POST", "/api/gd/force"], ["PATCH", `/api/gd/${own.id}`], ["DELETE", `/api/gd/${own.id}`], ["POST", "/api/gd/force"], ["POST", "/api/tracks"], ["PATCH", "/api/tracks/1"], ["DELETE", "/api/tracks/1"], ["PATCH", "/api/settings"], ["POST", "/api/sync"], ["POST", "/api/import"]]) {
  const [code] = await call(p, null, { method: m, body: "{}" });
  check(`guest ${m} ${p}`, code, [401, 404]);
}

// --- 2. IDOR: user biasa vs baris orang lain
check("attacker PATCH gd milik DaCh1", (await call(`/api/gd/${victim.id}?user=DaCh1`, ATT_C, { method: "PATCH", body: JSON.stringify({ note: "x" }) }))[0], 404);
check("attacker DELETE gd milik DaCh1", (await call(`/api/gd/${victim.id}?user=DaCh1`, ATT_C, { method: "DELETE" }))[0], 404);
if (vTrack?.length) check("attacker PATCH track milik DaCh1", (await call(`/api/tracks/${vTrack[0].id}?user=DaCh1`, ATT_C, { method: "PATCH", body: JSON.stringify({ track_status: "dropped" }) }))[0], 404);
if (vTrack?.length) check("attacker DELETE track milik DaCh1", (await call(`/api/tracks/${vTrack[0].id}?user=DaCh1`, ATT_C, { method: "DELETE" }))[0], 404);

// --- 3. admin dengan admin_mode MATI: tetap 404
check("admin(off) PATCH gd DaCh1", (await call(`/api/gd/${victim.id}?user=DaCh1`, ADM_C, { method: "PATCH", body: JSON.stringify({ note: victim.note ?? "" }) }))[0], 404);

// --- 4. admin dengan admin_mode NYALA: harus kena
await call("/api/settings", ADM_C, { method: "PATCH", body: JSON.stringify({ admin_mode: true }) });
const onPatch = (await call(`/api/gd/${victim.id}?user=DaCh1`, ADM_C, { method: "PATCH", body: JSON.stringify({ note: victim.note ?? "" }) }))[0];
check("admin(on) PATCH gd DaCh1", onPatch, 200);
if (oTrack?.length) check("admin(on) PATCH track sendiri tetap jalan", (await call(`/api/tracks/${oTrack[0].id}`, ADM_C, { method: "PATCH", body: JSON.stringify({ track_status: "accepted" }) }))[0], 200);
await call("/api/settings", ADM_C, { method: "PATCH", body: JSON.stringify({ admin_mode: false }) });

// --- 5. batch ?user=victim oleh user biasa: baris harus milik PENYERANG
const { data: linkRow } = await db.from("gd_entries").select("beatmapset_id,beatmap_id").eq("owner_id", 12602650).not("beatmapset_id", "is", null).limit(1);
if (linkRow?.length) {
  const l = linkRow[0];
  // yang penting: jumlah baris korban tidak bertambah gara-gara request ini
  const victimCount = async () =>
    (await db.from("gd_entries").select("id", { count: "exact", head: true }).eq("beatmap_id", l.beatmap_id).eq("owner_id", 26705942)).count ?? 0;
  const before = await victimCount();
  await call("/api/gd/batch?user=DaCh1", ATT_C, { method: "POST", body: JSON.stringify({ text: `https://osu.ppy.sh/beatmapsets/${l.beatmapset_id}#osu/${l.beatmap_id}`, confirm: true }) });
  check("batch ?user=DaCh1 -> baris korban tidak bertambah", await victimCount(), before);
  await db.from("gd_entries").delete().eq("owner_id", ATT);
}

// --- 6. field privat di payload publik
const guestGd = (await call("/api/gd?user=DaCh1", null))[1];
check("guest payload tanpa note", guestGd?.entries ? guestGd.entries.some((e) => "note" in e) : "n/a", false);
const guestTracks = (await call("/api/tracks?user=SayuMana", null))[1];
const tlist = guestTracks?.tracks || guestTracks?.rows || [];
check("guest track payload tanpa note", tlist.length ? tlist.some((t) => "note" in t) : "n/a", false);

// --- 7. cookie dipalsukan
const [pp, sig] = ADM_C.split(".");
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pp, "base64url").toString()), role: "user" })).toString("base64url") + "." + sig;
check("cookie tampered -> /api/me", (await call("/api/me", forged))[1], null);

// --- 8. cron auth
check("cron tanpa header", (await call("/api/cron/sync", null))[0], 401);
check("cron Bearer undefined", (await call("/api/cron/sync", null, { headers: { Authorization: "Bearer undefined" } }))[0], 401);
check("cron secret salah", (await call("/api/cron/sync", null, { headers: { Authorization: "Bearer ngawur" } }))[0], 401);

// --- 9. OAuth state
check("callback tanpa state", (await call("/api/auth/callback?code=x", null))[0], 400);
check("callback state ngawur", (await call("/api/auth/callback?code=x&state=ngawur", null))[0], 400);

// --- 10. user biasa tidak bisa menaikkan role lewat settings
await call("/api/settings", ATT_C, { method: "PATCH", body: JSON.stringify({ admin_mode: true, role: "admin" }) });
const { data: attSet } = await db.from("user_settings").select("admin_mode").eq("owner_id", ATT).maybeSingle();
const meAtt = (await call("/api/me", ATT_C))[1];
check("attacker set admin_mode=true diabaikan server", meAtt?.admin_mode, false);
check("attacker tetap role user", meAtt?.role, "user");

// --- bersihkan
await db.from("gd_entries").delete().eq("owner_id", ATT);
await db.from("user_settings").delete().eq("owner_id", ATT);
await db.from("users").delete().eq("osu_id", ATT);
const { count } = await db.from("users").select("osu_id", { count: "exact", head: true });

console.log(out.join("\n"));
console.log(`\n${out.filter((l) => l.startsWith("PASS")).length} pass / ${out.filter((l) => l.startsWith("FAIL")).length} fail | users tersisa: ${count}`);
