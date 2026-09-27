import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getProfileForUser } from "../lib/profile.js";
import { refreshOnLogin } from "../lib/refreshOnLogin.js";
import {
  checkPassword,
  createUser,
  findUserByEmail,
  findUserById,
  toPublic,
  updatePassword,
} from "../lib/users.js";

const router = Router();

const loginBody = z.object({ email: z.string().min(1), password: z.string().min(1) });
const registerBody = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
const passwordBody = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

function startSession(req: import("express").Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
}

router.post("/login", async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your email and password." });
    return;
  }
  const user = await findUserByEmail(parsed.data.email);
  if (!user || !(await checkPassword(user, parsed.data.password))) {
    res.status(401).json({ error: "That email and password don't match an account." });
    return;
  }
  await startSession(req, user.id);
  const profile = await getProfileForUser(user.id);
  if (profile) refreshOnLogin(user.id); // background: obligations, Radar, Local Risk
  res.json({ user: toPublic(user), hasProfile: profile !== null });
});

router.post("/register", async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check your details." });
    return;
  }
  try {
    const user = await createUser(parsed.data.name, parsed.data.email, parsed.data.password);
    await startSession(req, user.id);
    res.status(201).json({ user: toPublic(user), hasProfile: false });
  } catch (err) {
    if ((err as Error).message === "EMAIL_TAKEN") {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    throw err;
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("regwise.sid");
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Please log in." });
    return;
  }
  const profile = await getProfileForUser(user.id);
  res.json({ user: toPublic(user), hasProfile: profile !== null });
});

router.post("/password", requireAuth, async (req, res) => {
  const parsed = passwordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check your details." });
    return;
  }
  const user = await findUserById(req.session.userId!);
  if (!user || !(await checkPassword(user, parsed.data.currentPassword))) {
    res.status(400).json({ error: "Your current password is incorrect." });
    return;
  }
  await updatePassword(user.id, parsed.data.newPassword);
  res.json({ ok: true });
});

export default router;
