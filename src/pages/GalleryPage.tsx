import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  Globe,
  Grid,
  Images,
  List as ListIcon,
  Lock,
  Search,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthImage } from '../components/AuthImage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { UploadDropzone } from '../components/UploadDropzone';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate } from '../lib/format';
import type {
  BatchFileActionResponse,
  FileCategory,
  GalleryFileDTO,
  GalleryFilesResponse,
  NoteImageItem,
  UserDTO,
  Visibility,
} from '../types';

export function GalleryPage({
  onNavigate,
}: {
  onNavigate: (path: string, state?: unknown) => void;
}) {
  const { user, apiFetch, refreshMe } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFilesMap, setSelectedFilesMap] = useState<Record<string, GalleryFileDTO>>({});

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | FileCategory>('all');
  const [visibility, setVisibility] = useState<'all' | 'private' | 'public'>('all');
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [ownerId, setOwnerId] = useState<string>('me');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<GalleryFilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminUsers, setAdminUsers] = useState<UserDTO[]>([]);

  const [selectedFile, setSelectedFile] = useState<GalleryFileDTO | null>(null);
  const [fileToDelete, setFileToDelete] = useState<GalleryFileDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [batchBusy, setBatchBusy] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetFolder, setMoveTargetFolder] = useState('');
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  const canEditAny =
    user?.role === 'admin' ||
    user?.permissionLevel === 'view_edit' ||
    user?.permissionLevel === 'view_edit_delete';

  const canDeleteAny =
    user?.role === 'admin' || user?.permissionLevel === 'view_edit_delete';

  const canPublishPublic = user?.role === 'admin' || user?.canPublishPublic !== false;

  useEffect(() => {
    if (user?.role === 'admin') {
      apiFetch('/api/admin/users?limit=50')
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((res) => setAdminUsers(res.items || []))
        .catch(() => {});
    }
  }, [user?.role, apiFetch]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
        sort,
        category,
        visibility,
        folder: folderFilter,
        ownerId: user?.role === 'admin' ? ownerId : 'me',
      });
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await apiFetch(`/api/files?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as GalleryFilesResponse;
        setData(json);
      }
    } catch {
      toast.error('Unable to load gallery files.');
    } finally {
      setLoading(false);
    }
  }, [
    apiFetch,
    page,
    sort,
    category,
    visibility,
    folderFilter,
    ownerId,
    search,
    dateFrom,
    dateTo,
    user?.role,
  ]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/files/${fileToDelete.id}`, {
        method: 'DELETE',
      });
      const resData = await res.json();
      if (!res.ok) {
        toast.error(resData.error || 'Could not delete file.');
        return;
      }
      toast.success('File deleted.');
      if (selectedFile?.id === fileToDelete.id) {
        setSelectedFile(null);
      }
      setSelectedFilesMap((prev) => {
        if (!prev[fileToDelete.id]) return prev;
        const next = { ...prev };
        delete next[fileToDelete.id];
        return next;
      });
      setFileToDelete(null);
      await refreshMe();
      await loadFiles();
    } catch {
      toast.error('Network error deleting file.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyShare = async (e: React.MouseEvent, file: GalleryFileDTO) => {
    e.stopPropagation();
    const url = `${window.location.origin}/public/file/${file.shareSlug}`;
    await navigator.clipboard.writeText(url);
    toast.success('Public share link copied.');
  };

  const canDeleteFile = (file: GalleryFileDTO) =>
    user?.role === 'admin' ||
    (file.ownerId === user?.id && user?.permissionLevel === 'view_edit_delete');

  const selectedFiles = Object.values(selectedFilesMap);
  const selectedIds = selectedFiles.map((f) => f.id);
  const selectedImageFiles = selectedFiles.filter((f) => f.category === 'image');
  const pageItems = data?.items || [];
  const allPageSelected =
    pageItems.length > 0 && pageItems.every((item) => Boolean(selectedFilesMap[item.id]));

  const toggleFileSelection = (file: GalleryFileDTO) => {
    setSelectedFilesMap((prev) => {
      const next = { ...prev };
      if (next[file.id]) {
        delete next[file.id];
      } else {
        if (Object.keys(next).length >= 100) {
          toast.error('Bulk selection supports up to 100 files at a time.');
          return prev;
        }
        next[file.id] = file;
      }
      return next;
    });
  };

  const handleToggleSelectPage = () => {
    if (pageItems.length === 0) return;
    setSelectedFilesMap((prev) => {
      const next = { ...prev };
      if (allPageSelected) {
        for (const item of pageItems) {
          delete next[item.id];
        }
      } else {
        for (const item of pageItems) {
          if (Object.keys(next).length >= 100) break;
          next[item.id] = item;
        }
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedFilesMap({});
    setSelectionMode(false);
  };

  const handleCombineIntoCollection = () => {
    if (selectedImageFiles.length === 0) {
      toast.error('Select at least one image first.');
      return;
    }
    const preselectedImages: NoteImageItem[] = selectedImageFiles
      .slice(0, 40)
      .map((f, index) => ({
        id: crypto.randomUUID(),
        fileId: f.id,
        src: f.fileData || f.previewDataUrl || f.contentUrl,
        fileName: f.originalName,
        caption: f.description || '',
        marked: false,
        order: index,
      }))
      .filter((item) => Boolean(item.src));

    onNavigate('/notes/new', { preselectedImages });
  };

  const runBatchAction = async (payload: {
    action: 'move' | 'delete' | 'visibility';
    folder?: string;
    visibility?: Visibility;
  }) => {
    if (selectedIds.length === 0) return false;
    setBatchBusy(true);
    try {
      const res = await apiFetch('/api/files/batch', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedIds,
          ...payload,
        }),
      });
      const resData = (await res.json().catch(() => ({}))) as Partial<BatchFileActionResponse> & {
        error?: string;
      };

      if (!res.ok || !resData.ok) {
        toast.error(
          resData.error ||
            resData.errors?.[0] ||
            'Batch action could not be completed due to permissions.'
        );
        return false;
      }

      const processed = resData.processed ?? selectedIds.length;
      const skipped = resData.skipped ?? 0;

      if (payload.action === 'move') {
        const destLabel = payload.folder ? `"${payload.folder}"` : 'Unsorted';
        toast.success(
          `Moved ${processed} ${processed === 1 ? 'item' : 'items'} to ${destLabel}.${
            skipped > 0 ? ` (${skipped} skipped)` : ''
          }`
        );
      } else if (payload.action === 'visibility') {
        const visLabel = payload.visibility === 'public' ? 'Public' : 'Private';
        toast.success(
          `Updated ${processed} ${processed === 1 ? 'item' : 'items'} to ${visLabel}.${
            skipped > 0 ? ` (${skipped} skipped)` : ''
          }`
        );
      } else if (payload.action === 'delete') {
        toast.success(
          `Deleted ${processed} ${processed === 1 ? 'item' : 'items'}.${
            skipped > 0 ? ` (${skipped} skipped)` : ''
          }`
        );
        await refreshMe();
      }

      if (skipped > 0 && resData.errors?.[0]) {
        toast.warning(resData.errors[0]);
      }

      clearSelection();
      await loadFiles();
      return true;
    } catch {
      toast.error('Network error while executing batch operation.');
      return false;
    } finally {
      setBatchBusy(false);
    }
  };

  const renderCategoryIcon = (cat: FileCategory) => {
    if (cat === 'spreadsheet')
      return <FileSpreadsheet className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />;
    if (cat === 'other') return <FileCode2 className="h-8 w-8 text-slate-600 dark:text-slate-400" />;
    return <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />;
  };

  const folders = data?.folders || [];
  const showBulkBar = canEditAny && (selectionMode || selectedFiles.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Note Gallery
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Upload, organize into folders, preview, and perform bulk operations across your files.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              aria-label="Grid view"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              aria-label="List view"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>

          {canEditAny && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (selectionMode || selectedFiles.length > 0) {
                    clearSelection();
                  } else {
                    setSelectionMode(true);
                  }
                }}
                className={`inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                  selectionMode || selectedFiles.length > 0
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {selectionMode || selectedFiles.length > 0 ? (
                  <X className="h-4 w-4" />
                ) : (
                  <CheckSquare className="h-4 w-4" />
                )}
                <span>
                  {selectionMode || selectedFiles.length > 0 ? 'Done Selecting' : 'Select Items'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowUpload((v) => !v)}
                className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <UploadCloud className="h-4 w-4" />
                <span>{showUpload ? 'Hide Uploader' : 'Upload Files'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showUpload && (
        <UploadDropzone
          onUploaded={() => {
            setPage(1);
            loadFiles();
          }}
        />
      )}

      {/* Search & Filters Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search filename, title, folder, tags..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as 'all' | FileCategory);
                setPage(1);
              }}
              aria-label="Filter by file type"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="document">Documents</option>
              <option value="spreadsheet">Spreadsheets</option>
              <option value="other">Other Files</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={folderFilter}
              onChange={(e) => {
                setFolderFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by folder"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">All Folders</option>
              <option value="unfiled">Unsorted</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value as 'all' | 'private' | 'public');
                setPage(1);
              }}
              aria-label="Filter by visibility"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">All Visibility</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </div>

          {user?.role === 'admin' ? (
            <div className="md:col-span-2">
              <select
                value={ownerId}
                onChange={(e) => {
                  setOwnerId(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by owner"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="me">My Uploads</option>
                <option value="all">All Users</option>
                {adminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-2">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                aria-label="Sort files"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="alpha_asc">Name (A-Z)</option>
                <option value="alpha_desc">Name (Z-A)</option>
                <option value="size_desc">Largest Size</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <span>Upload date range:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            <span>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            {(search ||
              category !== 'all' ||
              visibility !== 'all' ||
              folderFilter !== 'all' ||
              dateFrom ||
              dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategory('all');
                  setVisibility('all');
                  setFolderFilter('all');
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Reset filters
              </button>
            )}
          </div>

          {user?.role === 'admin' && (
            <div className="flex items-center gap-2">
              <span>Sort:</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                aria-label="Sort files"
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="alpha_asc">Name (A-Z)</option>
                <option value="alpha_desc">Name (Z-A)</option>
                <option value="size_desc">Largest Size</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Bulk-Action Toolbar */}
      {showBulkBar && (
        <div
          role="region"
          aria-label="Bulk actions toolbar"
          className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-blue-900/70 dark:bg-slate-900/95"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {selectedFiles.length} {selectedFiles.length === 1 ? 'item' : 'items'} selected
            </span>
            <button
              type="button"
              onClick={handleToggleSelectPage}
              disabled={pageItems.length === 0 || batchBusy}
              className="whitespace-nowrap shrink-0 text-xs font-medium text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
            >
              {allPageSelected ? 'Deselect Page' : `Select Page (${pageItems.length})`}
            </button>
            {selectedFiles.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFilesMap({})}
                disabled={batchBusy}
                className="whitespace-nowrap shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedFiles.length === 0 || batchBusy}
              onClick={() => {
                setMoveTargetFolder('');
                setShowMoveModal(true);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FolderInput className="h-3.5 w-3.5" />
              <span>Move</span>
            </button>

            <button
              type="button"
              disabled={selectedFiles.length === 0 || batchBusy || !canPublishPublic}
              title={
                !canPublishPublic
                  ? 'Public publishing is restricted on your account.'
                  : 'Make selected items public'
              }
              onClick={() => runBatchAction({ action: 'visibility', visibility: 'public' })}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Make Public</span>
            </button>

            <button
              type="button"
              disabled={selectedFiles.length === 0 || batchBusy}
              onClick={() => runBatchAction({ action: 'visibility', visibility: 'private' })}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Make Private</span>
            </button>

            {selectedImageFiles.length > 0 && (
              <button
                type="button"
                disabled={batchBusy}
                onClick={handleCombineIntoCollection}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <Images className="h-3.5 w-3.5" />
                <span>Combine Images ({selectedImageFiles.length})</span>
              </button>
            )}

            {canDeleteAny && (
              <button
                type="button"
                disabled={selectedFiles.length === 0 || batchBusy}
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete ({selectedFiles.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={clearSelection}
              disabled={batchBusy}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Exit bulk selection"
              title="Exit bulk selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Gallery Items */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <FolderOpen className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            No files match your filters
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Upload images, documents, or spreadsheets to populate your gallery.
          </p>
          {canEditAny && !showUpload && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Upload Files
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((file) => {
            const isSelected = Boolean(selectedFilesMap[file.id]);
            const isSelectingActive = selectionMode || selectedFiles.length > 0;
            return (
              <div
                key={file.id}
                onClick={() => {
                  if (canEditAny && isSelectingActive) {
                    toggleFileSelection(file);
                  } else {
                    setSelectedFile(file);
                  }
                }}
                className={`group cursor-pointer overflow-hidden rounded-xl border bg-white transition-colors dark:bg-slate-900 ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-500/30 dark:border-blue-500'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-950">
                  {file.category === 'image' ? (
                    <AuthImage
                      file={file}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center">
                      {renderCategoryIcon(file.category)}
                      <span className="mt-2 font-mono text-xs font-semibold uppercase text-slate-500">
                        {file.extension.replace('.', '')}
                      </span>
                    </div>
                  )}

                  {canEditAny && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFileSelection(file);
                      }}
                      aria-label={isSelected ? `Deselect ${file.title}` : `Select ${file.title}`}
                      className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white opacity-100'
                          : isSelectingActive
                            ? 'border-slate-300 bg-white/95 text-transparent opacity-100 hover:border-blue-500 dark:border-slate-600 dark:bg-slate-900/90'
                            : 'border-slate-300 bg-white/95 text-transparent opacity-0 hover:border-blue-500 group-hover:opacity-100 dark:border-slate-600 dark:bg-slate-900/90'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {isSelectingActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(file);
                      }}
                      title="Quick preview"
                      aria-label={`Preview ${file.title}`}
                      className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {file.title}
                    </h3>
                    {file.lockedByAdmin && (
                      <Lock
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                        aria-label="Locked by admin"
                      />
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">{formatBytes(file.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{file.visibility === 'public' ? 'Public' : 'Private'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatDate(file.createdAt)}</span>
                    {file.folder && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 truncate text-slate-600 dark:text-slate-300">
                          <Folder className="h-3 w-3 shrink-0" />
                          <span className="truncate">{file.folder}</span>
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {file.ownerName}
                    </span>
                    <div className="flex items-center gap-1">
                      {file.fileData && (
                        <a
                          href={file.fileData}
                          download={file.originalName}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          title={`Download ${file.originalName}`}
                          aria-label={`Download ${file.originalName}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {file.visibility === 'public' && (
                        <button
                          type="button"
                          onClick={(e) => handleCopyShare(e, file)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          title="Copy public link"
                          aria-label="Copy public link"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDeleteFile(file) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFileToDelete(file);
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          title="Delete file"
                          aria-label="Delete file"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                {canEditAny && (
                  <th className="w-10 px-4 py-3">
                    <button
                      type="button"
                      onClick={handleToggleSelectPage}
                      aria-label={allPageSelected ? 'Deselect all on page' : 'Select all on page'}
                      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                        allPageSelected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-transparent hover:border-blue-500 dark:border-slate-600 dark:bg-slate-800'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </th>
                )}
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Folder</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Size</th>
                <th className="px-4 py-3 text-right">Uploaded</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((file) => {
                const isSelected = Boolean(selectedFilesMap[file.id]);
                const isSelectingActive = selectionMode || selectedFiles.length > 0;
                return (
                  <tr
                    key={file.id}
                    onClick={() => {
                      if (canEditAny && isSelectingActive) {
                        toggleFileSelection(file);
                      } else {
                        setSelectedFile(file);
                      }
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {canEditAny && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleFileSelection(file)}
                          aria-label={isSelected ? `Deselect ${file.title}` : `Select ${file.title}`}
                          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white text-transparent hover:border-blue-500 dark:border-slate-600 dark:bg-slate-800'
                          }`}
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[240px] truncate">{file.title}</span>
                        {file.lockedByAdmin && (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-amber-600"
                            aria-label="Locked by admin"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {file.folder || <span className="text-slate-400">Unsorted</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs uppercase text-slate-500">
                      {file.extension.replace('.', '')}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {file.visibility === 'public' ? 'Public' : 'Private'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {file.ownerName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-500">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-500">
                      {formatDate(file.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(file);
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          aria-label={`Preview ${file.title}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {file.fileData && (
                          <a
                            href={file.fileData}
                            download={file.originalName}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                            aria-label={`Download ${file.originalName}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {file.visibility === 'public' && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyShare(e, file)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                            aria-label="Copy share link"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDeleteFile(file) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFileToDelete(file);
                            }}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            aria-label="Delete file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Page {data.page} of {data.totalPages} ({data.total} files)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Move to Folder Modal */}
      {showMoveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-folder-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="move-folder-modal-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Move {selectedFiles.length} {selectedFiles.length === 1 ? 'Item' : 'Items'}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Choose an existing folder, move to Unsorted, or type a new folder name.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                disabled={batchBusy}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Destination Folder
                </label>
                <input
                  type="text"
                  value={moveTargetFolder}
                  onChange={(e) => setMoveTargetFolder(e.target.value)}
                  placeholder="Leave blank for Unsorted (Root)"
                  maxLength={80}
                  autoFocus
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Quick Select
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMoveTargetFolder('')}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      moveTargetFolder.trim() === ''
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>Unsorted (Root)</span>
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setMoveTargetFolder(f)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        moveTargetFolder.trim() === f
                          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Folder className="h-3.5 w-3.5" />
                      <span>{f}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                disabled={batchBusy}
                className="whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={batchBusy}
                onClick={async () => {
                  const ok = await runBatchAction({
                    action: 'move',
                    folder: moveTargetFolder.trim(),
                  });
                  if (ok) setShowMoveModal(false);
                }}
                className="whitespace-nowrap shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {batchBusy ? 'Moving...' : 'Move Items'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FilePreviewModal
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onUpdated={(updated) => {
          setSelectedFile(updated);
          loadFiles();
        }}
        onDeleteRequest={(f) => setFileToDelete(f)}
      />

      <ConfirmDialog
        open={Boolean(fileToDelete)}
        title="Delete File"
        description={`Are you sure you want to permanently delete "${fileToDelete?.title}"? This removes both the database record and stored file object.`}
        confirmLabel="Delete File"
        destructive
        loading={deleting}
        onCancel={() => setFileToDelete(null)}
        onConfirm={handleDeleteConfirm}
      />

      <ConfirmDialog
        open={showBatchDeleteConfirm}
        title={`Delete ${selectedFiles.length} Selected ${
          selectedFiles.length === 1 ? 'File' : 'Files'
        }`}
        description={`Are you sure you want to permanently delete ${selectedFiles.length} selected ${
          selectedFiles.length === 1 ? 'item' : 'items'
        }? This frees storage quota and removes both database records and stored file data.`}
        confirmLabel={`Delete ${selectedFiles.length} ${selectedFiles.length === 1 ? 'File' : 'Files'}`}
        destructive
        loading={batchBusy}
        onCancel={() => setShowBatchDeleteConfirm(false)}
        onConfirm={async () => {
          const ok = await runBatchAction({ action: 'delete' });
          if (ok) setShowBatchDeleteConfirm(false);
        }}
      />
    </div>
  );
}
