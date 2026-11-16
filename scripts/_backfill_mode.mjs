// isi kolom mode untuk data lama. jalankan: node --env-file=.env _backfill_mode.mjs
import { db } from "../api/lib/db.js";
import { getToken, getBeatmapset } from "../api/lib/osu.js";

const token = await getToken();

const tables = [
  { table: "gd_entries", key: "beatmap_id" },
  { table: "gd_tracks", key: "beatmap_id" },
  { table: "requests", key: "beatmap_id" },
];

for (const { table, key } of tables) {
  const { data, error } = await db.from(table).select(`id,beatmapset_id,${key}`).is("game_mode", null);
  if (error) {
    console.log(`${table}: ${error.message}`);
    continue;
  }

  const sets = [...new Set(data.map((r) => r.beatmapset_id).filter(Boolean))];
  console.log(`${table}: ${data.length} baris tanpa mode, ${sets.length} beatmapset`);

  const modeById = new Map();
  for (const setId of sets) {
    try {
      const full = await getBeatmapset(setId, token);
      for (const b of full.beatmaps || []) modeById.set(b.id, b.mode);
    } catch (e) {
      console.log(`  set ${setId} gagal: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  let ok = 0;
  for (const row of data) {
    const mode = modeById.get(row[key]);
    if (!mode) continue;
    const { error: e2 } = await db.from(table).update({ game_mode: mode }).eq("id", row.id);
    if (!e2) ok += 1;
  }
  console.log(`  terisi: ${ok}/${data.length}`);
}

console.log("selesai");
