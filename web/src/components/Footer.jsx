// Isi kalau repo GitHub-nya sudah ada, format: "https://github.com/user/repo"
const REPO_URL = "https://github.com/SayuMana/osugd";

const LINK = "text-ink underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-panel px-4 py-4 text-xs text-muted md:px-6">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Made by{" "}
          <a
            className={LINK}
            href="https://osu.ppy.sh/users/12602650"
            target="_blank"
            rel="noopener noreferrer"
          >
            SayuMana
          </a>
        </span>

        {REPO_URL ? (
          <a className={LINK} href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        ) : (
          <span>GitHub</span>
        )}

        <span className="max-sm:basis-full sm:ml-auto">
          Not affiliated with osu! or ppy Pty Ltd.
        </span>
      </div>
    </footer>
  );
}
