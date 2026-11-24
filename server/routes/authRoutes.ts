import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  generateOpaqueToken,
  generateRecoveryCode,
  hashSecret,
  hashToken,
  signSessionToken,
  verifySecret,
} from '../auth.js';
import {
  countUsers,
  createResetRequest,
  createResetToken,
  createUserAtomic,
  findUserByEmail,
  findUserById,
  findValidResetToken,
  fulfillResetRequestsForUser,
  listAllUsers,
  markResetTokenUsed,
  toUserDTO,
  updateUser,
} from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../permissions.js';

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Please enter a valid email address').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().trim().email(),
  mode: z.enum(['recovery_code', 'admin_request']),
  recoveryCode: z.string().trim().optional(),
});

const resetSchema = z.object({
  token: z.string().trim().min(16),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(400).optional(),
  themePreference: z.enum(['light', 'dark']).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
});

authRouter.get('/bootstrap-status', async (_req, res) => {
  try {
    const total = await countUsers();
    res.json({ hasUsers: total > 0 });
  } catch {
    res.status(500).json({ error: 'Unable to check bootstrap status.' });
  }
});

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data.' });
    return;
  }

  const { name, email, password } = parsed.data;
  const recoveryCode = generateRecoveryCode();
  const verificationToken = generateOpaqueToken(20);

  try {
    const user = await createUserAtomic({
      name,
      email,
      bio: '',
      passwordHash: hashSecret(password),
      recoveryCodeHash: hashSecret(recoveryCode),
      emailVerificationTokenHash: hashToken(verificationToken),
    });

    const dto = await toUserDTO(user);
    const isFirstUser = user.role === 'admin' && user.status === 'approved';
    const token = isFirstUser ? signSessionToken(user.id, user.tokenVersion) : null;

    res.status(201).json({
      user: dto,
      token,
      recoveryCode,
      verificationToken: isFirstUser ? null : verificationToken,
      isFirstUser,
      message: isFirstUser
        ? 'Administrator account created and approved automatically.'
        : 'Account registered. Please verify your email and wait for administrator approval.',
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    res.status(500).json({ error: 'Unable to complete registration.' });
  }
});

authRouter.post('/verify-email', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }

  const targetHash = hashToken(token);
  const users = await listAllUsers();
  const match = users.find((u) => u.emailVerificationTokenHash === targetHash);
  if (!match) {
    res.status(400).json({ error: 'Invalid or already used verification token.' });
    return;
  }

  await updateUser(match.id, {
    emailVerified: true,
    emailVerificationTokenHash: null,
  });

  res.json({
    verified: true,
    status: match.status,
    message:
      match.status === 'approved'
        ? 'Email verified. You can sign in now.'
        : 'Email verified. Your account is still awaiting administrator approval.',
  });
});

authRouter.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required.' });
      return;
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    if (!user || !verifySecret(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    if (user.status === 'rejected') {
      res.status(200).json({
        authenticated: false,
        error: 'Your registration request was rejected by an administrator. You cannot sign in unless an administrator approves your account.',
        code: 'ACCOUNT_REJECTED',
        status: 'rejected',
      });
      return;
    }

    if (user.status === 'pending') {
      res.status(200).json({
        authenticated: false,
        error: 'Your account is waiting for administrator approval. Please wait until an administrator approves your registration before signing in.',
        code: 'PENDING_APPROVAL',
        status: 'pending',
      });
      return;
    }

    if (!user.isActive) {
      res.status(200).json({
        authenticated: false,
        error: 'Your account has been deactivated by an administrator. Please contact your workspace administrator to restore access.',
        code: 'ACCOUNT_DEACTIVATED',
        status: 'deactivated',
      });
      return;
    }

    const token = signSessionToken(user.id, user.tokenVersion);
    const dto = await toUserDTO(user);
    res.json({ authenticated: true, token, user: dto });
  } catch (err) {
    console.error('[FolioVault] Login error:', err);
    res.status(500).json({ error: 'Authentication service encountered an error. Please try again.' });
  }
});

authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user) {
    await updateUser(req.user.id, { tokenVersion: req.user.tokenVersion + 1 });
  }
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const fresh = await findUserById(req.user!.id);
  if (!fresh) {
    res.status(401).json({ error: 'User not found.' });
    return;
  }
  res.json({ user: await toUserDTO(fresh) });
});

authRouter.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile update.' });
    return;
  }

  const user = req.user!;
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
  if (parsed.data.themePreference !== undefined) patch.themePreference = parsed.data.themePreference;

  let newToken: string | undefined;
  if (parsed.data.newPassword) {
    if (!parsed.data.currentPassword || !verifySecret(parsed.data.currentPassword, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    patch.passwordHash = hashSecret(parsed.data.newPassword);
    patch.tokenVersion = user.tokenVersion + 1;
    newToken = signSessionToken(user.id, user.tokenVersion + 1);
  }

  const updated = await updateUser(user.id, patch);
  if (!updated) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  res.json({
    user: await toUserDTO(updated),
    token: newToken,
  });
});

authRouter.post('/regenerate-recovery-code', requireAuth, async (req: AuthenticatedRequest, res) => {
  const newCode = generateRecoveryCode();
  await updateUser(req.user!.id, { recoveryCodeHash: hashSecret(newCode) });
  res.json({ recoveryCode: newCode });
});

authRouter.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and recovery mode are required.' });
    return;
  }

  const { email, mode, recoveryCode } = parsed.data;
  const user = await findUserByEmail(email);

  if (mode === 'recovery_code') {
    if (!user || !recoveryCode || !verifySecret(recoveryCode.trim().toUpperCase(), user.recoveryCodeHash)) {
      res.status(400).json({ error: 'Email or recovery code is invalid.' });
      return;
    }

    const rawResetToken = generateOpaqueToken(24);
    await createResetToken({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashToken(rawResetToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      used: false,
      createdAt: new Date().toISOString(),
    });

    res.json({
      verified: true,
      resetToken: rawResetToken,
      message: 'Recovery code verified. Proceed to set a new password.',
    });
    return;
  }

  // Admin-assisted reset request (non-enumerating response)
  if (user && user.status === 'approved' && user.isActive) {
    await createResetRequest(user.id);
  }
  res.json({
    verified: false,
    message:
      'If an approved account exists for that email, a password reset request has been sent to the administrator queue.',
  });
});

authRouter.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reset request.' });
    return;
  }

  const record = await findValidResetToken(hashToken(parsed.data.token));
  if (!record) {
    res.status(400).json({ error: 'Reset token is invalid or has expired.' });
    return;
  }

  const user = await findUserById(record.userId);
  if (!user) {
    res.status(404).json({ error: 'User account no longer exists.' });
    return;
  }

  await updateUser(user.id, {
    passwordHash: hashSecret(parsed.data.newPassword),
    tokenVersion: user.tokenVersion + 1,
  });
  await markResetTokenUsed(record.id);
  await fulfillResetRequestsForUser(user.id);

  res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
});
