export const MODES = [
  { key: "osu", label: "osu!", rank: 0 },
  { key: "taiko", label: "osu!taiko", rank: 2 },
  { key: "fruits", label: "osu!catch", rank: 3 },
  { key: "mania", label: "osu!mania", rank: 1 },
];

export const MODE_RANK = Object.fromEntries(MODES.map((m) => [m.key, m.rank]));

// osu API kadang menulis "catch", db menyimpan "fruits"
export const modeKey = (m) => (m === "catch" ? "fruits" : m || null);
export const modeLabel = (m) => MODES.find((x) => x.key === modeKey(m))?.label ?? null;
// cuma key yang dikenal, biar nilai aneh dari DB tidak jadi path
export const modeIcon = (m) =>
  MODES.some((x) => x.key === modeKey(m)) ? `/mode/${modeKey(m)}.png` : null;
export const modeRank = (m) => MODE_RANK[modeKey(m)] ?? 9;
