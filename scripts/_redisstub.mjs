// Stub Upstash REST untuk menguji jalur redis tanpa akun: node scripts/_redisstub.mjs
import http from "node:http";

const store = new Map();
const hits = { incr: 0, expire: 0 };

http
  .createServer((req, res) => {
    if (req.method !== "POST" || !req.url.startsWith("/pipeline")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const cmds = JSON.parse(body);
      const out = cmds.map(([cmd, key, ttl]) => {
        if (cmd === "INCR") {
          hits.incr++;
          const n = (store.get(key) || 0) + 1;
          store.set(key, n);
          return { result: n };
        }
        if (cmd === "EXPIRE") {
          hits.expire++;
          return { result: 1 };
        }
        return { result: null };
      });
      if (req.url.includes("/stats")) res.setHeader("x-stats", JSON.stringify(hits));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
  })
  .listen(6390, () => console.log("redis stub on 6390"));

process.on("SIGTERM", () => {
  console.log("hits:", JSON.stringify(hits));
  process.exit(0);
});
