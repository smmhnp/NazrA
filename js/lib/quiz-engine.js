/**
 * quiz-engine.js — انتخاب پرسش و محاسبهٔ امتیاز (منطق خالص).
 * پاسخ صحیح فقط از content.js خوانده میشود؛ هیچ پاسخی در رابط ثابت نشده است.
 */
import { randomIndex } from "./utils.js";

/** سه پرسش تصادفی از یک دسته؛ پرسشهای تأییدشده در اولویتاند. */
export function selectQuestions(questions, category, count = 3, rng = Math.random) {
  const inCategory = (questions ?? []).filter((q) => q && q.category === category);
  const verified = inCategory.filter((q) => q.verified === true);
  const source = verified.length >= count ? verified : inCategory;
  const pool = [...source];
  const selected = [];
  while (pool.length && selected.length < count) {
    const i = randomIndex(pool.length, rng);
    selected.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return selected;
}

/**
 * @param {Array} questions پرسشهای انتخابشده
 * @param {Array<number|null>} answers اندیس گزینهٔ انتخابشده برای هر پرسش
 */
export function scoreQuiz(questions, answers) {
  const list = Array.isArray(questions) ? questions : [];
  const given = Array.isArray(answers) ? answers : [];
  const details = list.map((q, i) => ({
    id: q?.id ?? `q${i}`,
    chosenIndex: Number.isInteger(given[i]) ? given[i] : null,
    correctIndex: q?.correctIndex ?? -1,
    correct: Number.isInteger(given[i]) && given[i] === q?.correctIndex
  }));
  const correct = details.filter((d) => d.correct).length;
  const total = list.length;
  return {
    correct,
    total,
    percent: total ? Math.round((correct / total) * 100) : 0,
    details
  };
}

export function getResultMessage(result, messages = {}) {
  if (!result || !result.total) return messages.fair ?? "";
  const ratio = result.correct / result.total;
  if (ratio === 1) return messages.perfect ?? "";
  if (ratio >= 0.66) return messages.good ?? "";
  if (ratio >= 0.33) return messages.fair ?? "";
  return messages.low ?? "";
}
