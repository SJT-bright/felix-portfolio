import { fileURLToPath } from "node:url";
import { createRangeServer } from "./range-server.mjs";

let server = null;
if (!process.env.FELIX_BASE_URL) {
  const siteRoot = fileURLToPath(new URL("../dist/", import.meta.url));
  server = createRangeServer(siteRoot);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  process.env.FELIX_BASE_URL = `http://127.0.0.1:${address.port}/`;
}

try {
  await import("./browser-smoke.mjs");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
