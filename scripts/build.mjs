// Build step: check every local file referenced from the HTML pages exists,
// then copy public/ to dist/ (the assets directory Workers Builds deploys).
import { readFileSync, existsSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join, relative } from "node:path";

const root = "public";
let missing = 0;
for (const page of readdirSync(root).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(join(root, page), "utf8");
  for (const [, ref] of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
    if (ref === "/" || ref.startsWith("/api/") || ref.startsWith("/auth/")) continue;
    const candidates = [join(root, ref), join(root, ref + ".html"), join(root, ref, "index.html")];
    if (!candidates.some((p) => existsSync(p))) {
      console.error(`${page}: missing ${ref}`);
      missing++;
    }
  }
}
if (missing) process.exit(1);

// Update dist/ in place (a running `wrangler dev` keeps watching it), then drop stale files.
cpSync(root, "dist", { recursive: true, force: true });
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
for (const file of walk("dist")) {
  if (!existsSync(join(root, relative("dist", file)))) rmSync(file);
}
console.log("Static site check passed. Output in dist/.");
