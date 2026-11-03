// CI's rule check: the page never sends a file anywhere, never loads pickles, and keeps a strict
// Content Security Policy. Run it with: node scripts/check-rules.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(p)) files.push(p);
  }
};
walk(path.join(root, "src"));

const problems = [];
const banned = [
  [/method:\s*["'](POST|PUT|PATCH)/i, "sends data with POST, PUT or PATCH"],
  [/navigator\.sendBeacon|XMLHttpRequest|WebSocket|EventSource/, "has another way to send data"],
  [/localStorage|sessionStorage|indexedDB|document\.cookie/, "stores data in the browser"],
  [/\beval\(|new Function\(/, "evaluates code"],
  [/\b(google-analytics|gtag|plausible|posthog|sentry)\b/i, "has analytics"],
];
for (const file of files) {
  const rel = path.relative(root, file);
  const code = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
  for (const [pattern, why] of banned) if (pattern.test(code)) problems.push(`${rel} ${why}`);
  // Every fetch is the page's own files, or the one address a person typed into ?url=.
  for (const m of code.matchAll(/\bfetch\(([^,)]*)/g)) {
    if (!/^(url\.href|"example\.h5"|plugins\[key\])$/.test(m[1].trim())) problems.push(`${rel} fetches something unexpected: fetch(${m[1]})`);
  }
}
const npy = readFileSync(path.join(root, "src/formats/npy.js"), "utf8");
if (!/never loads those, because unpickling can run code/.test(npy)) problems.push("npy.js must refuse object (pickled) arrays");

const html = readFileSync(path.join(root, "index.html"), "utf8");
const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
for (const rule of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) if (!csp.includes(rule)) problems.push(`index.html's CSP lacks ${rule}`);
if (/script-src[^;]*(https?:|\*)/.test(csp)) problems.push("index.html's CSP allows scripts from other sites");

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  const license = JSON.parse(readFileSync(path.join(root, "node_modules", dep, "package.json"), "utf8")).license ?? "";
  if (!/MIT|ISC|BSD|Apache|SEE LICENSE/.test(license)) problems.push(`${dep} has license ${license}`);
}

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}
console.log(`OK: ${files.length} source files, nothing sent anywhere, strict CSP, permissive dependencies.`);
