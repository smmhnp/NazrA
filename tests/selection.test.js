import test from "node:test";
import assert from "node:assert/strict";
import { pickText, HISTORY_LIMIT } from "../js/lib/selection.js";

const records = [
  { id: "v1", verified: true }, { id: "v2", verified: true },
  { id: "t1", verified: false }, { id: "t2", verified: false }, { id: "t3", verified: false }
];

test("متن بعدی هرگز متن فعلی را بلافاصله تکرار نمیکند", () => {
  let rngState = 1;
  const rng = () => { rngState = (rngState * 16807) % 2147483647; return rngState / 2147483647; };
  let current = "v1", history = ["v1"];
  for (let i = 0; i < 60; i += 1) {
    const result = pickText({ records, historyIds: history, currentId: current, rng });
    assert.notEqual(result.record.id, current);
    assert.ok(records.some((r) => r.id === result.record.id));
    current = result.record.id;
    history = result.history;
  }
  assert.ok(history.length <= HISTORY_LIMIT);
});

test("تا پیش از اتمام گزینهها، متن دیدهشده تکرار نمیشود", () => {
  const first = pickText({ records, historyIds: [], currentId: null, rng: () => 0 });
  assert.equal(first.record.id, "v1");
  const second = pickText({ records, historyIds: first.history, currentId: first.record.id, rng: () => 0 });
  assert.equal(second.record.id, "v2");
  const third = pickText({ records, historyIds: second.history, currentId: second.record.id, rng: () => 0 });
  assert.ok(["t1", "t2", "t3"].includes(third.record.id));
});

test("پس از اتمام گزینهها تاریخچه بازنشانی میشود، ولی متن فعلی تکرار نمیشود", () => {
  const history = records.map((r) => r.id);
  const result = pickText({ records, historyIds: history, currentId: "v1", rng: () => 0 });
  assert.equal(result.exhausted, true);
  assert.notEqual(result.record.id, "v1");
  assert.equal(result.history.length, 1);
});

test("با یک متن، همان بازگردانده میشود و برنامه متوقف نمیشود", () => {
  const one = [{ id: "only", verified: false }];
  const result = pickText({ records: one, historyIds: [], currentId: "only" });
  assert.equal(result.record.id, "only");
  assert.equal(result.exhausted, true);
});

test("نبود محتوا و تاریخچهٔ نامعتبر مدیریت میشود", () => {
  assert.equal(pickText({ records: [] }).record, null);
  const r = pickText({ records, historyIds: "bad", currentId: null, rng: () => 0.4 });
  assert.ok(r.record);
});
