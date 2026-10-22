/**
 * Runs async jobs one at a time, in the order they were queued. A job that throws rejects only its
 * own promise; the next job still runs.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job);
    tail = result.catch(() => undefined);
    return result;
  };
}
