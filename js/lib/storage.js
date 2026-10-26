/** Safe localStorage access; malformed JSON or missing storage never crashes. */

export const DEFAULT_STATE = Object.freeze({
  step: "welcome",
  category: null,
  currentTextId: null,
  seenTextIds: [],
  quiz: { questionIds: [], answers: [], index: 0 },
  ui: { postcardTemplate: "gold", selfieTemplate: "gold" }
});

const SERIALIZABLE_KEYS = ["step", "category", "currentTextId", "seenTextIds", "quiz", "ui"];

function getLocalStorage() {
  try {
    if (typeof globalThis === "undefined" || !globalThis.localStorage) return null;
    // Some browsers throw on property access rather than setItem.
    const probe = "__nazra_probe__";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function sanitize(raw) {
  const state = { ...DEFAULT_STATE, quiz: { ...DEFAULT_STATE.quiz }, ui: { ...DEFAULT_STATE.ui } };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return state;

  if (typeof raw.step === "string" && /^[a-z-]+$/.test(raw.step)) state.step = raw.step;
  if (typeof raw.category === "string") state.category = raw.category;
  if (typeof raw.currentTextId === "string") state.currentTextId = raw.currentTextId;
  if (Array.isArray(raw.seenTextIds)) {
    state.seenTextIds = raw.seenTextIds.filter((id) => typeof id === "string").slice(-200);
  }
  if (raw.quiz && typeof raw.quiz === "object" && !Array.isArray(raw.quiz)) {
    state.quiz = {
      questionIds: Array.isArray(raw.quiz.questionIds) ? raw.quiz.questionIds.filter((x) => typeof x === "string").slice(0, 3) : [],
      answers: Array.isArray(raw.quiz.answers) ? raw.quiz.answers.slice(0, 3) : [],
      index: Number.isInteger(raw.quiz.index) ? Math.max(0, Math.min(3, raw.quiz.index)) : 0
    };
  }
  if (raw.ui && typeof raw.ui === "object" && !Array.isArray(raw.ui)) {
    state.ui = {
      postcardTemplate: typeof raw.ui.postcardTemplate === "string" ? raw.ui.postcardTemplate : "gold",
      selfieTemplate: typeof raw.ui.selfieTemplate === "string" ? raw.ui.selfieTemplate : "gold"
    };
  }
  return state;
}

/** @param {{key: string, storage: Storage|null, onError: Function}} p */
export function createStateStore({ key, storage, onError } = {}) {
  const storageKey = key ?? "nazra.state.v1";
  const backend = storage === undefined ? getLocalStorage() : storage;
  let cache = { ...DEFAULT_STATE };

  function report(error) {
    if (typeof onError === "function") {
      try { onError(error); } catch { /* Avoid secondary errors. */ }
    }
  }

  function load() {
    try {
      if (!backend) { cache = sanitize(null); return cache; }
      const raw = backend.getItem(storageKey);
      if (!raw) { cache = sanitize(null); return cache; }
      cache = sanitize(JSON.parse(raw));
    } catch (error) {
      // Malformed JSON: use defaults.
      cache = sanitize(null);
      report(error);
      try { backend?.removeItem(storageKey); } catch { /* Ignore. */ }
    }
    return cache;
  }

  function save(patch = {}) {
    const next = sanitize({ ...cache, ...patch });
    cache = next;
    try {
      if (!backend) return cache;
      const payload = {};
      for (const k of SERIALIZABLE_KEYS) payload[k] = next[k];
      backend.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      report(error);
    }
    return cache;
  }

  function clear() {
    cache = sanitize(null);
    try { backend?.removeItem(storageKey); } catch (error) { report(error); }
    return cache;
  }

  return {
    load,
    save,
    clear,
    get state() { return { ...cache }; },
    get available() { return Boolean(backend); }
  };
}
