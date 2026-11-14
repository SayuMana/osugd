import { useEffect, useState } from "react";
import { TAB, TAB_OFF, TAB_ON, btnGhost, empty, emptyTitle, filterGroup, filterLabel, filterToggle, h1, isPrivate, muted, panelH2 } from "../ui.js";
import ModeIcon from "../components/ModeIcon.jsx";
import { MODES, modeKey } from "../lib/mode.js";

const BUCKETS = [
  ["<2", 0, 2],
  ["2-3", 2, 3],
  ["3-4", 3, 4],
  ["4-5", 4, 5],
  ["5-6", 5, 6],
  ["6-7", 6, 7],
  ["7+", 7, 99],
];

const STATUSES = ["ranked", "loved", "qualified", "pending", "wip", "graveyard"];
const PER_PAGE = 12;
const CELL = "min-w-0 p-3.5";

const yearOf = (e) => (e.gd_date ? e.gd_date.slice(0, 4) : "Unknown");

function MiniBars({ rows, unit, total }) {
  const max = Math.max(1, ...rows.map((r) => r.total ?? r.count));
  // label tiap N batang kalau kolomnya sudah padat; angka per batang tetap tampil semua
  const step = rows.length > 8 ? Math.ceil(rows.length / 6) : 1;

  return (
    <>
      <div className="flex min-h-16 flex-1 items-end gap-1" role="img" aria-label={`${total} GDs per ${unit}`}>
        {rows.map((r) => {
          const all = r.total ?? r.count;
          return (
            <div
              key={r.label}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${r.label}: ${r.count} of ${all} GDs`}
            >
              {all - r.count > 0 && (
                <div className="w-full rounded-t-sm bg-line" style={{ height: `${((all - r.count) / max) * 100}%` }} />
              )}
              {r.count > 0 && (
                <div className="w-full bg-accent" style={{ height: `${(r.count / max) * 100}%` }} />
              )}
              {all === 0 && <div className="w-full bg-line" style={{ height: "3%" }} />}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1 text-xs">
        {rows.map((r, i) => (
          <span key={r.label} className="min-w-0 flex-1 text-center">
            <span className="block font-mono text-ink">{r.count}</span>
            <span className="block truncate text-muted">{i % step === 0 ? r.label : ""}</span>
          </span>
        ))}
      </div>

      <p className="m-0 mt-2 text-xs text-muted">
        {total} GDs, per {unit}.
      </p>

    </>
  );
}

// pager hanya dipakai di layar lebar; di mobile daftar mapper cukup di-scroll
function useWide() {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));

  useEffect(() => {
    const m = window.matchMedia(query);
    const on = (e) => setWide(e.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  return wide;
}

export default function Summary() {
  const [entries, setEntries] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState(null);
  const [year, setYear] = useState(null);
  const [statuses, setStatuses] = useState(STATUSES);
  const [mode, setMode] = useState("all");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const wide = useWide();

  useEffect(() => {
    fetch("/api/summary")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error === "private" ? "This log is private." : j.error || "Couldn't load.");
        setEntries(j.entries);
        setNames(j.names || {});
        if (j.defaults) {
          if (j.defaults.mode) setMode(j.defaults.mode);
          if (j.defaults.statuses?.length) setStatuses(j.defaults.statuses);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [year, statuses, mode]);

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>Summary</h1>
        </div>
        <div className={empty}>
          <p className={emptyTitle}>{error}</p>
          {!isPrivate(error) && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button className={btnGhost} onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  if (!entries) {
    return (
      <>
        <div>
          <h1 className={h1}>Summary</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const allYears = [...new Set(entries.map(yearOf))].sort();
  const filtered = entries.filter(
    (e) =>
      (year === null || yearOf(e) === year) &&
      (mode === "all" || modeKey(e.game_mode) === mode) &&
      statuses.includes(e.map_status)
  );

  const stars = filtered.map((e) => Number(e.star_rating)).filter((n) => !Number.isNaN(n));
  const avg = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0;
  const groups = {};
  for (const e of filtered) {
    const key = e.host_id ?? e.host;
    const info = e.host_id ? names[e.host_id] : null;
    const g = (groups[key] ??= { key, name: info?.username ?? e.host, count: 0 });
    g.count += 1;
  }
  const mappers = Object.values(groups).sort((a, b) => b.count - a.count);
  const mapperCount = mappers.length;

  const years = [...new Set(filtered.map(yearOf))].sort();
  const byYear = allYears.map((y) => ({
    label: y,
    count: filtered.filter((e) => yearOf(e) === y).length,
    total: entries.filter((e) => yearOf(e) === y).length,
  }));
  const byStar = BUCKETS.map(([label, min, max]) => ({
    label,
    count: stars.filter((s) => s >= min && s < max).length,
  }));

  const countStatus = (list) => filtered.filter((e) => list.includes(e.map_status)).length;
  const ranked = countStatus(["ranked"]);
  const loved = countStatus(["loved"]);
  const pending = countStatus(["pending"]);
  const wip = countStatus(["wip"]);
  const graveyard = countStatus(["graveyard"]);

  // urutan mengisi kolom: kiri 4 dulu, lalu kanan 4
  const stats = [
    [filtered.length, "total GDs"],
    [mapperCount, "mappers"],
    [avg.toFixed(2), "average star"],
    [ranked, "ranked"],
    [loved, "loved"],
    [pending, "pending"],
    [wip, "wip"],
    [graveyard, "graveyard"],
  ];

  const pageCount = Math.ceil(mappers.length / PER_PAGE);
  const shownMappers = wide ? mappers.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE) : mappers;

  const toggleStatus = (s) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const activeFilters = (year === null ? 0 : 1) + (STATUSES.length - statuses.length) + (mode === "all" ? 0 : 1);

  const reset = () => {
    setYear(null);
    setStatuses(STATUSES);
    setMode("all");
  };

  return (
    <>
      <div>
        <h1 className={h1}>Summary</h1>
        <p className={muted}>
          {filtered.length} GDs · {mapperCount} mappers · {avg.toFixed(2)}★ average
          {years.length > 1 ? ` · ${years[0]} to ${years[years.length - 1]}` : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className={`${empty} mt-4`}>
          <p className={emptyTitle}>No entries match this filter</p>
          <p className={muted}>Turn a status back on, or pick another year.</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button className={btnGhost} onClick={reset}>
              Reset filters
            </button>
          </div>
        </div>
      ) : (
        <div className="cell-grid mt-4 grid auto-rows-fr grid-cols-2 overflow-hidden rounded-lg border border-line bg-panel max-[900px]:grid-cols-1">
          <section className={CELL}>
            <h2 className={panelH2}>Summary</h2>
            <div
              className="grid grid-flow-col grid-cols-2 gap-x-3 gap-y-4"
              style={{ gridTemplateRows: `repeat(${Math.ceil(stats.length / 2)}, auto)` }}
            >
              {stats.map(([value, label]) => (
                <div className="flex flex-col gap-0.5" key={label}>
                  <span className="font-mono text-xl font-medium leading-tight">{value}</span>
                  <span className="text-xs text-muted">{label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${CELL} flex flex-col`}>
            <h2 className={panelH2}>Mappers mapped for</h2>
            <ul
              className={`grid flex-1 min-h-0 grid-cols-2 gap-x-4 overflow-y-auto min-[900px]:min-h-[186px] [scrollbar-width:thin] [scrollbar-color:var(--color-strong)_transparent] max-[900px]:max-h-60 max-[900px]:grid-cols-1 ${
                wide ? "grid-flow-col" : ""
              }`}
              style={wide ? { gridTemplateRows: `repeat(${Math.ceil(shownMappers.length / 2)}, auto)` } : undefined}
            >
              {shownMappers.map((m) => (
                <li className="flex min-w-0 items-center justify-between gap-2 border-b border-line py-[7px] text-xs" key={m.key}>
                  <a
                    className="truncate underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent"
                    href={`https://osu.ppy.sh/users/${encodeURIComponent(m.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m.name}
                  </a>
                  <span className="font-mono text-2xs text-muted">{m.count}</span>
                </li>
              ))}
            </ul>

            {wide && pageCount > 1 && (
              <nav className="mt-3 flex flex-wrap items-center justify-between gap-3" aria-label="Mapper pages">
                <button className={btnGhost} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Previous
                </button>
                <span className={muted}>
                  Page {page + 1} of {pageCount}
                </span>
                <button className={btnGhost} disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </nav>
            )}
          </section>
          <section className={`${CELL} flex flex-col`}>
            <h2 className={panelH2}>Star rating</h2>
            <MiniBars rows={byStar} unit="star bracket" total={stars.length} />
          </section>

          <section className={`${CELL} flex flex-col`}>
            <h2 className={panelH2}>GDs per year</h2>
            <MiniBars rows={byYear} unit="year" total={filtered.length} />
          </section>

        </div>
      )}
      <div className="mt-4">
        <button className={filterToggle} aria-expanded={filtersOpen} aria-controls="summary-filters" onClick={() => setFiltersOpen((v) => !v)}>
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
          {activeFilters > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-accent px-1.5 text-2xs font-medium text-accent-ink">
              {activeFilters}
            </span>
          )}
        </button>

        {filtersOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-line bg-panel p-3" id="summary-filters">
        <div className={filterGroup} role="group" aria-label="Filter by year">
          <span className={filterLabel}>Year</span>
          <button
            className={year === null ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
            aria-pressed={year === null}
            onClick={() => setYear(null)}
          >
            All
            <span className="font-mono text-2xs text-muted">{entries.length}</span>
          </button>
          {allYears.map((y) => (
            <button
              key={y}
              className={y === year ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
              aria-pressed={y === year}
              onClick={() => setYear(y)}
            >
              {y}
              <span className="font-mono text-2xs text-muted">
                {entries.filter((e) => yearOf(e) === y).length}
              </span>
            </button>
          ))}
        </div>

        <div className={filterGroup} role="group" aria-label="Filter by mode">
          <span className={filterLabel}>Mode</span>
          <button
            className={mode === "all" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
            aria-pressed={mode === "all"}
            onClick={() => setMode("all")}
          >
            All
          </button>
          {MODES.map((m) => (
            <button
              key={m.key}
              className={mode === m.key ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
              aria-pressed={mode === m.key}
              onClick={() => setMode(m.key)}
            >
              <ModeIcon mode={m.key} className="h-3.5 w-3.5" />
              {m.label}
            </button>
          ))}
        </div>

        <div className={filterGroup} role="group" aria-label="Filter by status">
          <span className={filterLabel}>Status</span>
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

        <div className="flex justify-end">
          <button className={btnGhost} onClick={reset}>
            Reset filters
          </button>
        </div>
        </div>
        )}
      </div>

    </>
  );
}
