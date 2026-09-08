import { fileURLToPath } from "node:url";
import { createRangeServer } from "./tests/range-server.mjs";

const port = Number(process.argv[2] ?? process.env.PORT ?? 52124);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("Preview port must be an integer between 1 and 65535.");
}

const siteRoot = fileURLToPath(new URL("./dist/", import.meta.url));

createRangeServer(siteRoot).listen(port, "127.0.0.1", () => {
  console.log(`Felix preview: http://127.0.0.1:${port}/`);
});
