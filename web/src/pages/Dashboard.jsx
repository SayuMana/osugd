import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ModeIcon from "../components/ModeIcon.jsx";
import { modeKey } from "../lib/mode.js";
import { REQUESTS_ON } from "../lib/features.js";
import { btn, btnGhost, chip, empty, emptyTitle, h1, inputFit, muted, panel, panelH2, statusChip } from "../ui.js";

const STATUS_LABEL = {
  pending: "pending",
  accepted: "accepted",
  in_progress: "in progress",
  done: "done",
  rejected: "rejected",
  on_hold: "in hold",
};

const ROW = "flex items-center justify-between gap-3 border-b border-line py-2 text-13";
const LINK = "min-w-0 truncate underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent";
const META = "flex shrink-0 items-center gap-2 text-xs text-muted";

function ago(days) {
  if (days == null) return "never";
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

const SHORT = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });

const THIS_YEAR = String(new Date().getFullYear());

function Spark({ months, years }) {
  const [scale, setScale] = useState(THIS_YEAR);
  const [hover, setHover] = useState(null);

  let bars;
  let scope;
  if (scale === "all") {
    const byYear = new Map();
    for (const m of months) {
      const y = m.key.slice(0, 4);
      byYear.set(y, (byYear.get(y) || 0) + m.count);
    }
    bars = [...byYear].map(([y, count]) => ({ key: y, label: y, count }));
    scope = "all time";
  } else {
    bars = months.filter((m) => m.key.startsWith(scale)).map((m) => ({ ...m, label: SHORT(m.key) }));
    scope = scale === THIS_YEAR ? "this year" : scale;
  }

  const total = bars.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...bars.map((b) => b.count));
  const step = bars.length > 6 ? Math.ceil(bars.length / 4) : 1;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold">
          GD output{" "}
          <span className="text-xs font-normal text-muted">
            {scope} · {total} GDs
          </span>
        </h2>
        <select
          className={inputFit}
          value={scale}
          onChange={(e) => {
            setScale(e.target.value);
            setHover(null);
          }}
          aria-label="Chart range"
        >
          <option value={THIS_YEAR}>This year</option>
          <option value="all">All time</option>
          {years.filter((y) => y !== THIS_YEAR).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-1.5 h-4 text-xs text-muted">
        {hover ? `${hover.key} · ${hover.count} ${hover.count === 1 ? "GD" : "GDs"}` : ""}
      </div>

      <div className="flex h-16 items-end gap-1" role="group" aria-label={`Guest difficulties, ${scope}`}>
        {bars.map((b) => (
          <button
            key={b.key}
            type="button"
            className="flex h-full min-w-0 flex-1 cursor-pointer items-end border-0 bg-transparent p-0"
            aria-label={`${b.key}: ${b.count} ${b.count === 1 ? "GD" : "GDs"}`}
            aria-pressed={hover?.key === b.key}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") return;
              setHover((prev) => (prev?.key === b.key ? null : b));
            }}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(b)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
            onFocus={() => setHover(b)}
            onBlur={() => setHover(null)}
          >
            <span
              className={`w-full rounded-sm bg-accent ${hover && hover.key !== b.key ? "opacity-40" : ""}`}
              style={{ height: `${Math.max(3, Math.round((b.count / max) * 100))}%` }}
            />
          </button>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1 text-xs text-muted">
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 text-center">
            {i % step === 0 ? b.label : ""}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <Link className={btnGhost} to="/summary">
          Open the summary
        </Link>
      </div>
    </>
  );
}

export default function Dashboard({ me }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load the dashboard.");
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>Dashboard</h1>
        </div>
        <div className={empty}>
          <p className={emptyTitle}>{error}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button className={btnGhost} onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div>
          <h1 className={h1}>Dashboard</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const isOwner = true;

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const r = await fetch("/api/sync", { method: "POST" });
    const j = await r.json();
    setSyncing(false);
    if (!r.ok) {
      setSyncMsg(j.error || "Sync failed.");
      return;
    }
    if (j.skipped) {
      setSyncMsg("Sync is turned off in settings.");
      return;
    }
    setSyncMsg(
      `Synced ${j.sets} sets, ${j.updated} entries updated${
        j.remaining ? `, ${j.remaining} sets left for the next run` : ""
      }.`
    );
  }

  if (!isOwner) {
    const open = data.queue.open;
    return (
      <>
        <div>
          <h1 className={h1}>Dashboard</h1>
        </div>

        {!REQUESTS_ON && (
          <div className={`${empty} mt-4`}>
            <p className={muted}>The GD log is open to everyone.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link className={btn} to="/log">
                Browse the log
              </Link>
            </div>
          </div>
        )}

        <div
          className={`mt-4 grid items-stretch gap-4 max-[900px]:grid-cols-1 ${
            REQUESTS_ON ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {REQUESTS_ON && (
          <section className={panel}>
            <h2 className={panelH2}>Your requests</h2>
            {data.requests.length === 0 ? (
              <p className={muted}>{me ? "You haven't requested a GD yet." : "Log in to send and track requests."}</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {data.requests.map((r) => (
                  <li className={ROW} key={r.id}>
                    <span className="min-w-0">
                      <span className="block truncate">{r.title}</span>
                      <span className="block text-xs text-muted">
                        {r.artist} · wants {r.requested_diff}
                      </span>
                    </span>
                    <span className={statusChip(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}

          {REQUESTS_ON && (
          <section className={panel}>
            <h2 className={panelH2}>Request a GD</h2>
            <p className={muted}>
              {open
                ? "The queue is open. Send a beatmap link and the difficulty you want."
                : "The queue is closed for now."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Link className={open ? btn : btnGhost} to={open ? "/requestform" : "/requests"}>
                {open ? "Open the request form" : "See the queue"}
              </Link>
            </div>
          </section>
          )}
        </div>
      </>
    );
  }

  const { stats, todo, recent, months, years } = data;
  const emptyTodo = todo.tracks.length === 0;

  return (
    <>
      <div>
        <h1 className={h1}>Dashboard</h1>
      </div>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-panel sm:grid-cols-4 sm:divide-x sm:divide-line">
        <div className="min-w-0 p-3.5">
          <span className="block font-mono text-xl font-medium leading-tight">{stats.total}</span>
          <span className="block text-xs text-muted">total GDs</span>
        </div>
        <div className="min-w-0 p-3.5">
          <span className="block font-mono text-xl font-medium leading-tight">{stats.ranked}</span>
          <span className="block text-xs text-muted">ranked</span>
        </div>
        <div className="min-w-0 p-3.5">
          <span className="block font-mono text-xl font-medium leading-tight">{stats.mappers}</span>
          <span className="block text-xs text-muted">mappers</span>
        </div>
        <Link
          className="min-w-0 p-3.5 hover:bg-panel2"
          to={`/log?month=${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
        >
          <span className="block font-mono text-xl font-medium leading-tight">+{stats.this_month}</span>
          <span className="block text-xs text-muted">this month</span>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 items-stretch gap-4 max-[900px]:grid-cols-1">
        <section className={`${panel} flex flex-col`}>
          <h2 className={panelH2}>On the board</h2>
          {emptyTodo ? (
            <p className={muted}>The board is clear.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {todo.tracks.map((t) => (
                <li className={ROW} key={`trk-${t.id}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <ModeIcon mode={t.game_mode} />
                    <Link className={LINK} to="/track">
                      {t.title}
                    </Link>
                  </span>
                  <span className={META}>
                    <span>{ago(t.days)}</span>
                    <span className={chip}>{t.track_status.replace("_", " ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-3">
            <Link className={btnGhost} to="/track">
              Open board
            </Link>
            <button className={btnGhost} onClick={syncNow} disabled={syncing}>
              {syncing ? "Syncing" : "Sync status now"}
            </button>
          </div>
          {syncMsg && <p className={`${muted} mt-2`}>{syncMsg}</p>}
        </section>

        <section className={panel}>
          <h2 className={panelH2}>Recent GDs</h2>
          {recent.length === 0 ? (
            <p className={muted}>Nothing in the log yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {recent.map((e) => (
                <li className={ROW} key={e.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <ModeIcon mode={e.game_mode} />
                    <span className="min-w-0">
                      {e.beatmapset_id ? (
                        <a
                          className="block truncate underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent"
                          href={`https://osu.ppy.sh/beatmapsets/${e.beatmapset_id}#${modeKey(e.game_mode) ?? "osu"}/${e.beatmap_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {e.title}
                        </a>
                      ) : (
                        <span className="block truncate">{e.title}</span>
                      )}
                      <span className="block text-xs text-muted">
                        {e.artist} · {e.diff_name}
                      </span>
                    </span>
                  </span>
                  <span className={META}>
                    <span className="font-mono">{e.gd_date}</span>
                    <span className={statusChip(e.map_status)}>{e.map_status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Link className={btnGhost} to="/log">
              Open the log
            </Link>
          </div>
        </section>
      </div>

      <section className={`${panel} mt-4`}>
        <Spark months={months} years={years} />
      </section>
    </>
  );
}
