export async function runImport({ startOffset = 0, onProgress, shouldStop = () => false } = {}) {
  let offset = startOffset;
  let total = 0;
  let added = 0;

  while (!shouldStop()) {
    const r = await fetch(`/api/import?offset=${offset}`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) {
      const err = new Error(j.error || "Import stopped.");
      err.nextOffset = j.nextOffset ?? offset;
      throw err;
    }
    if (j.total) total = j.total;
    offset = j.nextOffset;
    added += j.imported || 0;
    onProgress?.({ done: offset, total });
    if (j.done) break;
  }

  return { added, total };
}
