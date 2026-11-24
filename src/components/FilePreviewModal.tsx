import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Lock,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { base64ToBlob, downloadBase64File } from '../lib/fileConverter';
import { formatBytes, formatDateTime } from '../lib/format';
import type { GalleryFileDTO, Visibility } from '../types';
import { AuthImage } from './AuthImage';

interface FilePreviewModalProps {
  file: GalleryFileDTO | null;
  readOnly?: boolean;
  onClose: () => void;
  onUpdated?: (file: GalleryFileDTO) => void;
  onDeleteRequest?: (file: GalleryFileDTO) => void;
}

export function FilePreviewModal({
  file,
  readOnly = false,
  onClose,
  onUpdated,
  onDeleteRequest,
}: FilePreviewModalProps) {
  const { user, token, apiFetch } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [folder, setFolder] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [saving, setSaving] = useState(false);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [base64Copied, setBase64Copied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!file) return;
    setTitle(file.title);
    setDescription(file.description);
    setFolder(file.folder || '');
    setTagsInput(file.tags.join(', '));
    setVisibility(file.visibility);
    setPdfSrc(null);
    setTextPreview(null);

    let active = true;
    let objUrl: string | null = null;

    const isPdf = file.mimeType === 'application/pdf';
    const isTextLike =
      file.mimeType.startsWith('text/') || ['.txt', '.csv'].includes(file.extension);

    if (isPdf) {
      if (file.fileData) {
        // Render PDF directly from Base64 Data URL via iframe/object
        setPdfSrc(file.fileData);
      } else {
        const headers: Record<string, string> = {};
        if (file.visibility === 'private' && token) {
          headers.Authorization = `Bearer ${token}`;
        }
        fetch(file.contentUrl, { headers })
          .then((res) => (res.ok ? res.blob() : Promise.reject()))
          .then((blob) => {
            if (!active) return;
            objUrl = URL.createObjectURL(blob);
            setPdfSrc(objUrl);
          })
          .catch(() => {});
      }
    } else if (isTextLike) {
      if (file.fileData) {
        try {
          const blob = base64ToBlob(file.fileData);
          blob.text().then((txt) => {
            if (active) setTextPreview(txt.slice(0, 20_000));
          });
        } catch {
          // Ignore malformed text preview
        }
      } else {
        const headers: Record<string, string> = {};
        if (file.visibility === 'private' && token) {
          headers.Authorization = `Bearer ${token}`;
        }
        fetch(file.contentUrl, { headers })
          .then((res) => (res.ok ? res.text() : Promise.reject()))
          .then((txt) => {
            if (active) setTextPreview(txt.slice(0, 20_000));
          })
          .catch(() => {});
      }
    }

    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [file, token]);

  if (!file) return null;

  const canEdit =
    !readOnly &&
    user &&
    (user.role === 'admin' ||
      (file.ownerId === user.id &&
        (user.permissionLevel === 'view_edit' || user.permissionLevel === 'view_edit_delete')));

  const canDelete =
    !readOnly &&
    user &&
    (user.role === 'admin' ||
      (file.ownerId === user.id && user.permissionLevel === 'view_edit_delete'));

  const canChangeVis =
    canEdit &&
    (user?.role === 'admin' || (!file.lockedByAdmin && user?.canPublishPublic !== false));

  const shareUrl = `${window.location.origin}/public/file/${file.shareSlug}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
      const res = await apiFetch(`/api/files/${file.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description, folder: folder.trim(), tags, visibility }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not update file.');
        return;
      }
      toast.success('File metadata updated.');
      onUpdated?.(data.file);
    } catch {
      toast.error('Network error while saving changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      if (file.fileData) {
        downloadBase64File(file.fileData, file.originalName);
        return;
      }
      const headers: Record<string, string> = {};
      if (file.visibility === 'private' && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${file.contentUrl}?download=1`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Unable to download file.');
    }
  };

  const handleCopyBase64 = async () => {
    try {
      if (file.fileData) {
        await navigator.clipboard.writeText(file.fileData);
        setBase64Copied(true);
        toast.success('Base64 Data URL copied to clipboard.');
        setTimeout(() => setBase64Copied(false), 2000);
        return;
      }
      const res = await apiFetch(`/api/files/${file.id}/base64`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not retrieve Base64 data URL.');
        return;
      }
      await navigator.clipboard.writeText(data.dataUrl);
      setBase64Copied(true);
      toast.success('Base64 Data URL copied to clipboard.');
      setTimeout(() => setBase64Copied(false), 2000);
    } catch {
      toast.error('Unable to copy Base64 data URL.');
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      toast.success('Public share URL copied.');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Unable to copy share link.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 lg:flex-row">
        {/* Left: Preview Viewport */}
        <div className="flex min-h-[300px] flex-1 flex-col items-center justify-center overflow-auto bg-slate-100 p-6 dark:bg-slate-950">
          {file.category === 'image' ? (
            <AuthImage
              file={file}
              className="max-h-[68vh] w-auto rounded-lg object-contain"
              alt={file.originalName || file.title}
            />
          ) : file.mimeType === 'application/pdf' && pdfSrc ? (
            <iframe
              src={pdfSrc}
              title={file.originalName || file.title}
              className="h-[65vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
            />
          ) : textPreview !== null ? (
            <pre className="max-h-[65vh] w-full overflow-auto rounded-xl border border-slate-200 bg-white p-5 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {textPreview}
            </pre>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {file.category === 'spreadsheet' ? (
                  <FileSpreadsheet className="h-8 w-8" />
                ) : file.category === 'other' ? (
                  <FileCode2 className="h-8 w-8" />
                ) : (
                  <FileText className="h-8 w-8" />
                )}
              </div>
              <p className="mt-4 text-sm font-medium text-slate-800 dark:text-slate-200">
                {file.originalName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {file.extension.replace('.', '').toUpperCase()} · {formatBytes(file.sizeBytes)} · Stored as Base64 Data URL
              </p>
              {file.fileData ? (
                <a
                  href={file.fileData}
                  download={file.originalName}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Download {file.originalName}</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Download File</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Details & Actions */}
        <div className="flex w-full shrink-0 flex-col justify-between border-t border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="overflow-y-auto pr-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{file.extension.replace('.', '').toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatBytes(file.sizeBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{file.visibility === 'public' ? 'Public' : 'Private'}</span>
                  {file.folder && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{file.folder}</span>
                    </>
                  )}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {file.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Uploaded by <span className="font-medium text-slate-700 dark:text-slate-300">{file.ownerName}</span> on {formatDateTime(file.createdAt)}
            </div>

            {file.lockedByAdmin && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Visibility locked by Administrator</span>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {canEdit ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Folder
                    </label>
                    <input
                      type="text"
                      value={folder}
                      onChange={(e) => setFolder(e.target.value)}
                      placeholder="Unsorted (leave blank)"
                      maxLength={80}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Tags
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="comma separated"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Visibility
                    </label>
                    <select
                      value={visibility}
                      disabled={!canChangeVis}
                      onChange={(e) => setVisibility(e.target.value as Visibility)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {file.description && (
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {file.description}
                    </p>
                  )}
                  {file.folder && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Folder: {file.folder}
                    </div>
                  )}
                  {file.tags.length > 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Tags: {file.tags.join(' · ')}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Metadata'}</span>
              </button>
            )}

            <div className="flex flex-wrap gap-2">
              {file.fileData ? (
                <a
                  href={file.fileData}
                  download={file.originalName}
                  className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
              )}

              {!readOnly && token && (
                <button
                  type="button"
                  onClick={handleCopyBase64}
                  className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {base64Copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{base64Copied ? 'Copied' : 'Base64 URL'}</span>
                </button>
              )}
            </div>

            {file.visibility === 'public' && (
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {linkCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                <span>{linkCopied ? 'Share Link Copied' : 'Copy Public Share Link'}</span>
              </button>
            )}

            {canDelete && onDeleteRequest && (
              <button
                type="button"
                onClick={() => onDeleteRequest(file)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete File</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
