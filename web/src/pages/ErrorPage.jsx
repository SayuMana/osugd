import { btn, h1, muted } from "../ui.js";

export default function ErrorPage({ error }) {
  return (
    <>
      <div>
        <h1 className={h1}>Something broke</h1>
        <p className={muted}>
          The page stopped working. Reloading usually fixes it. If it keeps happening, the server
          may be down.
        </p>
      </div>

      {error?.message && (
        <p className="mt-4 rounded-lg border border-line bg-panel px-4 py-3 font-mono text-xs text-muted">
          {error.message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2.5">
        <button className={btn} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </>
  );
}
