import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { btnGhost, empty, emptyTitle, h1, muted, panel, panelH2, statusChip } from "../ui.js";
import { REQUESTS_ON } from "../lib/features.js";

const PAGE = 20;
const cover = (id) => `https://assets.ppy.sh/beatmaps/${id}/covers/list.jpg`;
const ROW = "flex flex-col gap-1.5 border-b border-line py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3";

function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Row({ href, title, sub, status, right }) {
  return (
    <li className={ROW}>
      <div className="flex min-w-0 items-center gap-2.5">
        {href && <img className="h-10 w-10 flex-none rounded object-cover bg-panel2" src={cover(href)} alt="" width="40" height="40" loading="lazy" />}
        <div className="min-w-0">
          <span className="block truncate">{title}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {right}
        {status}
      </div>
    </li>
  );
}

export default function Profile() {
  const { osuId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [osuId]);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/users/${encodeURIComponent(osuId)}?page=${page}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this profile.");
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, [osuId, page]);

  if (error) {
    return (
      <>
        <div>
          <h1 className={h1}>Profile</h1>
        </div>
        <div className={empty}>
          <p className={emptyTitle}>{error}</p>
          <p className={muted}>
            <Link to="/log">Back to the GD log</Link>
          </p>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div>
          <h1 className={h1}>Profile</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const { user, gds, requests } = data;
  const isOwnerProfile = user.role === "admin";
  const roleLabel = isOwnerProfile ? "Owner" : "Requester";

  return (
    <>
      <div className="flex items-center gap-3">
        {user.avatar_url && (
          <img className="h-10 w-10 flex-none rounded object-cover bg-panel2" src={user.avatar_url} alt="" width="40" height="40" />
        )}
        <div>
          <h1 className={h1}>{user.username}</h1>
          <p className={muted}>
            {roleLabel} ·{" "}
            {data.log_public ? `${data.gds_total} GDs${isOwnerProfile ? "" : " mapped for them"}` : "GD log private"} ·{" "}
            {requests.length} requests
          </p>
        </div>
      </div>

      <section className={`${panel} mt-4`}>
        <h2 className={panelH2}>{isOwnerProfile ? "GD log" : `GDs mapped for ${user.username}`}</h2>
        {!data.log_public && gds.length === 0 ? (
          <p className={muted}>The GD log is private right now.</p>
        ) : gds.length === 0 ? (
          <p className={muted}>No GDs mapped for this mapper yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {gds.map((e) => (
              <Row
                key={e.id}
                href={e.beatmapset_id}
                title={e.title}
                sub={`${e.artist} · ${e.diff_name}`}
                right={
                  <>
                    <span className="font-mono text-xs text-muted">
                      {e.star_rating != null ? Number(e.star_rating).toFixed(2) : "n/a"}
                    </span>
                    <span className="font-mono text-xs text-muted">{shortDate(e.gd_date)}</span>
                  </>
                }
                status={<span className={statusChip(e.map_status)}>{e.map_status}</span>}
              />
            ))}
          </ul>
        )}
      </section>

      {data.gds_total > PAGE && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="GD pages">
          <button className={btnGhost} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className={muted}>
            Page {page + 1} of {Math.ceil(data.gds_total / PAGE)}
          </span>
          <button className={btnGhost} disabled={(page + 1) * PAGE >= data.gds_total} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </nav>
      )}

      {REQUESTS_ON && (
      <section className={`${panel} mt-4`}>
        <h2 className={panelH2}>Requests</h2>
        {requests.length === 0 ? (
          <p className={muted}>No requests yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {requests.map((r) => (
              <Row
                key={r.id}
                href={r.beatmapset_id}
                title={r.title}
                sub={`${r.artist} · wants ${r.requested_diff}`}
                right={<span className="font-mono text-xs text-muted">{shortDate(r.created_at)}</span>}
                status={<span className={statusChip(r.status)}>{r.status.replace("_", " ")}</span>}
              />
            ))}
          </ul>
        )}
      </section>
      )}
    </>
  );
}
