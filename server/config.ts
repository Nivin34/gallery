import 'dotenv/config';
import crypto from 'crypto';
import path from 'path';
import type { FileCategory } from '../src/types.js';

export const PORT = Number(process.env.PORT || 3000);
export const MONGODB_URI = (process.env.MONGODB_URI || '').trim();
export const SESSION_SECRET =
  (process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

export const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), 'storage', 'objects');

export const DATA_ROOT = path.resolve(process.cwd(), 'data');

export const MAX_HARD_UPLOAD_MB = 10;
export const INLINE_PREVIEW_MAX_BYTES = 512 * 1024;
export const BASE64_RESPONSE_MAX_BYTES = 10 * 1024 * 1024;

export interface AllowedFormat {
  mimeTypes: string[];
  category: FileCategory;
  inlineSafe: boolean;
}

export const ALLOWED_EXTENSIONS: Record<string, AllowedFormat> = {
  '.jpg': { mimeTypes: ['image/jpeg', 'image/pjpeg'], category: 'image', inlineSafe: true },
  '.jpeg': { mimeTypes: ['image/jpeg', 'image/pjpeg'], category: 'image', inlineSafe: true },
  '.png': { mimeTypes: ['image/png'], category: 'image', inlineSafe: true },
  '.webp': { mimeTypes: ['image/webp'], category: 'image', inlineSafe: true },
  '.gif': { mimeTypes: ['image/gif'], category: 'image', inlineSafe: true },
  '.pdf': { mimeTypes: ['application/pdf'], category: 'document', inlineSafe: true },
  '.doc': {
    mimeTypes: ['application/msword', 'application/octet-stream'],
    category: 'document',
    inlineSafe: false,
  },
  '.docx': {
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
    ],
    category: 'document',
    inlineSafe: false,
  },
  '.txt': { mimeTypes: ['text/plain'], category: 'document', inlineSafe: true },
  '.xls': {
    mimeTypes: ['application/vnd.ms-excel', 'application/octet-stream'],
    category: 'spreadsheet',
    inlineSafe: false,
  },
  '.xlsx': {
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/octet-stream',
    ],
    category: 'spreadsheet',
    inlineSafe: false,
  },
  '.csv': {
    mimeTypes: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
    category: 'spreadsheet',
    inlineSafe: true,
  },
};

export function validateFileFormat(
  originalName: string,
  mimeType: string
): { valid: boolean; ext: string; category: FileCategory; inlineSafe: boolean } {
  const ext = path.extname(originalName || '').toLowerCase();
  const rule = ALLOWED_EXTENSIONS[ext];
  if (!rule) {
    return { valid: false, ext, category: 'other', inlineSafe: false };
  }
  const normalizedMime = (mimeType || '').toLowerCase().split(';')[0].trim();
  const mimeOk =
    rule.mimeTypes.includes(normalizedMime) ||
    (normalizedMime === 'application/octet-stream' &&
      ['.doc', '.docx', '.xls', '.xlsx', '.csv'].includes(ext));
  if (!mimeOk) {
    return { valid: false, ext, category: rule.category, inlineSafe: false };
  }
  return { valid: true, ext, category: rule.category, inlineSafe: rule.inlineSafe };
}

function verifyMagicBytes(ext: string, buffer: Buffer): boolean {
  if (buffer.byteLength === 0) return false;
  switch (ext) {
    case '.png':
      return (
        buffer.byteLength >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case '.jpg':
    case '.jpeg':
      return buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case '.gif': {
      const sig = buffer.subarray(0, 6).toString('ascii');
      return sig === 'GIF87a' || sig === 'GIF89a';
    }
    case '.webp': {
      return (
        buffer.byteLength >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    case '.pdf':
      return buffer.byteLength >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return true;
  }
}

export function validateBase64DataUrl(
  dataUrl: string,
  originalName: string
): {
  valid: boolean;
  error?: string;
  buffer?: Buffer;
  mimeType?: string;
  ext?: string;
  category?: FileCategory;
  inlineSafe?: boolean;
  sizeBytes?: number;
} {
  if (typeof dataUrl !== 'string') {
    return { valid: false, error: 'Missing Base64 data URL.' };
  }
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return { valid: false, error: `Malformed Base64 Data URL for "${originalName}".` };
  }

  const mimeType = match[1].toLowerCase();
  const base64Body = match[2];
  const format = validateFileFormat(originalName, mimeType);
  if (!format.valid) {
    return {
      valid: false,
      error: `Unsupported or mismatched file format "${format.ext || originalName}". Allowed: PNG, JPG, JPEG, WEBP, GIF, PDF, DOC, DOCX, XLS, XLSX, TXT, CSV.`,
    };
  }

  const buffer = Buffer.from(base64Body, 'base64');
  if (!verifyMagicBytes(format.ext, buffer)) {
    return {
      valid: false,
      error: `File signature for "${originalName}" does not match its declared ${mimeType} format.`,
    };
  }

  return {
    valid: true,
    buffer,
    mimeType,
    ext: format.ext,
    category: format.category,
    inlineSafe: format.inlineSafe,
    sizeBytes: buffer.byteLength,
  };
}
