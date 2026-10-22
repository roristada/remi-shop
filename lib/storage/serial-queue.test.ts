import { test } from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "./serial-queue";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("runs jobs one at a time, in order", async () => {
  const run = createSerialQueue();
  let active = 0;
  let maxActive = 0;
  const finished: number[] = [];
  const job = (n: number, ms: number) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await tick(ms);
    finished.push(n);
    active--;
    return n;
  };

  const results = await Promise.all([run(job(1, 30)), run(job(2, 5)), run(job(3, 10))]);

  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(finished, [1, 2, 3]);
  assert.equal(maxActive, 1);
});

test("a failing job rejects only itself", async () => {
  const run = createSerialQueue();
  const failed = run(async () => {
    throw new Error("boom");
  });
  const next = run(async () => "ok");

  await assert.rejects(failed, /boom/);
  assert.equal(await next, "ok");
});
