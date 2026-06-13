import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PREFERENCES = Object.freeze({
  autoUpdate: true,
});

export function normalizePreferences(value = {}) {
  return {
    autoUpdate: value?.autoUpdate !== false,
  };
}

export function createPreferenceStore(filePath) {
  const read = async () => {
    try {
      return normalizePreferences(JSON.parse(await readFile(filePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return { ...DEFAULT_PREFERENCES };
      return { ...DEFAULT_PREFERENCES };
    }
  };

  const write = async (preferences = {}) => {
    const normalized = normalizePreferences(preferences);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  };

  const update = async (patch = {}) => write({ ...(await read()), ...patch });

  return {
    read,
    update,
    write,
  };
}
