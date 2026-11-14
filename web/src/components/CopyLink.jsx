import { useState } from "react";
import { btnGhost } from "../ui.js";

// tombol salin link halaman; dipasang hanya di halaman yang memang publik
export default function CopyLink({ to }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.origin + (to || window.location.pathname);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard butuh HTTPS dan izin browser; kalau ditolak, tidak ada yang bisa dilakukan
    }
  }

  return (
    <button type="button" className={btnGhost} onClick={copy}>
      {copied ? "Link copied" : "Copy link to share"}
    </button>
  );
}
