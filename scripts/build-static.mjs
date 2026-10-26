/**
 * build-static.mjs — ساخت پوشهٔ dist فقط از فایلهای لازم برای انتشار.
 * بدون ابزار ساخت خارجی؛ فقط Node داخلی. خروجی قابل استقرار مستقیم است.
 * اجرا: npm run build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const FILES = [
  "index.html", "manifest.json", "sw.js", "README.md",
  "css/style.css", "css/components.css", "css/animations.css",
  "js/app.js", "js/config.js", "js/content.js", "js/card-engine.js",
  "js/lib/utils.js", "js/lib/validation.js", "js/lib/selection.js",
  "js/lib/storage.js", "js/lib/time.js", "js/lib/quiz-engine.js",
  "js/lib/share.js",
  "js/ui/common.js", "js/ui/toast.js", "js/ui/quiz.js",
  "js/ui/postcard.js", "js/ui/selfie.js",
  "assets/logo.png", "assets/icons/icon.svg", "assets/icons/icon-192.png",
  "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "assets/fonts/vazirmatn/Vazirmatn-Regular.woff2",
  "assets/fonts/vazirmatn/Vazirmatn-SemiBold.woff2",
  "assets/fonts/vazirmatn/Vazirmatn-ExtraBold.woff2",
  "assets/fonts/vazirmatn/OFL.txt"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const missing = [];
for (const rel of FILES) {
  const from = path.join(root, rel);
  if (!fs.existsSync(from)) { missing.push(rel); continue; }
  const to = path.join(dist, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
if (missing.length) { console.error("فایلهای مفقود:", missing.join(", ")); process.exit(1); }

// اطمینان از اینکه تمام منابع APP_SHELL در خروجی وجود دارند.
const sw = fs.readFileSync(path.join(dist, "sw.js"), "utf8");
const entries = JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\n\]);/)[1]);
const absent = entries.filter((entry) => {
  const rel = entry === "./" ? "index.html" : entry.replace(/^\.\//, "");
  return !fs.existsSync(path.join(dist, rel));
});
if (absent.length) { console.error("منابع کش در dist یافت نشدند:", absent.join(", ")); process.exit(1); }

console.log(`✓ پوشهٔ dist ساخته شد (${FILES.length} فایل، ${entries.length} منبع آفلاین تأیید شد).`);
