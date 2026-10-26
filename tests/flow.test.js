/**
 * flow.test.js — تست یکپارچهٔ مسیر کاربر با jsdom و Canvas واقعی.
 * اگر وابستگیهای توسعه نصب نباشند، تست رد نمیشود (skip).
 */
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

  // app.js را بعد از آمادهسازی DOM و سراسریها بارگذاری میکنیم.
  await import(`../js/app.js?flow=${Date.now()}`);
  const { CATEGORIES, TEXT_RECORDS, QUESTION_RECORDS } = await import("../js/content.js");

  // ۱. خوشآمدگویی
  assert.equal(visible("welcome"), true);
  assert.equal(visible("categories"), false);
  assert.equal($("#welcome-title").textContent, "موسسه آموزش عالی شاندیز");
  assert.equal($("#app-header").hidden, true);

  click(action("start"));
  assert.equal(visible("categories"), true);
  assert.equal($$("#categories-grid .category-card").length, 5);

  // ۲. همهٔ پنج دسته
  for (const category of CATEGORIES) {
    click($(`[data-category-id="${category.id}"]`));
    assert.equal(visible("text"), true, `دستهٔ ${category.id}`);
    assert.equal($("#text-category-label").textContent, category.title);
    const body = $("#text-body").textContent;
    assert.ok(TEXT_RECORDS.some((r) => r.category === category.id && r.text === body), "متن از دستهٔ صحیح");
    assert.ok($("#text-source").textContent.length > 5);
    assert.ok($("#text-badge").textContent.length > 3, "برچسب صحت محتوا");
    click(action("change-category"));
    assert.equal(visible("categories"), true);
  }

  // ۳. «متن دیگر» متن فعلی را بلافاصله تکرار نمیکند
  click($('[data-category-id="scientific"]'));
  let previous = $("#text-body").textContent;
  for (let i = 0; i < 12; i += 1) {
    click(action("another-text"));
    const current = $("#text-body").textContent;
    assert.notEqual(current, previous, "تکرار بلافاصلهٔ متن");
    assert.ok(TEXT_RECORDS.some((r) => r.category === "scientific" && r.text === current));
    previous = current;
  }

  // ۴. فعالیتها و دکمهٔ همیشهدردسترس «رد کردن و ادامه»
  click(action("to-activities"));
  assert.equal(visible("activities"), true);
  assert.equal($$('#screen-activities [data-action="skip-to-output"]').length, 1);
  assert.equal($$('[data-action="choose-activity"]').length, 3);

  // ۵. آزمون: سه پرسش، چهار گزینه، امتیاز از روی دادهها
  click($('[data-activity="quiz"]'));
  assert.equal(visible("quiz"), true);
  assert.equal($$('#screen-quiz [data-action="skip-to-output"]').length, 1);
  for (let step = 1; step <= 3; step += 1) {
    assert.equal($("#quiz-progress").textContent.includes(`پرسش ${"۰۱۲۳"[step]} از ۳`), true);
    assert.equal($$("#quiz-options .quiz-option").length, 4);
    const questionText = $("#quiz-question").textContent;
    const record = QUESTION_RECORDS.find((q) => q.question === questionText);
    assert.ok(record, "صورت پرسش از content.js");
    click($(`[data-option-index="${record.correctIndex}"]`));
    assert.equal($("#quiz-feedback").hidden, false);
    assert.equal($("#quiz-feedback-title").textContent, "پاسخ درست");
    assert.ok($("#quiz-feedback-source").textContent.length > 3);
    click($("#quiz-next"));
  }
  assert.equal($("#quiz-result").hidden, false);
  assert.ok($("#quiz-score").textContent.includes("۳ از ۳"), `امتیاز: ${$("#quiz-score").textContent}`);

  // ۶. ساخت کارت آزمون و رسیدن به خروجی
  click($("#quiz-make-card"));
  await waitFor(() => visible("output"));
  assert.equal($("#output-empty").hidden, true);
  assert.equal($("#output-card-buttons").hidden, false);
  assert.ok($("#output-card-meta").textContent.includes("۱۰۸۰×۱۳۵۰"));
  assert.ok($("#output-card-preview").getAttribute("src"));

  // ۷. کارتپستال: سه قالب، نام اختیاری، پیشنمایش و ساخت
  click(action("make-another-card"));
  click($('[data-activity="postcard"]'));
  assert.equal(visible("postcard"), true);
  assert.equal($$("#postcard-templates .chip").length, 3);
  const postcardText = $("#postcard-text");
  assert.ok(postcardText.value.length > 5, "متن منتخب بهصورت خودکار قرار گرفته است");
  postcardText.value = "متنی تازه برای کارتپستال، نوشتهشده توسط کاربر.";
  postcardText.dispatchEvent(new window.Event("input", { bubbles: true }));
  $("#postcard-name").value = "";
  click($('#postcard-templates [data-template-id="band"]'));
  assert.equal($('#postcard-templates [data-template-id="band"]').getAttribute("aria-pressed"), "true");
  click($("#postcard-make"));
  await waitFor(() => visible("output"));

  // ۸. سلفیکارت: بدون عکس، دکمهٔ ساخت غیرفعال ولی خروج آزاد است
  click(action("make-another-card"));
  click($('[data-activity="selfie"]'));
  assert.equal(visible("selfie"), true);
  assert.equal($("#selfie-make").disabled, true);
  assert.ok($("#selfie-privacy").textContent.includes("هیچ سروری"));
  assert.equal($$("#selfie-templates .chip").length, 3);
  click($('#selfie-templates [data-template-id="glow"]'));
  click($('[data-ui-action="selfie-flip"]'));
  assert.equal($("#selfie-flip").getAttribute("aria-pressed"), "true");
  click($('[data-ui-action="selfie-reset"]'));
  assert.equal($("#selfie-flip").getAttribute("aria-pressed"), "false");
  assert.equal($$('#screen-selfie [data-action="skip-to-output"]').length, 1);

  // بارگذاری عکس محلی (شبیهسازی createImageBitmap بدون هیچ درخواست شبکهای)
  const sourceCanvas = createCanvas(600, 800);
  const sctx = sourceCanvas.getContext("2d");
  sctx.fillStyle = "#3A4A5A"; sctx.fillRect(0, 0, 600, 800);
  const localImage = await loadNapiImage(sourceCanvas.toBuffer("image/png"));
  setGlobal("createImageBitmap", async () => localImage);
  const fileInput = $("#selfie-file");
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [{ name: "selfie.png", type: "image/png", size: 2048 }]
  });
  fileInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => !$("#selfie-make").disabled);
  assert.ok($("#selfie-status").textContent.length > 3);
  assert.equal($("#selfie-empty").hidden, true);

  // زوم با چرخ ماوس و جابهجایی با اشارهگر
  const preview = $("#selfie-preview");
  preview.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true }));
  assert.ok(Number($("#selfie-zoom").value) > 1, "زوم با چرخ ماوس");
  const pointer = (type, x, y) => {
    const event = new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
  };
  preview.dispatchEvent(pointer("pointerdown", 100, 100));
  preview.dispatchEvent(pointer("pointermove", 130, 120));
  preview.dispatchEvent(pointer("pointerup", 130, 120));
  click($('[data-ui-action="selfie-flip"]'));

  click($("#selfie-make"));
  await waitFor(() => visible("output"));
  assert.equal($("#output-empty").hidden, true);
  assert.ok($("#output-card-preview").getAttribute("src"));

  // دانلود و اشتراکگذاری (مسیر پشتیبانی / عدم پشتیبانی) بدون خطا
  click(action("download-card"));
  const fakeNavigator = {
    onLine: true,
    canShare: () => false,
    share: async () => {},
    clipboard: { writeText: async () => {} }
  };
  setGlobal("navigator", fakeNavigator);
  click(action("share-card"));
  await waitFor(() => !$("#output-guide").hidden);
  assert.ok($("#output-guide").textContent.includes("پیوست"));

  click($('#screen-output [data-action="go-final"]'));

  // ۹. رد کردن مستقیم از فعالیتها و بازگشت به خروجی
  click(action("home"));
  click($('#screen-welcome [data-action="resume"]'));
  assert.equal(visible("final"), true, "ادامهٔ مسیر قبل");

  // ۱۰. صفحهٔ پایانی: تنظیمات TODO و نبود سکشنهای حذفشده
  assert.equal(visible("final"), true);
  assert.ok($("#mokab-address").textContent.includes("بهزودی"));
  assert.ok($("#mokab-time").textContent.includes("بهزودی"));
  assert.equal($("#countdown-grid"), null, "سکشن شمارش معکوس حذف شده است");
  assert.equal($("#screen-final").classList.contains("screen--final"), true, "فاصلهگذاری صفحهٔ آخر");
  assert.equal($$("#screen-final > .card").length, 2);
  assert.ok($("#mokab-timezone").textContent.includes("Asia/Tehran"));
  assert.equal($("#coming-button"), null, "دکمهٔ میآیم حذف شده است");
  assert.equal($("#coming-note"), null, "یادداشت میآیم حذف شده است");
  assert.ok($$("#screen-final .btn--primary").length === 0, "هیچ دکمهٔ اصلی در صفحهٔ آخر نیست");
  const stored = JSON.parse(window.localStorage.getItem("nazra.state.v1"));
  assert.equal(stored.step, "final");

  // دعوت از دوست: مسیر جایگزین کپی (مرورگری بدون Web Share API)
  setGlobal("navigator", { onLine: true, clipboard: { writeText: async () => {} } });
  click(action("invite-friend"));
  await waitFor(() => !$("#invite-fallback").hidden);
  assert.ok($("#invite-link").value === "https://example.test/NazrA/");
  assert.ok($("#invite-text-preview").value.includes("https://example.test/NazrA/"));

  // بازگشت به ابتدا
  click(action("restart"));
  assert.equal(visible("welcome"), true);
  assert.equal($("#resume-button").hidden, true);

  // هیچ خطای JavaScript یا خطای DOM رخ نداده است.
  const realErrors = jsdomErrors.filter((message) => !/Not implemented|Could not parse CSS|navigation/i.test(message));
  assert.deepEqual(realErrors, []);
  assert.deepEqual(consoleErrors, []);
});
