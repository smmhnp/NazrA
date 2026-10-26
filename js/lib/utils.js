/** utils.js — توابع خالص و بدون وابستگی به DOM. */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** تبدیل ارقام لاتین/عربی به فارسی، با قابلیت صفرگذاری چپ. */
export function toFaDigits(value, { pad = 0 } = {}) {
  let str = String(value ?? "");
  str = str.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
  str = str.replace(/[٠-٩]/g, (d) => FA_DIGITS[AR_DIGITS.indexOf(d)]);
  if (pad > 0) str = str.padStart(pad, FA_DIGITS[0]);
  return str;
}

/** آیا مقدار، نماد «تنظیم نشده» است؟ */
export function isTodo(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed === "" || /^TODO\b/i.test(trimmed) || trimmed === "—" || trimmed === "-";
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** تبدیل امن برای innerHTML — در جاهایی که از رشتهسازی HTML ناگزیریم. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

export function randomIndex(length, rng = Math.random) {
  if (!Number.isFinite(length) || length <= 0) return -1;
  const r = typeof rng === "function" ? rng() : Math.random();
  const n = Number.isFinite(r) ? clamp(r, 0, 0.999999999) : 0.5;
  return Math.floor(n * length);
}

/** یکنواختی نویسههای پربسامد عربی/فارسی برای اندازهگیری و جستجو. */
export function normalizePersian(value) {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function truncate(value, max) {
  const str = String(value ?? "");
  return str.length > max ? `${str.slice(0, Math.max(0, max - 1))}…` : str;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰ بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${toFaDigits((bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1))} ${units[i]}`;
}

/** آدرسهای http/https معتبر (برای منابع خارجی اختیاری). */
export function isSafeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
