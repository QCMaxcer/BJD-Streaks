import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dedupeRecords, recordKey, sortRecordsNewestFirst } from "../core.js";

export const CACHE_VERSION = 1;

export function safeCacheName(uuid) {
  return String(uuid ?? "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_") || "unknown";
}

export function cacheRecordKeys(cache) {
  return new Set((cache?.records ?? []).map((record) => recordKey(record)));
}

export function createCacheStore(baseDir, { legacyDirs = [] } = {}) {
  const cachePath = (uuid) => path.join(baseDir, `${safeCacheName(uuid)}.json`);
  const legacyCachePaths = (uuid) =>
    legacyDirs.map((legacyDir) => path.join(legacyDir, `${safeCacheName(uuid)}.json`));

  const readFromPath = async (targetPath) => {
    try {
      const payload = JSON.parse(await readFile(targetPath, "utf8"));
      if (payload?.version !== CACHE_VERSION || !Array.isArray(payload.records)) {
        return null;
      }
      return payload;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      return null;
    }
  };

  const persist = async ({
    uuid,
    playerName = "",
    records = [],
    fetchedAt = new Date().toISOString(),
    playerInfo,
    playerInfoFetchedAt,
  }) => {
    await mkdir(baseDir, { recursive: true });
    const payload = {
      version: CACHE_VERSION,
      uuid: String(uuid ?? ""),
      playerName: String(playerName ?? ""),
      fetchedAt,
      records: sortRecordsNewestFirst(dedupeRecords(records)),
    };
    if (playerInfo) payload.playerInfo = playerInfo;
    if (playerInfoFetchedAt) payload.playerInfoFetchedAt = playerInfoFetchedAt;
    await writeFile(cachePath(uuid), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  };

  const write = async (options) => {
    const existing = await readFromPath(cachePath(options.uuid));
    return persist({
      ...options,
      playerInfo: options.playerInfo ?? existing?.playerInfo,
      playerInfoFetchedAt: options.playerInfoFetchedAt ?? existing?.playerInfoFetchedAt,
    });
  };

  const read = async (uuid) => {
    const current = await readFromPath(cachePath(uuid));
    if (current) return current;

    for (const legacyPath of legacyCachePaths(uuid)) {
      const legacy = await readFromPath(legacyPath);
      if (!legacy) continue;
      return persist({ ...legacy, uuid });
    }
    return null;
  };

  const mergeAndWrite = async ({ uuid, playerName = "", records = [] }) => {
    const existing = await read(uuid);
    return write({
      uuid,
      playerName: playerName || existing?.playerName || "",
      records: [...records, ...(existing?.records ?? [])],
    });
  };

  const readKeys = async (uuid) => [...cacheRecordKeys(await read(uuid))];

  const updatePlayerInfo = async ({
    uuid,
    playerName = "",
    playerInfo,
    playerInfoFetchedAt = new Date().toISOString(),
  }) => {
    const existing = await read(uuid);
    return persist({
      uuid,
      playerName: playerName || existing?.playerName || "",
      records: existing?.records ?? [],
      fetchedAt: existing?.fetchedAt,
      playerInfo,
      playerInfoFetchedAt,
    });
  };

  const clearRecords = async (uuid) => {
    const existing = await read(uuid);
    if (!existing) return null;
    return persist({
      ...existing,
      uuid,
      records: [],
      fetchedAt: new Date().toISOString(),
    });
  };

  const clear = async (uuid = "") => {
    if (uuid) {
      await rm(cachePath(uuid), { force: true });
      return;
    }
    await rm(baseDir, { recursive: true, force: true });
  };

  return {
    cachePath,
    cacheRecordKeys,
    clear,
    clearRecords,
    mergeAndWrite,
    read,
    readKeys,
    updatePlayerInfo,
    write,
  };
}
