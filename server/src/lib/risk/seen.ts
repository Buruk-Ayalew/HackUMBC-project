import { dataPath, readJson, writeJson } from "../jsonStore.js";

// "New nearby" tracking. The first time we check a location, everything found is
// the baseline (not new). After that, an item is "new" for 7 days after we first
// see it. Keyed by user and location, so changing the address starts a new baseline.

const SEEN_FILE = dataPath("risk-seen.json");
const NEW_FOR_MS = 7 * 86_400_000;
const FORGET_AFTER_MS = 180 * 86_400_000;

interface LocationSeen {
  baselineAt: string;
  firstSeen: Record<string, string>; // item id -> ISO time first seen
}
type SeenFile = Record<string, Record<string, LocationSeen>>; // userId -> locationKey -> ...

// Serialize read-modify-write so two requests can't drop each other's updates.
let chain: Promise<unknown> = Promise.resolve();

export function markSeen(userId: string, locKey: string, itemIds: string[], now = new Date()): Promise<Set<string>> {
  const run = chain.then(async () => {
    const all = await readJson<SeenFile>(SEEN_FILE, {});
    const byLoc = (all[userId] ??= {});
    const nowIso = now.toISOString();
    let loc = byLoc[locKey];
    const isBaseline = !loc;
    if (!loc) loc = byLoc[locKey] = { baselineAt: nowIso, firstSeen: {} };

    const current = new Set(itemIds);
    let changed = isBaseline;
    for (const id of itemIds) {
      if (!loc.firstSeen[id]) {
        loc.firstSeen[id] = nowIso;
        changed = true;
      }
    }
    for (const [id, at] of Object.entries(loc.firstSeen)) {
      if (!current.has(id) && now.getTime() - Date.parse(at) > FORGET_AFTER_MS) {
        delete loc.firstSeen[id];
        changed = true;
      }
    }
    if (changed) await writeJson(SEEN_FILE, all);

    const baseline = Date.parse(loc.baselineAt);
    const fresh = new Set<string>();
    for (const id of itemIds) {
      const at = Date.parse(loc.firstSeen[id]);
      if (at > baseline && now.getTime() - at < NEW_FOR_MS) fresh.add(id);
    }
    return fresh;
  });
  chain = run.catch(() => {});
  return run;
}
