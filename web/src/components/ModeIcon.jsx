import { modeIcon, modeLabel } from "../lib/mode.js";

export default function ModeIcon({ mode, className = "h-4 w-4" }) {
  const src = modeIcon(mode);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={modeLabel(mode)}
      width="16"
      height="16"
      title={modeLabel(mode)}
      className={`${className} flex-none opacity-75`}
      loading="lazy"
    />
  );
}
