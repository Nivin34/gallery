import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { generateOpaqueToken, hashToken } from '../auth.js';
import {
  createResetToken,
  deleteUserById,
  findFileById,
  findNoteById,
  findUserById,
  fulfillResetRequestsForUser,
  getDatabaseEngine,
  getDatabaseFallbackReason,
  listAllFiles,
  listAllNotes,
  listAllUsers,
  listResetRequests,
  toFileDTO,
  toNoteDTO,
  toUserDTO,
  updateFile,
  updateNote,
  updateUser,
} from '../db.js';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from '../permissions.js';
import { deleteUserStorageDir } from '../storage.js';
import type { FileCategory } from '../../src/types.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

const approvalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  permissionLevel: z.enum(['view_only', 'view_edit', 'view_edit_delete']).optional(),
  canPublishPublic: z.boolean().optional(),
});

const roleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

const permissionSchema = z.object({
  permissionLevel: z.enum(['view_only', 'view_edit', 'view_edit_delete']),
  canPublishPublic: z.boolean(),
  maxFileCount: z.number().int().min(0).max(10000),
  maxFileSizeMB: z.number().min(1).max(50),
  maxStorageMB: z.number().min(1).max(50000),
});

const visibilitySchema = z.object({
  visibility: z.enum(['private', 'public']),
  lockedByAdmin: z.boolean(),
});

adminRouter.get('/stats', async (_req, res) => {
  const [users, files, notes, resetRequests] = await Promise.all([
    listAllUsers(),
    listAllFiles(),
    listAllNotes(),
    listResetRequests(),
  ]);

  const storageByCategory: Record<FileCategory, { count: number; bytes: number }> = {
    image: { count: 0, bytes: 0 },
    document: { count: 0, bytes: 0 },
    spreadsheet: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
  };

  let totalStorageBytes = 0;
  for (const f of files) {
    totalStorageBytes += f.sizeBytes;
    storageByCategory[f.category].count += 1;
    storageByCategory[f.category].bytes += f.sizeBytes;
  }

  res.json({
    databaseEngine: getDatabaseEngine(),
    databaseFallbackReason: getDatabaseFallbackReason(),
    totalUsers: users.length,
    pendingUsers: users.filter((u) => u.status === 'pending').length,
    approvedUsers: users.filter((u) => u.status === 'approved').length,
    deactivatedUsers: users.filter((u) => !u.isActive).length,
    totalFiles: files.length,
    publicFiles: files.filter((f) => f.visibility === 'public').length,
    privateFiles: files.filter((f) => f.visibility === 'private').length,
    totalNotes: notes.length,
    publishedNotes: notes.filter((n) => n.status === 'published').length,
    draftNotes: notes.filter((n) => n.status === 'draft').length,
    totalStorageBytes,
    storageByCategory,
    pendingResetRequests: resetRequests.length,
  });
});

adminRouter.get('/users', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const role = typeof req.query.role === 'string' ? req.query.role : 'all';
  const active = typeof req.query.active === 'string' ? req.query.active : 'all';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '15'), 10) || 15));

  const users = await listAllUsers();
  let filtered = users;

  if (status !== 'all') {
    filtered = filtered.filter((u) => u.status === status);
  }
  if (role !== 'all') {
    filtered = filtered.filter((u) => u.role === role);
  }
  if (active === 'active') {
    filtered = filtered.filter((u) => u.isActive);
  } else if (active === 'inactive') {
    filtered = filtered.filter((u) => !u.isActive);
  }
  if (search) {
    filtered = filtered.filter(
      (u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
    );
  }

  filtered.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt);
      case 'alpha_asc':
        return a.name.localeCompare(b.name);
      case 'alpha_desc':
        return b.name.localeCompare(a.name);
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);
  const items = await Promise.all(slice.map((u) => toUserDTO(u)));

  res.json({
    items,
    total,
    page: safePage,
    limit,
    totalPages,
  });
});

adminRouter.patch('/users/:id/approval', async (req, res) => {
  const parsed = approvalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid approval decision.' });
    return;
  }

  const target = await findUserById(String(req.params.id));
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const updated = await updateUser(target.id, {
    status: parsed.data.decision,
    ...(parsed.data.permissionLevel ? { permissionLevel: parsed.data.permissionLevel } : {}),
    ...(parsed.data.canPublishPublic !== undefined
      ? { canPublishPublic: parsed.data.canPublishPublic }
      : {}),
  });

  res.json({ user: await toUserDTO(updated!) });
});

adminRouter.patch('/users/:id/role', async (req: AuthenticatedRequest, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid role value.' });
    return;
  }

  const target = await findUserById(String(req.params.id));
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (target.id === req.user!.id && parsed.data.role !== 'admin') {
    res.status(400).json({ error: 'You cannot demote your own administrator account.' });
    return;
  }

  if (target.role === 'admin' && parsed.data.role !== 'admin') {
    const allUsers = await listAllUsers();
    const adminCount = allUsers.filter((u) => u.role === 'admin' && u.isActive).length;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot demote the last active administrator.' });
      return;
    }
  }

  const updated = await updateUser(target.id, {
    role: parsed.data.role,
    tokenVersion: target.tokenVersion + 1,
  });

  res.json({ user: await toUserDTO(updated!) });
});

adminRouter.patch('/users/:id/status', async (req: AuthenticatedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status payload.' });
    return;
  }

  const target = await findUserById(String(req.params.id));
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (target.id === req.user!.id && !parsed.data.isActive) {
    res.status(400).json({ error: 'You cannot deactivate your own active session.' });
    return;
  }

  const updated = await updateUser(target.id, {
    isActive: parsed.data.isActive,
    tokenVersion: parsed.data.isActive ? target.tokenVersion : target.tokenVersion + 1,
  });

  res.json({ user: await toUserDTO(updated!) });
});

adminRouter.patch('/users/:id/permissions', async (req, res) => {
  const parsed = permissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid permission settings.' });
    return;
  }

  const target = await findUserById(String(req.params.id));
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const updated = await updateUser(target.id, parsed.data);
  res.json({ user: await toUserDTO(updated!) });
});

adminRouter.post('/users/:id/reset-token', async (req, res) => {
  const target = await findUserById(String(req.params.id));
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const rawResetToken = generateOpaqueToken(24);
  await createResetToken({
    id: crypto.randomUUID(),
    userId: target.id,
    tokenHash: hashToken(rawResetToken),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    used: false,
    createdAt: new Date().toISOString(),
  });
  await fulfillResetRequestsForUser(target.id);

  res.json({
    resetToken: rawResetToken,
    expiresInMinutes: 60,
  });
});

adminRouter.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  const target = await findUserById(String(req.params.id));
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (target.id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own administrator account.' });
    return;
  }

  await deleteUserById(target.id);
  await deleteUserStorageDir(target.id);
  res.json({ ok: true });
});

adminRouter.patch('/content/:kind/:id/visibility', async (req, res) => {
  const parsed = visibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid visibility control payload.' });
    return;
  }

  const kind = req.params.kind;
  const id = String(req.params.id);
  const allUsers = await listAllUsers();
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  if (kind === 'file') {
    const file = await findFileById(id);
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    const updated = await updateFile(file.id, parsed.data);
    res.json({ file: toFileDTO(updated!, userMap.get(file.ownerId) || 'Unknown') });
    return;
  }

  if (kind === 'note') {
    const note = await findNoteById(id);
    if (!note) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    const updated = await updateNote(note.id, parsed.data);
    res.json({ note: toNoteDTO(updated!, userMap.get(note.ownerId) || 'Unknown') });
    return;
  }

  res.status(400).json({ error: 'Unsupported content type.' });
});

adminRouter.get('/reset-requests', async (_req, res) => {
  const requests = await listResetRequests();
  res.json({ requests });
});
