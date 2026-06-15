import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dedupeRecords, recordKey, sortRecordsNewestFirst } from "../core.js";

export const CACHE_VERSION = 1;

export function safeCacheName(uuid) {
  return String(uuid ?? "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_") || "unknown";
}

export function cacheRecordKeys(cache) {
  return new Set((cache?.records ?? []).map((record) => recordKey(record)));
}

function pruneMatchDetails(records, matchDetails = {}) {
  const allowed = new Set((records ?? []).map((record) => recordKey(record)));
  return Object.fromEntries(
    Object.entries(matchDetails ?? {}).filter(([key, value]) => allowed.has(key) && value),
  );
}

export function createCacheStore(baseDir, { legacyDirs = [] } = {}) {
  const cachePath = (uuid) => path.join(baseDir, `${safeCacheName(uuid)}.json`);
  const legacyCachePaths = (uuid) =>
    legacyDirs.map((legacyDir) => path.join(legacyDir, `${safeCacheName(uuid)}.json`));
  const writeQueues = new Map();

  const enqueueWrite = (uuid, operation) => {
    const key = String(uuid ?? "");
    const previous = writeQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    writeQueues.set(key, current);
    return current.finally(() => {
      if (writeQueues.get(key) === current) writeQueues.delete(key);
    });
  };

  const atomicWrite = async (targetPath, content) => {
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporaryPath, content, "utf8");
      await rename(temporaryPath, targetPath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => {});
    }
  };

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
    matchDetails = {},
  }) => {
    await mkdir(baseDir, { recursive: true });
    const normalizedRecords = sortRecordsNewestFirst(dedupeRecords(records));
    const payload = {
      version: CACHE_VERSION,
      uuid: String(uuid ?? ""),
      playerName: String(playerName ?? ""),
      fetchedAt,
      records: normalizedRecords,
      matchDetails: pruneMatchDetails(normalizedRecords, matchDetails),
    };
    if (playerInfo) payload.playerInfo = playerInfo;
    if (playerInfoFetchedAt) payload.playerInfoFetchedAt = playerInfoFetchedAt;
    await atomicWrite(cachePath(uuid), `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  };

  const writeUnlocked = async (options) => {
    const existing = await readFromPath(cachePath(options.uuid));
    return persist({
      ...options,
      playerInfo: options.playerInfo ?? existing?.playerInfo,
      playerInfoFetchedAt: options.playerInfoFetchedAt ?? existing?.playerInfoFetchedAt,
      matchDetails: options.matchDetails ?? existing?.matchDetails,
    });
  };
  const write = async (options) => enqueueWrite(options.uuid, () => writeUnlocked(options));

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
    return enqueueWrite(uuid, async () => {
      const existing = await read(uuid);
      return writeUnlocked({
        uuid,
        playerName: playerName || existing?.playerName || "",
        records: [...records, ...(existing?.records ?? [])],
      });
    });
  };

  const readKeys = async (uuid) => [...cacheRecordKeys(await read(uuid))];

  const updatePlayerInfo = async ({
    uuid,
    playerName = "",
    playerInfo,
    playerInfoFetchedAt = new Date().toISOString(),
  }) => {
    return enqueueWrite(uuid, async () => {
      const existing = await read(uuid);
      return persist({
        uuid,
        playerName: playerName || existing?.playerName || "",
        records: existing?.records ?? [],
        fetchedAt: existing?.fetchedAt,
        playerInfo,
        playerInfoFetchedAt,
        matchDetails: existing?.matchDetails,
      });
    });
  };

  const clearRecords = async (uuid) => {
    return enqueueWrite(uuid, async () => {
      const existing = await read(uuid);
      if (!existing) return null;
      return persist({
        ...existing,
        uuid,
        records: [],
        matchDetails: {},
        fetchedAt: new Date().toISOString(),
      });
    });
  };

  const readMatchDetail = async (uuid, record) => {
    const existing = await read(uuid);
    return existing?.matchDetails?.[recordKey(record)]?.raw ?? null;
  };

  const writeMatchDetail = async ({
    uuid,
    record,
    raw,
    fetchedAt = new Date().toISOString(),
  }) => {
    return enqueueWrite(uuid, async () => {
      const existing = await read(uuid);
      const records = existing?.records?.length ? existing.records : [record];
      return writeUnlocked({
        uuid,
        playerName: existing?.playerName ?? "",
        records,
        fetchedAt: existing?.fetchedAt,
        playerInfo: existing?.playerInfo,
        playerInfoFetchedAt: existing?.playerInfoFetchedAt,
        matchDetails: {
          ...(existing?.matchDetails ?? {}),
          [recordKey(record)]: { fetchedAt, raw },
        },
      });
    });
  };

  const writeMatchDetailsBatch = async ({ uuid, details = [] }) => {
    if (!details.length) return read(uuid);
    return enqueueWrite(uuid, async () => {
      const existing = await read(uuid);
      const matchDetails = { ...(existing?.matchDetails ?? {}) };
      for (const detail of details) {
        if (!detail?.record || detail.raw === undefined) continue;
        matchDetails[recordKey(detail.record)] = {
          fetchedAt: detail.fetchedAt ?? new Date().toISOString(),
          raw: detail.raw,
        };
      }
      return writeUnlocked({
        uuid,
        playerName: existing?.playerName ?? "",
        records: existing?.records ?? details.map((detail) => detail.record).filter(Boolean),
        fetchedAt: existing?.fetchedAt,
        playerInfo: existing?.playerInfo,
        playerInfoFetchedAt: existing?.playerInfoFetchedAt,
        matchDetails,
      });
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
    readMatchDetail,
    updatePlayerInfo,
    write,
    writeMatchDetail,
    writeMatchDetailsBatch,
  };
}
