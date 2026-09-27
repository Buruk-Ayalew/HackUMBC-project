import type { ObligationRule } from "../../../../shared/types.js";
import { dataPath, readJson, writeJson } from "../jsonStore.js";

// One-time obligations an owner has marked as done, per user. Repeating
// obligations can't be marked done: they come back every period.

const FILE = dataPath("completed-obligations.json");
type Store = Record<string, Record<string, string>>; // userId -> ruleId -> ISO time marked done

export function isOneTime(rule: ObligationRule): boolean {
  return rule.frequency === "once" && !rule.recurring;
}

export async function getCompleted(userId: string): Promise<Record<string, string>> {
  const store = await readJson<Store>(FILE, {});
  return store[userId] ?? {};
}

export async function setCompleted(userId: string, ruleId: string, done: boolean): Promise<void> {
  const store = await readJson<Store>(FILE, {});
  const mine = { ...(store[userId] ?? {}) };
  if (done) mine[ruleId] = new Date().toISOString();
  else delete mine[ruleId];
  store[userId] = mine;
  await writeJson(FILE, store);
}
