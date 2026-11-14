import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import GDLog from "./GDLog.jsx";
import Summary from "./Summary.jsx";
import Tracks from "./Tracks.jsx";
import { btnGhost, empty, emptyTitle, h1, muted } from "../ui.js";

const NAV_ROW = "mb-4 flex flex-wrap gap-2.5";

// /u/{nama}/log dan /u/{nama}/track: tampilan tamu dari halaman aslinya
export default function ProfilePage({ page }) {
  const { osuId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/users/${encodeURIComponent(osuId)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this profile.");
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, [osuId]);

  // lihat diri sendiri: langsung ke halaman aslinya, bukan tampilan tamu
  useEffect(() => {
    if (!data?.user?.is_self) return;
    const target = page === "log" ? "/log" : page === "track" ? "/track" : "/summary";
    navigate(target, { replace: true });
  }, [data, page, navigate]);

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

  if (!data || data.user.is_self) {
    return (
      <>
        <div>
          <h1 className={h1}>Profile</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  const name = data.user.username;
  const link = (path) => `/u/${encodeURIComponent(name)}${path}`;
  // host hanya dipakai kalau yang dilihat bukan owner: itu GD yang dibuat untuk mereka
  const host = data.user.role === "admin" ? undefined : name;

  return (
    <>
      <div className={NAV_ROW}>
        <Link className={btnGhost} to={link("")}>
          Overview
        </Link>
        {page !== "summary" && data.summary_public && (
          <Link className={btnGhost} to={link("/summary")}>
            Summary
          </Link>
        )}
        {page !== "log" && data.log_public && (
          <Link className={btnGhost} to={link("/log")}>
            GD log
          </Link>
        )}
        {page !== "track" && data.track_public && (
          <Link className={btnGhost} to={link("/track")}>
            GD track
          </Link>
        )}
      </div>

      {/* me={null} bikin semua tombol owner hilang: add, edit, delete, bring back */}
      {page === "summary" && <Summary me={null} nav={false} />}
      {page === "log" && <GDLog me={null} host={host} />}
      {page === "track" && <Tracks me={null} />}
    </>
  );
}
