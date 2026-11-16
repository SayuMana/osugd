import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { input, muted } from "../ui.js";

// cari player lain: ketik nama, pilih, langsung ke profil publiknya
export default function PlayerSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setHits(j.users || []);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  function go(name) {
    setQ("");
    setHits([]);
    setOpen(false);
    nav(`/u/${encodeURIComponent(name)}`);
  }

  return (
    <div className="relative" ref={box} role="search">
      <input
        className={`${input} w-[170px] py-1.5 text-13`}
        type="search"
        value={q}
        aria-label="Find a player"
        placeholder="Find a player"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && hits[0]) go(hits[0].username);
        }}
      />

      {open && (
        <ul className="absolute right-0 top-[calc(100%+4px)] z-30 m-0 w-[240px] list-none rounded-lg border border-line bg-panel p-1 shadow-lg">
          {hits.length === 0 ? (
            <li className={`px-2 py-1.5 text-xs ${muted}`}>No player by that name.</li>
          ) : (
            hits.map((u) => (
              <li key={u.osu_id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-13 hover:bg-panel2"
                  onClick={() => go(u.username)}
                >
                  <img className="block rounded" src={u.avatar_url} alt="" width="20" height="20" />
                  <span className="truncate">{u.username}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
