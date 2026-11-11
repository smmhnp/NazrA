/** End-to-end user flow with jsdom and a real Canvas. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let JSDOM, VirtualConsole, createCanvas, GlobalFonts, loadNapiImage;
try {
  ({ JSDOM, VirtualConsole } = await import("jsdom"));
  ({ createCanvas, GlobalFonts, loadImage: loadNapiImage } = await import("@napi-rs/canvas"));
} catch {
  JSDOM = null;
}

function setGlobal(name, value) {
  try { globalThis[name] = value; }
  catch { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
}

const waitFor = async (predicate, timeout = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("مهلت انتظار برای تغییر رابط به پایان رسید.");
};

test("مسیر کامل کاربر: آغاز → پنج دسته → متن → سه فعالیت → خروجی → پایان", { skip: !JSDOM }, async (t) => {
  const fontPath = path.join(root, "assets/fonts/vazirmatn/Vazirmatn-Variable.ttf");
  if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, "Vazirmatn");

  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error.message));
  virtualConsole.on("error", (message) => jsdomErrors.push(String(message)));

  const dom = new JSDOM(html, {
    url: "https://example.test/NazrA/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const { document } = window;

  window.scrollTo = () => {};
  window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    if (type !== "2d") return null;
    if (!this.__napiCanvas) this.__napiCanvas = createCanvas(this.width || 300, this.height || 150);
    return this.__napiCanvas.getContext("2d");
  };
  window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    const buffer = this.__napiCanvas?.toBuffer("image/png");
    callback(buffer ? new Blob([buffer], { type: "image/png" }) : null);
  };

  setGlobal("window", window);
  setGlobal("document", document);
  setGlobal("location", window.location);
  setGlobal("localStorage", window.localStorage);
  setGlobal("requestAnimationFrame", (cb) => setTimeout(() => cb(Date.now()), 0));
  setGlobal("cancelAnimationFrame", (id) => clearTimeout(id));
  setGlobal("HTMLElement", window.HTMLElement);
  setGlobal("MouseEvent", window.MouseEvent);

  const consoleErrors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => { consoleErrors.push(args.map(String).join(" ")); };
  t.after(() => {
    console.error = originalConsoleError;
    dom.window.close();
  });

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const visible = (name) => !$(`#screen-${name}`).hidden;
  const click = (element) => {
    assert.ok(element, "عنصر مورد کلیک وجود ندارد");
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  const action = (name) => $(`[data-action="${name}"]`);

  // Load app.js after the DOM and globals are ready.
  await import(`../js/app.js?flow=${Date.now()}`);
  const { CATEGORIES, TEXT_RECORDS, QUESTION_RECORDS } = await import("../js/content.js");

  // 1. Welcome
  assert.equal(visible("welcome"), true);
  assert.equal(visible("categories"), false);
  assert.equal($("#welcome-title").textContent, "موسسه آموزش عالی شاندیز");
  assert.equal($("#app-header").hidden, true);

  click(action("start"));
  // 2. Single category: start goes straight to the text
  assert.equal(visible("categories"), false);
  assert.equal(visible("text"), true);
  assert.equal(CATEGORIES.length, 1);
  assert.equal(action("change-category"), null);
  assert.ok(TEXT_RECORDS.some((r) => r.text === $("#text-body").textContent));
  assert.ok($("#text-source").textContent.length > 5);
  assert.equal($("#text-badge").hidden, true);

  // 3. Another text never repeats the current one
  let previous = $("#text-body").textContent;
  for (let i = 0; i < 12; i += 1) {
    click(action("another-text"));
    const current = $("#text-body").textContent;
    assert.notEqual(current, previous, "تکرار بلافاصلهٔ متن");
    assert.ok(TEXT_RECORDS.some((r) => r.category === "sayings" && r.text === current));
    previous = current;
  }

  // 4. No activities: the text screen continues straight to the final screen
  assert.equal(action("to-activities"), null);
  click($('#screen-text [data-action="go-final"]'));
  assert.equal(visible("final"), true);
  assert.equal(visible("activities"), false);
  assert.ok($("#screen-final").textContent.includes("هرشب جمعه مثل اربعین"));
  assert.equal($("#stepper").hidden, true, "نشانگر گام نمایش داده نمی‌شود");

  // 9. Skip directly from activities and return to the output
  click(action("home"));
  click($('#screen-welcome [data-action="resume"]'));
  assert.equal(visible("final"), true, "ادامهٔ مسیر قبل");

  // 10. Final screen: TODO settings and removed sections
  assert.equal(visible("final"), true);
  assert.equal($("#countdown-grid"), null, "سکشن شمارش معکوس حذف شده است");
  assert.equal($("#screen-final").classList.contains("screen--final"), true, "فاصلهگذاری صفحهٔ آخر");
  assert.equal($$("#screen-final > .card").length, 1);
  assert.equal($("#screen-final .mokab-card"), null, "کادر موکب حذف شده است");
  assert.equal($("#coming-button"), null, "دکمهٔ میآیم حذف شده است");
  assert.equal($("#coming-note"), null, "یادداشت میآیم حذف شده است");
  assert.ok($$("#screen-final .btn--primary").length === 0, "هیچ دکمهٔ اصلی در صفحهٔ آخر نیست");
  const stored = JSON.parse(window.localStorage.getItem("nazra.state.v1"));
  assert.equal(stored.step, "final");

  // Invite a friend: copy fallback (browser without Web Share API)
  setGlobal("navigator", { onLine: true, clipboard: { writeText: async () => {} } });
  click(action("invite-friend"));
  await waitFor(() => !$("#invite-fallback").hidden);
  assert.equal($("#invite-link"), null, "لینک وب‌اپ از دعوت‌نامه حذف شده است");
  assert.ok($("#invite-text-preview").value.length > 10);
  assert.equal($("#invite-text-preview").value.includes("http"), false);

  // Restart
  click(action("restart"));
  assert.equal(visible("welcome"), true);
  assert.equal($("#resume-button").hidden, true);

  // No JavaScript or DOM errors occurred.
  const realErrors = jsdomErrors.filter((message) => !/Not implemented|Could not parse CSS|navigation/i.test(message));
  assert.deepEqual(realErrors, []);
  assert.deepEqual(consoleErrors, []);
});
