import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_WIDTH, CARD_HEIGHT, CARD_RATIO, CARD_PRESETS, CARD_TEMPLATE_IDS,
  wrapText, fitTextLayout, clampImageTransform, renderCard, renderCardScaled,
  createCardBlob, CardEngineError
} from "../js/card-engine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let createCanvas, GlobalFonts, loadImage;
try {
  ({ createCanvas, GlobalFonts, loadImage } = await import("@napi-rs/canvas"));
  const fontPath = path.join(root, "assets/fonts/vazirmatn/Vazirmatn-Variable.ttf");
  if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, "Vazirmatn");
} catch {
  createCanvas = null;
}

const brand = { background: "#0E0F12", surface: "#16181D", text: "#EDE8DC", gold: "#C9A24B" };
const baseOptions = {
  universityName: "موسسه آموزش عالی شاندیز",
  programTitle: "نهضت هر شب جمعه",
  headerLine: "ایام فاطمیه • نهضت هر شب جمعه",
  footerLine: "شب جمعه، موکب …",
  brand,
  fontFamily: "Vazirmatn"
};
const longText = "دانستن، وقتی فروتنی بیاورد، چراغی است که راه را نشان میدهد؛ نه وسیلهای برای برتریجویی. ".repeat(6);

test("ابعاد و نسبت خروجی ثابتاند", () => {
  assert.equal(CARD_WIDTH, 1080);
  assert.equal(CARD_HEIGHT, 1350);
  assert.equal(CARD_RATIO, "4:5");
  assert.equal(CARD_TEMPLATE_IDS.length, 3);
});

/** ctx سادهای که عرض واقعی را شبیهسازی میکند (بدون وابستگی). */
function mockCtx() {
  return {
    font: "600 40px sans-serif",
    measureText(text) { return { width: String(text).length * (parseFloat(this.font.match(/(\d+)px/)?.[1] ?? 40) * 0.5) }; }
  };
}

test("wrapText خطوط را با اندازهگیری میشکند و از maxLines تجاوز نمیکند", () => {
  const ctx = mockCtx();
  const lines = wrapText(ctx, "سلام دنیا این یک متن تست است", 200, { maxLines: 8 });
  assert.ok(lines.length >= 1 && lines.length <= 8);
  assert.ok(lines.every((line) => ctx.measureText(line).width <= 200 + 0.001));
  assert.equal(wrapText(ctx, "", 200).length, 1);
  const newline = wrapText(ctx, "خط یک\nخط دو", 1000);
  assert.deepEqual(newline, ["خط یک", "خط دو"]);
  const longWord = wrapText(ctx, "a".repeat(80), 100);
  assert.ok(longWord.length > 1);
  assert.ok(longWord.every((l) => l.length < 80));
});

test("fitTextLayout برای متن بلند اندازهٔ فونت را کنترلشده کاهش میدهد", () => {
  const ctx = mockCtx();
  const short = fitTextLayout(ctx, "یک جملهٔ کوتاه", { maxWidth: 600, maxHeight: 400, baseSize: 60, minSize: 28, maxLines: 8 });
  const long = fitTextLayout(ctx, longText, { maxWidth: 600, maxHeight: 400, baseSize: 60, minSize: 28, maxLines: 8 });
  assert.equal(short.fontSize, 60);
  assert.ok(long.fontSize < short.fontSize);
  assert.ok(long.fontSize >= 28);
  assert.ok(long.lines.length <= 8);
  assert.ok(long.totalHeight <= 400 + long.lineHeight);
});

test("clampImageTransform تصویر را محدود به پوشش کامل قاب نگه میدارد", () => {
  const frame = CARD_PRESETS.gold.media;
  const image = { width: 800, height: 1000 };
  const t = clampImageTransform(image, frame, { scale: 2, x: 5, y: -5 });
  assert.equal(t.scale, 2);
  assert.equal(t.x, 1);
  assert.equal(t.y, -1);
  assert.ok(t.width >= frame.w && t.height >= frame.h);
  assert.ok(Math.abs(t.offsetX) <= (t.width - frame.w) / 2 + 0.001);
  const normal = clampImageTransform(image, frame, { scale: 1, x: 0.5, y: 0 });
  assert.ok(normal.width >= frame.w && normal.height >= frame.h);
});

test("رندر هر سه قالب و هر سه نوع کارت، خطا نمیدهد و متن داخل محدودهٔ امن است", { skip: !createCanvas }, () => {
  for (const templateId of CARD_TEMPLATE_IDS) {
    for (const type of ["postcard", "quiz", "selfie"]) {
      const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
      const ctx = canvas.getContext("2d");
      const drawnText = [];
      const proxy = new Proxy(ctx, {
        get(target, prop) {
          if (prop === "fillText") {
            return (text, x, y) => {
              const width = target.measureText(String(text)).width;
              const align = target.textAlign;
              const left = align === "center" ? x - width / 2 : align === "left" ? x : x - width;
              drawnText.push({ text: String(text), left, right: left + width, y });
              return target.fillText(text, x, y);
            };
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, prop, value) { target[prop] = value; return true; }
      });
      const options = {
        ...baseOptions, type, templateId, text: longText.slice(0, 240),
        name: type === "postcard" ? "علی رضایی" : "",
        score: type === "quiz" ? { correct: 2, total: 3 } : null
      };
      const result = renderCard(proxy, options);
      assert.equal(result.width, 1080);
      assert.equal(result.height, 1350);
      assert.ok(drawnText.length >= 5);
      for (const item of drawnText) {
        assert.ok(item.left >= 20, `متن از سمت چپ خارج شد: ${item.text.slice(0, 20)}`);
        assert.ok(item.right <= CARD_WIDTH - 20, `متن از سمت راست خارج شد: ${item.text.slice(0, 20)}`);
        assert.ok(item.y >= 80 && item.y <= CARD_HEIGHT - 30, `متن در محدودهٔ عمودی امن نیست: ${item.y}`);
      }
      const buffer = canvas.toBuffer("image/png");
      assert.equal(buffer.subarray(1, 4).toString(), "PNG");
      assert.equal(buffer.readUInt32BE(16), CARD_WIDTH);
      assert.equal(buffer.readUInt32BE(20), CARD_HEIGHT);
    }
  }
});

test("رندر سلفی با تصویر، آینه و جابهجایی کار میکند", { skip: !createCanvas }, async () => {
  const src = createCanvas(800, 1000);
  const c = src.getContext("2d");
  c.fillStyle = "#345"; c.fillRect(0, 0, 800, 1000);
  const photo = await loadImage(src.toBuffer("image/png"));
  for (const mirror of [false, true]) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    assert.doesNotThrow(() => renderCard(canvas.getContext("2d"), {
      ...baseOptions, type: "selfie", templateId: "band", text: "شب جمعه، یادشان را زنده نگه میداریم.",
      userImage: photo, imageTransform: { scale: 1.8, x: 0.4, y: -0.3 }, mirror
    }));
    assert.equal(canvas.toBuffer("image/png").readUInt32BE(16), 1080);
  }
});

test("renderCardScaled همان خروجی را در مقیاس کوچک میدهد", { skip: !createCanvas }, () => {
  const canvas = createCanvas(540, 675);
  const result = renderCardScaled(canvas.getContext("2d"), { ...baseOptions, type: "postcard", templateId: "glow", text: "متن کوتاه" }, 0.5);
  assert.equal(result.width, 1080);
  assert.equal(canvas.toBuffer("image/png").readUInt32BE(16), 540);
});

test("createCardBlob فایل PNG دقیقاً ۱۰۸۰×۱۳۵۰ تولید میکند", { skip: !createCanvas }, async () => {
  const napi = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const fakeCanvas = {
    width: CARD_WIDTH, height: CARD_HEIGHT,
    getContext: () => napi.getContext("2d"),
    toBlob: (callback) => callback(new Blob([napi.toBuffer("image/png")], { type: "image/png" }))
  };
  const previousDocument = globalThis.document;
  globalThis.document = { fonts: undefined };
  try {
    const result = await createCardBlob({
      ...baseOptions, type: "postcard", templateId: "gold",
      text: "متنی برای کارت نهایی", name: "",
      canvas: fakeCanvas, logoPath: null
    });
    assert.equal(result.width, 1080);
    assert.equal(result.height, 1350);
    assert.equal(result.mimeType, "image/png");
    const buffer = Buffer.from(await result.blob.arrayBuffer());
    assert.equal(buffer.readUInt32BE(16), 1080);
    assert.equal(buffer.readUInt32BE(20), 1350);
    assert.ok(result.blob.size > 10000);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("خطاهای بوم و تصویر بهصورت قابلتفکیک گزارش میشوند", async () => {
  assert.throws(() => renderCard(null, {}), (error) => error instanceof CardEngineError && error.code === "CANVAS_UNAVAILABLE");
  const previous = globalThis.document;
  delete globalThis.document;
  try {
    await assert.rejects(
      () => createCardBlob({ ...baseOptions, type: "postcard", text: "x" }),
      (error) => error instanceof CardEngineError && error.code === "CANVAS_UNAVAILABLE"
    );
  } finally {
    if (previous !== undefined) globalThis.document = previous;
  }
});
