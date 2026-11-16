import { useEffect, useState } from "react";
import { useDialog } from "./lib/useDialog.js";
import { REQUESTS_ON } from "./lib/features.js";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import GDLog from "./pages/GDLog.jsx";
import Landing from "./pages/Landing.jsx";
import Settings from "./pages/Settings.jsx";
import Request from "./pages/Request.jsx";
import Requests from "./pages/Requests.jsx";
import Tracks from "./pages/Tracks.jsx";
import Summary from "./pages/Summary.jsx";
import PlayerSearch from "./components/PlayerSearch.jsx";
import Profile from "./pages/Profile.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import NotFound from "./pages/NotFound.jsx";
import Footer from "./components/Footer.jsx";

const baseLinks = [
  ["/", "Dashboard"],
  ["/log", "GD Log"],
  ["/summary", "Summary"],
  ["/track", "GD Track"],
  ["/requests", "Requests"],
];

const NAV = "inline-flex min-h-11 items-center rounded px-2.5 text-13 text-muted no-underline hover:bg-panel2 hover:text-ink";
const NAV_ON = "bg-panel2 text-ink";
const DRAWER_LINK = "rounded px-2.5 py-3 text-sm text-muted no-underline hover:bg-panel2 hover:text-ink";
const BTN = "inline-flex min-h-11 cursor-pointer items-center justify-center rounded border border-transparent bg-accent px-3.5 text-13 font-medium text-accent-ink no-underline hover:brightness-[1.06]";
const BTN_GHOST = "inline-flex min-h-11 cursor-pointer items-center justify-center rounded border border-strong bg-transparent px-3.5 text-13 font-medium text-ink no-underline hover:bg-panel2";

const TITLES = {
  "/log": "GD Log",
  "/summary": "Summary",
  "/track": "GD Track",
  "/requests": "Requests",
  "/requestform": "Request a GD",
  "/settings": "Settings",
};

function titleFor(pathname, me) {
  if (pathname === "/") return me ? "Dashboard" : "Home";
  if (pathname.startsWith("/u/")) {
    const page = pathname.split("/")[3];
    if (page === "log") return "Guest difficulties";
    if (page === "summary") return "Summary";
    if (page === "track") return "GD track";
    return "Profile";
  }
  return TITLES[pathname] ?? "Not found";
}

// halaman kerja butuh login; tamu diarahkan ke halaman publik pemilik situs
function Guard({ me, site, page, children }) {
  if (me === undefined) return null;
  if (me === null) {
    if (site === undefined) return null;
    const to = site?.owner && page ? `/u/${encodeURIComponent(site.owner)}/${page}` : "/";
    return <Navigate to={to} replace />;
  }
  return children;
}

export default function App() {
  const [me, setMe] = useState(undefined);
  const [site, setSite] = useState(undefined);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const visibleLinks = REQUESTS_ON ? baseLinks : baseLinks.filter(([to]) => to !== "/requests");
  const links = visibleLinks;
  const showSettings = !!me;

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  // tamu: tahu dulu akun mana yang dipajang, buat tujuan redirect halaman kerja
  useEffect(() => {
    if (me !== null) return;
    let alive = true;
    fetch("/api/site")
      .then((r) => r.json())
      .then((j) => alive && setSite(j || {}))
      .catch(() => alive && setSite({}));
    return () => {
      alive = false;
    };
  }, [me]);

  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `osugd | ${titleFor(location.pathname, me)}`;
  }, [location.pathname, me]);

  // tinggi topbar dipakai header tabel biar sticky-nya tidak ketutup
  useEffect(() => {
    const el = document.querySelector("header");
    if (!el) return;
    // rect (bukan offsetHeight) supaya tinggi pecahan tidak dibulatkan ke atas dan menyisakan 1px
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${el.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawerRef = useDialog(menu, () => setMenu(false));
  const navigate = useNavigate();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    setMenu(false);
    // balik ke landing; halaman terakhir tidak boleh tetap kelihatan
    navigate("/", { replace: true });
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-panel px-4 py-2.5 md:px-6">
        {me && (
        <button
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line bg-transparent px-2.5 text-13 text-ink min-[900px]:hidden"
          aria-expanded={menu}
          aria-controls="nav-drawer"
          onClick={() => setMenu((v) => !v)}
        >
          <span className="burger-lines" aria-hidden="true" />
          Menu
        </button>
        )}

        <Link to="/" className="text-15 font-semibold tracking-[-0.01em] no-underline">
          osugd
        </Link>

        {me && (
        <nav className="hidden flex-wrap gap-0.5 min-[900px]:flex">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => (isActive ? `${NAV} ${NAV_ON}` : NAV)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        )}

        <div className="ml-auto hidden items-center gap-2.5 text-13 min-[900px]:flex">
          {me ? (
            <>
              {showSettings && (
                <NavLink
                  to="/settings"
                  aria-label="Settings"
                  title="Settings"
                  className={({ isActive }) =>
                    `inline-flex h-11 w-11 items-center justify-center rounded border ${
                      isActive ? "border-strong bg-panel2 text-ink" : "border-transparent text-muted"
                    } hover:bg-panel2 hover:text-ink`
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </NavLink>
              )}
              <PlayerSearch />
              <Link
                className="flex items-center gap-2.5 text-muted underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent"
                to={`/u/${encodeURIComponent(me.username)}`}
              >
                <img className="block rounded" src={me.avatar} alt="" width="28" height="28" />
                {me.username}
              </Link>
              <button className={BTN_GHOST} onClick={logout}>
                Log out
              </button>
            </>
          ) : null}
        </div>

        {me ? (
          <button
            className="ml-auto inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded border border-line bg-transparent p-0 hover:border-strong min-[900px]:hidden"
            aria-label="Open account menu"
            aria-expanded={menu}
            aria-controls="nav-drawer"
            onClick={() => setMenu(true)}
          >
            <img className="block rounded" src={me.avatar} alt="" width="28" height="28" />
          </button>
        ) : null}
      </header>

      {menu && (
        <>
          <div className="fixed inset-0 z-40 bg-[rgba(10,6,16,0.6)]" onClick={() => setMenu(false)} />
          <div ref={drawerRef} className="fixed inset-y-0 left-0 z-[41] flex w-[min(300px,86vw)] flex-col gap-4 border-r border-line bg-panel p-4" id="nav-drawer">
            <div className="flex items-center justify-between gap-3">
              <span className="text-15 font-semibold tracking-[-0.01em]">osugd</span>
              <button className={BTN_GHOST} onClick={() => setMenu(false)}>
                Close
              </button>
            </div>
            <nav className="flex flex-col gap-0.5">
              {links.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) => (isActive ? `${DRAWER_LINK} ${NAV_ON}` : DRAWER_LINK)}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto flex flex-col items-start gap-2.5">
              {me ? (
                <>
                  <Link
                    className="text-13 text-muted underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent"
                    to={`/u/${encodeURIComponent(me.username)}`}
                  >
                    Logged in as {me.username}
                  </Link>
                  {showSettings && (
                    <NavLink className={DRAWER_LINK} to="/settings">
                      Settings
                    </NavLink>
                  )}
                  <button className={BTN_GHOST} onClick={logout}>
                    Log out
                  </button>
                </>
              ) : (
                <a className={BTN} href="/api/auth/login">
                  Log in with osu!
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {me === null && location.pathname !== "/" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel2 px-4 py-2.5 text-13 text-muted md:px-6">
          <span>Log in with osu! to keep your own GD log and track board.</span>
          <a className={BTN} href="/api/auth/login">
            Log in with osu!
          </a>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-5 pb-14 md:px-6 md:pt-[22px] md:pb-16">
        <Routes>
          <Route path="/" element={me ? <Dashboard me={me} /> : <Landing site={site} />} />
          <Route path="/log" element={<Guard me={me} site={site} page="log"><GDLog me={me} /></Guard>} />
          <Route path="/summary" element={<Guard me={me} site={site} page="summary"><Summary me={me} /></Guard>} />
          <Route path="/track" element={<Guard me={me} site={site} page="track"><Tracks me={me} /></Guard>} />
          <Route
            path="/requests"
            element={REQUESTS_ON ? <Requests me={me} /> : <NotFound />}
          />
          <Route
            path="/requestform"
            element={REQUESTS_ON ? <Request me={me} /> : <NotFound />}
          />
          <Route path="/settings" element={<Guard me={me} site={site}><Settings me={me} /></Guard>} />
          <Route path="/u/:osuId" element={<Profile me={me} />} />
          <Route path="/u/:osuId/summary" element={<ProfilePage page="summary" me={me} />} />
          <Route path="/u/:osuId/log" element={<ProfilePage page="log" me={me} />} />
          <Route path="/u/:osuId/track" element={<ProfilePage page="track" me={me} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}
