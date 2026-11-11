import test from "node:test";
import assert from "node:assert/strict";
import { selectQuestions, scoreQuiz, getResultMessage } from "../js/lib/quiz-engine.js";
import { QUESTION_RECORDS, QUIZ_MESSAGES, CATEGORIES } from "../js/content.js";
import { validateContent } from "../js/lib/validation.js";

const questions = validateContent({ texts: [], questions: QUESTION_RECORDS, categories: CATEGORIES }).questions;

test("برای هر دسته سه پرسش متمایز از همان دسته انتخاب میشود", () => {
  for (const category of CATEGORIES) {
    const selected = selectQuestions(questions, category.id, 3, () => 0.37);
    assert.equal(selected.length, 3);
    assert.equal(new Set(selected.map((q) => q.id)).size, 3);
    assert.ok(selected.every((q) => q.category === category.id));
    assert.ok(selected.every((q) => q.verified === true), "پرسشهای تأییدنشده در اولویت نیستند");
  }
});

test("امتیاز فقط از correctIndex دادهها محاسبه میشود", () => {
  const sample = questions.filter((q) => q.category === "scientific").slice(0, 3);
  const allCorrect = scoreQuiz(sample, sample.map((q) => q.correctIndex));
  assert.deepEqual({ correct: allCorrect.correct, total: allCorrect.total, percent: allCorrect.percent }, { correct: 3, total: 3, percent: 100 });
  const mixed = scoreQuiz(sample, [sample[0].correctIndex, (sample[1].correctIndex + 1) % 4, null]);
  assert.equal(mixed.correct, 1);
  assert.equal(mixed.percent, 33);
  assert.equal(mixed.details[2].correct, false);
  assert.equal(scoreQuiz([], []).total, 0);
  assert.equal(scoreQuiz(sample, undefined).correct, 0);
});

test("پیام تشویقی متناسب با نتیجه است", () => {
  assert.equal(getResultMessage({ correct: 3, total: 3 }, QUIZ_MESSAGES), QUIZ_MESSAGES.perfect);
  assert.equal(getResultMessage({ correct: 2, total: 3 }, QUIZ_MESSAGES), QUIZ_MESSAGES.good);
  assert.equal(getResultMessage({ correct: 1, total: 3 }, QUIZ_MESSAGES), QUIZ_MESSAGES.fair);
  assert.equal(getResultMessage({ correct: 0, total: 3 }, QUIZ_MESSAGES), QUIZ_MESSAGES.low);
});
