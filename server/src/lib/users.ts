import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PublicUser } from "../../../shared/types.js";
import { dataPath, readJson, writeJson } from "./jsonStore.js";
import { getProfileForUser, getSampleProfiles, saveProfile } from "./profile.js";

export interface StoredUser extends PublicUser {
  passwordHash: string;
}

const USERS = dataPath("users.json");

export const DEMO_EMAIL = "demo@regwise.test";
// Public on purpose: judges and visitors use it to try the app.
export const DEMO_PASSWORD = "RegWise-tZnc-oecR-7jbE";

export function toPublic(u: StoredUser): PublicUser {
  return { id: u.id, email: u.email, name: u.name };
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await readJson<StoredUser[]>(USERS, []);
  return users.find((u) => u.email === email.trim().toLowerCase()) ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const users = await readJson<StoredUser[]>(USERS, []);
  return users.find((u) => u.id === id) ?? null;
}

export async function createUser(name: string, email: string, password: string): Promise<StoredUser> {
  const users = await readJson<StoredUser[]>(USERS, []);
  const normalized = email.trim().toLowerCase();
  if (users.some((u) => u.email === normalized)) throw new Error("EMAIL_TAKEN");
  const user: StoredUser = {
    id: randomUUID(),
    email: normalized,
    name: name.trim(),
    passwordHash: await bcrypt.hash(password, 10),
  };
  users.push(user);
  await writeJson(USERS, users);
  return user;
}

export async function updatePassword(userId: string, password: string): Promise<void> {
  const users = await readJson<StoredUser[]>(USERS, []);
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("NOT_FOUND");
  user.passwordHash = await bcrypt.hash(password, 10);
  await writeJson(USERS, users);
}

export function checkPassword(user: StoredUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

// Seed the test account with the Baltimore City restaurant profile so judges
// land on real results.
export async function seedDemoUser(): Promise<void> {
  let user = await findUserByEmail(DEMO_EMAIL);
  if (!user) user = await createUser("Demo Owner", DEMO_EMAIL, DEMO_PASSWORD);
  // Keep the stored password in sync with DEMO_PASSWORD (e.g. after it's changed).
  else if (!(await checkPassword(user, DEMO_PASSWORD))) await updatePassword(user.id, DEMO_PASSWORD);
  if (!(await getProfileForUser(user.id))) {
    const [restaurant] = await getSampleProfiles();
    if (restaurant) {
      await saveProfile({
        ...restaurant,
        id: randomUUID(),
        userId: user.id,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
