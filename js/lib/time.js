/**
 * time.js — محاسبهٔ «شب جمعهٔ بعدی» با احترام به منطقهٔ زمانی و DST.
 *
 * بدون کتابخانهٔ خارجی: اختلاف offset از طریق Intl.DateTimeFormat بهدست میآید
 * و با چند بار تکرار، لحظهٔ UTC متناظر با ساعت محلی محاسبه میشود.
 * تغییر ساعت تابستانی (DST) بنابراین نیازی به فهرست قوانین ثابت ندارد.
 */

const formatterCache = new Map();

function getFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23"
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** «HH:MM» معتبر → {hours, minutes}؛ «TODO» یا ناقص → null. */
export function parseEventTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** مؤلفههای ساعت محلی در منطقهٔ زمانی دادهشده. */
export function getZonedParts(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new TypeError("زمان نامعتبر است.");
  const parts = {};
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  if (![parts.year, parts.month, parts.day, parts.hour, parts.minute].every(Number.isFinite)) {
    throw new Error("خروجی Intl.DateTimeFormat نامعتبر است.");
  }
  // روز هفته از روی تاریخ تقویمی محلی (مستقل از offset) محاسبه میشود.
  parts.weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return parts;
}

function offsetMs(instant, timeZone) {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second ?? 0);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function wallKey(p) {
  return (((p.year * 100 + p.month) * 100 + p.day) * 100 + p.hour) * 100 + p.minute;
}

function wallMatches(p, local) {
  return p.year === local.year && p.month === local.month && p.day === local.day &&
    p.hour === local.hour && p.minute === local.minute;
}

/** تبدیل ساعت دیواریِ محلی به لحظهٔ UTC (با مدیریت شکاف/همپوشانی DST). */
export function zonedTimeToUtc(local, timeZone) {
  const desiredWall = wallKey(local);
  const desiredAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  let guess = desiredAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const next = desiredAsUtc - offsetMs(new Date(guess), timeZone);
    if (next === guess) break;
    guess = next;
  }

  const candidate = new Date(guess);
  if (wallMatches(getZonedParts(candidate, timeZone), local)) return candidate;

  const scanned = [];
  // پنجرهٔ ±۲ ساعت بهصورت دقیقهدقیقه بررسی میشود تا شکاف DST (ساعتی که وجود
  // ندارد) و همپوشانی پاییزه (ساعتی که دوبار رخ میدهد) هم به نتیجهای معتبر برسند.
  for (let minute = -120; minute <= 120; minute += 1) {
    const instant = new Date(guess + minute * 60000);
    const p = getZonedParts(instant, timeZone);
    if (wallMatches(p, local)) scanned.push(instant);
  }
  if (scanned.length) {
    // در همپوشانی پاییزه، نخستین رخداد (offset تابستانی) انتخاب میشود.
    scanned.sort((a, b) => a.getTime() - b.getTime());
    return scanned[0];
  }

  // ساعت درخواستی وجود ندارد (شکاف بهاره): نخستین لحظهٔ معتبر بعد از آن.
  let earliest = null;
  for (let minute = -120; minute <= 120; minute += 1) {
    const instant = new Date(guess + minute * 60000);
    const p = getZonedParts(instant, timeZone);
    if (wallKey(p) > desiredWall && (!earliest || instant < earliest)) earliest = instant;
  }
  return earliest ?? candidate;
}

/**
 * شب جمعهٔ بعدی.
 * @param {Date|number} now
 * @param {object} schedule {timeZone, eventTime, eventDayOfWeek}
 * @returns {{instant: Date, local: object}|null} null یعنی تنظیمات نامعتبر/تأییدنشده
 */
export function getNextEvent(now, schedule = {}) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) return null;
  const time = parseEventTime(schedule.eventTime);
  const weekday = Number(schedule.eventDayOfWeek);
  const timeZone = schedule.timeZone;
  if (!time || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
      typeof timeZone !== "string" || !timeZone.trim()) return null;

  try {
    const nowParts = getZonedParts(current, timeZone);
    const todayUtc = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
    const daysUntil = (weekday - nowParts.weekday + 7) % 7;

    for (const extra of [0, 7, 14]) {
      const delta = daysUntil + extra;
      const day = new Date(todayUtc + delta * 86400000);
      const local = {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour: time.hours,
        minute: time.minutes
      };
      const instant = zonedTimeToUtc(local, timeZone);
      // «دقیقاً در زمان برگزاری یا بعد از آن» یعنی رویداد هفتهٔ بعد انتخاب شود.
      if (instant && instant.getTime() > current.getTime()) return { instant, local };
    }
    return null;
  } catch {
    return null;
  }
}

/** شکستن مدتزمان به روز/ساعت/دقیقه/ثانیه. */
export function breakDownDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const day = 86400000, hour = 3600000, minute = 60000;
  return {
    totalMs: total,
    days: Math.floor(total / day),
    hours: Math.floor((total % day) / hour),
    minutes: Math.floor((total % hour) / minute),
    seconds: Math.floor((total % minute) / 1000),
    done: total <= 0
  };
}

export function getCountdown(target, now = Date.now()) {
  const t = target instanceof Date ? target.getTime() : Number(target);
  const n = now instanceof Date ? now.getTime() : Number(now);
  return breakDownDuration(t - n);
}

/** تاریخ رویداد به فارسی و همان منطقهٔ زمانی (برای نمایش در رابط). */
export function formatEventDate(instant, timeZone) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone,
      weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(instant);
  } catch {
    return "";
  }
}
