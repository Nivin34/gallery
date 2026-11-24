import { Router } from 'express';
import { validateFileFormat } from '../config.js';
import {
  findFileByShareSlug,
  findNoteByShareSlug,
  listAllFiles,
  listAllNotes,
  listAllUsers,
  toFileDTO,
  toNoteDTO,
} from '../db.js';
import { readObjectBuffer } from '../storage.js';

export const publicRouter = Router();

publicRouter.get('/gallery', async (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : 'all'; // all | files | notes
  const category = typeof req.query.category === 'string' ? req.query.category : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(String(req.query.limit || '12'), 10) || 12));

  const [allFiles, allNotes, allUsers] = await Promise.all([
    listAllFiles(),
    listAllNotes(),
    listAllUsers(),
  ]);
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const publicFiles =
    kind === 'notes'
      ? []
      : allFiles
          .filter((f) => f.visibility === 'public')
          .filter((f) => category === 'all' || f.category === category)
          .filter(
            (f) =>
              !search ||
              f.title.toLowerCase().includes(search) ||
              f.originalName.toLowerCase().includes(search) ||
              f.description.toLowerCase().includes(search) ||
              f.tags.some((t) => t.toLowerCase().includes(search))
          )
          .map((f) => ({
            entryType: 'file' as const,
            createdAt: f.createdAt,
            title: f.title,
            item: toFileDTO(f, userMap.get(f.ownerId) || 'Creator'),
          }));

  const publicNotes =
    kind === 'files' || (category !== 'all' && kind === 'all')
      ? []
      : allNotes
          .filter((n) => n.visibility === 'public' && n.status === 'published')
          .filter(
            (n) =>
              !search ||
              n.title.toLowerCase().includes(search) ||
              n.plainText.toLowerCase().includes(search) ||
              n.tags.some((t) => t.toLowerCase().includes(search)) ||
              (n.images || []).some(
                (img) =>
                  img.caption.toLowerCase().includes(search) ||
                  img.fileName.toLowerCase().includes(search)
              )
          )
          .map((n) => ({
            entryType: 'note' as const,
            createdAt: n.createdAt,
            title: n.title,
            item: toNoteDTO(n, userMap.get(n.ownerId) || 'Author'),
          }));

  const combined = [...publicFiles, ...publicNotes].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt);
      case 'alpha_asc':
        return a.title.localeCompare(b.title);
      case 'alpha_desc':
        return b.title.localeCompare(a.title);
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });

  const total = combined.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  res.json({
    items: combined.slice(offset, offset + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  });
});

publicRouter.get('/files/:shareSlug', async (req, res) => {
  const file = await findFileByShareSlug(String(req.params.shareSlug));
  if (!file || file.visibility !== 'public') {
    res.status(404).json({ error: 'Public file not found or access is restricted.' });
    return;
  }
  const users = await listAllUsers();
  const ownerName = users.find((u) => u.id === file.ownerId)?.name || 'Creator';
  res.json({ file: toFileDTO(file, ownerName) });
});

publicRouter.get('/files/:shareSlug/content', async (req, res) => {
  const file = await findFileByShareSlug(String(req.params.shareSlug));
  if (!file || file.visibility !== 'public') {
    res.status(404).json({ error: 'Public file not found or access is restricted.' });
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
      res.status(404).json({ error: 'File content unavailable.' });
      return;
    }
    const check = validateFileFormat(file.originalName, file.mimeType);
    const downloadRequested = req.query.download === '1';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (downloadRequested || !check.inlineSafe) {
      const safeName = file.originalName.replace(/["\r\n]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'File content unavailable.' });
  }
});

publicRouter.get('/notes/:shareSlug', async (req, res) => {
  const note = await findNoteByShareSlug(String(req.params.shareSlug));
  if (!note || note.visibility !== 'public' || note.status !== 'published') {
    res.status(404).json({ error: 'Public note not found or not published.' });
    return;
  }
  const users = await listAllUsers();
  const ownerName = users.find((u) => u.id === note.ownerId)?.name || 'Author';
  res.json({ note: toNoteDTO(note, ownerName) });
});
