import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { btn, btnGhost, h1, input, muted } from "../ui.js";
import Status from "../components/Status.jsx";
import { MODES } from "../lib/mode.js";

const DIFFS = ["easy", "normal", "hard", "insane", "extra", "top diff"];

const FIELD = "flex flex-col gap-1 text-xs text-muted";
const ACTIONS = "flex flex-wrap items-center gap-2.5";

export default function Request({ me }) {
  const [queue, setQueue] = useState(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [diff, setDiff] = useState("insane");
  const [mode, setMode] = useState("osu");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((j) => setQueue(j.queue))
      .catch(() => setQueue({ open: true }));
  }, []);

  if (!me) {
    return (
      <>
        <div>
          <h1 className={h1}>Request a GD</h1>
          <p className={muted}>Log in with osu! before sending a request.</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <a className={btn} href="/api/auth/login">
            Log in with osu!
          </a>
        </div>
      </>
    );
  }

  async function check(e) {
    e.preventDefault();
    setChecking(true);
    setMsg(null);
    setPreview(null);
    const r = await fetch(`/api/request/resolve?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    setChecking(false);
    if (!r.ok) {
      setMsg(j.error || "Couldn't read that link.");
      return;
    }
    setPreview(j);
    if (j.mode) setMode(j.mode);
  }

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setMsg(null);
    const r = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        beatmapset_id: preview.beatmapset_id,
        beatmap_id: preview.diffs[0]?.id,
        requested_diff: diff,
        mode,
        note,
        rules_accepted: accepted,
      }),
    });
    const j = await r.json();
    setSending(false);
    if (!r.ok) {
      setMsg(j.error || "Couldn't send the request.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <div>
          <h1 className={h1}>Request sent</h1>
          <p className={muted}>It's in the queue. You can follow it on the requests page.</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link className={btn} to="/requests">
            See the queue
          </Link>
        </div>
      </>
    );
  }

  if (queue && queue.open === false) {
    return (
      <>
        <div>
          <h1 className={h1}>Request a GD</h1>
          <p className={muted}>The queue is closed right now. Check back later.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className={h1}>Request a GD</h1>
        <p className={muted}>Paste the beatmap link, pick the difficulty you want, and say what you need.</p>
      </div>

      <form className="mt-5 flex max-w-[560px] flex-col gap-4" onSubmit={preview ? submit : check}>
        <label className={FIELD}>
          Beatmap link
          <div className="flex gap-2">
            <input
              className={`${input} min-w-0 flex-1`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://osu.ppy.sh/beatmapsets/..."
              aria-label="Beatmap link"
            />
            <button className={btnGhost} type="button" onClick={check} disabled={checking || !url.trim()}>
              {checking ? "Checking" : "Check"}
            </button>
          </div>
        </label>

        {preview && (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
            <img
              className="h-10 w-10 flex-none rounded object-cover bg-panel2"
              src={`https://assets.ppy.sh/beatmaps/${preview.beatmapset_id}/covers/list.jpg`}
              alt=""
              width="48"
              height="48"
            />
            <div>
              <p className="m-0 mb-0.5 font-medium">{preview.title}</p>
              <p className={muted}>
                {preview.artist} · host {preview.host} · {preview.status}
              </p>
              <p className={muted}>{preview.diffs.length} difficulties in this set</p>
            </div>
          </div>
        )}

        <label className={FIELD}>
          Mode
          <select className={input} value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          Difficulty you want
          <select className={input} value={diff} onChange={(e) => setDiff(e.target.value)}>
            {DIFFS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <div className={FIELD}>
          Note, optional
          <textarea
            className={`${input} min-h-[84px] resize-y p-2.5 font-mono text-xs leading-relaxed`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Anything I should know: mods, timing, deadline."
          />
        </div>

        {queue?.rules ? (
          <div className="rounded-lg border border-line bg-panel p-3">
            <p className="m-0 mb-1.5 text-13 font-semibold">Rules</p>
            <p className="m-0 mb-2.5 text-13 text-muted whitespace-pre-wrap">{queue.rules}</p>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              I read the rules
            </label>
          </div>
        ) : null}

        <div className={ACTIONS}>
          <button className={btn} disabled={!preview || sending || (queue?.rules && !accepted)}>
            {sending ? "Sending" : "Send request"}
          </button>
          <Status className={muted}>{msg}</Status>
        </div>
      </form>
    </>
  );
}
