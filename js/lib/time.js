/** Timezone/DST-aware helpers for the next Thursday-night event. */

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

/** Parse valid HH:MM; return null for TODO or invalid input. */
export function parseEventTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** Local wall-clock parts in the given time zone. */
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
  // Derive weekday from the local calendar date (offset-independent).
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

/** Convert local wall time to UTC, handling DST gaps and overlaps. */
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
  // Scan +/-2h minute-by-minute to cover DST gaps and overlaps.
  // Keeps the result valid when an hour is missing or repeated.
  for (let minute = -120; minute <= 120; minute += 1) {
    const instant = new Date(guess + minute * 60000);
    const p = getZonedParts(instant, timeZone);
    if (wallMatches(p, local)) scanned.push(instant);
  }
  if (scanned.length) {
    // In an autumn overlap, pick the first occurrence (summer offset).
    scanned.sort((a, b) => a.getTime() - b.getTime());
    return scanned[0];
  }

  // Missing hour (spring gap): use the first valid instant after it.
  let earliest = null;
  for (let minute = -120; minute <= 120; minute += 1) {
    const instant = new Date(guess + minute * 60000);
    const p = getZonedParts(instant, timeZone);
    if (wallKey(p) > desiredWall && (!earliest || instant < earliest)) earliest = instant;
  }
  return earliest ?? candidate;
}

/** Next scheduled event; null when settings are invalid or unverified. */
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
      // At or after the event instant, target the following week.
      if (instant && instant.getTime() > current.getTime()) return { instant, local };
    }
    return null;
  } catch {
    return null;
  }
}

/** Split a duration into days/hours/minutes/seconds. */
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

/** Format the event date in Persian using the same time zone. */
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
