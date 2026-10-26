import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));
const html = read("index.html");
const manifest = JSON.parse(read("manifest.json"));
const swSource = read("sw.js");
const appSource = read("js/app.js");

function localRefs(source) {
  const refs = new Set();
  for (const match of source.matchAll(/(?:src|href)\s*=\s*"(\.\/[^"#]+)"/g)) refs.add(match[1].replace(/^\.\//, ""));
  return [...refs];
}

test("همهٔ منابع محلی اشارهشده در index.html وجود دارند", () => {
  for (const ref of localRefs(html)) assert.ok(exists(ref), `فایل مفقود: ${ref}`);
});

test("manifest معتبر، فارسی، RTL و دارای آیکونهای موجود است", () => {
  assert.equal(manifest.lang, "fa");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.background_color, "#0E0F12");
  assert.ok(manifest.name.includes("شاندیز"));
  assert.ok(manifest.icons.length >= 4);
  for (const icon of manifest.icons) {
    assert.ok(exists(icon.src.replace(/^\.\//, "")), `آیکون مفقود: ${icon.src}`);
    assert.ok(icon.type && icon.sizes);
  }
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
});

test("APP_SHELL شامل فونتها، CSS، JS، لوگو و آیکونها است و همه وجود دارند", () => {
  const match = swSource.match(/const APP_SHELL = (\[[\s\S]*?\n\]);/);
  assert.ok(match);
  const entries = JSON.parse(match[1]);
  for (const entry of entries) {
    const rel = entry === "./" ? "index.html" : entry.replace(/^\.\//, "");
    assert.ok(exists(rel), `منبع کش مفقود: ${rel}`);
  }
  for (const needed of ["style.css", "components.css", "animations.css", "app.js", "content.js", "card-engine.js", "config.js", "logo.svg", "Vazirmatn-Regular.woff2", "Vazirmatn-SemiBold.woff2", "Vazirmatn-ExtraBold.woff2"]) {
    assert.ok(entries.some((e) => e.includes(needed)), `APP_SHELL فاقد ${needed}`);
  }
  assert.ok(swSource.includes("activate") && swSource.includes("caches.delete"));
});

test("نسخهٔ کش با محتوای فایلها هماهنگ است", () => {
  const entries = JSON.parse(swSource.match(/const APP_SHELL = (\[[\s\S]*?\n\]);/)[1]);
  const hash = crypto.createHash("sha256");
  for (const entry of entries) {
    const rel = entry === "./" ? "index.html" : entry.replace(/^\.\//, "");
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(root, rel)));
  }
  const expected = `nazra-${hash.digest("hex").slice(0, 12)}`;
  const current = swSource.match(/const CACHE_VERSION = "([^"]*)";/)[1];
  assert.equal(current, expected);
});

test("همهٔ data-actionها در ACTIONS و data-ui-actionها در ماژولها هماهنگاند", () => {
  const actions = new Set([...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]));
  const actionsBlock = appSource.slice(appSource.indexOf("const ACTIONS = {"), appSource.indexOf("\n};", appSource.indexOf("const ACTIONS = {")));
  for (const action of actions) {
    assert.ok(actionsBlock.includes(`${action}(`) || actionsBlock.includes(`"${action}"(`), `اقدام بدون کنترلکننده: ${action}`);
  }
  const uiActions = new Set([...html.matchAll(/data-ui-action="([^"]+)"/g)].map((m) => m[1]));
  const moduleSources = ["js/ui/quiz.js", "js/ui/postcard.js", "js/ui/selfie.js"].map(read).join("\n");
  for (const action of uiActions) assert.ok(moduleSources.includes(`"${action}"`), `اقدام ماژول بدون کنترلکننده: ${action}`);
});

test("هیچ لینک شکسته، لینک خارجی یا منبع CDN در رابط وجود ندارد", () => {
  assert.ok(!/href\s*=\s*""/.test(html), "لینک خالی");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const match of html.matchAll(/href\s*=\s*"#([^"]*)"/g)) {
    assert.ok(match[1] && ids.has(match[1]), `لنگر شکسته: #${match[1]}`);
  }
  for (const match of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    assert.ok(!/^https?:\/\//.test(match[1]), `منبع خارجی در HTML: ${match[1]}`);
  }
  const css = ["css/style.css", "css/components.css", "css/animations.css"].map(read).join("\n");
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const value = match[1];
    if (value.startsWith("data:")) continue;
    assert.ok(exists(path.join("css", value).replace(/\\/g, "/")), `منبع CSS مفقود: ${value}`);
  }
  assert.ok(!/https?:\/\//.test(css.replace(/xmlns[^)]*/g, "")), "نباید CDN خارجی وجود داشته باشد");
});

test("همهٔ importهای ماژولها به فایلهای موجود اشاره دارند", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".js")) files.push(rel);
    }
  };
  walk("js");
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const target = path.normalize(path.join(path.dirname(file), match[1]));
      assert.ok(exists(target), `import نامعتبر در ${file}: ${match[1]}`);
    }
  }
  assert.ok(files.length >= 15);
});

test("ورودی فایل و پیام حریم خصوصی دقیقاً طبق الزامات است", () => {
  assert.ok(/<input[^>]+type="file"[^>]+accept="image\/\*"[^>]+capture="user"/.test(html));
  assert.ok(html.includes("عکس شما فقط روی همین دستگاه پردازش میشود"));
  assert.ok(/<html[^>]+lang="fa"[^>]+dir="rtl"/.test(html));
  assert.ok(html.includes("env(safe-area-inset-bottom)") === false); // در CSS است
  const css = read("css/style.css");
  assert.ok(css.includes("env(safe-area-inset-bottom)"));
  assert.ok(css.includes("prefers-reduced-motion") || read("css/animations.css").includes("prefers-reduced-motion"));
});
