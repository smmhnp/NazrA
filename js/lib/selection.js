/** Random text selection with history; pure, no DOM or storage. */
import { randomIndex, clamp } from "./utils.js";

export const HISTORY_LIMIT = 200;

/** @returns {{record: object|null, history: string[], exhausted: boolean}} */
export function pickText({ records = [], historyIds = [], currentId = null, rng = Math.random } = {}) {
  const all = Array.isArray(records) ? records.filter(Boolean) : [];
  const history = Array.isArray(historyIds) ? historyIds.filter((id) => typeof id === "string") : [];
  if (all.length === 0) return { record: null, history, exhausted: false };

  const pool = all.filter((r) => r.id !== currentId);
  if (pool.length === 0) {
    // Only one text exists: repeat it (unavoidable).
    return { record: all[0], history: appendHistory(history, all[0].id), exhausted: true };
  }

  const seen = new Set(history);
  let exhausted = false;
  let candidates = pool.filter((r) => !seen.has(r.id));
  let baseHistory = history;
  if (candidates.length === 0) {
    // Pool exhausted: reset history but exclude the current text.
    exhausted = true;
    candidates = pool;
    baseHistory = [];
  }

  // Prefer verified/editorial texts over TODO placeholders.
  const verified = candidates.filter((r) => r.verified === true);
  const chosenFrom = verified.length ? verified : candidates;
  const index = clamp(randomIndex(chosenFrom.length, rng), 0, chosenFrom.length - 1);
  const record = chosenFrom[index] ?? chosenFrom[0];

  return { record, history: appendHistory(baseHistory, record.id), exhausted };
}

function appendHistory(history, id) {
  const next = [...history, id];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** Find a record by id. */
export function findRecordById(records, id) {
  return records.find((r) => r.id === id) ?? null;
}
