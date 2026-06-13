import test from "node:test";
import assert from "node:assert/strict";
import { createFetchCoordinator } from "../src/desktop/fetch-coordinator.js";

test("finishing an old fetch does not clear the current fetch controller", () => {
  const coordinator = createFetchCoordinator();
  const first = coordinator.start();
  const second = coordinator.start();

  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  coordinator.finish(first);
  assert.equal(coordinator.hasActiveFetch(), true);

  coordinator.cancel();
  assert.equal(second.signal.aborted, true);
  coordinator.finish(second);
  assert.equal(coordinator.hasActiveFetch(), false);
});
