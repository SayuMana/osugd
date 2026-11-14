import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ModeIcon from "../components/ModeIcon.jsx";
import { useDialog } from "../lib/useDialog.js";
import Status from "../components/Status.jsx";
import CopyLink from "../components/CopyLink.jsx";
import { TAB, TAB_OFF, TAB_ON, btn, btnGhost, chip, empty, emptyTitle, h1, isPrivate, input, inputFit, muted, panel, panelH2, statusChip } from "../ui.js";
import { REQUESTS_ON } from "../lib/features.js";

const PAGE = 20;

const CHOICES = [
  ["accepted", "accepted"],
  ["priority", "high priority"],
  ["in_progress", "in progress"],
  ["dropped", "dropped"],
];

const FIELD = "flex flex-col gap-1 text-xs text-muted";
const DIFFS = ["easy", "normal", "hard", "insane", "extra", "top diff"];
const TRACK_ROW = "flex items-center justify-between gap-3 border-b border-line py-2.5";
const TRACK_MAIN = "flex min-w-0 items-center gap-2.5";
const TRACK_ACTIONS = "flex shrink-0 items-center gap-2";
// kolom board: scroll sendiri kalau kartunya banyak (desktop), di mobile ikut scroll halaman
const COLUMN =
  "flex flex-col gap-4 min-[900px]:max-h-[calc(100vh-230px)] min-[900px]:overflow-y-auto min-[900px]:pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-strong)_transparent]";
const LINK_BTN =
  "min-h-6 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted underline decoration-muted underline-offset-2 hover:text-accent";
const SCRIM = "fixed inset-0 z-40 bg-[rgba(10,6,16,0.6)]";
const MODAL =
  "fixed inset-0 z-50 m-auto h-fit w-[min(440px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-auto rounded-lg border border-line bg-panel p-4";
const MODAL_HEAD = "mb-3.5 flex items-center justify-between gap-3";
const MODAL_TITLE = "m-0 text-base font-semibold text-white";
const MAP_TITLE = "block";
const MAP_TITLE_LINK =
  "block underline decoration-muted underline-offset-2 hover:text-accent hover:decoration-accent";

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Cover({ id }) {
  if (!id) return <span className="inline-block h-10 w-10 flex-none rounded bg-panel2" aria-hidden="true" />;
  return (
    <img
      className="h-10 w-10 flex-none rounded object-cover bg-panel2"
      src={`https://assets.ppy.sh/beatmaps/${id}/covers/list.jpg`}
      alt=""
      width="40"
      height="40"
      loading="lazy"
    />
  );
}

export default function Tracks({ me }) {
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("board");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [adding, setAdding] = useState(false);
  const [doneTrack, setDoneTrack] = useState(null);
  const [doneLink, setDoneLink] = useState("");
  const [doneMsg, setDoneMsg] = useState(null);
  const [needConfirm, setNeedConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({
    artist: "",
    title: "",
    diff_name: "",
    link: "",
    requester_name: "",
    note: "",
    status: "accepted",
  });
  const [mode, setMode] = useState("manual");
  const [rows, setRows] = useState([{ link: "", diff: "insane" }]);
  const [addMsg, setAddMsg] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(null);

  const isOwner = me?.role === "admin";

  const addRef = useDialog(adding, () => setAdding(false));
  const doneRef = useDialog(!!doneTrack, () => setDoneTrack(null));

  const load = useCallback(async () => {
    const qs = `?page=${page}${tab === "history" ? "&history=1" : ""}`;
    const r = await fetch(`/api/tracks${qs}`);
    const j = await r.json();
    if (!r.ok) {
      setError(j.error || "Couldn't load the board.");
      return;
    }
    setError(null);
    setTracks(j.tracks);
    setTotal(j.total ?? 0);
  }, [tab, page]);

  useEffect(() => {
    setTracks(null);
    load();
  }, [load]);

  async function update(id, body) {
    setBusy(id);
    const r = await fetch(`/api/tracks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) load();
    return r.ok ? { ok: true } : { ok: false, error: j.error || "Couldn't save.", needsConfirm: !!j.needsConfirm };
  }

  function startNote(t) {
    setNoteFor(t.id);
    setNoteText(t.note ?? "");
  }

  async function saveNote(id) {
    await update(id, { note: noteText });
    setNoteFor(null);
  }

  async function removeTrack(id) {
    setBusy(id);
    const r = await fetch(`/api/tracks/${id}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) {
      setConfirmDelete(null);
      load();
    }
  }

  function openDone(t) {
    setDoneTrack(t);
    setDoneLink(t.beatmapset_id ? `https://osu.ppy.sh/beatmapsets/${t.beatmapset_id}` : "");
    setDoneMsg(null);
    setNeedConfirm(false);
    setConfirmed(false);
  }

  async function confirmDone() {
    const res = await update(doneTrack.id, { track_status: "done", link: doneLink.trim(), confirm: confirmed });
    if (!res.ok) {
      setDoneMsg(res.error);
      if (res.needsConfirm) setNeedConfirm(true);
      return;
    }
    setDoneTrack(null);
    setDoneLink("");
    setNeedConfirm(false);
    setConfirmed(false);
  }

  async function addTrack() {
    setAddMsg(null);

    const body =
      mode === "link"
        ? {
            items: rows
              .filter((r) => r.link.trim())
              .map((r) => ({ link: r.link.trim(), diff_name: r.diff })),
            requester_name: form.requester_name,
            note: form.note,
            track_status: form.status,
          }
        : { ...form, track_status: form.status };

    if (mode === "link" && body.items.length === 0) {
      setAddMsg("Paste at least one beatmap link.");
      return;
    }

    const r = await fetch("/api/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) {
      setAddMsg(j.error || "Couldn't add the track.");
      return;
    }

    if (mode === "link" && j.failed?.length) {
      setAddMsg(`Added ${j.added}, failed ${j.failed.length}: ${j.failed[0].error}`);
      load();
      return;
    }

    setAdding(false);
    setForm({ artist: "", title: "", diff_name: "", link: "", requester_name: "", note: "", status: "accepted" });
    setRows([{ link: "", diff: "insane" }]);
    load();
  }

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>GD track</h1>
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

  const restoreTrack = (id) => update(id, { track_status: "accepted" }).then(() => setConfirmRestore(null));

  const boardColumn = (title, keys) => {
    const rows = tracks.filter((t) => keys.includes(t.track_status));
    return (
      <section className={`${panel} mt-0`} key={title}>
        <h2 className={panelH2}>
          {title} <span className="text-xs font-normal text-muted">{rows.length}</span>
        </h2>
        {rows.length === 0 ? (
          <p className={`${muted} m-0 text-xs`}>Nothing here.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{rows.map(card)}</ul>
        )}
      </section>
    );
  };

  const card = (t) => (
    <li className="rounded border border-line bg-panel2/40 p-2.5" key={t.id}>
      <div className="flex gap-2.5">
        <Cover id={t.beatmapset_id} />
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <ModeIcon mode={t.game_mode} className="h-3.5 w-3.5" />
            {t.beatmapset_id ? (
              <a
                className={MAP_TITLE_LINK}
                href={`https://osu.ppy.sh/beatmapsets/${t.beatmapset_id}`}
                target="_blank"
                rel="noreferrer"
              >
                {t.title}
              </a>
            ) : (
              <span className={MAP_TITLE}>{t.title}</span>
            )}
          </span>
          <span className="block text-xs text-muted">
            {t.beatmapset_id ? t.artist : `${t.artist} · ${t.diff_name}`}
          </span>
          {t.requester_name && <span className="block text-xs text-muted">for {t.requester_name}</span>}
        </div>
      </div>

      {noteFor === t.id ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <textarea
            className={`${input} min-h-[60px] resize-y p-2 text-xs leading-relaxed`}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            aria-label={`Note for ${t.title}`}
          />
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => saveNote(t.id)} disabled={busy === t.id}>
              Save
            </button>
            <button className={btnGhost} onClick={() => setNoteFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {t.note && <p className="m-0 whitespace-pre-wrap text-xs text-muted">{t.note}</p>}
          {isOwner && (
            <button className={LINK_BTN} onClick={() => startNote(t)}>
              {t.note ? "Edit note" : "Add note"}
            </button>
          )}
        </div>
      )}

      {isOwner && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className={`${inputFit} px-2 py-1`}
            value={t.track_status}
            onChange={(e) => update(t.id, { track_status: e.target.value })}
            disabled={busy === t.id}
            aria-label={`Status for ${t.title}`}
          >
            {!CHOICES.some(([v]) => v === t.track_status) && <option value={t.track_status}>{t.track_status}</option>}
            {CHOICES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button className={btnGhost} onClick={() => openDone(t)} disabled={busy === t.id}>
            Done
          </button>
        </div>
      )}
    </li>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={h1}>GD track</h1>
          <p className={muted}>
            {!tracks
              ? "Loading."
              : tab === "history"
                ? `${total} finished ${total === 1 ? "map" : "maps"}.`
                : `${total} ${total === 1 ? "map" : "maps"} on the board. Done maps move to the log.`}
          </p>
        </div>
        {me?.role === "admin" && tracks !== null && !isPrivate(error) && <CopyLink />}
      </div>

      <div className="mt-4 mb-4 flex gap-2">
        <button
          className={tab === "board" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
          onClick={() => {
            setTab("board");
            setPage(0);
          }}
        >
          Board
        </button>
        <button
          className={tab === "history" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
          onClick={() => {
            setTab("history");
            setPage(0);
          }}
        >
          History
        </button>
        {isOwner && tab === "board" && (
          <button className={`${btnGhost} ml-auto text-white`} onClick={() => setAdding(true)}>
            Add track
          </button>
        )}
      </div>

      {!tracks ? null : tracks.length === 0 ? (
        <div className="rounded-lg border border-line bg-panel p-6">
          <p className={emptyTitle}>{tab === "history" ? "Nothing finished yet" : "Nothing in progress"}</p>
          <p className={muted}>
            {tab === "history" ? (
              "Maps show up here once you mark them done or drop them."
            ) : isOwner ? (
              REQUESTS_ON ? <Link to="/requests">Accept a request to start one.</Link> : "Requests are not open yet."
            ) : (
              "The board is empty."
            )}
          </p>
        </div>
      ) : tab === "history" ? (
        <section className={`${panel} mt-0`}>
          <ul className="m-0 list-none p-0">
            {tracks.map((t) => (
              <li className={TRACK_ROW} key={t.id}>
                <div className={TRACK_MAIN}>
                  <Cover id={t.beatmapset_id} />
                  <div className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <ModeIcon mode={t.game_mode} className="h-3.5 w-3.5" />
                      <a
                        className={MAP_TITLE_LINK}
                        href={`https://osu.ppy.sh/beatmapsets/${t.beatmapset_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.title}
                      </a>
                    </span>
                    <span className="block text-xs text-muted">
                      {t.artist} · {t.diff_name}
                      {t.requester_name ? ` · for ${t.requester_name}` : ""}
                    </span>
                  </div>
                </div>
                <div className={TRACK_ACTIONS}>
                  <span className="font-mono text-xs text-muted">{shortDate(t.done_at || t.updated_at)}</span>
                  <span className={t.track_status === "done" ? statusChip("done") : chip}>{t.track_status}</span>

                  {isOwner &&
                    (confirmRestore === t.id ? (
                      <span className="flex items-center gap-2 text-xs text-muted">
                        Bring back?
                        <button className={LINK_BTN} onClick={() => restoreTrack(t.id)} disabled={busy === t.id}>
                          Yes
                        </button>
                        <button className={LINK_BTN} onClick={() => setConfirmRestore(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button className={LINK_BTN} onClick={() => setConfirmRestore(t.id)}>
                        Bring back
                      </button>
                    ))}

                  {isOwner &&
                    (confirmDelete === t.id ? (
                      <span className="flex items-center gap-2 text-xs text-muted">
                        Delete?
                        <button className={LINK_BTN} onClick={() => removeTrack(t.id)} disabled={busy === t.id}>
                          Yes
                        </button>
                        <button className={LINK_BTN} onClick={() => setConfirmDelete(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button className={LINK_BTN} onClick={() => setConfirmDelete(t.id)}>
                        Delete
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-4 grid grid-cols-2 items-start gap-4 max-[900px]:grid-cols-1">
          <div className={COLUMN}>
            {boardColumn("Accepted (High Priority)", ["priority"])}
            {boardColumn("Accepted", ["accepted", "queued"])}
          </div>
          <div className={COLUMN}>
            {boardColumn("In Progress", ["in_progress", "on_hold"])}
          </div>
        </div>
      )}

      {total > PAGE && tracks && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pager">
          <button className={btnGhost} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className={muted}>
            Page {page + 1} of {Math.ceil(total / PAGE)}
          </span>
          <button className={btnGhost} disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </nav>
      )}

      {adding && (
        <>
          <div className={SCRIM} onClick={() => setAdding(false)} />
          <div ref={addRef} className={MODAL} role="dialog" aria-modal="true" aria-labelledby="add-track">
            <div className={MODAL_HEAD}>
              <h2 className={MODAL_TITLE} id="add-track">
                Add track
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5" role="group" aria-label="Input mode">
                  <button
                    type="button"
                    className={mode === "manual" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                    aria-pressed={mode === "manual"}
                    onClick={() => setMode("manual")}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={mode === "link" ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
                    aria-pressed={mode === "link"}
                    onClick={() => setMode("link")}
                  >
                    Beatmap
                  </button>
                </div>
                <button className={btnGhost} onClick={() => setAdding(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {mode === "manual" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={FIELD}>
                      Artist
                      <input className={input} value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
                    </label>
                    <label className={FIELD}>
                      Title
                      <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </label>
                  </div>
                  <label className={FIELD}>
                    Difficulty
                    <input
                      className={input}
                      value={form.diff_name}
                      onChange={(e) => setForm({ ...form, diff_name: e.target.value })}
                      placeholder="Mana's Insane"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className={FIELD}>
                    Beatmap links
                    {rows.map((row, i) => (
                      <div className="flex flex-col gap-2 sm:flex-row" key={i}>
                        <input
                          className={`${input} min-w-0 flex-1`}
                          value={row.link}
                          onChange={(e) =>
                            setRows((prev) => prev.map((r, j) => (j === i ? { ...r, link: e.target.value } : r)))
                          }
                          placeholder="https://osu.ppy.sh/beatmapsets/..."
                          aria-label={`Beatmap link ${i + 1}`}
                        />
                        <select
                          className={inputFit}
                          value={row.diff}
                          onChange={(e) =>
                            setRows((prev) => prev.map((r, j) => (j === i ? { ...r, diff: e.target.value } : r)))
                          }
                          aria-label={`Difficulty for link ${i + 1}`}
                        >
                          {DIFFS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                            aria-label={`Remove link ${i + 1}`}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className={`${btnGhost} mt-1 self-start`}
                      onClick={() => setRows((prev) => [...prev, { link: "", diff: "insane" }])}
                    >
                      Add another link
                    </button>
                  </div>
                </>
              )}
              <label className={FIELD}>
                Status
                <select
                  className={inputFit}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {CHOICES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD}>
                Requester, optional
                <input
                  className={input}
                  value={form.requester_name}
                  onChange={(e) => setForm({ ...form, requester_name: e.target.value })}
                />
              </label>
              <label className={FIELD}>
                Note, optional
                <textarea
                  className={`${input} min-h-[64px] resize-y p-2.5 font-mono text-xs leading-relaxed`}
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btn} onClick={addTrack}>
                Add
              </button>
              <Status className={muted}>{addMsg}</Status>
            </div>
          </div>
        </>
      )}

      {doneTrack && (
        <>
          <div className={SCRIM} onClick={() => setDoneTrack(null)} />
          <div ref={doneRef} className={MODAL} role="dialog" aria-modal="true" aria-labelledby="done-title">
            <div className={MODAL_HEAD}>
              <h2 className={MODAL_TITLE} id="done-title">
                Mark done
              </h2>
              <button className={btnGhost} onClick={() => setDoneTrack(null)}>
                Close
              </button>
            </div>

            <p className={muted}>
              {doneTrack.title} · {doneTrack.diff_name}
            </p>

            <div className="mt-3 flex flex-col gap-2">
              {doneTrack.beatmapset_id ? (
                <p className={muted}>
                  Uses the beatmap already linked to this track.
                  {doneTrack.beatmap_id ? "" : " The difficulty is picked for you."}
                </p>
              ) : (
              <label className={FIELD}>
                Beatmap link
                <input
                  className={input}
                  value={doneLink}
                  onChange={(e) => {
                    setDoneLink(e.target.value);
                    setNeedConfirm(false);
                    setConfirmed(false);
                    setDoneMsg(null);
                  }}
                  placeholder="https://osu.ppy.sh/beatmapsets/..."
                  aria-label="Beatmap link"
                />
                <span className="text-xs text-muted">Required. Status and star rating come from osu.</span>
              </label>
              )}

              {needConfirm && (
                <label className="inline-flex items-start gap-1.5 text-xs text-muted">
                  <input
                    className="mt-0.5 h-4 w-4 flex-none accent-accent"
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  yes, this is my own gd and not other user
                </label>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={btn}
                onClick={confirmDone}
                disabled={
                  busy === doneTrack.id ||
                  (!doneTrack.beatmapset_id && !doneLink.trim()) ||
                  (needConfirm && !confirmed)
                }
              >
                {busy === doneTrack.id ? "Saving" : "Mark done"}
              </button>
              <Status className={muted}>{doneMsg}</Status>
            </div>
          </div>
        </>
      )}
    </>
  );
}
