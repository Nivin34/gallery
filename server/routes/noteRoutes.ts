import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  createNote,
  deleteNoteById,
  findNoteById,
  listAllNotes,
  listAllUsers,
  toNoteDTO,
  updateNote,
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
import { computeReadingMetrics, sanitizeRichHtml } from '../sanitize.js';

export const noteRouter = Router();

function isSafeImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/api/files/') || trimmed.startsWith('/api/public/files/')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const noteImageItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  fileId: z.string().trim().max(100).nullable().optional(),
  src: z.string().min(1).refine(isSafeImageSrc, 'Invalid or unsafe image source URL.'),
  fileName: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(500).default(''),
  marked: z.boolean().default(false),
  order: z.number().int().min(0).max(500),
});

const noteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  contentHtml: z.string().max(500_000).default(''),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  images: z.array(noteImageItemSchema).max(40).default([]),
  collectionLayout: z.enum(['grid', 'columns', 'stack']).default('grid'),
  status: z.enum(['draft', 'published']).default('draft'),
  visibility: z.enum(['private', 'public']).default('private'),
});

const patchNoteSchema = noteSchema.partial();

noteRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const visibility = typeof req.query.visibility === 'string' ? req.query.visibility : 'all';
  const kind = typeof req.query.kind === 'string' ? req.query.kind : 'all'; // all | collections | text
  const ownerFilter = typeof req.query.ownerId === 'string' ? req.query.ownerId : 'me';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));

  const [allNotes, allUsers] = await Promise.all([listAllNotes(), listAllUsers()]);
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  let filtered = allNotes.filter((n) => {
    if (user.role === 'admin') {
      if (ownerFilter === 'me') return n.ownerId === user.id;
      if (ownerFilter && ownerFilter !== 'all') return n.ownerId === ownerFilter;
      return true;
    }
    return n.ownerId === user.id;
  });

  if (status !== 'all') {
    filtered = filtered.filter((n) => n.status === status);
  }
  if (visibility !== 'all') {
    filtered = filtered.filter((n) => n.visibility === visibility);
  }
  if (kind === 'collections') {
    filtered = filtered.filter((n) => Array.isArray(n.images) && n.images.length > 0);
  } else if (kind === 'text') {
    filtered = filtered.filter((n) => !n.images || n.images.length === 0);
  }
  if (search) {
    filtered = filtered.filter(
      (n) =>
        n.title.toLowerCase().includes(search) ||
        n.plainText.toLowerCase().includes(search) ||
        n.tags.some((t) => t.toLowerCase().includes(search)) ||
        (n.images || []).some(
          (img) =>
            img.caption.toLowerCase().includes(search) ||
            img.fileName.toLowerCase().includes(search)
        )
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
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const items = filtered
    .slice(offset, offset + limit)
    .map((n) => toNoteDTO(n, userMap.get(n.ownerId) || 'Unknown'));

  res.json({
    items,
    total,
    page: safePage,
    limit,
    totalPages,
  });
});

noteRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const note = await findNoteById(String(req.params.id));
  if (!note) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  if (!canViewResource(req.user!, note)) {
    res.status(403).json({ error: 'You do not have permission to view this private note.' });
    return;
  }

  const allUsers = await listAllUsers();
  const ownerName = allUsers.find((u) => u.id === note.ownerId)?.name || 'Unknown';
  res.json({ note: toNoteDTO(note, ownerName) });
});

noteRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (!canCreateOrUpload(user)) {
    res.status(403).json({
      error: 'Your current permission tier (View Only) does not allow creating notes.',
    });
    return;
  }

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note payload.' });
    return;
  }

  if (parsed.data.visibility === 'public' && user.role !== 'admin' && !user.canPublishPublic) {
    res.status(403).json({
      error: 'Public publishing has been restricted on your account by an administrator.',
    });
    return;
  }

  const safeHtml = sanitizeRichHtml(parsed.data.contentHtml);
  const metrics = computeReadingMetrics(safeHtml);
  const normalizedImages = [...parsed.data.images]
    .sort((a, b) => a.order - b.order)
    .map((img, idx) => ({ ...img, fileId: img.fileId ?? null, order: idx }));
  const now = new Date().toISOString();

  const entity = await createNote({
    id: crypto.randomUUID(),
    ownerId: user.id,
    title: parsed.data.title,
    shareSlug: crypto.randomBytes(8).toString('hex'),
    contentHtml: safeHtml,
    plainText: metrics.plainText,
    excerpt: metrics.excerpt,
    tags: parsed.data.tags,
    images: normalizedImages,
    collectionLayout: parsed.data.collectionLayout,
    status: parsed.data.status,
    visibility: parsed.data.visibility,
    lockedByAdmin: false,
    readingTimeMinutes: metrics.readingTimeMinutes,
    wordCount: metrics.wordCount,
    createdAt: now,
    updatedAt: now,
  });

  res.status(201).json({ note: toNoteDTO(entity, user.name) });
});

noteRouter.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = patchNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note update.' });
    return;
  }

  const note = await findNoteById(String(req.params.id));
  if (!note) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  if (!canEditResource(req.user!, note)) {
    res.status(403).json({ error: 'You do not have permission to edit this note.' });
    return;
  }

  if (parsed.data.visibility) {
    const visCheck = canChangeVisibility(req.user!, note, parsed.data.visibility);
    if (!visCheck.allowed) {
      res.status(403).json({ error: visCheck.reason });
      return;
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.visibility !== undefined) patch.visibility = parsed.data.visibility;
  if (parsed.data.collectionLayout !== undefined) {
    patch.collectionLayout = parsed.data.collectionLayout;
  }
  if (parsed.data.images !== undefined) {
    patch.images = [...parsed.data.images]
      .sort((a, b) => a.order - b.order)
      .map((img, idx) => ({ ...img, fileId: img.fileId ?? null, order: idx }));
  }
  if (parsed.data.contentHtml !== undefined) {
    const safeHtml = sanitizeRichHtml(parsed.data.contentHtml);
    const metrics = computeReadingMetrics(safeHtml);
    patch.contentHtml = safeHtml;
    patch.plainText = metrics.plainText;
    patch.excerpt = metrics.excerpt;
    patch.wordCount = metrics.wordCount;
    patch.readingTimeMinutes = metrics.readingTimeMinutes;
  }

  const updated = await updateNote(note.id, patch);
  const allUsers = await listAllUsers();
  const ownerName = allUsers.find((u) => u.id === note.ownerId)?.name || 'Unknown';
  res.json({ note: toNoteDTO(updated!, ownerName) });
});

noteRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const note = await findNoteById(String(req.params.id));
  if (!note) {
    res.status(404).json({ error: 'Note not found.' });
    return;
  }

  if (!canDeleteResource(req.user!, note)) {
    res.status(403).json({ error: 'You do not have permission to delete this note.' });
    return;
  }

  await deleteNoteById(note.id);
  res.json({ ok: true });
});
