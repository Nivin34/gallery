import React, { useRef, useState } from 'react';
import { File as FileIcon, Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { convertFileToBase64, DEFAULT_MAX_FILE_SIZE_MB } from '../lib/fileConverter';
import { formatBytes } from '../lib/format';
import type { ConvertedFilePayload, GalleryFileDTO, Visibility } from '../types';

interface UploadDropzoneProps {
  onUploaded: (files: GalleryFileDTO[]) => void;
}

export function UploadDropzone({ onUploaded }: UploadDropzoneProps) {
  const { user, apiFetch, refreshMe } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queued, setQueued] = useState<ConvertedFilePayload[]>([]);
  const [converting, setConverting] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [folder, setFolder] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const canUpload =
    user?.role === 'admin' ||
    user?.permissionLevel === 'view_edit' ||
    user?.permissionLevel === 'view_edit_delete';

  const canPublic = user?.role === 'admin' || user?.canPublishPublic;
  const maxFileSizeMB = Math.min(user?.maxFileSizeMB || DEFAULT_MAX_FILE_SIZE_MB, 10);

  const processIncomingFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).slice(0, Math.max(0, 10 - queued.length));
    if (incoming.length === 0) {
      toast.error('Queue limit reached (10 files per batch).');
      return;
    }

    setConverting(true);
    const convertedBatch: ConvertedFilePayload[] = [];
    for (const file of incoming) {
      try {
        const result = await convertFileToBase64(file, {
          maxSizeMB: maxFileSizeMB,
          maxDimension: 1024,
          quality: 0.85,
        });
        convertedBatch.push(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not process "${file.name}".`);
      }
    }

    if (convertedBatch.length > 0) {
      setQueued((prev) => [...prev, ...convertedBatch].slice(0, 10));
    }
    setConverting(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canUpload) {
      toast.error('Your account is currently set to View Only.');
      return;
    }
    void processIncomingFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (queued.length === 0) return;
    setUploading(true);
    try {
      const res = await apiFetch('/api/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          files: queued,
          visibility: canPublic ? visibility : 'private',
          folder: folder.trim(),
          tags: tagsText,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Upload failed.');
        return;
      }

      toast.success(
        `Saved ${data.files.length} ${data.files.length === 1 ? 'file' : 'files'} as Base64 Data URLs.`
      );
      setQueued([]);
      setFolder('');
      setTagsText('');
      setDescription('');
      await refreshMe();
      onUploaded(data.files);
    } catch {
      toast.error('Network error while persisting files.');
    } finally {
      setUploading(false);
    }
  };

  if (!canUpload) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Your account permission tier is currently{' '}
        <strong className="text-slate-900 dark:text-slate-100">View Only</strong>. Contact an
        administrator to enable uploads.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !converting && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
            : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            void processIncomingFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
          {converting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <UploadCloud className="h-5 w-5" />
          )}
        </div>
        <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          {converting
            ? 'Encoding & optimizing files to Base64 Data URLs...'
            : 'Drag and drop files here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Images (PNG, JPG, WEBP compressed to 1024px @ 85%) · Animated GIFs · PDFs · Docs (DOC, DOCX, XLS, XLSX, TXT, CSV) · Max {maxFileSizeMB} MB
        </p>
      </div>

      {queued.length > 0 && (
        <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="space-y-2">
            {queued.map((item, idx) => (
              <div
                key={`${item.fileName}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {item.mimeType.startsWith('image/') ? (
                    <img
                      src={item.base64}
                      alt={item.fileName}
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {item.fileName}
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-slate-500">
                      {item.mimeType} · {formatBytes(item.fileSize)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQueued((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label="Remove queued file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Visibility
              </label>
              <select
                value={canPublic ? visibility : 'private'}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
                disabled={!canPublic}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="private">Private (Owner & Admin only)</option>
                {canPublic && <option value="public">Public (Shareable link)</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Folder (optional)
              </label>
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="e.g. Brand Assets"
                maxLength={80}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="design, specs, q4"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional note about this batch"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setQueued([])}
              disabled={uploading}
              className="whitespace-nowrap rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Clear Queue
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || converting}
              className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading
                ? 'Saving to Database...'
                : `Upload ${queued.length} ${queued.length === 1 ? 'File' : 'Files'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
