import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { MAX_HARD_UPLOAD_MB, validateBase64DataUrl, validateFileFormat } from '../config.js';
import {
  createFile,
  deleteFileById,
  findFileById,
  listAllFiles,
  listAllUsers,
  toFileDTO,
  updateFile,
} from '../db.js';
import {
  canChangeVisibility,
  canCreateOrUpload,
  canDeleteResource,
  canEditResource,
  canViewResource,
  requireAuth,
  type AuthenticatedRequest,
} from '../permissions.js';
import { deleteObject, readObjectAsBase64DataUrl, readObjectBuffer } from '../storage.js';

export const fileRouter = Router();

const base64FileItemSchema = z.object({
  base64: z.string().min(10),
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1).max(120),
});

const base64UploadBodySchema = z.object({
  files: z.array(base64FileItemSchema).min(1).max(10),
  visibility: z.enum(['private', 'public']).default('private'),
  tags: z.string().max(500).optional().default(''),
  description: z.string().max(1000).optional().default(''),
  folder: z.string().trim().max(80).optional().default(''),
  title: z.string().max(160).optional(),
});

const patchFileSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  folder: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  visibility: z.enum(['private', 'public']).optional(),
});

const batchFileActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['move', 'delete', 'visibility']),
  folder: z.string().trim().max(80).optional(),
  visibility: z.enum(['private', 'public']).optional(),
});

fileRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const category = typeof req.query.category === 'string' ? req.query.category : 'all';
  const visibility = typeof req.query.visibility === 'string' ? req.query.visibility : 'all';
  const folder = typeof req.query.folder === 'string' ? req.query.folder : 'all';
  const ownerFilter = typeof req.query.ownerId === 'string' ? req.query.ownerId : 'me';
  const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
  const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '12'), 10) || 12));

  const [allFiles, allUsers] = await Promise.all([listAllFiles(), listAllUsers()]);
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const scoped = allFiles.filter((f) => {
    if (user.role === 'admin') {
      if (ownerFilter === 'me') return f.ownerId === user.id;
      if (ownerFilter && ownerFilter !== 'all') return f.ownerId === ownerFilter;
      return true;
    }
    return f.ownerId === user.id;
  });

  const folders = Array.from(
    new Set(scoped.map((f) => (f.folder || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  let filtered = scoped;

  if (category !== 'all') {
    filtered = filtered.filter((f) => f.category === category);
  }
  if (visibility !== 'all') {
    filtered = filtered.filter((f) => f.visibility === visibility);
  }
  if (folder === 'unfiled') {
    filtered = filtered.filter((f) => !(f.folder || '').trim());
  } else if (folder !== 'all') {
    filtered = filtered.filter((f) => (f.folder || '').trim() === folder);
  }
  if (dateFrom) {
    filtered = filtered.filter((f) => f.createdAt >= dateFrom);
  }
  if (dateTo) {
    const endIso = `${dateTo}T23:59:59.999Z`;
    filtered = filtered.filter((f) => f.createdAt <= endIso);
  }
  if (search) {
    filtered = filtered.filter(
      (f) =>
        f.title.toLowerCase().includes(search) ||
        f.originalName.toLowerCase().includes(search) ||
        f.description.toLowerCase().includes(search) ||
        (f.folder || '').toLowerCase().includes(search) ||
        f.tags.some((t) => t.toLowerCase().includes(search))
    );
  }

  filtered.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt);
      case 'alpha_asc':
        return a.title.localeCompare(b.title);
      case 'alpha_desc':
        return b.title.localeCompare(a.title);
      case 'size_desc':
        return b.sizeBytes - a.sizeBytes;
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const items = filtered
    .slice(offset, offset + limit)
    .map((f) => toFileDTO(f, userMap.get(f.ownerId) || 'Unknown'));

  res.json({
    items,
    total,
    page: safePage,
    limit,
    totalPages,
    folders,
  });
});

fileRouter.post('/upload', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (!canCreateOrUpload(user)) {
    res.status(403).json({
      error: 'Your current permission level (View Only) does not allow uploading files.',
    });
    return;
  }

  const parsed = base64UploadBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid Base64 file upload payload.',
    });
    return;
  }

  const { files: incomingFiles, visibility, tags: rawTags, description, folder, title } = parsed.data;
  if (visibility === 'public' && user.role !== 'admin' && !user.canPublishPublic) {
    res.status(403).json({
      error: 'Public publishing has been restricted on your account by an administrator.',
    });
    return;
  }

  const existingFiles = (await listAllFiles()).filter((f) => f.ownerId === user.id);
  let currentCount = existingFiles.length;
  let currentBytes = existingFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const maxBytesLimit = user.maxStorageMB * 1024 * 1024;
  const effectiveMaxFileMB = Math.min(user.maxFileSizeMB, MAX_HARD_UPLOAD_MB);
  const maxFileBytes = effectiveMaxFileMB * 1024 * 1024;

  const tags = rawTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  const validated: Array<{
    fileName: string;
    base64: string;
    buffer: Buffer;
    mimeType: string;
    ext: string;
    category: 'image' | 'document' | 'spreadsheet' | 'other';
    sizeBytes: number;
  }> = [];

  for (const item of incomingFiles) {
    const check = validateBase64DataUrl(item.base64, item.fileName);
    if (!check.valid || !check.buffer || !check.mimeType || !check.ext || !check.category) {
      res.status(400).json({ error: check.error || `Invalid file "${item.fileName}".` });
      return;
    }

    const actualSize = check.sizeBytes ?? check.buffer.byteLength;
    if (actualSize > maxFileBytes) {
      res.status(413).json({
        error: `"${item.fileName}" exceeds the ${effectiveMaxFileMB} MB per-file size limit.`,
      });
      return;
    }

    if (user.role !== 'admin' && currentCount + 1 > user.maxFileCount) {
      res.status(403).json({
        error: `Upload would exceed your maximum file limit (${user.maxFileCount} files).`,
      });
      return;
    }

    if (user.role !== 'admin' && currentBytes + actualSize > maxBytesLimit) {
      res.status(413).json({
        error: `Upload would exceed your total storage quota (${user.maxStorageMB} MB).`,
      });
      return;
    }

    currentCount += 1;
    currentBytes += actualSize;
    validated.push({
      fileName: item.fileName,
      base64: item.base64,
      buffer: check.buffer,
      mimeType: check.mimeType,
      ext: check.ext,
      category: check.category,
      sizeBytes: actualSize,
    });
  }

  const createdDTOs = [];
  for (const entry of validated) {
    const now = new Date().toISOString();
    const checksum = crypto.createHash('sha256').update(entry.buffer).digest('hex');
    const baseTitle = entry.fileName.replace(/\.[^/.]+$/, '').slice(0, 140) || 'Untitled';

    const entity = await createFile({
      id: crypto.randomUUID(),
      ownerId: user.id,
      originalName: entry.fileName,
      title:
        validated.length === 1 && title && title.trim()
          ? title.trim().slice(0, 160)
          : baseTitle,
      description: description.trim().slice(0, 1000),
      folder: (folder || '').trim().slice(0, 80),
      tags,
      mimeType: entry.mimeType,
      extension: entry.ext,
      category: entry.category,
      sizeBytes: entry.sizeBytes,
      storageKey: '',
      checksum,
      fileData: entry.base64,
      previewDataUrl: entry.category === 'image' ? entry.base64 : null,
      visibility,
      lockedByAdmin: false,
      shareSlug: crypto.randomBytes(8).toString('hex'),
      createdAt: now,
      updatedAt: now,
    });

    createdDTOs.push(toFileDTO(entity, user.name));
  }

  res.status(201).json({ files: createdDTOs });
});

fileRouter.post('/batch', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const parsed = batchFileActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid batch operation payload.',
    });
    return;
  }

  const uniqueIds = Array.from(new Set(parsed.data.ids));
  const { action, folder, visibility } = parsed.data;

  if (action === 'visibility' && !visibility) {
    res.status(400).json({ error: 'Target visibility is required for batch visibility updates.' });
    return;
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of uniqueIds) {
    const file = await findFileById(id);
    if (!file) {
      skipped += 1;
      errors.push('One or more selected files no longer exist.');
      continue;
    }

    if (action === 'move') {
      if (!canEditResource(user, file)) {
        skipped += 1;
        errors.push(`"${file.title}": your permission level does not allow editing.`);
        continue;
      }
      await updateFile(file.id, { folder: (folder || '').trim().slice(0, 80) });
      processed += 1;
    } else if (action === 'visibility') {
      const targetVisibility = visibility!;
      const visCheck = canChangeVisibility(user, file, targetVisibility);
      if (!visCheck.allowed) {
        skipped += 1;
        errors.push(`"${file.title}": ${visCheck.reason}`);
        continue;
      }
      await updateFile(file.id, { visibility: targetVisibility });
      processed += 1;
    } else if (action === 'delete') {
      if (!canDeleteResource(user, file)) {
        skipped += 1;
        errors.push(`"${file.title}": your permission level does not allow deletion.`);
        continue;
      }
      await deleteFileById(file.id);
      if (file.storageKey) {
        await deleteObject(file.storageKey);
      }
      processed += 1;
    }
  }

  if (processed === 0 && skipped > 0) {
    res.status(403).json({
      ok: false,
      processed,
      skipped,
      errors,
      error: errors[0] || 'You do not have permission to perform this batch action.',
    });
    return;
  }

  res.json({
    ok: true,
    processed,
    skipped,
    errors,
  });
});

fileRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const file = await findFileById(String(req.params.id));
  if (!file) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }
  if (!canViewResource(req.user!, file)) {
    res.status(403).json({ error: 'You do not have access to this private file.' });
    return;
  }
  const users = await listAllUsers();
  const ownerName = users.find((u) => u.id === file.ownerId)?.name || 'Unknown';
  res.json({ file: toFileDTO(file, ownerName) });
});

fileRouter.get('/:id/content', requireAuth, async (req: AuthenticatedRequest, res) => {
  const file = await findFileById(String(req.params.id));
  if (!file) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  if (!canViewResource(req.user!, file)) {
    res.status(403).json({ error: 'You do not have access to this private file.' });
    return;
  }

  try {
    let buffer: Buffer;
    if (file.fileData) {
      const commaIdx = file.fileData.indexOf(',');
      buffer = Buffer.from(file.fileData.slice(commaIdx + 1), 'base64');
    } else if (file.storageKey) {
      buffer = await readObjectBuffer(file.storageKey);
    } else {
      res.status(404).json({ error: 'File data unavailable.' });
      return;
    }

    const check = validateFileFormat(file.originalName, file.mimeType);
    const downloadRequested = req.query.download === '1';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (downloadRequested || !check.inlineSafe) {
      const safeName = file.originalName.replace(/["\r\n]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'Stored file binary could not be retrieved.' });
  }
});

fileRouter.get('/:id/base64', requireAuth, async (req: AuthenticatedRequest, res) => {
  const file = await findFileById(String(req.params.id));
  if (!file) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  if (!canViewResource(req.user!, file)) {
    res.status(403).json({ error: 'You do not have access to this private file.' });
    return;
  }

  try {
    const dataUrl =
      file.fileData ||
      (file.storageKey ? await readObjectAsBase64DataUrl(file.storageKey, file.mimeType) : null);
    if (!dataUrl) {
      res.status(404).json({ error: 'Base64 Data URL unavailable.' });
      return;
    }
    res.json({ dataUrl, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
  } catch (err: unknown) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to retrieve Base64 data URL.',
    });
  }
});

fileRouter.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = patchFileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid file update.' });
    return;
  }

  const file = await findFileById(String(req.params.id));
  if (!file) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  if (!canEditResource(req.user!, file)) {
    res.status(403).json({ error: 'You do not have permission to edit this file.' });
    return;
  }

  if (parsed.data.visibility) {
    const visCheck = canChangeVisibility(req.user!, file, parsed.data.visibility);
    if (!visCheck.allowed) {
      res.status(403).json({ error: visCheck.reason });
      return;
    }
  }

  const updated = await updateFile(file.id, parsed.data);
  const allUsers = await listAllUsers();
  const ownerName = allUsers.find((u) => u.id === file.ownerId)?.name || 'Unknown';
  res.json({ file: toFileDTO(updated!, ownerName) });
});

fileRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const file = await findFileById(String(req.params.id));
  if (!file) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  if (!canDeleteResource(req.user!, file)) {
    res.status(403).json({ error: 'You do not have permission to delete this file.' });
    return;
  }

  await deleteFileById(file.id);
  if (file.storageKey) {
    await deleteObject(file.storageKey);
  }
  res.json({ ok: true });
});
