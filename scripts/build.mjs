// Build step: check every local file referenced from the HTML pages exists,
// then copy public/ to dist/ (the assets directory Workers Builds deploys).
import { readFileSync, existsSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";

const root = "public";
let missing = 0;
for (const page of readdirSync(root).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(join(root, page), "utf8");
  for (const [, ref] of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
    if (ref === "/" || ref.startsWith("/api/")) continue;
    const candidates = [join(root, ref), join(root, ref + ".html"), join(root, ref, "index.html")];
    if (!candidates.some((p) => existsSync(p))) {
      console.error(`${page}: missing ${ref}`);
      missing++;
    }
  }
}
if (missing) process.exit(1);

rmSync("dist", { recursive: true, force: true });
cpSync(root, "dist", { recursive: true });
console.log("Static site check passed. Output in dist/.");
