// Shared Tailwind class strings. One source for spacing, type and colour so pages cannot drift.

export const h1 = "m-0 mb-1 text-28 font-semibold tracking-[-0.02em]";
export const muted = "m-0 text-13 text-muted";
export const empty = "mt-5 rounded-lg border border-line bg-panel p-6";
export const emptyTitle = "m-0 mb-1 font-semibold";
export const panel = "min-w-0 rounded-lg border border-line bg-panel p-4";
export const panelH2 = "m-0 mb-3 text-sm font-semibold";
export const stack = "flex flex-col gap-4";

export const btn =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded border border-transparent bg-accent px-3.5 text-13 font-medium text-accent-ink no-underline hover:brightness-[1.06] disabled:opacity-60";
export const btnGhost =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded border border-strong bg-transparent px-3.5 text-13 font-medium text-ink no-underline hover:bg-panel2 disabled:opacity-60";
export const btnDanger =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded border border-transparent bg-danger px-3.5 text-13 font-medium text-accent-ink no-underline hover:brightness-[1.06] disabled:opacity-60";

export const TAB = "inline-flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded border px-3 text-13";
export const filterGroup = "flex flex-wrap items-center gap-1.5";
export const filterLabel = "w-full text-xs text-muted";
export const filterToggle =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line bg-panel px-3 text-13 text-ink hover:border-strong";
export const TAB_OFF = "border-line bg-transparent text-muted hover:border-strong hover:text-ink";
export const TAB_ON = "border-accent bg-panel text-ink";

export const input =
  "min-h-11 w-full rounded border border-strong bg-base px-2.5 text-13 text-ink placeholder:text-muted";

// versi tanpa w-full, untuk input yang lebarnya harus tetap
export const inputNarrow =
  "min-h-11 w-[120px] rounded border border-strong bg-base px-2.5 text-13 text-ink placeholder:text-muted";

// tanpa w-full juga, lebarnya ikut isi (select)
export const inputFit = "min-h-11 rounded border border-strong bg-base px-2.5 text-13 text-ink";

const chipBase = "inline-block rounded border px-1.5 py-0.5 font-mono text-2xs whitespace-nowrap";

export const chip = `${chipBase} border-strong`;

const STATUS = {
  ranked: "text-good border-good bg-good/16",
  approved: "text-good border-good bg-good/16",
  accepted: "text-good border-good bg-good/16",
  done: "text-good border-good bg-good/16",
  loved: "text-loved border-loved bg-loved/16",
  graveyard: "text-strong border-strong bg-strong/16",
  rejected: "text-reject border-reject bg-reject/16",
  on_hold: "text-accent border-accent bg-accent/16",
  in_progress: "text-ink border-muted bg-ink/12",
};

export const statusChip = (status) => `${chipBase} ${STATUS[status] ?? "border-strong text-muted"}`;

// pesan "private" dari API bukan error, jangan tawarkan retry
export const isPrivate = (msg) => /private/i.test(msg || "");
