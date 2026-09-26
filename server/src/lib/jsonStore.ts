import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Absolute path to server/data, regardless of the process's working directory.
export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

export function dataPath(...parts: string[]): string {
  return path.join(DATA_DIR, ...parts);
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

// Write to a temp file, then rename, so readers never see a half-written file.
// Writes to the same file are serialized to avoid lost updates.
const queues = new Map<string, Promise<void>>();

export function writeJson(filePath: string, data: unknown): Promise<void> {
  const prev = queues.get(filePath) ?? Promise.resolve();
  const next = prev.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, filePath);
  });
  queues.set(filePath, next.catch(() => {}));
  return next;
}
