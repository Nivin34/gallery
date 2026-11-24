import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Globe,
  Moon,
  Search,
  Share2,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthImage } from '../components/AuthImage';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { ImageCollectionViewer } from '../components/ImageCollectionBuilder';
import { RichTextViewer } from '../components/RichTextEditor';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { formatBytes, formatDate } from '../lib/format';
import type { FileCategory, GalleryFileDTO, NoteDTO, PaginatedResponse } from '../types';

type PublicEntry =
  | { entryType: 'file'; createdAt: string; title: string; item: GalleryFileDTO }
  | { entryType: 'note'; createdAt: string; title: string; item: NoteDTO };

export function PublicGalleryPage({
  shareKind,
  shareSlug,
  onNavigate,
}: {
  shareKind?: 'file' | 'note';
  shareSlug?: string;
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [kind, setKind] = useState<'all' | 'files' | 'notes'>('all');
  const [category, setCategory] = useState<'all' | FileCategory>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<PublicEntry> | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeFile, setActiveFile] = useState<GalleryFileDTO | null>(null);
  const [activeNote, setActiveNote] = useState<NoteDTO | null>(null);
  const [shareError, setShareError] = useState('');

  const loadPublic = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        kind,
        category: kind === 'notes' ? 'all' : category,
        sort,
        page: String(page),
        limit: '12',
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/public/gallery?${params.toString()}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      toast.error('Unable to load public gallery.');
    } finally {
      setLoading(false);
    }
  }, [kind, category, sort, page, search]);

  useEffect(() => {
    loadPublic();
  }, [loadPublic]);

  // Direct shareable link resolution
  useEffect(() => {
    setShareError('');
    if (!shareKind || !shareSlug) {
      setActiveNote(null);
      return;
    }

    if (shareKind === 'file') {
      fetch(`/api/public/files/${shareSlug}`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) {
            setShareError(d.error || 'Public file unavailable.');
            return;
          }
          setActiveFile(d.file);
        })
        .catch(() => setShareError('Unable to load shared file.'));
    } else if (shareKind === 'note') {
      fetch(`/api/public/notes/${shareSlug}`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) {
            setShareError(d.error || 'Public note unavailable.');
            return;
          }
          setActiveNote(d.note);
        })
        .catch(() => setShareError('Unable to load shared note.'));
    }
  }, [shareKind, shareSlug]);

  const content = (
    <div className="space-y-6">
      {shareError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {shareError}
        </div>
      )}

      {activeNote ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveNote(null);
                onNavigate('/public');
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Public Gallery</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const url = `${window.location.origin}/public/note/${activeNote.shareSlug}`;
                await navigator.clipboard.writeText(url);
                toast.success('Public link copied.');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Copy Link</span>
            </button>
          </div>

          <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span>By {activeNote.ownerName}</span>
              <span className="mx-1.5">·</span>
              <span className="font-mono tabular-nums">{formatDate(activeNote.createdAt)}</span>
              <span className="mx-1.5">·</span>
              <span>{activeNote.readingTimeMinutes} min read</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {activeNote.title}
            </h1>
            {activeNote.tags.length > 0 && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {activeNote.tags.join(' · ')}
              </div>
            )}
            <ImageCollectionViewer
              images={activeNote.images || []}
              layout={activeNote.collectionLayout || 'grid'}
            />
            <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
              <RichTextViewer contentHtml={activeNote.contentHtml} />
            </div>
          </article>
        </div>
      ) : (
        <>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Public Gallery
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Publicly shared photography, reference documents, and published technical notes.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(['all', 'files', 'notes'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setKind(tab);
                    setPage(1);
                  }}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                    kind === tab
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab === 'all' ? 'All Items' : tab}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-12">
            <div className="relative sm:col-span-6">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search public files and published notes..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                value={category}
                disabled={kind === 'notes'}
                onChange={(e) => {
                  setCategory(e.target.value as 'all' | FileCategory);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="all">All File Types</option>
                <option value="image">Images</option>
                <option value="document">Documents</option>
                <option value="spreadsheet">Spreadsheets</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="alpha_asc">Alphabetical (A-Z)</option>
                <option value="alpha_desc">Alphabetical (Z-A)</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <Globe className="mx-auto h-10 w-10 text-slate-400" />
              <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                No public entries available yet
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Approved members can publish notes or mark gallery files as Public to share them here.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((entry) => {
                if (entry.entryType === 'file') {
                  const file = entry.item;
                  return (
                    <div
                      key={`file-${file.id}`}
                      onClick={() => setActiveFile(file)}
                      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-950">
                        {file.category === 'image' ? (
                          <AuthImage
                            file={file}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center">
                            {file.category === 'spreadsheet' ? (
                              <FileSpreadsheet className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
                            ) : file.category === 'other' ? (
                              <FileCode2 className="h-9 w-9 text-slate-600 dark:text-slate-400" />
                            ) : (
                              <FileText className="h-9 w-9 text-blue-600 dark:text-blue-400" />
                            )}
                            <span className="mt-2 font-mono text-xs font-semibold uppercase text-slate-500">
                              {file.extension.replace('.', '')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          <span>File</span>
                          <span className="mx-1.5">·</span>
                          <span>{file.ownerName}</span>
                          <span className="mx-1.5">·</span>
                          <span className="font-mono tabular-nums">{formatBytes(file.sizeBytes)}</span>
                        </div>
                        <h3 className="mt-1 truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                          {file.title}
                        </h3>
                        {file.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                            {file.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                const note = entry.item;
                return (
                  <div
                    key={`note-${note.id}`}
                    onClick={() => {
                      setActiveNote(note);
                      onNavigate(`/public/note/${note.shareSlug}`);
                    }}
                    className="flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                  >
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span>{note.images && note.images.length > 0 ? 'Collection' : 'Article'}</span>
                        <span className="mx-1.5">·</span>
                        <span>{note.ownerName}</span>
                        <span className="mx-1.5">·</span>
                        {note.images && note.images.length > 0 ? (
                          <span className="font-mono tabular-nums">{note.images.length} images</span>
                        ) : (
                          <span>{note.readingTimeMinutes} min read</span>
                        )}
                      </div>
                      <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
                        {note.title}
                      </h3>
                      {note.images && note.images.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-1.5 overflow-hidden rounded-lg">
                          {note.images.slice(0, 3).map((img) => (
                            <img
                              key={img.id}
                              src={img.src}
                              alt={img.caption || img.fileName}
                              className="aspect-[4/3] w-full object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        {note.excerpt || 'Open collection to inspect ordered frames and notes.'}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800">
                      <span className="font-mono tabular-nums">{formatDate(note.createdAt)}</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">Read Article</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Page {data.page} of {data.totalPages} ({data.total} items)
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
        </>
      )}

      <FilePreviewModal
        file={activeFile}
        readOnly
        onClose={() => {
          setActiveFile(null);
          if (shareKind === 'file') onNavigate('/public');
        }}
      />
    </div>
  );

  // If authenticated, AppShell wraps this page in App.tsx. When logged out, render standalone 3-zone top bar!
  if (user) {
    return content;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-slate-900 dark:bg-[#090D16] dark:text-slate-100">
      <header className="flex h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => onNavigate('/public')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          FolioVault
        </button>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 sm:flex">
          <button
            type="button"
            onClick={() => onNavigate('/public')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Public Gallery
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/signup')}
            className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            Register
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="whitespace-nowrap shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">{content}</main>
    </div>
  );
}
