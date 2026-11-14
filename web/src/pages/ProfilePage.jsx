import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import GDLog from "./GDLog.jsx";
import Tracks from "./Tracks.jsx";
import { empty, emptyTitle, h1, muted } from "../ui.js";

// /u/{nama}/log dan /u/{nama}/track: tampilan tamu dari halaman aslinya
export default function ProfilePage({ page }) {
  const { osuId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setUser(null);
    setError(null);
    fetch(`/api/users/${encodeURIComponent(osuId)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this profile.");
        setUser(j.user);
      })
      .catch((e) => setError(e.message));
  }, [osuId]);

  // lihat diri sendiri: langsung ke halaman aslinya, bukan tampilan tamu
  useEffect(() => {
    if (user?.is_self) navigate(page === "log" ? "/log" : "/track", { replace: true });
  }, [user, page, navigate]);

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

  if (!user || user.is_self) {
    return (
      <>
        <div>
          <h1 className={h1}>Profile</h1>
          <p className={muted}>Loading.</p>
        </div>
      </>
    );
  }

  // me={null} bikin semua tombol owner hilang: add, edit, delete, bring back
  // host hanya dipakai kalau yang dilihat bukan owner: itu GD yang dibuat untuk mereka
  const host = user.role === "admin" ? undefined : user.username;
  return page === "log" ? <GDLog me={null} host={host} /> : <Tracks me={null} />;
}
