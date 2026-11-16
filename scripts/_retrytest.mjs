import { osuGet } from "../api/lib/osu.js";

let calls = 0;
let queue = [];
let auth = null;

globalThis.fetch = async (url, opts) => {
  calls++;
  auth = opts?.headers?.Authorization ?? null;
  const step = queue.shift() ?? { status: 200 };
  return new Response(JSON.stringify({ ok: true }), {
    status: step.status,
    headers: step.retryAfter != null ? { "retry-after": String(step.retryAfter) } : {},
  });
};

async function run(label, steps) {
  calls = 0;
  queue = steps.slice();
  const t0 = Date.now();
  try {
    const out = await osuGet("/beatmapsets/1", "tok");
    console.log(`${label} -> resolved ${JSON.stringify(out)} | calls=${calls} ms=${Date.now() - t0}`);
  } catch (e) {
    console.log(`${label} -> threw "${e.message}" | calls=${calls} ms=${Date.now() - t0}`);
  }
}

await run("429 x2 lalu 200 (Retry-After 1s)", [{ status: 429, retryAfter: 1 }, { status: 429, retryAfter: 1 }, { status: 200 }]);
await run("404 (tidak diulang)", [{ status: 404 }]);
await run("429 terus (backoff 2s+4s)", [{ status: 429 }, { status: 429 }, { status: 429 }, { status: 200 }]);
await run("503 lalu 200 (tanpa header)", [{ status: 503 }, { status: 200 }]);

console.log("Authorization header:", auth);
