/**
 * app.js — مسیریاب، وضعیت و هماهنگی کل برنامه.
 * ترتیب: خوشآمد → دستهها → متن → فعالیتها → (آزمون/کارتپستال/سلفی) → خروجی → پایان.
 * هیچ اطلاعاتی به سرور ارسال نمیشود؛ همهچیز محلی است.
 */
import { CONFIG } from "./config.js";
import {
  CATEGORIES, TEXT_RECORDS, QUESTION_RECORDS, CARD_TEMPLATES, COPY, QUIZ_MESSAGES
} from "./content.js";
import { validateContent, getTextsByCategory } from "./lib/validation.js";
import { pickText, findRecordById } from "./lib/selection.js";
import { createStateStore } from "./lib/storage.js";
import { parseEventTime, getNextEvent, getCountdown, formatEventDate } from "./lib/time.js";
import { isTodo, toFaDigits, isSafeHttpUrl, escapeHtml } from "./lib/utils.js";
import {
  buildFileName, shareOrDownload, copyText, inviteFriend, getAppUrl, defaultDownload
} from "./lib/share.js";
import { createCardBlob, ensureCardFonts } from "./card-engine.js";
import { createToaster } from "./ui/toast.js";
import { createQuizUI } from "./ui/quiz.js";
import { createPostcardUI } from "./ui/postcard.js";
import { createSelfieUI } from "./ui/selfie.js";
import { setLoading, iconSvg, cardBrandOptions } from "./ui/common.js";

const $ = (selector, base = document) => base.querySelector(selector);
const $$ = (selector, base = document) => [...base.querySelectorAll(selector)];
const WEEKDAYS = ["یکشنبه", "دوشنبه", "سهشنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

const SCREEN_META = {
  welcome:    { step: 1, label: "آغاز" },
  categories: { step: 2, label: "انتخاب دسته" },
  text:       { step: 3, label: "متن" },
  activities: { step: 4, label: "فعالیتها" },
  quiz:       { step: 4, label: "پرسش و پاسخ" },
  postcard:   { step: 4, label: "کارتپستال" },
  selfie:     { step: 4, label: "سلفیکارت" },
  output:     { step: 5, label: "خروجی" },
  final:      { step: 6, label: "پایان" }
};

const toast = createToaster({ root: $("#toast-region"), statusRoot: $("#sr-status") });
const store = createStateStore({
  key: CONFIG.storageKey,
  onError: () => toast.error(COPY.errors.storage)
});

const validated = validateContent({
  texts: TEXT_RECORDS, questions: QUESTION_RECORDS, categories: CATEGORIES
});
if (validated.errors.length) console.warn("[محتوا] رکوردهای نامعتبر:", validated.errors);

let S = store.load();
const runtime = {
  currentScreen: "welcome",
  currentText: null,
  card: null,
  cardUrl: null,
  countdownTimer: null,
  nextEvent: null,
  onlineBannerTimer: null
};

function setState(patch) { S = store.save(patch); return S; }

/* ------------------------------------------------------------------ */
/* اجزای مشترک                                                        */
/* ------------------------------------------------------------------ */

function setCard(result, options = {}) {
  if (runtime.cardUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
    try { URL.revokeObjectURL(runtime.cardUrl); } catch { /*noop*/ }
  }
  try {
    runtime.card = {
      blob: result.blob,
      type: options.type ?? "postcard",
      templateId: options.templateId ?? "gold",
      width: result.width,
      height: result.height
    };
    if (typeof URL !== "undefined" && URL.createObjectURL) runtime.cardUrl = URL.createObjectURL(result.blob);
    else runtime.cardUrl = null;
  } catch {
    runtime.card = null;
    runtime.cardUrl = null;
    toast.error(COPY.errors.unexpected);
  }
}

function clearCard() {
  if (runtime.cardUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
    try { URL.revokeObjectURL(runtime.cardUrl); } catch { /*noop*/ }
  }
  runtime.card = null;
  runtime.cardUrl = null;
}

async function makeCard(options, button) {
  setLoading(button, true, COPY.cardMaking);
  try {
    const result = await createCardBlob(cardBrandOptions(CONFIG, options));
    setCard(result, options);
    if (result.fontFallback) toast.info(COPY.cardFontFallback);
    renderOutput();
    showScreen("output");
    toast.success(COPY.cardMade);
  } catch (error) {
    console.error("[ساخت کارت]", error);
    toast.error(COPY.cardFailed);
  } finally {
    setLoading(button, false);
  }
}

/* ------------------------------------------------------------------ */
/* ماژولهای فعالیت                                                    */
/* ------------------------------------------------------------------ */

const quizUI = createQuizUI({
  root: $("#screen-quiz"),
  questions: validated.questions,
  copy: COPY,
  quizMessages: QUIZ_MESSAGES,
  toast,
  makeCard,
  getCurrentText: () => runtime.currentText,
  templateId: () => S.ui.postcardTemplate,
  onProgress: (quiz) => setState({ quiz })
});

const postcardUI = createPostcardUI({
  root: $("#screen-postcard"),
  config: CONFIG,
  templates: CARD_TEMPLATES,
  copy: COPY,
  toast,
  makeCard,
  getCurrentText: () => runtime.currentText,
  initialTemplate: S.ui.postcardTemplate,
  onTemplateChange: (id) => setState({ ui: { ...S.ui, postcardTemplate: id } })
});

const selfieUI = createSelfieUI({
  root: $("#screen-selfie"),
  config: CONFIG,
  templates: CARD_TEMPLATES,
  copy: COPY,
  toast,
  makeCard,
  initialTemplate: S.ui.selfieTemplate,
  onTemplateChange: (id) => setState({ ui: { ...S.ui, selfieTemplate: id } })
});

const activityModules = { quiz: quizUI, postcard: postcardUI, selfie: selfieUI };

/* ------------------------------------------------------------------ */
/* مسیریابی                                                           */
/* ------------------------------------------------------------------ */

function stopCountdown() {
  if (runtime.countdownTimer) { clearInterval(runtime.countdownTimer); runtime.countdownTimer = null; }
}

function showScreen(name, { persist = true, focus = true } = {}) {
  if (!SCREEN_META[name]) name = "welcome";
  const previous = runtime.currentScreen;
  if (previous && previous !== name && activityModules[previous]) activityModules[previous].leave?.();

  $$(".screen").forEach((section) => { section.hidden = section.dataset.screen !== name; });
  const target = $(`#screen-${name}`);
  target?.classList.remove("is-entering");
  // اجبار به reflow تا انیمیشن هر بار اجرا شود.
  void target?.offsetWidth;
  target?.classList.add("is-entering");
  runtime.currentScreen = name;

  const meta = SCREEN_META[name];
  const header = $("#app-header");
  const stepper = $("#stepper");
  if (header) header.hidden = name === "welcome";
  if (stepper) stepper.hidden = name === "welcome";
  $("#stepper-label").textContent = `گام ${toFaDigits(meta.step)} از ${toFaDigits(6)}`;
  $("#stepper-name").textContent = meta.label;
  $("#stepper-fill").style.width = `${(meta.step / 6) * 100}%`;
  $("#stepper-progress").setAttribute("aria-valuenow", String(meta.step));

  if (name !== "final") stopCountdown();

  if (name === "text") renderText(runtime.currentText);
  else if (name === "quiz") initQuizSession();
  else if (name === "postcard") postcardUI.enter();
  else if (name === "selfie") selfieUI.enter();
  else if (name === "output") renderOutput();
  else if (name === "final") renderFinal();
  else if (name === "welcome") updateResumeButton();
  if (name === "activities") { /* هیچ پیشنیازی لازم نیست */ }

  try { window.scrollTo(0, 0); } catch { /*noop*/ }
  if (focus) {
    const heading = target?.querySelector("h1[tabindex='-1']");
    try { heading?.focus({ preventScroll: true }); } catch { heading?.focus(); }
  }
  if (persist) setState({ step: name });
}

function updateResumeButton() {
  const button = $("#resume-button");
  if (button) button.hidden = !S.step || S.step === "welcome";
}

function resumeFlow() {
  const step = S.step && SCREEN_META[S.step] ? S.step : "welcome";
  if (step !== "welcome" && !S.category) { showScreen("categories"); return; }
  if (["text", "activities", "quiz", "postcard", "selfie", "output", "final"].includes(step) && !runtime.currentText) {
    const records = getTextsByCategory(validated.texts, S.category);
    runtime.currentText = records[0] ?? null;
  }
  showScreen(step);
}

/* ------------------------------------------------------------------ */
/* دستهها و متنها                                                     */
/* ------------------------------------------------------------------ */

function renderCategories() {
  const grid = $("#categories-grid");
  if (!grid) return;
  grid.innerHTML = CATEGORIES.map((category) => `
    <button class="category-card" type="button" data-action="choose-category" data-category-id="${escapeHtml(category.id)}"
            aria-label="${escapeHtml(category.title)}: ${escapeHtml(category.description)}">
      <span class="category-card__icon">${iconSvg(category.icon)}</span>
      <span class="category-card__text"><strong>${escapeHtml(category.title)}</strong><small>${escapeHtml(category.description)}</small></span>
    </button>`).join("");
}

function renderText(record) {
  const body = $("#text-body");
  if (!body) return;
  if (!record) {
    body.textContent = COPY.textEmpty;
    $("#text-badge").textContent = COPY.badgeTodo;
    $("#text-badge").className = "badge badge--todo";
    $("#text-source").textContent = COPY.sourceMissing;
    $("#text-source-link").hidden = true;
    $("#text-note").hidden = true;
    return;
  }
  const category = CATEGORIES.find((c) => c.id === record.category);
  $("#text-category-label").textContent = category?.title ?? record.category;

  const badge = $("#text-badge");
  if (record.needsReview) {
    badge.textContent = COPY.badgeTodo;
    badge.className = "badge badge--todo";
  } else if (record.sourceType === "editorial") {
    badge.textContent = COPY.badgeEditorial;
    badge.className = "badge badge--editorial";
  } else {
    badge.textContent = COPY.badgeAppDoc;
    badge.className = "badge";
  }

  body.textContent = record.text;
  body.classList.toggle("is-long", record.text.length > 200);
  body.classList.remove("is-swapping");
  void body.offsetWidth;
  body.classList.add("is-swapping");

  $("#text-source").textContent = record.source;
  const link = $("#text-source-link");
  if (record.sourceUrl && isSafeHttpUrl(record.sourceUrl)) {
    link.href = record.sourceUrl;
    link.hidden = false;
  } else {
    link.removeAttribute("href");
    link.hidden = true;
  }
  const note = $("#text-note");
  note.textContent = record.needsReview ? COPY.textTodoNote
    : record.sourceType === "editorial" ? COPY.textEditorialNote : "";
  note.hidden = !note.textContent;
}

function selectCategory(id) {
  if (!CATEGORIES.some((c) => c.id === id)) { showScreen("categories"); return; }
  const records = getTextsByCategory(validated.texts, id);
  if (!records.length) { toast.error(COPY.textEmpty); return; }
  setState({
    category: id,
    currentTextId: null,
    quiz: { questionIds: [], answers: [], index: 0 }
  });
  pickNewText(true);
  showScreen("text");
}

function pickNewText(reset = false) {
  const records = getTextsByCategory(validated.texts, S.category);
  if (!records.length) { toast.error(COPY.textEmpty); showScreen("categories"); return; }
  const currentId = reset ? null : (runtime.currentText?.id ?? S.currentTextId);
  const { record, history } = pickText({
    records,
    historyIds: S.seenTextIds,
    currentId
  });
  runtime.currentText = record;
  setState({ currentTextId: record?.id ?? null, seenTextIds: history });
  renderText(record);
}

/* ------------------------------------------------------------------ */
/* آزمون                                                              */
/* ------------------------------------------------------------------ */

function initQuizSession() {
  const saved = S.quiz;
  const valid = saved?.questionIds?.length === 3 && saved.questionIds.every((id) =>
    validated.questions.some((q) => q.id === id && q.category === S.category));
  if (valid) quizUI.restore(S.category, saved);
  else quizUI.start(S.category);
}

/* ------------------------------------------------------------------ */
/* خروجی                                                              */
/* ------------------------------------------------------------------ */

function renderOutput() {
  const hasCard = Boolean(runtime.card);
  $("#output-empty").hidden = hasCard;
  $("#output-card-wrap").hidden = !hasCard;
  $("#output-card-buttons").hidden = !hasCard;
  $("#output-guide").hidden = true;
  if (hasCard) {
    const preview = $("#output-card-preview");
    if (runtime.cardUrl) preview.src = runtime.cardUrl;
    else preview.removeAttribute("src");
    const template = CARD_TEMPLATES.find((t) => t.id === runtime.card.templateId);
    $("#output-card-meta").textContent =
      `${template?.label ?? "کارت"} • ${toFaDigits(runtime.card.width)}×${toFaDigits(runtime.card.height)} پیکسل • PNG`;
  }
}

function downloadCard() {
  if (!runtime.card) { toast.error(COPY.outputNoCard); return; }
  const ok = defaultDownload(runtime.card.blob, buildFileName(`nazra-${runtime.card.type}`));
  toast[ok ? "success" : "error"](ok ? COPY.downloadDone : COPY.downloadFailed);
}

async function shareCard(button) {
  if (!runtime.card) { toast.error(COPY.outputNoCard); return; }
  setLoading(button, true, COPY.cardMaking);
  try {
    const result = await shareOrDownload({
      blob: runtime.card.blob,
      fileName: buildFileName(`nazra-${runtime.card.type}`),
      shareText: COPY.shareBody(CONFIG.universityName),
      email: CONFIG.NEHZAT_EMAIL,
      subject: COPY.shareSubject,
      body: COPY.shareBody(CONFIG.universityName),
      guide: COPY.shareGuide
    });
    const messages = {
      shared: COPY.shareOutcomeShared,
      cancelled: COPY.shareOutcomeCancelled,
      "downloaded-email": COPY.shareOutcomeEmail,
      "downloaded-no-email": COPY.shareOutcomeNoEmail,
      "share-error-download": COPY.shareOutcomeFailed,
      "share-error-download-no-email": COPY.shareOutcomeNoEmail,
      "download-failed": COPY.downloadFailed,
      "image-error": COPY.shareOutcomeError
    };
    const message = messages[result.outcome] ?? COPY.shareOutcomeFailed;
    const isError = ["download-failed", "image-error"].includes(result.outcome);
    toast[isError ? "error" : "info"](message);
    const guide = $("#output-guide");
    guide.textContent = result.guide ? `${result.guide} ${message}` : "";
    guide.hidden = !guide.textContent;
  } catch (error) {
    console.error("[اشتراکگذاری]", error);
    toast.error(COPY.shareOutcomeFailed);
  } finally {
    setLoading(button, false);
  }
}

/* ------------------------------------------------------------------ */
/* صفحهٔ پایانی، شمارش معکوس، دعوت، «میآیم»                          */
/* ------------------------------------------------------------------ */

function renderMokab() {
  const address = $("#mokab-address");
  const time = $("#mokab-time");
  const timezone = $("#mokab-timezone");
  address.textContent = isTodo(CONFIG.mosqueAddress) ? COPY.addressMissing : CONFIG.mosqueAddress;
  const parsed = parseEventTime(CONFIG.eventTime);
  if (!parsed) time.textContent = COPY.timeMissing;
  else {
    const dayName = WEEKDAYS[Number(CONFIG.eventDayOfWeek)] ?? "";
    time.textContent = `${dayName}ها، ساعت ${toFaDigits(String(parsed.hours).padStart(2, "0"))}:${toFaDigits(String(parsed.minutes).padStart(2, "0"))}`;
  }
  timezone.textContent = `${COPY.timezoneLabel}: ${CONFIG.timeZone || "—"}`;
  $("#mokab-title").textContent = COPY.mokabTitle;
}

function renderComing() {
  const button = $("#coming-button");
  button.setAttribute("aria-pressed", String(S.coming === true));
  $("#coming-label").textContent = S.coming ? COPY.comingOn : COPY.comingOff;
  $("#coming-note").textContent = CONFIG.privacy.comingNotice;
}

function renderCountdown() {
  const grid = $("#countdown-grid");
  const message = $("#countdown-message");
  const dateLine = $("#countdown-date");
  $("#countdown-title").textContent = COPY.countdownTitle;
  stopCountdown();

  const schedule = {
    timeZone: CONFIG.timeZone,
    eventTime: CONFIG.eventTime,
    eventDayOfWeek: CONFIG.eventDayOfWeek
  };
  if (!parseEventTime(schedule.eventTime)) {
    grid.hidden = true;
    dateLine.hidden = true;
    message.hidden = false;
    message.textContent = COPY.countdownUnavailable;
    runtime.nextEvent = null;
    return;
  }

  let next = getNextEvent(new Date(), schedule);
  if (!next) {
    grid.hidden = true;
    dateLine.hidden = true;
    message.hidden = false;
    message.textContent = COPY.countdownError;
    runtime.nextEvent = null;
    return;
  }
  runtime.nextEvent = next;
  grid.hidden = false;
  message.hidden = true;
  dateLine.hidden = false;
  dateLine.textContent = formatEventDate(next.instant, schedule.timeZone);

  const tick = () => {
    const now = new Date();
    if (!runtime.nextEvent || runtime.nextEvent.instant.getTime() <= now.getTime()) {
      runtime.nextEvent = getNextEvent(now, schedule);
      if (runtime.nextEvent) dateLine.textContent = formatEventDate(runtime.nextEvent.instant, schedule.timeZone);
    }
    if (!runtime.nextEvent) { grid.hidden = true; message.hidden = false; message.textContent = COPY.countdownError; stopCountdown(); return; }
    const parts = getCountdown(runtime.nextEvent.instant, now);
    $("#cd-days").textContent = toFaDigits(parts.days);
    $("#cd-hours").textContent = toFaDigits(parts.hours, { pad: 2 });
    $("#cd-minutes").textContent = toFaDigits(parts.minutes, { pad: 2 });
    $("#cd-seconds").textContent = toFaDigits(parts.seconds, { pad: 2 });
  };
  tick();
  runtime.countdownTimer = setInterval(tick, 1000);
}

function renderFinal() {
  renderMokab();
  renderCountdown();
  renderComing();
  const url = getAppUrl();
  $("#invite-text-preview").value = COPY.inviteBody(CONFIG.universityName, url);
  $("#invite-link").value = url;
}

async function handleInvite(button) {
  const url = getAppUrl();
  const text = COPY.inviteBody(CONFIG.universityName, url);
  setLoading(button, true, "در حال آمادهسازی…");
  try {
    const result = await inviteFriend({
      title: COPY.inviteTitle,
      text,
      url: url || undefined,
      onFallback: () => { $("#invite-fallback").hidden = false; }
    });
    if (result.outcome === "shared") toast.success(COPY.inviteShared);
    else if (result.outcome === "cancelled") toast.info(COPY.inviteCancelled);
    else if (result.outcome === "fallback") toast.info(COPY.inviteFallbackHint);
  } catch (error) {
    console.error("[دعوت]", error);
    $("#invite-fallback").hidden = false;
  } finally {
    setLoading(button, false);
  }
}

/* ------------------------------------------------------------------ */
/* اقدامات رابط                                                       */
/* ------------------------------------------------------------------ */

const ACTIONS = {
  start() {
    clearCard();
    setState({
      step: "categories",
      category: null,
      currentTextId: null,
      quiz: { questionIds: [], answers: [], index: 0 }
    });
    showScreen("categories");
  },
  resume() { resumeFlow(); },
  home() { showScreen("welcome", { persist: false }); },
  "choose-category"(button) { selectCategory(button.dataset.categoryId); },
  "change-category"() { showScreen("categories"); },
  "another-text"() { pickNewText(false); },
  "to-activities"() { showScreen("activities"); },
  "choose-activity"(button) {
    const name = button.dataset.activity;
    if (!activityModules[name]) { toast.error(COPY.errors.unexpected); return; }
    showScreen(name);
  },
  "back-to-text"() {
    if (!runtime.currentText) pickNewText(true);
    showScreen("text");
  },
  "back-to-activities"() { showScreen("activities"); },
  "skip-to-output"() { showScreen("output"); },
  "make-another-card"() { showScreen("activities"); },
  "go-final"() { showScreen("final"); },
  "download-card"() { downloadCard(); },
  "share-card"(button) { return shareCard(button); },
  "toggle-coming"() {
    const next = S.coming !== true;
    setState({ coming: next });
    renderComing();
    if (next) toast.success(COPY.comingSaved);
  },
  "invite-friend"(button) { return handleInvite(button); },
  "copy-invite-text"() {
    copyText($("#invite-text-preview").value).then((ok) =>
      toast[ok ? "success" : "error"](ok ? COPY.inviteCopied : COPY.copyFailed));
  },
  "copy-invite-link"() {
    copyText($("#invite-link").value).then((ok) =>
      toast[ok ? "success" : "error"](ok ? COPY.linkCopied : COPY.copyFailed));
  },
  restart() {
    clearCard();
    selfieUI.reset();
    runtime.currentText = null;
    setState({
      step: "welcome",
      category: null,
      currentTextId: null,
      quiz: { questionIds: [], answers: [], index: 0 }
    });
    showScreen("welcome");
  }
};

/* ------------------------------------------------------------------ */
/* رویدادهای سراسری                                                   */
/* ------------------------------------------------------------------ */

document.addEventListener("click", (event) => {
  // منابع خارجی در حالت آفلاین: هشدار بهجای لینک شکسته.
  const external = event.target.closest?.('a[href^="http"]');
  if (external && typeof navigator !== "undefined" && navigator.onLine === false) {
    event.preventDefault();
    toast.error(COPY.offlineExternal);
    return;
  }
  const button = event.target.closest?.("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const handler = ACTIONS[action];
  if (!handler) { console.warn("[اقدام ناشناخته]", action); return; }
  event.preventDefault();
  Promise.resolve(handler(button, event)).catch((error) => {
    console.error("[خطای اقدام]", error);
    toast.error(COPY.errors.unexpected);
  });
});

function updateOnlineBanner(isOnline) {
  const banner = $("#offline-banner");
  if (!banner) return;
  const text = $("#offline-banner-text");
  if (!isOnline) {
    clearTimeout(runtime.onlineBannerTimer);
    banner.hidden = false;
    banner.classList.remove("is-online");
    text.textContent = COPY.offline;
  } else {
    banner.hidden = false;
    banner.classList.add("is-online");
    text.textContent = COPY.online;
    clearTimeout(runtime.onlineBannerTimer);
    runtime.onlineBannerTimer = setTimeout(() => { banner.hidden = true; }, 3200);
  }
}

window.addEventListener("offline", () => updateOnlineBanner(false));
window.addEventListener("online", () => updateOnlineBanner(true));

window.addEventListener("error", (event) => {
  console.error("[خطای سراسری]", event.error ?? event.message);
  toast.error(COPY.errors.unexpected);
});
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.name === "AbortError") return;
  console.error("[وعدهٔ ردشده]", event.reason);
  toast.error(COPY.errors.unexpected);
});

function setupLogos() {
  $$("[data-logo]").forEach((image) => {
    image.addEventListener("error", () => {
      image.classList.add("is-broken");
      toast.info(COPY.logoFallback);
    }, { once: true });
    if (image.complete && image.naturalWidth === 0) {
      image.classList.add("is-broken");
    }
  });
}

function setupBrand() {
  $("#header-university").textContent = CONFIG.universityName;
  $("#header-program").textContent = CONFIG.programTitle;
  $("#welcome-eyebrow").textContent = "ایام فاطمیه";
  $("#welcome-title").textContent = CONFIG.universityName;
  $("#welcome-program").textContent = CONFIG.programTitle;
  document.title = `${CONFIG.universityName} | ${CONFIG.programTitle}`;
}

function registerServiceWorker() {
  try {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register(CONFIG.serviceWorkerPath, { scope: "./" })
      .catch(() => toast.error(COPY.swFailed));
  } catch {
    toast.error(COPY.swFailed);
  }
}

function showFatal() {
  const panel = $("#fatal-error");
  if (panel) panel.hidden = false;
}

/* ------------------------------------------------------------------ */
/* آغاز                                                               */
/* ------------------------------------------------------------------ */

function init() {
  setupBrand();
  setupLogos();
  renderCategories();
  $("#app-header").hidden = true;
  $("#stepper").hidden = true;

  if (S.currentTextId) runtime.currentText = findRecordById(validated.texts, S.currentTextId);
  if (!runtime.currentText && S.category) {
    runtime.currentText = getTextsByCategory(validated.texts, S.category)[0] ?? null;
  }

  showScreen("welcome", { persist: false, focus: false });
  updateResumeButton();
  if (typeof navigator !== "undefined" && navigator.onLine === false) updateOnlineBanner(false);

  // بارگذاری فونت محلی پیش از نخستین رسم کارت.
  ensureCardFonts(CONFIG.card.fontFamily).then((result) => {
    if (!result.ok && result.source !== "none") toast.info(COPY.cardFontFallback);
  }).catch(() => { /*noop*/ });

  registerServiceWorker();
}

try {
  init();
} catch (error) {
  console.error("[خطای آغاز]", error);
  showFatal();
}
