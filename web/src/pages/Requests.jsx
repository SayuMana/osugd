import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDialog } from "../lib/useDialog.js";
import Status from "../components/Status.jsx";
import { TAB, TAB_OFF, TAB_ON, btn, btnDanger, btnGhost, chip, empty, emptyTitle, h1, input, inputNarrow, muted, panel, panelH2, statusChip } from "../ui.js";
import ModeIcon from "../components/ModeIcon.jsx";

const STATUS_LABEL = {
  pending: "pending",
  accepted: "accepted",
  in_progress: "in progress",
  done: "done",
  on_hold: "in consideration",
  rejected: "rejected",
};

const FIELD = "flex flex-col gap-1 text-xs text-muted";
const ACTIONS = "flex flex-wrap items-center gap-2.5";
const SETTING = "flex items-start gap-2.5 py-[7px]";
const REQ_LIST = "m-0 list-none p-0";
const REQ_BODY = "flex min-w-0 flex-col gap-[3px]";
const REQ_BODY_DENSE = "flex min-w-0 flex-wrap items-baseline gap-x-2.5";
const FACTS = "dot-sep flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted";
const REQ_ROW = "-mx-3 flex items-start justify-between gap-3 rounded border border-line px-3 py-2.5 max-sm:flex-col max-sm:gap-1.5";
const REQ_ROW_DENSE = "flex items-center justify-between gap-3 border-b border-line py-1.5 max-sm:flex-col max-sm:gap-1";
const BTN_ROW = "cover-tint flex w-full cursor-pointer items-start justify-between gap-3 rounded border border-line bg-transparent px-3 py-2.5 text-left text-inherit hover:bg-panel2";
const BTN_ROW_DENSE = "flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line bg-transparent py-1.5 text-left text-inherit hover:bg-panel2";
const COUNT = "text-xs font-normal text-muted";
const MAP_TITLE_LINK = "block underline decoration-muted underline-offset-2 hover:text-accent hover:decoration-accent";
const TEXTAREA = `${input} min-h-[84px] resize-y p-2.5 font-mono text-xs leading-relaxed`;

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Facts({ children }) {
  return <span className={FACTS}>{children}</span>;
}

const cover = (id) => `url(https://assets.ppy.sh/beatmaps/${id}/covers/list.jpg)`;

export default function Requests({ me }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [dense, setDense] = useState(false);

  const isOwner = !!me;

  const reqRef = useDialog(!!selected, () => setSelected(null));

  const load = useCallback(async () => {
    const r = await fetch("/api/requests");
    const j = await r.json();
    if (!r.ok) {
      setError(j.error || "Couldn't load the queue.");
      return;
    }
    setData(j);
  }, []);

  useEffect(() => {
    load();
    if (isOwner) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then(setSettings)
        .catch(() => null);
    }
  }, [load, isOwner]);

  async function saveQueue() {
    setSaveMsg(null);
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queue_open: !!settings.queue_open,
        cooldown_days: Number(settings.cooldown_days),
        max_active: Number(settings.max_active),
        rules_md: settings.rules_md || "",
      }),
    });
    setSaveMsg(r.ok ? "Saved." : "Couldn't save.");
    if (r.ok) load();
  }

  async function act(action) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/requests/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMsg(j.error || "Failed.");
      return;
    }
    setSelected(null);
    setReason("");
    load();
  }

  async function restore(id) {
    await fetch(`/api/requests/${id}/restore`, { method: "POST" });
    load();
  }

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>Requests</h1>
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
          <h1 className={h1}>Requests</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const free = Math.max(0, Number(settings?.max_active ?? data.slots.max) - data.slots.used);

  return (
    <>
      <div>
        <h1 className={h1}>Requests</h1>
        <p className={muted}>
          {data.requests.length} {data.requests.length === 1 ? "request" : "requests"} in the queue, {free}{" "}
          {free === 1 ? "slot" : "slots"} free.
        </p>
      </div>

      {isOwner && settings && (
        <section className={`${panel} mt-4`}>
          <h2 className={panelH2}>Queue</h2>
          <label className={SETTING}>
            <input
              className="mt-0.5 h-4 w-4 flex-none accent-accent"
              type="checkbox"
              checked={!!settings.queue_open}
              onChange={(e) => setSettings({ ...settings, queue_open: e.target.checked })}
            />
            <span className="flex flex-col gap-px">
              <span className="text-13">Queue is open</span>
              <span className="text-xs text-muted">Turn off to stop new requests.</span>
            </span>
          </label>

          <div className="mt-3 flex flex-wrap gap-3.5">
            <label className={FIELD}>
              Cooldown, days
              <input
                className={inputNarrow}
                type="number"
                min="0"
                max="30"
                value={settings.cooldown_days}
                onChange={(e) => setSettings({ ...settings, cooldown_days: e.target.value })}
              />
              <span className="text-xs text-muted">0 means no cooldown.</span>
            </label>
            <label className={FIELD}>
              Active slots
              <input
                className={inputNarrow}
                type="number"
                min="1"
                max="10"
                value={settings.max_active}
                onChange={(e) => setSettings({ ...settings, max_active: e.target.value })}
              />
              <span className="text-xs text-muted">
                {free} free of {settings.max_active}. Requests stop when full.
              </span>
            </label>
          </div>

          <label className={`${FIELD} mt-3`}>
            Rules, shown before someone can send a request
            <textarea
              className={TEXTAREA}
              rows={4}
              value={settings.rules_md || ""}
              onChange={(e) => setSettings({ ...settings, rules_md: e.target.value })}
            />
          </label>

          <div className={`${ACTIONS} mt-4`}>
            <button className={btn} onClick={saveQueue}>
              Save queue
            </button>
            <Status className={muted}>{saveMsg}</Status>
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Row density">
        <button
          className={dense ? `${TAB} ${TAB_OFF}` : `${TAB} ${TAB_ON}`}
          aria-pressed={!dense}
          onClick={() => setDense(false)}
        >
          Cards
        </button>
        <button
          className={dense ? `${TAB} ${TAB_ON}` : `${TAB} ${TAB_OFF}`}
          aria-pressed={dense}
          onClick={() => setDense(true)}
        >
          Table
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 items-stretch gap-4 max-[900px]:grid-cols-1">
        <section className={panel}>
          <h2 className={panelH2}>
            Your requests <span className={COUNT}>{data.mine.length}</span>
          </h2>
          {data.mine.length === 0 ? (
            <p className={muted}>{me ? "You have not requested a GD yet." : "Log in to send and track requests."}</p>
          ) : (
            <ul className={REQ_LIST}>
              {data.mine.map((r) => (
                <li className={dense ? REQ_ROW_DENSE : `${REQ_ROW} cover-tint`} key={r.id} style={{ "--cover": cover(r.beatmapset_id) }}>
                  <div className={dense ? REQ_BODY_DENSE : REQ_BODY}>
                    <span className="flex items-center gap-1.5">
                      <ModeIcon mode={r.game_mode} className="h-3.5 w-3.5" />
                      <a
                        className={MAP_TITLE_LINK}
                        href={`https://osu.ppy.sh/beatmapsets/${r.beatmapset_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.title}
                      </a>
                    </span>
                    <Facts>
                      <span>{r.artist}</span>
                      <span>{r.requested_diff}</span>
                      <span>to {data.owner}</span>
                      <span className="font-mono text-xs">{when(r.created_at)}</span>
                    </Facts>
                    {r.archived_reason && <span className="text-xs text-muted">{r.archived_reason}</span>}
                  </div>
                  <span className={statusChip(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={panel}>
          <h2 className={panelH2}>
            {isOwner ? "Incoming" : "Queue"} <span className={COUNT}>{data.requests.length}</span>
          </h2>
          {data.requests.length === 0 ? (
            <p className={muted}>Nothing waiting.</p>
          ) : (
            <ul className={REQ_LIST}>
              {data.requests.map((r) => (
                <li className={dense ? "" : "-mx-3"} key={r.id}>
                  <button
                    className={dense ? BTN_ROW_DENSE : BTN_ROW}
                    style={{ "--cover": cover(r.beatmapset_id) }}
                    onClick={() => {
                      setSelected(r);
                      setReason("");
                      setMsg(null);
                    }}
                  >
                    <div className={dense ? REQ_BODY_DENSE : REQ_BODY}>
                      <span className="flex items-center gap-1.5">
                        <ModeIcon mode={r.game_mode} className="h-3.5 w-3.5" />
                        <span className="block">{r.title}</span>
                      </span>
                      <Facts>
                        <span>{r.artist}</span>
                        <span>{r.requested_diff}</span>
                        <span>
                          from{" "}
                          <Link className="text-muted underline decoration-line underline-offset-2 hover:text-accent" to={`/u/${encodeURIComponent(r.requester && r.requester !== "someone" ? r.requester : r.requester_id)}`}>
                            {r.requester}
                          </Link>
                        </span>
                        <span className="font-mono text-xs">{when(r.created_at)}</span>
                      </Facts>
                    </div>
                    <span className={statusChip(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isOwner && data.archived.length > 0 && (
        <section className={`${panel} mt-4 bg-panel2`}>
          <h2 className={panelH2}>
            Archived <span className={COUNT}>{data.archived.length}</span>
          </h2>
          <ul className={REQ_LIST}>
            {data.archived.map((r) => (
              <li className={dense ? REQ_ROW_DENSE : `${REQ_ROW} cover-tint`} key={r.id} style={{ "--cover": cover(r.beatmapset_id) }}>
                <div className={dense ? REQ_BODY_DENSE : REQ_BODY}>
                  <a
                    className={MAP_TITLE_LINK}
                    href={`https://osu.ppy.sh/beatmapsets/${r.beatmapset_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.title}
                  </a>
                  <Facts>
                    <span>{r.artist}</span>
                    <span>{r.requested_diff}</span>
                    <span>to {data.owner}</span>
                    <span className="font-mono text-xs">{when(r.archived_at)}</span>
                  </Facts>
                  {r.archived_reason && <span className="text-xs text-muted">{r.archived_reason}</span>}
                </div>
                <button
                  className="min-h-6 cursor-pointer border-0 bg-transparent p-0 text-xs text-muted underline decoration-muted underline-offset-2 hover:text-accent"
                  onClick={() => restore(r.id)}
                >
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-[rgba(10,6,16,0.6)]" onClick={() => setSelected(null)} />
          <div
            ref={reqRef}
            className="fixed inset-0 z-50 m-auto h-fit w-[min(560px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-auto rounded-lg border border-line bg-panel p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="req-title"
          >
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <h2 className="m-0 text-base font-semibold" id="req-title">
                {selected.title}
              </h2>
              <button className={btnGhost} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <a
              className="group block text-inherit no-underline"
              href={`https://osu.ppy.sh/beatmapsets/${selected.beatmapset_id}`}
              target="_blank"
              rel="noreferrer"
            >
              <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                <img
                  className="h-10 w-10 flex-none rounded object-cover bg-panel2"
                  src={`https://assets.ppy.sh/beatmaps/${selected.beatmapset_id}/covers/list.jpg`}
                  alt=""
                  width="48"
                  height="48"
                />
                <div>
                  <p className="m-0 mb-0.5 font-medium group-hover:text-accent group-hover:underline">
                    {selected.title}
                  </p>
                  <p className={muted}>{selected.artist}</p>
                  <p className={muted}>
                    host {selected.host} · wants {selected.requested_diff} · from {selected.requester}
                  </p>
                </div>
              </div>
            </a>

            {selected.note && (
              <p className="mt-3 mb-0 border-l-2 border-line bg-panel2 px-3 py-2.5 text-13 whitespace-pre-wrap">
                {selected.note}
              </p>
            )}

            {isOwner && (
              <>
                <label className={`${FIELD} mt-3`}>
                  Reject reason, optional
                  <input
                    className={input}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why this request is being rejected or put on hold"
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={btn} onClick={() => act("accept")} disabled={busy}>
                    Accept
                  </button>
                  <button className={btnGhost} onClick={() => act("consider")} disabled={busy}>
                    In consideration
                  </button>
                  <button className={btnDanger} onClick={() => act("reject")} disabled={busy}>
                    Reject
                  </button>
                </div>
                <Status as="p" className={`${muted} mt-2`}>{msg}</Status>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
