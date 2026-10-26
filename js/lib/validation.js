/**
 * validation.js — اعتبارسنجی محتوای content.js در زمان اجرا.
 * رکوردهای ناقص حذف میشوند؛ رکوردهای تأییدنشده حفظ ولی برچسبگذاری میشوند.
 */
import { isSafeHttpUrl, isTodo } from "./utils.js";

const SOURCE_TYPES = new Set(["placeholder", "editorial", "app-doc", "sourced"]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCommon(record, kind, errors) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    errors.push(`رکورد ${kind} نامعتبر است.`);
    return false;
  }
  if (!hasText(record.id)) errors.push(`${kind}: شناسه (id) وجود ندارد.`);
  if (!hasText(record.category)) errors.push(`${kind}: دسته (category) وجود ندارد.`);
  if (record.category && !/^[a-z][a-z0-9_-]*$/i.test(record.category)) {
    errors.push(`${kind}: شناسهٔ دسته نامعتبر است.`);
  }
  if (!hasText(record.source)) errors.push(`${kind}: منبع (source) وجود ندارد.`);
  if (record.sourceUrl !== null && record.sourceUrl !== undefined && !isSafeHttpUrl(record.sourceUrl)) {
    errors.push(`${kind}: sourceUrl باید null یا یک آدرس http/https معتبر باشد.`);
  }
  if (record.sourceType !== undefined && !SOURCE_TYPES.has(record.sourceType)) {
    errors.push(`${kind}: sourceType ناشناخته است.`);
  }
  return true;
}

/**
 * بررسی یک رکورد متن.
 * خروجی: { valid, needsReview, errors[], record }
 * needsReview یعنی رابط باید «نمونهٔ نیازمند تأیید منبع» را نمایش دهد.
 */
export function validateTextRecord(raw) {
  const errors = [];
  if (!validateCommon(raw, "متن", errors)) return { valid: false, needsReview: true, errors, record: null };
  if (!hasText(raw.text)) errors.push("متن: بدنهٔ متن خالی است.");

  const sourceType = raw.sourceType ?? "placeholder";
  const verified = raw.verified === true;
  // نشانهٔ واقعی «نیازمند تکمیل»: شناسه یا منبع TODO، یا بدنهای که دقیقاً با TODO آغاز شود.
  const textHasTodo = isTodo(raw.text) || /^TODO\b/i.test(String(raw.text ?? "").trim());
  const sourceHasTodo = isTodo(raw.source) || /^TODO\b/i.test(String(raw.source ?? "").trim());
  const idHasTodo = /^TODO_/i.test(String(raw.id ?? ""));

  // اگر منبع TODO است، رکورد نمیتواند تأییدشده باشد.
  if (verified && (sourceHasTodo || textHasTodo || idHasTodo)) {
    errors.push("متن: رکورد حاوی TODO است ولی verified:true دارد.");
  }
  if (sourceType === "placeholder" && verified) {
    errors.push("متن: رکورد placeholder نمیتواند تأییدشده باشد.");
  }

  const valid = errors.length === 0 && hasText(raw.text);
  const needsReview = !valid || !verified || sourceType === "placeholder";
  const record = valid ? {
    id: raw.id.trim(),
    category: raw.category.trim(),
    text: raw.text.trim(),
    source: raw.source.trim(),
    sourceUrl: isSafeHttpUrl(raw.sourceUrl) ? raw.sourceUrl : null,
    verified,
    sourceType,
    needsReview
  } : null;

  return { valid, needsReview, errors, record };
}

/** بررسی یک پرسش چهارگزینهای. */
export function validateQuestionRecord(raw) {
  const errors = [];
  if (!validateCommon(raw, "پرسش", errors)) return { valid: false, needsReview: true, errors, record: null };
  if (!hasText(raw.question)) errors.push("پرسش: صورت سؤال خالی است.");
  if (!Array.isArray(raw.options) || raw.options.length !== 4 || !raw.options.every(hasText)) {
    errors.push("پرسش: دقیقاً چهار گزینهٔ غیرخالی لازم است.");
  }
  if (!Number.isInteger(raw.correctIndex) || raw.correctIndex < 0 || raw.correctIndex > 3) {
    errors.push("پرسش: correctIndex باید عددی بین ۰ و ۳ باشد.");
  }
  if (!hasText(raw.explanation)) errors.push("پرسش: توضیح پاسخ خالی است.");

  const sourceType = raw.sourceType ?? "placeholder";
  const verified = raw.verified === true;
  // پرسشهای فنی ممکن است واژهٔ TODO را *توضیح* دهند؛ فقط نشانههای ساختاری مهماند.
  const hasTodo = isTodo(raw.source) || /^TODO\b/i.test(String(raw.source ?? "").trim()) ||
    /^TODO_/i.test(String(raw.id ?? "")) ||
    /^TODO\b/i.test(String(raw.question ?? "").trim());
  if (verified && hasTodo) errors.push("پرسش: حاوی TODO است ولی verified:true دارد.");
  if (sourceType === "placeholder" && verified) errors.push("پرسش: placeholder نمیتواند تأییدشده باشد.");

  const valid = errors.length === 0;
  const needsReview = !valid || !verified || sourceType === "placeholder";
  const record = valid ? {
    id: raw.id.trim(),
    category: raw.category.trim(),
    question: raw.question.trim(),
    options: raw.options.map((o) => o.trim()),
    correctIndex: raw.correctIndex,
    explanation: raw.explanation.trim(),
    source: raw.source.trim(),
    sourceUrl: isSafeHttpUrl(raw.sourceUrl) ? raw.sourceUrl : null,
    verified,
    sourceType,
    needsReview
  } : null;

  return { valid, needsReview, errors, record };
}

/** اعتبارسنجی کل مجموعهٔ محتوا. */
export function validateContent({ texts = [], questions = [], categories = [] } = {}) {
  const errors = [];
  const validTexts = [];
  const validQuestions = [];
  const knownCategories = new Set(categories.map((c) => c.id));

  texts.forEach((raw, i) => {
    const result = validateTextRecord(raw);
    if (!result.valid) errors.push(`متن #${i + 1}: ${result.errors.join(" ")}`);
    else {
      if (knownCategories.size && !knownCategories.has(result.record.category)) {
        errors.push(`متن #${i + 1}: دستهٔ ناشناخته «${result.record.category}»`);
      } else validTexts.push(result.record);
    }
  });

  questions.forEach((raw, i) => {
    const result = validateQuestionRecord(raw);
    if (!result.valid) errors.push(`پرسش #${i + 1}: ${result.errors.join(" ")}`);
    else {
      if (knownCategories.size && !knownCategories.has(result.record.category)) {
        errors.push(`پرسش #${i + 1}: دستهٔ ناشناخته «${result.record.category}»`);
      } else validQuestions.push(result.record);
    }
  });

  return { texts: validTexts, questions: validQuestions, errors };
}

export function getTextsByCategory(texts, category) {
  return texts.filter((t) => t.category === category);
}

export function getQuestionsByCategory(questions, category) {
  return questions.filter((q) => q.category === category);
}
