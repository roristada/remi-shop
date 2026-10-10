import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHistory, type HistoryText } from "./history";

const text: HistoryText = {
  title: (t) => t,
  date: () => "d",
  money: (v) => `฿${v}`,
  fieldLabel: (id) => ({ f1: "ชื่อศิลปิน", artwork: "รูปผลงาน" })[id] ?? null,
  locale: "th",
  priceLine: (o, n) => `${o}→${n}`,
  changeLine: (l, b, a) => `${l}:${b}>${a}`,
  flaggedLine: (l) => `fix ${l}`,
  empty: "-",
};

test("history shows message, price change, flagged fields and before/after", () => {
  const [row] = buildHistory(
    [
      {
        id: "1",
        type: "CHANGES_REQUESTED",
        message: "แนบรูป",
        oldTotal: "500",
        newTotal: "650",
        fieldIds: ["f1", "artwork", "gone"],
        changes: [{ labelTH: "เหตุผลที่แก้ราคา", labelEN: "Reason", before: "", after: "ใช้เชิงพาณิชย์" }],
        createdAt: new Date(),
        actor: { email: "a@x", displayName: null },
      },
    ],
    { ...text, showActor: true },
  );
  assert.deepEqual(row.lines, ["แนบรูป", "฿500→฿650", "fix ชื่อศิลปิน, รูปผลงาน", "เหตุผลที่แก้ราคา:->ใช้เชิงพาณิชย์"]);
  assert.equal(row.actor, "a@x");
  assert.equal(row.tone, "store");
});

test("a total alone is not a price change; actor hidden for customers", () => {
  const [row] = buildHistory(
    [{ id: "1", type: "SUBMITTED", message: null, oldTotal: null, newTotal: "500", fieldIds: [], changes: null, createdAt: new Date(), actor: { email: "a@x", displayName: "A" } }],
    text,
  );
  assert.deepEqual(row.lines, []);
  assert.equal(row.actor, null);
});
