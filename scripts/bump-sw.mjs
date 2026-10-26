/**
 * bump-sw.mjs — نسخهٔ کش Service Worker را از روی محتوای واقعی فایلها میسازد.
 * با هر تغییر در منابع اصلی، «npm run sw:version» را اجرا کنید.
 * --check فقط بررسی میکند و چیزی نمینویسد (مناسب CI و npm run check).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const swPath = path.join(root, "sw.js");
const source = fs.readFileSync(swPath, "utf8");

const shellMatch = source.match(/const APP_SHELL = (\[[\s\S]*?\n\]);/);
if (!shellMatch) { console.error("فهرست APP_SHELL در sw.js پیدا نشد."); process.exit(1); }
let entries;
try { entries = JSON.parse(shellMatch[1]); }
catch (error) { console.error("APP_SHELL باید JSON معتبر باشد:", error.message); process.exit(1); }

const hash = crypto.createHash("sha256");
const missing = [];
for (const entry of entries) {
  const relative = entry === "./" ? "index.html" : entry.replace(/^\.\//, "");
  const file = path.join(root, relative);
  hash.update(relative);
  if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  else missing.push(relative);
}
const version = `nazra-${hash.digest("hex").slice(0, 12)}`;
const versionMatch = source.match(/const CACHE_VERSION = "[^"]*";/);
if (!versionMatch) { console.error("CACHE_VERSION در sw.js پیدا نشد."); process.exit(1); }

const checkOnly = process.argv.includes("--check");
const current = versionMatch[0].match(/"([^"]*)"/)[1];

if (checkOnly) {
  if (missing.length) { console.error("فایلهای مفقود در APP_SHELL:", missing.join(", ")); process.exit(1); }
  if (current !== version) {
    console.error(`نسخهٔ کش قدیمی است («${current}» → «${version}»). «npm run sw:version» را اجرا کنید.`);
    process.exit(1);
  }
  console.log(`✓ نسخهٔ کش هماهنگ است: ${version} (${entries.length} منبع)`);
  process.exit(0);
}

if (missing.length) console.warn("هشدار — فایلهای مفقود:", missing.join(", "));
fs.writeFileSync(swPath, source.replace(versionMatch[0], `const CACHE_VERSION = "${version}";`));
console.log(`✓ نسخهٔ کش بهروزرسانی شد: ${current} → ${version}`);
