// backfill host_id + cache nama mapper. jalankan: node --env-file=.env _backfill_mappers.mjs
import { db } from "./lib/db.js";
import { getToken, osuGet, getBeatmapset } from "./lib/osu.js";

const token = await getToken();
const { data: rows, error } = await db.from("gd_entries").select("id,host,host_id,beatmapset_id");
if (error) throw error;

// 1. entry yang belum punya host_id
const pending = rows.filter((r) => !r.host_id && r.host);
console.log(`entry: ${rows.length}, tanpa id: ${pending.length}`);

const failed = [];
for (const row of pending) {
  let user = null;
  try {
    user = await osuGet(`/users/${encodeURIComponent(row.host)}/osu`, token);
  } catch {
    // nama lama yang sudah tidak dipakai: tanya set-nya, creator = pemilik aslinya
    try {
      const set = await getBeatmapset(row.beatmapset_id, token);
      user = { id: set.user_id, username: set.creator, previous_usernames: [] };
    } catch (e) {
      failed.push(`${row.host} (${e.message})`);
      continue;
    }
  }
  await db.from("gd_entries").update({ host_id: user.id }).eq("id", row.id);
  await db
    .from("mapper_names")
    .upsert(
      { osu_id: user.id, username: user.username, show_previous: true, fetched_at: new Date().toISOString() },
      { onConflict: "osu_id", ignoreDuplicates: true }
    );
  console.log(`  ${row.host} -> ${user.username} (${user.id})`);
  await new Promise((r) => setTimeout(r, 300));
}

// 2. nama host di log yang beda dari username sekarang = nama lama, masukkan ke riwayat
const { data: fresh } = await db.from("gd_entries").select("host,host_id").not("host_id", "is", null);
const { data: cache } = await db.from("mapper_names").select("osu_id,username,previous");
const byId = new Map((cache || []).map((c) => [c.osu_id, c]));

const extra = new Map();
for (const r of fresh) {
  const c = byId.get(r.host_id);
  if (!c) continue;
  if (r.host === c.username || (c.previous || []).includes(r.host)) continue;
  if (!extra.has(r.host_id)) extra.set(r.host_id, []);
  extra.get(r.host_id).push(r.host);
}

for (const [id, names] of extra) {
  const c = byId.get(id);
  const previous = [...new Set([...(c.previous || []), ...names])];
  await db.from("mapper_names").update({ previous }).eq("osu_id", id);
  console.log(`  riwayat ${c.username}: ${names.join(", ")}`);
}

console.log(`selesai. gagal ${failed.length}${failed.length ? ": " + failed.join(", ") : ""}`);
