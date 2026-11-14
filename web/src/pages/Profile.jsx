import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { btn, btnGhost, empty, emptyTitle, h1, muted, panel, panelH2, statusChip } from "../ui.js";
import ModeIcon from "../components/ModeIcon.jsx";

const TILE = "min-w-0 p-3.5";
const NUM = "block font-mono text-xl font-medium leading-tight";
const LABEL = "block text-xs text-muted";
const ROW =
  "flex flex-col gap-1 border-b border-line py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3";

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Profile() {
  const { osuId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUser(null);
    setEntries(null);
    setError(null);

    fetch(`/api/users/${encodeURIComponent(osuId)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this profile.");
        setUser(j.user);
        if (!j.log_public) return setEntries([]);

        const g = await fetch("/api/gd");
        const gj = await g.json();
        if (!g.ok) return setEntries([]);
        // log milik owner: semuanya. profil orang lain: GD yang dibuat untuk mereka.
        const all = gj.entries || [];
        setEntries(j.user.role === "admin" ? all : all.filter((e) => e.host === j.user.username));
      })
      .catch((e) => setError(e.message));
  }, [osuId]);

  // id angka dialihkan ke username biar link yang dibagikan kebaca
  useEffect(() => {
    if (!user?.username) return;
    if (osuId.toLowerCase() !== user.username.toLowerCase()) {
      navigate(`/u/${encodeURIComponent(user.username)}`, { replace: true });
    }
  }, [user, osuId, navigate]);

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>Profile</h1>
        </div>
        <div className={empty}>
          <p className={emptyTitle}>{error}</p>
        </div>
      </>
    );
  }

  if (!user || entries === null) {
    return (
      <>
        <div>
          <h1 className={h1}>Profile</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const name = user.username;
  const month = new Date().toISOString().slice(0, 7);
  const total = entries.length;
  const ranked = entries.filter((e) => e.map_status === "ranked").length;
  const thisMonth = entries.filter((e) => String(e.gd_date || "").startsWith(month)).length;
  const stars = entries.map((e) => Number(e.star_rating)).filter((n) => Number.isFinite(n) && n > 0);
  const avg = stars.length ? (stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2) : null;
  const recent = [...entries]
    .sort((a, b) => String(b.gd_date || "").localeCompare(String(a.gd_date || "")))
    .slice(0, 5);

  return (
    <>
      <div className="flex items-center gap-3">
        {user.avatar_url && (
          <img
            className="h-10 w-10 flex-none rounded bg-panel2 object-cover"
            src={user.avatar_url}
            alt=""
            width="40"
            height="40"
          />
        )}
        <div>
          <h1 className={h1}>{name}</h1>
          <p className={muted}>{user.role === "admin" ? "Owner" : "Requester"}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-panel sm:grid-cols-4 sm:divide-x sm:divide-line">
        <div className={TILE}>
          <span className={NUM}>{total}</span>
          <span className={LABEL}>guest difficulties</span>
        </div>
        <div className={TILE}>
          <span className={NUM}>{ranked}</span>
          <span className={LABEL}>ranked</span>
        </div>
        <div className={TILE}>
          <span className={NUM}>+{thisMonth}</span>
          <span className={LABEL}>this month</span>
        </div>
        <div className={TILE}>
          <span className={NUM}>{avg ?? "n/a"}</span>
          <span className={LABEL}>average star</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link className={btn} to={`/u/${encodeURIComponent(name)}/log`}>
          See the GD log
        </Link>
        <Link className={btnGhost} to={`/u/${encodeURIComponent(name)}/track`}>
          See the track board
        </Link>
      </div>

      <section className={`${panel} mt-4`}>
        <h2 className={panelH2}>Recent GDs</h2>
        {total === 0 ? (
          <p className={muted}>Nothing in the log for this name yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {recent.map((e) => (
              <li className={ROW} key={e.id}>
                <span className="flex min-w-0 items-center gap-2">
                  <ModeIcon mode={e.game_mode} />
                  <a
                    className="min-w-0 text-ink no-underline hover:text-accent"
                    href={`https://osu.ppy.sh/beatmapsets/${e.beatmapset_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="block truncate">{e.title}</span>
                    <span className="block text-xs text-muted">
                      {e.artist} · {e.diff_name}
                    </span>
                  </a>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">{shortDate(e.gd_date)}</span>
                  <span className={statusChip(e.map_status)}>{e.map_status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
