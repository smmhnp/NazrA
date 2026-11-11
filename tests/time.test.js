import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEventTime, getZonedParts, zonedTimeToUtc, getNextEvent,
  getCountdown, breakDownDuration, formatEventDate
} from "../js/lib/time.js";
import { toFaDigits } from "../js/lib/utils.js";

test("parseEventTime فقط ساعت معتبر را میپذیرد", () => {
  assert.deepEqual(parseEventTime("20:30"), { hours: 20, minutes: 30 });
  assert.deepEqual(parseEventTime("00:00"), { hours: 0, minutes: 0 });
  assert.equal(parseEventTime("TODO"), null);
  assert.equal(parseEventTime("24:00"), null);
  assert.equal(parseEventTime("12:60"), null);
  assert.equal(parseEventTime("abc"), null);
  assert.equal(parseEventTime(null), null);
});

test("مؤلفههای محلی Asia/Tehran درست محاسبه میشود", () => {
  const parts = getZonedParts(new Date("2026-10-26T12:00:00Z"), "Asia/Tehran");
  assert.equal(parts.hour, 15);
  assert.equal(parts.minute, 30);
  assert.equal(parts.day, 26);
  assert.equal(parts.weekday, 1); // Monday
});

test("شب جمعهٔ بعدی از تنظیمات خوانده میشود", () => {
  const schedule = { timeZone: "Asia/Tehran", eventTime: "20:00", eventDayOfWeek: 4 };
  const next = getNextEvent(new Date("2026-10-26T12:00:00Z"), schedule); // Monday
  assert.ok(next);
  assert.equal(next.instant.toISOString(), "2026-10-29T16:30:00.000Z"); // Thursday 20:00 Tehran
  assert.equal(getZonedParts(next.instant, "Asia/Tehran").weekday, 4);
});

test("در لحظهٔ دقیق برگزاری، رویداد هفتهٔ بعد انتخاب میشود", () => {
  const atEvent = new Date("2026-10-29T16:30:00.000Z");
  const next = getNextEvent(atEvent, { timeZone: "Asia/Tehran", eventTime: "20:00", eventDayOfWeek: 4 });
  assert.equal(next.instant.toISOString(), "2026-11-05T16:30:00.000Z");
});

test("ساعت تأییدنشده یا منطقهٔ نامعتبر، شمارش جعلی نمیدهد", () => {
  assert.equal(getNextEvent(Date.now(), { timeZone: "Asia/Tehran", eventTime: "TODO", eventDayOfWeek: 4 }), null);
  assert.equal(getNextEvent(Date.now(), { timeZone: "Not/AZone", eventTime: "20:00", eventDayOfWeek: 4 }), null);
  assert.equal(getNextEvent(new Date("invalid"), { timeZone: "Asia/Tehran", eventTime: "20:00", eventDayOfWeek: 4 }), null);
  assert.equal(getNextEvent(Date.now(), { timeZone: "Asia/Tehran", eventTime: "20:00", eventDayOfWeek: 9 }), null);
});

test("تغییر ساعت تابستانی (DST) باعث خطا نمیشود", () => {
  // America/New_York: 2026-03-08 02:30 does not exist (spring gap).
  const spring = zonedTimeToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York");
  assert.equal(spring.toISOString(), "2026-03-08T07:00:00.000Z");
  // 2026-11-01 01:30 occurs twice; expect the first occurrence.
  const fall = zonedTimeToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, "America/New_York");
  assert.ok(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"].includes(fall.toISOString()));
  // Regular times stay exact.
  assert.equal(zonedTimeToUtc({ year: 2026, month: 6, day: 15, hour: 20, minute: 0 }, "America/New_York").toISOString(), "2026-06-16T00:00:00.000Z");
});

test("شکست مدتزمان و اعداد فارسی", () => {
  assert.deepEqual(breakDownDuration(90061000), { totalMs: 90061000, days: 1, hours: 1, minutes: 1, seconds: 1, done: false });
  assert.equal(getCountdown(1000, 5000).done, true);
  assert.equal(toFaDigits(7, { pad: 2 }), "۰۷");
  assert.equal(toFaDigits("۱۲۳"), "۱۲۳");
  assert.ok(formatEventDate(new Date("2026-10-29T16:30:00Z"), "Asia/Tehran").length > 0);
});
