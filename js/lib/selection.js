/**
 * selection.js — انتخاب تصادفی متن با مدیریت تاریخچه.
 * خالص است (هیچ وابستهای به DOM یا localStorage ندارد).
 */
import { randomIndex, clamp } from "./utils.js";

export const HISTORY_LIMIT = 200;

/**
 * @param {object} p
 * @param {Array}  p.records      رکوردهای همان دسته (اعتبارسنجیشده)
 * @param {string[]} p.historyIds شناسههای دیدهشده
 * @param {string|null} p.currentId شناسهٔ متن فعلی (نباید بلافاصله تکرار شود)
 * @param {Function} p.rng        تابع تصادفی قابل تزریق برای تست
 * @returns {{record: object|null, history: string[], exhausted: boolean}}
 */
export function pickText({ records = [], historyIds = [], currentId = null, rng = Math.random } = {}) {
  const all = Array.isArray(records) ? records.filter(Boolean) : [];
  const history = Array.isArray(historyIds) ? historyIds.filter((id) => typeof id === "string") : [];
  if (all.length === 0) return { record: null, history, exhausted: false };

  const pool = all.filter((r) => r.id !== currentId);
  if (pool.length === 0) {
    // تنها یک متن وجود دارد: همان برگردانده میشود (تکرار اجتنابناپذیر).
    return { record: all[0], history: appendHistory(history, all[0].id), exhausted: true };
  }

  const seen = new Set(history);
  let exhausted = false;
  let candidates = pool.filter((r) => !seen.has(r.id));
  let baseHistory = history;
  if (candidates.length === 0) {
    // اتمام گزینهها: تاریخچه بازنشانی میشود، ولی متن فعلی همچنان حذف میگردد.
    exhausted = true;
    candidates = pool;
    baseHistory = [];
  }

  // محتوای تأییدشده/تدوینی در اولویت نمایش است؛ سپس نمونههای TODO.
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

/** شناسهٔ متن فعلی را از روی تاریخچه پیدا میکند. */
export function findRecordById(records, id) {
  return records.find((r) => r.id === id) ?? null;
}
