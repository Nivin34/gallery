import type { ConvertedFilePayload } from '../types';

export const DEFAULT_MAX_FILE_SIZE_MB = 10;
export const MAX_IMAGE_DIMENSION_PX = 1024;
export const IMAGE_COMPRESSION_QUALITY = 0.85;

export const ALLOWED_UPLOAD_RULES: Record<string, string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/pjpeg'],
  '.jpeg': ['image/jpeg', 'image/pjpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/octet-stream'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ],
  '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
};

const EXTENSION_DEFAULT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

function getFileExtension(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  return dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
}

function readViaFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error(`Unable to read "${file.name}" as a Base64 Data URL.`));
      }
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read "${file.name}". Please try again.`));
    };
    reader.readAsDataURL(file);
  });
}

function estimateBase64ByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const b64 = dataUrl.slice(commaIdx + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

function compressStaticImage(
  file: File,
  targetMime: string,
  maxDimension: number,
  quality: number
): Promise<{ base64: string; byteSize: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas rendering context is unavailable.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const outputMime =
          targetMime === 'image/png' || targetMime === 'image/webp' || targetMime === 'image/jpeg'
            ? targetMime
            : 'image/jpeg';

        const base64 =
          outputMime === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL(outputMime, quality);

        URL.revokeObjectURL(objectUrl);
        resolve({
          base64,
          byteSize: estimateBase64ByteSize(base64),
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error('Image compression failed.'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`"${file.name}" could not be decoded as a valid image.`));
    };

    img.src = objectUrl;
  });
}

export async function convertFileToBase64(
  file: File,
  options?: {
    maxSizeMB?: number;
    maxDimension?: number;
    quality?: number;
  }
): Promise<ConvertedFilePayload> {
  const maxSizeMB = options?.maxSizeMB ?? DEFAULT_MAX_FILE_SIZE_MB;
  const maxDimension = options?.maxDimension ?? MAX_IMAGE_DIMENSION_PX;
  const quality = options?.quality ?? IMAGE_COMPRESSION_QUALITY;

  const ext = getFileExtension(file.name);
  const allowedMimes = ALLOWED_UPLOAD_RULES[ext];
  if (!allowedMimes) {
    throw new Error(
      `Unsupported file format "${ext || file.name}". Supported: PNG, JPG, JPEG, WEBP, GIF, PDF, DOC, DOCX, XLS, XLSX, TXT, CSV.`
    );
  }

  const detectedMime = (file.type || EXTENSION_DEFAULT_MIME[ext] || '').toLowerCase().split(';')[0].trim();
  const resolvedMime =
    allowedMimes.includes(detectedMime) && detectedMime !== 'application/octet-stream'
      ? detectedMime
      : EXTENSION_DEFAULT_MIME[ext];

  if (!allowedMimes.includes(detectedMime) && file.type !== '') {
    throw new Error(
      `MIME type "${file.type}" does not match extension "${ext}" for "${file.name}".`
    );
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    const fileMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `"${file.name}" is ${fileMB} MB, which exceeds the ${maxSizeMB} MB file size limit.`
    );
  }

  // Static images (PNG, JPG/JPEG, WEBP): resize/compress via canvas to max 1024px at 85% quality
  if (['image/png', 'image/jpeg', 'image/webp'].includes(resolvedMime)) {
    const compressed = await compressStaticImage(file, resolvedMime, maxDimension, quality);
    // If PNG canvas encoding slightly inflated a small pre-optimized PNG, keep the smaller raw FileReader result when dimensions fit
    if (compressed.byteSize > file.size && compressed.byteSize > maxBytes) {
      throw new Error(`Compressed image "${file.name}" still exceeds ${maxSizeMB} MB.`);
    }
    return {
      base64: compressed.base64,
      fileName: file.name,
      fileSize: compressed.byteSize || file.size,
      mimeType: resolvedMime,
    };
  }

  // GIFs (preserve animation frames) + PDFs + Documents: convert directly with FileReader
  const rawDataUrl = await readViaFileReader(file);
  // Normalize empty/generic MIME header inside Data URL if browser emitted application/octet-stream
  const commaIdx = rawDataUrl.indexOf(',');
  const base64Body = commaIdx >= 0 ? rawDataUrl.slice(commaIdx + 1) : '';
  const normalizedDataUrl = `data:${resolvedMime};base64,${base64Body}`;

  return {
    base64: normalizedDataUrl,
    fileName: file.name,
    fileSize: file.size,
    mimeType: resolvedMime,
  };
}

export function base64ToBlob(base64DataUrl: string): Blob {
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid Base64 Data URL.');
  }
  const mimeType = match[1];
  const binaryString = atob(match[2]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function downloadBase64File(base64DataUrl: string, fileName: string): void {
  const blob = base64ToBlob(base64DataUrl);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
