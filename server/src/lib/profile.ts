import type { BusinessProfile } from "../../../shared/types.js";
import { dataPath, readJson, writeJson } from "./jsonStore.js";

const PROFILES = dataPath("profiles.json");

export async function getProfileForUser(userId: string): Promise<BusinessProfile | null> {
  const profiles = await readJson<BusinessProfile[]>(PROFILES, []);
  return profiles.find((p) => p.userId === userId) ?? null;
}

// Insert or replace the profile for profile.userId.
export async function saveProfile(profile: BusinessProfile): Promise<BusinessProfile> {
  const profiles = await readJson<BusinessProfile[]>(PROFILES, []);
  const i = profiles.findIndex((p) => p.userId === profile.userId);
  if (i >= 0) profiles[i] = profile;
  else profiles.push(profile);
  await writeJson(PROFILES, profiles);
  return profile;
}

export async function getSampleProfiles(): Promise<BusinessProfile[]> {
  return readJson<BusinessProfile[]>(dataPath("sample-profiles.json"), []);
}
