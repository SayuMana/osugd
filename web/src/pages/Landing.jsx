import { Link } from "react-router-dom";
import { btn, btnGhost, h1, muted, possessive } from "../ui.js";

export default function Landing({ site }) {
  const owner = site?.owner;
  return (
    <>
      <div>
        <h1 className={h1}>Guest difficulty log</h1>
        <p className={muted}>
          A log of guest difficulties: the map each one went on, its status, and its star rating.
        </p>
        {owner && site?.gds ? (
          <p className={muted}>{site.gds} GDs logged so far.</p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <a className={btn} href="/api/auth/login">
          Log in with osu!
        </a>
        {owner && (
          <Link className={btnGhost} to={`/u/${encodeURIComponent(owner)}`}>
            View {possessive(owner)} log
          </Link>
        )}
      </div>
    </>
  );
}
  