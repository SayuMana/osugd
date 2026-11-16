import { useCallback, useEffect, useRef, useState } from "react";
import { runImport as runImportChunks } from "../lib/import.js";
import { useDialog } from "../lib/useDialog.js";
import Status from "../components/Status.jsx";
import { TAB, TAB_OFF, TAB_ON, btn, btnDanger, btnGhost, empty, emptyTitle, filterGroup, filterLabel, filterToggle, h1, possessive, isPrivate, input, inputFit, muted, statusChip } from "../ui.js";
import ModeIcon from "../components/ModeIcon.jsx";
import CopyLink from "../components/CopyLink.jsx";
import { MODES, modeKey, modeRank } from "../lib/mode.js";

const cover = (id) => `https://assets.ppy.sh/beatmaps/${id}/covers/list.jpg`;
const yearOf = (e) => (e.gd_date ? e.gd_date.slice(0, 4) : "Unknown");

const STATUSES = ["ranked", "loved", "qualified", "pending", "wip", "graveyard"];
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));

const TH = "border-b border-line p-2 text-left text-xs font-medium text-muted";
const SORT_BTN =
  "inline-flex w-full cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-left text-xs font-medium text-muted hover:text-ink";
const SORT_BTN_RIGHT = `${SORT_BTN} justify-end`;
const TD = "border-b border-line px-2 py-2.5 align-top";
const MAP_TITLE_LINK = "block underline decoration-muted underline-offset-2 hover:text-accent hover:decoration-accent";
const LINK_BTN =
  "min-h-6 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted underline decoration-muted underline-offset-2 hover:text-accent";
const TEXTAREA = `${input} min-h-[84px] resize-y p-2.5 font-mono text-xs leading-relaxed`;
const MODAL =
  "fixed inset-0 z-50 m-auto h-fit w-[min(560px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-auto rounded-lg border border-line bg-panel p-[18px]";
const SCRIM = "fixed inset-0 z-40 bg-[rgba(10,6,16,0.6)]";
const MODAL_HEAD = "mb-3.5 flex items-center justify-between gap-3";
const MODAL_TITLE = "m-0 text-base font-semibold text-white";

// spektrum resmi osu! (wiki Beatmap/Star_rating): easy, normal, hard, insane, expert, expert+
const starColor = (v) => {
  if (v == null) return undefined;
  if (v < 2) return "#4FC0FF";
  if (v < 2.7) return "#7CFF4F";
  if (v < 4) return "#F6F05C";
  if (v < 5.3) return "#FF4E6F";
  if (v < 6.5) return "#C645B8";
  return "#6563DE";
};

// kapan status map terakhir dicek ke osu
const relTime = (iso) => {
  if (!iso) return null;
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return null;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const monthLabel = (e) =>
  e.gd_date
    ? new Date(`${e.gd_date}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "Unknown";

const COMPARE = {
  date: (a, b) => (a.gd_date === b.gd_date ? 0 : a.gd_date > b.gd_date ? 1 : -1),
  map: (a, b) => (a.title || "").localeCompare(b.title || ""),
  diff: (a, b) => (a.diff_name || "").localeCompare(b.diff_name || ""),
  host: (a, b) => (a.host || "").localeCompare(b.host || ""),
  star: (a, b) => Number(a.star_rating ?? -1) - Number(b.star_rating ?? -1),
  status: (a, b) => (STATUS_RANK[a.map_status] ?? 99) - (STATUS_RANK[b.map_status] ?? 99),
  mode: (a, b) => modeRank(a.game_mode) - modeRank(b.game_mode),
};

// default (tanpa kolom dipilih): status -> mode -> tanggal
function defaultCompare(a, b) {
  const st = COMPARE.status(a, b);
  if (st !== 0) return st;
  const m = COMPARE.mode(a, b);
  if (m !== 0) return m;
  return COMPARE.date(b, a);
}

function makeCompare(sortKey, sortDir) {
  if (!sortKey) return defaultCompare;
  const base = COMPARE[sortKey];
  return (a, b) => {
    const c = base(a, b);
    if (c !== 0) return sortDir === "desc" ? -c : c;
    return COMPARE.date(b, a);
  };
}

function groupByMonth(entries, dir, cmp) {
  const buckets = new Map();
  for (const e of entries) {
    const label = monthLabel(e);
    if (!buckets.has(label)) {
      buckets.set(label, { label, key: e.gd_date ? e.gd_date.slice(0, 7) : "", items: [] });
    }
    buckets.get(label).items.push(e);
  }

  const groups = [...buckets.values()];
  groups.sort((a, b) => (dir === "desc" ? (a.key > b.key ? -1 : 1) : a.key > b.key ? 1 : -1));
  for (const g of groups) g.items.sort(cmp);
  return groups;
}

export default function GDLog({ me, user, owner }) {
  const [entries, setEntries] = useState(null);
  const [year, setYear] = useState(null);
  const [dir, setDir] = useState("desc");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [statuses, setStatuses] = useState(STATUSES);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [activeMode, setActiveMode] = useState("all");
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [resumeAt, setResumeAt] = useState(null);
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [pendingScroll, setPendingScroll] = useState([]);
  const [defaults, setDefaults] = useState({ mode: "all", statuses: [] });
  const [q, setQ] = useState("");
  // /log?month=2026-11 : dipakai tile "+1 this month" di dashboard
  const [month, setMonth] = useState(
    () => new URLSearchParams(window.location.search).get("month") || null
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState({});
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [resyncMsg, setResyncMsg] = useState(null);
  const [resyncing, setResyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const cancelled = useRef(false);
  const autoStarted = useRef(false);
  const defaultsApplied = useRef(false);

  // target user lain hanya terkirim kalau admin mode nyala (dicek di server)
  const tq = user ? `?user=${encodeURIComponent(user)}` : "";

  // baris yang baru masuk: kabari bulannya, tombolnya yang menggulir kalau mau
  const announce = (rows) => {
    const months = [...new Set(rows.map((r) => monthLabel({ gd_date: r.gd_date })))];
    setFlash({
      text: `Added ${rows.length} ${rows.length === 1 ? "GD" : "GDs"} · ${months.join(", ")}`,
      ids: rows.map((r) => r.id),
    });
  };

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (user) qs.set("user", user);
    if (showArchived) qs.set("archived", "1");
    const r = await fetch(`/api/gd?${qs}`);
    const j = await r.json();
    if (!r.ok) {
      setError(j.error === "private" ? "This log is private." : j.error || "Couldn't load the log.");
      setEntries([]);
      return;
    }
    setEntries(j.entries || []);

    if (!defaultsApplied.current && j.defaults) {
      defaultsApplied.current = true;
      // dari /log?month=... : tampilkan semua status, kalau tidak bulannya bisa kosong
      if (!month) {
        if (j.defaults.mode) setActiveMode(j.defaults.mode);
        if (j.defaults.statuses?.length) setStatuses(j.defaults.statuses);
      }
    }
    if (j.defaults) setDefaults(j.defaults);
  }, [showArchived, user]);

  const runImport = useCallback(
    async (startOffset = 0) => {
      cancelled.current = false;
      setError(null);
      setResumeAt(null);
      setProgress({ done: startOffset, total: 0 });
      try {
        const out = await runImportChunks({
          startOffset,
          onProgress: (p) => {
            setProgress(p);
            load();
          },
          shouldStop: () => cancelled.current,
        });
        setSyncMsg(
          out.added
            ? `Imported ${out.added} ${out.added === 1 ? "GD" : "GDs"} from osu!.`
            : "Nothing new to import, your log is already up to date."
        );
      } catch (e) {
        setError(e.message);
        setResumeAt(e.nextOffset ?? startOffset);
      }
      setProgress(null);
      load();
    },
    [load]
  );

  useEffect(() => {
    load();
  }, [load]);

  const addRef = useDialog(addOpen, () => setAddOpen(false));
  const editRef = useDialog(!!editing, () => setEditing(null));

  useEffect(() => {
    if (me && !user && entries?.length === 0 && !autoStarted.current) {
      autoStarted.current = true;
      runImport(0);
    }
  }, [me, entries, runImport]);

  const years = entries ? [...new Set(entries.map(yearOf))] : [];
  const activeYear = year ?? "all";
  const needle = q.trim().toLowerCase();
  const filtered = entries
    ? entries.filter(
        (e) =>
          (activeYear === "all" || yearOf(e) === activeYear) &&
          (activeMode === "all" || modeKey(e.game_mode) === activeMode) &&
          statuses.includes(e.map_status) &&
          (!month || (e.gd_date || "").slice(0, 7) === month) &&
          (!needle ||
            [e.title, e.artist, e.host, e.diff_name].some((v) =>
              String(v || "").toLowerCase().includes(needle)
            ))
      )
    : [];
  const cmp = makeCompare(sortKey, sortDir);
  const rows = [...filtered].sort(cmp);

  // teks mulai dari asc, angka (star) mulai dari desc
  const defaultDir = (key) => (key === "star" ? "desc" : "asc");

  const pickSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDir(key));
  };

  const arrow = (key) => (sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "");
  const ariaSort = (key) =>
    sortKey === key ? (sortDir === "desc" ? "descending" : "ascending") : "none";
  const pct = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  const toggleStatus = (s) =>
    setStatuses((prev) => {
      // dari All, klik satu status berarti tampilkan status itu saja
      if (prev.length === STATUSES.length) return [s];
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      return next.length ? next : STATUSES; // semuanya dimatikan = tampilkan semua
    });

  const activeCount =
    (year ? 1 : 0) +
    (statuses.length !== STATUSES.length ? 1 : 0) +
    (dir !== "desc" ? 1 : 0) +
    (grouped ? 0 : 1) +
    (activeMode !== "all" ? 1 : 0) +
    (month ? 1 : 0) +
    (q.trim() ? 1 : 0);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const r = await fetch(`/api/sync${tq}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setSyncing(false);
    if (!r.ok) return setSyncMsg(j.error || "Couldn't sync.");
    setSyncMsg(`Checked ${j.sets ?? 0} sets, ${j.updated ?? 0} changed.`);
    load();
  }

  const resetFilters = () => {
    setYear(null);
    // balik ke preferensi yang disimpan di Settings, bukan ke "semua"
    setStatuses(defaults.statuses?.length ? defaults.statuses : STATUSES);
    setDir("desc");
    setShowArchived(false);
    setGrouped(true);
    setActiveMode(defaults.mode || "all");
    setMonth(null);
    setQ("");
  };

  async function addEntries(e) {
    if (e) e.preventDefault();
    setBusy(true);
    setResults(null);
    const r = await fetch(`/api/gd/batch${tq}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setResults([{ line: "", ok: false, message: j.error || "Couldn't add those links." }]);
      return;
    }
    setResults(j.results);
    setText("");
    load();
    // semua baris masuk: dialog ditutup, halaman langsung menunjukkan hasilnya
    const ok = j.results.filter((r) => r.ok && (r.ids?.length || r.id));
    if (ok.length && !j.results.some((r) => !r.ok)) {
      setAddOpen(false);
      // satu link bisa jadi beberapa diff: tiap diff punya barisnya sendiri
      announce(ok.flatMap((r) => (r.ids?.length ? r.ids : [r.id]).map((id) => ({ id, gd_date: r.gd_date }))));
    }
  }

  async function confirmEntry(index, r) {
    const res = await fetch(`/api/gd/force${tq}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beatmapset_id: r.beatmapset_id, beatmap_id: r.beatmap_id }),
    });
    const j = await res.json();
    setResults((prev) =>
      prev.map((x, i) =>
        i === index
          ? { ...x, needsConfirm: false, ok: res.ok, message: res.ok ? j.message : j.error || "Failed." }
          : x
      )
    );
    if (res.ok) {
      load();
      if (j.id) {
        setAddOpen(false);
        announce([{ id: j.id, gd_date: j.gd_date }]);
      }
    }
  }

  function openEdit(entry) {
    setEditing(entry);
    setNote(entry.note || "");
    setConfirmDel(false);
    setResyncMsg(null);
  }

  async function resyncEntry() {
    setResyncing(true);
    setResyncMsg(null);
    const r = await fetch(`/api/gd/${editing.id}/resync${tq}`, { method: "POST" });
    const j = await r.json();
    setResyncing(false);
    setResyncMsg(j.message || j.error || "Failed.");
    if (r.ok) {
      load();
      setEditing((prev) => (prev ? { ...prev, map_status: j.status } : prev));
    }
  }

  async function saveNote(e) {
    e.preventDefault();
    await fetch(`/api/gd/${editing.id}${tq}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, is_archived: !!editing.is_archived }),
    });
    setEditing(null);
    load();
  }

  async function removeEntry() {
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    await fetch(`/api/gd/${editing.id}${tq}`, { method: "DELETE" });
    setEditing(null);
    load();
  }

  // gulir hanya kalau tombolnya diklik
  useEffect(() => {
    if (!pendingScroll.length || !entries) return;
    const el = document.getElementById(`gd-${pendingScroll[0]}`);
    if (!el) {
      // filter bisa menyembunyikan baris yang baru masuk; buka dulu, jangan diam saja
      if (statuses.length !== STATUSES.length || year || activeMode !== "all") {
        setStatuses(STATUSES);
        setYear(null);
        setActiveMode("all");
        return;
      }
      setPendingScroll([]);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setPendingScroll([]);
  }, [entries, pendingScroll, statuses, year, activeMode]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={h1}>{owner ? `${possessive(owner)} Guest difficulties` : "Guest difficulties"}</h1>
          <p className={muted}>
            {isPrivate(error)
            ? ""
            : entries === null
              ? "Loading."
              : `${entries.length} GDs · ${new Set(entries.map((e) => e.host)).size} mappers`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {me && entries !== null && !isPrivate(error) && <CopyLink to={`/u/${me.username}/log`} />}
        </div>
      </div>

      {flash && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Status as="span" className={muted}>
            {flash.text}
          </Status>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setPendingScroll(flash.ids)}
          >
            Jump to it
          </button>
        </div>
      )}

      <Status as="p" className={`${muted} mt-1`}>
        {syncMsg}
      </Status>

      {years.length > 0 && (
        <div className="mt-4 flex w-full flex-col gap-2.5">
          <div className="flex w-full flex-wrap items-center gap-2">
            <button
              className={filterToggle}
              aria-expanded={filtersOpen}
              aria-controls="filter-panel"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <svg
                className="block text-muted"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M7 12h10M10 18h4" />
              </svg>
              Filters
              {activeCount > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-accent px-1.5 text-2xs font-medium text-accent-ink">
                  {activeCount}
                </span>
              )}
            </button>

            {me && (
              <button className={filterToggle} onClick={syncNow} disabled={syncing}>
                {syncing ? "Syncing" : "Sync"}
              </button>
            )}

            {me && (
              <button
                className={`${filterToggle} text-white`}
                onClick={() => {
                  setResults(null);
                  setAddOpen(true);
                }}
              >
                Add GD to log
              </button>
            )}

            <input
              className={`${inputFit} ml-auto w-[200px] py-1.5 max-[640px]:w-full`}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search the log"
              placeholder="Search map, artist, host"
            />
          </div>

          {filtersOpen && (
            <div className="flex w-full flex-col gap-2 rounded-lg border border-line bg-panel p-3" id="filter-panel">
              {month && (
                <div className={filterGroup} role="group" aria-label="Filter by month">
                  <span className={filterLabel}>Month</span>
                  <button className={`${TAB} ${TAB_ON}`} onClick={() => setMonth(null)}>
                    {new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", {
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    ×
                  </button>
                </div>
              )}

              <div className={filterGroup} role="group" aria-label="Filter by year">
                <span className={filterLabel}>Year</span>
                <button
                  className={activeYear === "all" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                  aria-pressed={activeYear === "all"}
                  onClick={() => setYear(null)}
                >
                  All
                  <span className="font-mono text-2xs text-muted">{entries.length}</span>
                </button>
                {years.map((y) => (
                  <button
                    key={y}
                    className={y === activeYear ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                    aria-pressed={y === activeYear}
                    onClick={() => setYear(y)}
                  >
                    {y}
                    <span className="font-mono text-2xs text-muted">
                        {entries.filter((e) => yearOf(e) === y).length}
                      </span>
                    </button>
                  ))}
              </div>

              <div className={filterGroup} role="group" aria-label="Filter by status">
                <span className={filterLabel}>Status</span>
                <button
                  className={statuses.length === STATUSES.length ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                  aria-pressed={statuses.length === STATUSES.length}
                  onClick={() => setStatuses(STATUSES)}
                >
                  All
                </button>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    className={statuses.includes(s) ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                    aria-pressed={statuses.includes(s)}
                    onClick={() => toggleStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {me && (
                <div className={filterGroup} role="group" aria-label="Archived entries">
                  <span className={filterLabel}>Archive</span>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-13 text-ink">
                    <input
                      type="checkbox"
                      className="h-[18px] w-[18px] accent-accent"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    Show archived
                  </label>
                </div>
              )}


              <div className={filterGroup} role="group" aria-label="Filter by mode">
                <span className={filterLabel}>Mode</span>
                <button
                  className={activeMode === "all" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                  aria-pressed={activeMode === "all"}
                  onClick={() => setActiveMode("all")}
                >
                  All
                </button>
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    className={activeMode === m.key ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                    aria-pressed={activeMode === m.key}
                    onClick={() => setActiveMode(m.key)}
                  >
                    <ModeIcon mode={m.key} className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                ))}
              </div>

              <div className={filterGroup} role="group" aria-label="Month grouping">
                <span className={filterLabel}>Month</span>
                <button
                  className={grouped ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                  aria-pressed={grouped}
                  onClick={() => setGrouped(true)}
                >
                  Grouped
                </button>
                <button
                  className={!grouped ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                  aria-pressed={!grouped}
                  onClick={() => setGrouped(false)}
                >
                  Flat
                </button>
              </div>

              <div className={filterGroup} role="group" aria-label="Month sort">
                <span className={filterLabel}>Month sort</span>
                <button
                  className={`${TAB} ${grouped && dir === "desc" ? TAB_ON : TAB_OFF} disabled:cursor-not-allowed disabled:opacity-40`}
                  aria-pressed={dir === "desc"}
                  disabled={!grouped}
                  onClick={() => setDir("desc")}
                >
                  Descending
                </button>
                <button
                  className={`${TAB} ${grouped && dir === "asc" ? TAB_ON : TAB_OFF} disabled:cursor-not-allowed disabled:opacity-40`}
                  aria-pressed={dir === "asc"}
                  disabled={!grouped}
                  onClick={() => setDir("asc")}
                >
                  Ascending
                </button>
              </div>

              <div className="flex justify-end">
                <button className={btnGhost} onClick={resetFilters}>
                  Reset filters
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <>
          <div className={SCRIM} onClick={() => setAddOpen(false)} />
          <div ref={addRef} className={MODAL} role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className={MODAL_HEAD}>
              <h2 className={MODAL_TITLE} id="add-title">
                Add GDs from links
              </h2>
              <button className={btnGhost} onClick={() => setAddOpen(false)}>
                Close
              </button>
            </div>

            <form className="flex flex-col gap-2.5" onSubmit={addEntries}>
              <textarea
                className={TEXTAREA}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste osu! beatmap links, one per line"
                aria-label="Beatmap links, one per line"
                rows={4}
              />
              <button className={btn} disabled={busy || !text.trim()}>
                {busy ? "Adding" : "Add to log"}
              </button>
            </form>

            {results && (
              <ul className="mt-2.5 flex list-none flex-col gap-1 p-0 text-xs">
                {results.map((r, i) => (
                  <li key={`${r.line}-${i}`} className="flex flex-wrap items-baseline gap-2.5">
                    <span
                      className={`font-mono text-xs ${r.ok ? "text-good" : r.needsConfirm ? "text-accent" : "text-reject"}`}
                    >
                      {r.ok ? "ok" : r.needsConfirm ? "check" : "skip"}
                    </span>
                    <span className={r.ok || r.needsConfirm ? "" : "text-muted"}>{r.message}</span>
                    {r.needsConfirm && (
                      <>
                        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={!!confirmChecked[i]}
                            onChange={(e) =>
                              setConfirmChecked((prev) => ({ ...prev, [i]: e.target.checked }))
                            }
                          />
                          yes, this is my own gd and not other user
                        </label>
                        <button
                          className={`${TAB} ${TAB_OFF}`}
                          disabled={!confirmChecked[i]}
                          onClick={() => confirmEntry(i, r)}
                        >
                          Add anyway
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {editing && (
        <>
          <div className={SCRIM} onClick={() => setEditing(null)} />
          <div ref={editRef} className={MODAL} role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <div className={MODAL_HEAD}>
              <h2 className={MODAL_TITLE} id="edit-title">
                Edit entry
              </h2>
              <button className={btnGhost} onClick={() => setEditing(null)}>
                Close
              </button>
            </div>

            <p className={muted}>
              {editing.title} · {editing.diff_name} · {editing.host}
            </p>

            <form className="flex flex-col gap-2.5" onSubmit={saveNote}>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={!!editing.is_archived}
                  onChange={(e) => setEditing({ ...editing, is_archived: e.target.checked })}
                />
                Hide from public
              </label>
              <textarea
                className={TEXTAREA}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Only you can see this note"
                aria-label="Note"
                rows={4}
              />
              <p className={`${muted} mt-3`}>
                {editing.synced_at
                  ? `Status checked ${relTime(editing.synced_at)} (${new Date(editing.synced_at).toLocaleString()}).`
                  : "Status has not been checked against osu! yet."}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className={btn}>Save note</button>
                <button type="button" className={btnGhost} onClick={resyncEntry} disabled={resyncing}>
                  {resyncing ? "Resyncing" : "Resync status"}
                </button>
                <button
                  type="button"
                  className={confirmDel ? btnDanger : btnGhost}
                  onClick={removeEntry}
                >
                  {confirmDel ? "Confirm delete" : "Delete"}
                </button>
              </div>
              <Status as="p" className={`${muted} mt-2`}>{resyncMsg}</Status>
            </form>
          </div>
        </>
      )}

      {progress && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-line bg-panel px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="m-0 mb-1 text-13 font-medium">Pulling your guest difficulties from osu!</p>
            <p className="m-0 mb-2 text-xs text-muted">
              Ranked maps come along too. First run takes a minute.
            </p>
            <div
              className="h-[3px] overflow-hidden rounded-[2px] bg-panel2"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label={`Importing ${progress.done} of ${progress.total || "?"} sets`}
            >
              <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
            </div>
            <p className="m-0 mt-1.5 font-mono text-2xs text-muted">
              {progress.done}
              {progress.total ? ` / ${progress.total}` : ""} sets
            </p>
          </div>
          <button className={btnGhost} onClick={() => (cancelled.current = true)}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-danger bg-panel px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="m-0 mb-1.5 text-13 font-medium">{error}</p>
            {!isPrivate(error) && <p className={muted}>Entries already imported are kept.</p>}
          </div>
          {!isPrivate(error) && resumeAt !== null && (
            <button className={btn} onClick={() => runImport(resumeAt)}>
              Resume
            </button>
          )}
        </div>
      )}

      {!isPrivate(error) && entries !== null && entries.length === 0 && !progress && (
        <div className={empty}>
          <p className={emptyTitle}>{me ? "Your log is empty" : "No entries yet"}</p>
          <p className={muted}>
            {me
              ? "osugd can pull every beatmap you're credited on from osu!, ranked maps included. Start there, then add anything missing by hand."
              : "Nothing in this log is public."}
          </p>
          {me && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button className={btn} onClick={() => runImport(0)}>
                Import my GDs from osu!
              </button>
              <button className={btnGhost} onClick={() => setAddOpen(true)}>
                Add GD to log
              </button>
            </div>
          )}
        </div>
      )}

      {entries !== null && entries.length > 0 && rows.length === 0 && (
        <div className={empty}>
          <p className={emptyTitle}>No entries match this filter</p>
          <p className={muted}>Turn a status back on, or pick another year.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              className={btnGhost}
              onClick={() => {
                setStatuses(STATUSES);
                setYear(null);
                setDir("desc");
                setSortKey(null);
                setSortDir("desc");
              }}
            >
              Reset filters
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <table className={`gd-table mt-5 w-full border-collapse text-13 ${grouped ? "" : "zebra"}`}>
          <thead>
            <tr>
              <th scope="col" className={`${TH} w-10`} aria-sort={ariaSort("mode")}>
                <button type="button" className={SORT_BTN} onClick={() => pickSort("mode")}>
                  Mode{arrow("mode")}
                </button>
              </th>
              <th scope="col" className={TH} aria-sort={ariaSort("map")}>
                <button type="button" className={SORT_BTN} onClick={() => pickSort("map")}>
                  Map{arrow("map")}
                </button>
              </th>
              <th scope="col" className={TH} aria-sort={ariaSort("diff")}>
                <button type="button" className={SORT_BTN} onClick={() => pickSort("diff")}>
                  Difficulty{arrow("diff")}
                </button>
              </th>
              <th scope="col" className={TH} aria-sort={ariaSort("host")}>
                <button type="button" className={SORT_BTN} onClick={() => pickSort("host")}>
                  Host{arrow("host")}
                </button>
              </th>
              <th scope="col" className={`${TH} text-right`} aria-sort={ariaSort("star")}>
                <button type="button" className={SORT_BTN_RIGHT} onClick={() => pickSort("star")}>
                  Star{arrow("star")}
                </button>
              </th>
              <th scope="col" className={TH} aria-sort={ariaSort("status")}>
                <button type="button" className={SORT_BTN} onClick={() => pickSort("status")}>
                  Status{arrow("status")}
                </button>
              </th>
              {me && (
                <th scope="col" className={TH}>
                  Edit
                </th>
              )}
            </tr>
          </thead>
          {(grouped ? groupByMonth(rows, dir, cmp) : [{ label: null, items: rows }]).map((group) => (
            <tbody key={group.label ?? "flat"}>
              {group.label && (
                <tr className="month-row">
                  <th
                    scope="colgroup"
                    colSpan={me ? 7 : 6}
                    className="border-y border-line px-2 py-3 text-13 font-semibold text-muted"
                  >
                    {group.label}
                  </th>
                </tr>
              )}
              {group.items.map((e) => (
                <tr key={e.id} id={`gd-${e.id}`}>
                  <td className="border-b border-line px-2 py-2.5 text-center align-middle">
                    <ModeIcon mode={e.game_mode} className="mx-auto h-4 w-4" />
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-2.5">
                      {e.beatmapset_id && (
                        <img
                          className="h-10 w-10 flex-none rounded object-cover bg-panel2"
                          src={cover(e.beatmapset_id)}
                          alt=""
                          width="40"
                          height="40"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      <div className="min-w-0">
                        {e.beatmapset_id ? (
                          <a
                            className={`map-title ${MAP_TITLE_LINK}`}
                            href={`https://osu.ppy.sh/beatmapsets/${e.beatmapset_id}#osu/${e.beatmap_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {e.title}
                          </a>
                        ) : (
                          <span className="map-title block">{e.title}</span>
                        )}
                        <span className="map-artist block text-xs text-muted">{e.artist}</span>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>
                    <span className="inline-block rounded border border-strong px-1.5 py-0.5 font-mono text-2xs whitespace-nowrap">
                      {e.diff_name}
                    </span>
                  </td>
                  <td className={`${TD} text-muted`}>
                    {e.host ? (
                      <a
                        className="whitespace-nowrap text-muted underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent"
                        href={`https://osu.ppy.sh/users/${encodeURIComponent(e.host)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {e.host}
                      </a>
                    ) : null}
                  </td>
                  <td className={`${TD} text-right font-mono text-xs`}>
                    {e.star_rating != null ? (
                      <span style={{ color: starColor(Number(e.star_rating)) }}>
                        {Number(e.star_rating).toFixed(2)}
                      </span>
                    ) : (
                      "n/a"
                    )}
                  </td>
                  <td className={TD}>
                    <span className={statusChip(e.map_status)}>{e.map_status}</span>
                    {e.is_archived && <span className="ml-1.5 inline-block text-2xs text-muted">archived</span>}
                  </td>
                  {me && (
                    <td className={TD}>
                      <button className={LINK_BTN} onClick={() => openEdit(e)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </>
  );
}
