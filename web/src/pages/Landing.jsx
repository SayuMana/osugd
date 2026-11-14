import { btn, h1, muted } from "../ui.js";

export default function Landing() {
  return (
    <>
      <div>
        <h1 className={h1}>Guest difficulty log</h1>
        <p className={muted}>
          A log of guest difficulties: the map each one went on, its status, and its star rating.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <a className={btn} href="/api/auth/login">
          Log in with osu!
        </a>
      </div>
    </>
  );
}
  