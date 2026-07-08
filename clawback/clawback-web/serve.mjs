// Tiny static server for the Clawback dashboard.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4600);
http
  .createServer((req, res) => {
    const file = req.url === "/" || !req.url ? "index.html" : req.url.replace(/^\//, "").split("?")[0];
    try {
      const body = readFileSync(join(DIR, file));
      const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/plain";
      res.writeHead(200, { "content-type": type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`clawback dashboard on http://127.0.0.1:${PORT}`));
