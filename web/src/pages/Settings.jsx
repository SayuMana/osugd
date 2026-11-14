import { useEffect, useState } from "react";
import { runImport } from "../lib/import.js";
import { TAB, TAB_OFF, TAB_ON, btn, btnGhost, empty, emptyTitle, h1, inputFit, muted, panel, panelH2 } from "../ui.js";
import { MODES } from "../lib/mode.js";
import Status from "../components/Status.jsx";
import NotFound from "./NotFound.jsx";

const TOGGLES = [
  ["gd_log_public", "GD log is public", "Turn off to hide the whole log from visitors."],
  ["gd_track_public", "GD track is public", "Turn off to hide work in progress."],
  ["summary_public", "Summary is public", "Turn off to hide the stats page."],
  ["sync_enabled", "Daily status sync", "Refresh map status from osu automatically."],
];

const ACTIONS = "flex flex-wrap items-center gap-2.5";
const STATUSES = ["ranked", "loved", "qualified", "pending", "wip", "graveyard"];
const SETTING = "flex items-start gap-2.5 py-[7px]";

export default function Settings({ me }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [importing, setImporting] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load settings.");
        setS(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  // tamu tidak punya urusan di sini (setelah semua hook)
  if (me !== undefined && me?.role !== "admin") return <NotFound />;

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>Settings</h1>
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

  if (!s) {
    return (
      <>
        <div>
          <h1 className={h1}>Settings</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const set = (key, value) => setS((prev) => ({ ...prev, [key]: value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) {
      setMsg(j.error || "Couldn't save.");
      return;
    }
    setS(j);
    setMsg("Saved.");
  }

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
      setSyncMsg("Sync is turned off above.");
      return;
    }
    setSyncMsg(`Synced ${j.sets} sets, ${j.updated} entries updated.`);
  }

  async function importNow() {
    setImporting({ done: 0, total: 0 });
    setImportMsg(null);
    try {
      const res = await runImport({ onProgress: (p) => setImporting(p) });
      setImportMsg(`Imported ${res.added} entries.`);
    } catch (e) {
      setImportMsg(e.message);
    } finally {
      setImporting(null);
    }
  }

  const pct = importing?.total ? Math.min(100, Math.round((importing.done / importing.total) * 100)) : 0;

  return (
    <>
      <div>
        <h1 className={h1}>Settings</h1>
        <p className={muted}>Visibility, queue, rules, and data refresh.</p>
      </div>

      <form className="mt-5 flex max-w-[720px] flex-col gap-4" onSubmit={save}>
        <section className={panel}>
          <h2 className={panelH2}>Visibility</h2>
          {TOGGLES.map(([key, title, desc]) => (
            <label className={SETTING} key={key}>
              <input
                className="mt-0.5 h-4 w-4 flex-none accent-accent"
                type="checkbox"
                checked={s[key] ?? true}
                onChange={(e) => set(key, e.target.checked)}
              />
              <span className="flex flex-col gap-px">
                <span className="text-13">{title}</span>
                <span className="text-xs text-muted">{desc}</span>
              </span>
            </label>
          ))}
        </section>

        <section className={panel}>
          <h2 className={panelH2}>Default filters</h2>
          <p className={`${muted} mb-2`}>
            What everyone sees when the log or summary opens, including visitors who are not logged in.
          </p>

          <label className={SETTING}>
            <span className="flex flex-1 flex-col gap-px">
              <span className="text-13">Main mode</span>
              <span className="text-xs text-muted">Mode filter used when the log opens.</span>
            </span>
            <select
              className={inputFit}
              value={s.default_mode ?? "all"}
              onChange={(e) => set("default_mode", e.target.value)}
            >
              <option value="all">All modes</option>
              {MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-1">
            <span className="text-13">Statuses on by default</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUSES.map((st) => {
                const on = (s.default_statuses?.length ? s.default_statuses : STATUSES).includes(st);
                return (
                  <button
                    type="button"
                    key={st}
                    className={on ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "default_statuses",
                        on ? (s.default_statuses?.length ? s.default_statuses : STATUSES).filter((x) => x !== st) : [...(s.default_statuses ?? []), st]
                      )
                    }
                  >
                    {st}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Leave all off to show every status.</p>
          </div>
        </section>

        <div className={ACTIONS}>
          <button className={btn} disabled={saving}>
            {saving ? "Saving" : "Save settings"}
          </button>
          <Status className={muted}>{msg}</Status>
        </div>
      </form>

      <section className={`${panel} mt-4`}>
        <h2 className={panelH2}>Data</h2>
        <div className={ACTIONS}>
          <button className={btnGhost} onClick={syncNow} disabled={syncing}>
            {syncing ? "Syncing" : "Sync status now"}
          </button>
          <button className={btnGhost} onClick={importNow} disabled={!!importing}>
            {importing ? "Importing" : "Import from osu"}
          </button>
        </div>

        {importing && (
          <div className="mt-3">
            <p className={muted}>
              Importing your GD list from osu! {importing.done}
              {importing.total ? ` / ${importing.total}` : ""} sets
            </p>
            <div className="h-[3px] overflow-hidden rounded-[2px] bg-panel2" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
              <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <Status as="p" className={`${muted} mt-2`}>{syncMsg}</Status>
        <Status as="p" className={`${muted} mt-2`}>{importMsg}</Status>
      </section>
    </>
  );
}
