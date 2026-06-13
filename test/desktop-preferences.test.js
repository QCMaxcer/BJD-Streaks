import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_PREFERENCES,
  createPreferenceStore,
  normalizePreferences,
} from "../src/desktop/preferences.js";

async function withTempStore(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bjd-prefs-"));
  try {
    return await fn(createPreferenceStore(path.join(dir, "preferences.json")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("preferences default to auto update enabled", async () => {
  await withTempStore(async (store) => {
    assert.deepEqual(await store.read(), DEFAULT_PREFERENCES);
  });
});

test("preferences can save and read auto update", async () => {
  await withTempStore(async (store) => {
    await store.write({ autoUpdate: false });
    assert.deepEqual(await store.read(), { autoUpdate: false });
  });
});

test("normalizePreferences falls back to enabled auto update", () => {
  assert.deepEqual(normalizePreferences({}), { autoUpdate: true });
  assert.deepEqual(normalizePreferences({ autoUpdate: null }), { autoUpdate: true });
});
