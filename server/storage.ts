import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  BASE64_RESPONSE_MAX_BYTES,
  INLINE_PREVIEW_MAX_BYTES,
  STORAGE_ROOT,
} from './config.js';
import type { FileCategory } from '../src/types.js';

export async function ensureStorageRoot(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

function resolveConfinedPath(relativeKey: string): string {
  const normalized = relativeKey.replace(/^\/+/, '');
  const resolved = path.resolve(STORAGE_ROOT, normalized);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error('Invalid storage path boundary');
  }
  return resolved;
}

export async function saveObjectBuffer(
  userId: string,
  extension: string,
  buffer: Buffer,
  mimeType: string,
  category: FileCategory
): Promise<{
  storageKey: string;
  checksum: string;
  previewDataUrl: string | null;
}> {
  await ensureStorageRoot();
  const safeUserDir = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUserDir) {
    throw new Error('Invalid user storage directory');
  }

  const objectName = `${crypto.randomUUID()}${extension}`;
  const storageKey = path.posix.join(safeUserDir, objectName);
  const targetPath = resolveConfinedPath(storageKey);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  // Only generate lightweight inline Base64 previews for small raster images
  // to avoid bloating DB documents (MongoDB 16MB BSON limit).
  let previewDataUrl: string | null = null;
  if (category === 'image' && buffer.byteLength <= INLINE_PREVIEW_MAX_BYTES) {
    previewDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  return { storageKey, checksum, previewDataUrl };
}

export async function readObjectBuffer(storageKey: string): Promise<Buffer> {
  const targetPath = resolveConfinedPath(storageKey);
  return fs.readFile(targetPath);
}

export async function readObjectAsBase64DataUrl(
  storageKey: string,
  mimeType: string
): Promise<string> {
  const buffer = await readObjectBuffer(storageKey);
  if (buffer.byteLength > BASE64_RESPONSE_MAX_BYTES) {
    throw new Error('File exceeds 10 MB inline Base64 conversion cap');
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function deleteObject(storageKey: string): Promise<void> {
  try {
    const targetPath = resolveConfinedPath(storageKey);
    await fs.unlink(targetPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw err;
    }
  }
}

export async function deleteUserStorageDir(userId: string): Promise<void> {
  const safeUserDir = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUserDir) return;
  const targetDir = resolveConfinedPath(safeUserDir);
  await fs.rm(targetDir, { recursive: true, force: true });
}
