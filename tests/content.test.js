import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, TEXT_RECORDS, QUESTION_RECORDS, CARD_TEMPLATES, COPY } from "../js/content.js";
import { validateContent, validateTextRecord, validateQuestionRecord, getTextsByCategory, getQuestionsByCategory } from "../js/lib/validation.js";

const result = validateContent({ texts: TEXT_RECORDS, questions: QUESTION_RECORDS, categories: CATEGORIES });

test("همهٔ رکوردها معتبر و بدون خطای اعتبارسنجیاند", () => {
  assert.deepEqual(result.errors, []);
  assert.equal(result.texts.length, TEXT_RECORDS.length);
  assert.equal(result.questions.length, QUESTION_RECORDS.length);
});

test("هر دسته حداقل پنج متن و سه پرسش دارد", () => {
  for (const category of CATEGORIES) {
    assert.ok(getTextsByCategory(result.texts, category.id).length >= 5, `متنهای ${category.id}`);
    assert.ok(getQuestionsByCategory(result.questions, category.id).length >= 3, `پرسشهای ${category.id}`);
  }
});

test("همهٔ پرسشها چهار گزینه و اندیس پاسخ معتبر دارند", () => {
  for (const q of result.questions) {
    assert.equal(q.options.length, 4);
    assert.ok(q.options.every((o) => o.trim().length > 0));
    assert.ok(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3);
    assert.ok(q.explanation.length > 0 && q.source.length > 0);
  }
});

test("محتوای TODO بهعنوان تأییدشده معرفی نمیشود", () => {
  const todos = result.texts.filter((t) => t.sourceType === "placeholder");
  assert.ok(todos.length >= 15);
  for (const todo of todos) {
    assert.equal(todo.verified, false);
    assert.equal(todo.needsReview, true);
    assert.ok(todo.id.startsWith("TODO_"));
    assert.ok(todo.text.startsWith("TODO"));
    assert.ok(todo.source.startsWith("TODO"));
    assert.equal(todo.sourceUrl, null);
  }
});

test("متنهای تدوینی و پرسشهای فنی، منبع شفاف و غیردینی دارند", () => {
  for (const record of [...result.texts, ...result.questions]) {
    if (record.sourceType === "placeholder") continue;
    assert.equal(record.verified, true);
    assert.equal(record.needsReview, false);
    assert.ok(!record.source.startsWith("TODO"));
    if (record.sourceType === "editorial") {
      assert.ok(record.source.includes("متن تدوینی برنامه"));
      assert.ok(record.source.includes("بدون نقل قول"));
    }
  }
});

test("اعتبارسنجی رکوردهای ناقص و متناقض را رد میکند", () => {
  assert.equal(validateTextRecord({ id: "x", category: "scientific", text: "", source: "s" }).valid, false);
  assert.equal(validateTextRecord({ id: "TODO_x", category: "scientific", text: "TODO — متن", source: "TODO — منبع", verified: true }).valid, false);
  assert.equal(validateQuestionRecord({ id: "q", category: "scientific", question: "؟", options: ["a", "b", "c"], correctIndex: 0, explanation: "e", source: "s" }).valid, false);
  assert.equal(validateTextRecord({ id: "x", category: "scientific", text: "متن", source: "منبع", sourceUrl: "javascript:alert(1)" }).valid, false);
  assert.equal(validateTextRecord({ id: "x", category: "scientific", text: "متن", source: "منبع", sourceUrl: "https://example.org/a", verified: false }).record.sourceUrl, "https://example.org/a");
});

test("رکورد متن منقول (sourced) با منبع دقیق پذیرفته و بدون برچسب TODO میشود", () => {
  const record = validateTextRecord({
    id: "sourced_prayer_001", category: "prayer",
    text: "متن دقیق با مأخذ", source: "نام کتاب، ناشر، صفحهٔ ۱۲۳",
    sourceUrl: "https://example.org/book", verified: true, sourceType: "sourced"
  });
  assert.equal(record.valid, true);
  assert.equal(record.needsReview, false);
  assert.equal(record.record.sourceType, "sourced");
  assert.equal(record.record.sourceUrl, "https://example.org/book");
  // Invalid or unverified sources still get flagged.
  assert.equal(validateTextRecord({
    id: "sourced_x", category: "prayer", text: "متن",
    source: "TODO — منبع", verified: true, sourceType: "sourced"
  }).valid, false);
  assert.ok(COPY.badgeSourced.includes("منبع"));
});

test("سه قالب کارت و پیامهای آزمون تعریف شدهاند", () => {
  assert.deepEqual(CARD_TEMPLATES.map((t) => t.id), ["gold", "glow", "band"]);
  for (const t of CARD_TEMPLATES) assert.ok(t.label && t.hint);
  assert.ok(COPY.shareGuide.includes("پیوست"));
  assert.ok(COPY.timeMissing.includes("بهزودی"));
});
