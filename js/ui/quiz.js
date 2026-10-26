/** quiz.js — کنترلر صفحهٔ پرسش و پاسخ (منطق امتیاز در quiz-engine.js). */
import { selectQuestions, scoreQuiz, getResultMessage } from "../lib/quiz-engine.js";
import { escapeHtml, toFaDigits } from "../lib/utils.js";
import { setLoading } from "./common.js";

const OPTION_KEYS = ["الف", "ب", "ج", "د"];

export function createQuizUI({ root, questions, copy, quizMessages = {}, toast, makeCard, getCurrentText, templateId, onProgress } = {}) {
  const $ = (sel) => root.querySelector(sel);
  const progressWrap = $("#quiz-progress-wrap");
  const progressText = $("#quiz-progress");
  const progressScore = $("#quiz-progress-score");
  const progressFill = $("#quiz-progress-fill");
  const panel = $("#quiz-question-panel");
  const questionText = $("#quiz-question");
  const optionsBox = $("#quiz-options");
  const feedback = $("#quiz-feedback");
  const feedbackTitle = $("#quiz-feedback-title");
  const feedbackExplanation = $("#quiz-feedback-explanation");
  const feedbackSource = $("#quiz-feedback-source");
  const nextButton = $("#quiz-next");
  const result = $("#quiz-result");
  const resultScore = $("#quiz-score");
  const resultMessage = $("#quiz-message");
  const makeCardButton = $("#quiz-make-card");
  const notice = $("#quiz-notice");

  if (notice) notice.textContent = copy.quizNotice;

  let session = null;   // {questions, answers, index}
  let category = null;

  function publishProgress() {
    if (!session) return;
    onProgress?.({
      questionIds: session.questions.map((q) => q.id),
      answers: session.answers.slice(),
      index: session.index
    });
  }

  function start(categoryId) {
    category = categoryId;
    session = { questions: selectQuestions(questions, categoryId, 3), answers: [], index: 0 };
    publishProgress();
    render();
  }

  /** بازیابی نشست نیمهتمام از localStorage. */
  function restore(categoryId, saved) {
    category = categoryId;
    const byId = new Map(questions.map((q) => [q.id, q]));
    const restored = (saved?.questionIds ?? []).map((id) => byId.get(id)).filter(Boolean);
    if (restored.length === 3) {
      session = {
        questions: restored,
        answers: Array.isArray(saved.answers) ? saved.answers.slice(0, 3) : [],
        index: Math.min(3, Math.max(0, Number(saved.index) || 0))
      };
    } else start(categoryId);
    render();
  }

  function render() {
    if (!session || !session.questions.length) {
      panel.hidden = true;
      progressWrap.hidden = true;
      result.hidden = false;
      resultScore.textContent = copy.quizNoQuestions;
      resultMessage.textContent = "";
      makeCardButton.hidden = true;
      return;
    }
    makeCardButton.hidden = false;
    if (session.index >= session.questions.length) { renderResult(); return; }

    result.hidden = true;
    panel.hidden = false;
    progressWrap.hidden = false;
    feedback.hidden = true;

    const index = session.index;
    const q = session.questions[index];
    progressText.textContent = copy.quizProgress(toFaDigits(index + 1), toFaDigits(session.questions.length));
    progressScore.textContent = `${toFaDigits(session.answers.length)} پاسخ`;
    progressFill.style.width = `${((index + (session.answers[index] !== undefined ? 1 : 0)) / session.questions.length) * 100}%`;
    questionText.textContent = q.question;

    const answered = session.answers[index] !== undefined && session.answers[index] !== null;
    optionsBox.innerHTML = q.options.map((option, i) => `
      <button type="button" class="quiz-option" data-option-index="${i}"
              ${answered ? "disabled" : ""}>
        <span class="quiz-option__key">${OPTION_KEYS[i]}</span>
        <span>${escapeHtml(option)}</span>
      </button>`).join("");

    if (answered) revealAnswer(session.answers[index]);
  }

  function revealAnswer(chosenIndex) {
    const q = session.questions[session.index];
    const buttons = [...optionsBox.querySelectorAll(".quiz-option")];
    buttons.forEach((button, i) => {
      button.disabled = true;
      if (i === q.correctIndex) button.classList.add("is-correct");
      if (i === chosenIndex) {
        button.classList.add("is-selected");
        if (i !== q.correctIndex) button.classList.add("is-wrong");
      }
    });
    const correct = chosenIndex === q.correctIndex;
    feedbackTitle.textContent = correct ? copy.quizCorrect : copy.quizWrong;
    feedbackExplanation.textContent = q.explanation;
    feedbackSource.textContent = q.source;
    feedback.hidden = false;
    nextButton.textContent = session.index + 1 >= session.questions.length ? copy.quizSeeResult : copy.quizNext;
    progressFill.style.width = `${((session.index + 1) / session.questions.length) * 100}%`;
  }

  function answer(index) {
    if (!session || session.answers[session.index] !== undefined) return;
    session.answers[session.index] = index;
    publishProgress();
    revealAnswer(index);
  }

  function next() {
    if (!session) return;
    session.index += 1;
    publishProgress();
    render();
  }

  function renderResult() {
    panel.hidden = true;
    progressWrap.hidden = true;
    result.hidden = false;
    const score = scoreQuiz(session.questions, session.answers);
    resultScore.textContent = copy.quizScore(toFaDigits(score.correct), toFaDigits(score.total));
    resultMessage.textContent = getResultMessage(score, quizMessages);
    toast.announce(`${copy.quizResultTitle}: ${resultScore.textContent}`);
  }

  async function buildCard(button) {
    if (!session) return;
    const score = scoreQuiz(session.questions, session.answers);
    const text = getCurrentText?.()?.text ?? "";
    await makeCard({
      type: "quiz",
      text,
      score: { correct: score.correct, total: score.total },
      templateId: templateId?.() ?? "gold"
    }, button);
  }

  root.addEventListener("click", (event) => {
    const option = event.target.closest("[data-option-index]");
    if (option) { answer(Number(option.dataset.optionIndex)); return; }
    const action = event.target.closest("[data-ui-action]")?.dataset.uiAction;
    if (action === "quiz-next") next();
    else if (action === "quiz-restart") start(category);
    else if (action === "quiz-make-card") {
      buildCard(event.target.closest("button")).catch(() => toast.error(copy.cardFailed));
    }
  });

  return {
    start,
    restore,
    leave() { setLoading(makeCardButton, false); },
    get finished() { return Boolean(session && session.index >= session.questions.length); },
    get session() { return session ? { ...session, questions: session.questions.slice() } : null; }
  };
}
