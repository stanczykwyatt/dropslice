// Writes public/THIRD_PARTY_NOTICES.txt: the license of every package bundled into the site.
// Run it after changing dependencies: node scripts/notices.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dirs = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((d) => d.includes("node_modules"));
const seen = new Set();
const parts = ["dropslice bundles the following open-source packages. Their licenses follow.\n"];
for (const dir of [...new Set(dirs)].sort()) {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f));
  const text = files.map((f) => readFileSync(path.join(dir, f), "utf8").trim()).join("\n\n");
  parts.push(`${"=".repeat(72)}\n${id} (${pkg.license ?? "see below"})\n${pkg.homepage ?? ""}\n\n${text || `License: ${pkg.license}`}\n`);
}
writeFileSync(path.join(root, "public", "THIRD_PARTY_NOTICES.txt"), parts.join("\n"));
console.log(`${seen.size} packages`);
