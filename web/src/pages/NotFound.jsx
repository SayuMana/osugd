import { Link } from "react-router-dom";
import { btn, btnGhost, empty, emptyTitle, h1, muted } from "../ui.js";

export default function NotFound() {
  return (
    <>
      <div>
        <h1 className={h1}>Page not found</h1>
        <p className={muted}>There's no page at this address.</p>
      </div>

      <div className={empty}>
        <p className={emptyTitle}>Nothing to show here</p>
        <p className={muted}>Check the link you followed, or start again from the log.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link className={btn} to="/log">
            Browse the GD log
          </Link>
          <Link className={btnGhost} to="/">
            Back to the start
          </Link>
        </div>
      </div>
    </>
  );
}
