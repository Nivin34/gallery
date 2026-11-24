import React, { useEffect, useState } from 'react';
import { ArrowRight, FileText, FolderOpen, Globe, Plus, UploadCloud } from 'lucide-react';
import { AuthImage } from '../components/AuthImage';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate, formatPermissionLabel } from '../lib/format';
import type { GalleryFileDTO, NoteDTO } from '../types';

export function DashboardPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, apiFetch } = useAuth();
  const [recentFiles, setRecentFiles] = useState<GalleryFileDTO[]>([]);
  const [recentNotes, setRecentNotes] = useState<NoteDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch('/api/files?limit=4&ownerId=me').then((r) => (r.ok ? r.json() : { items: [] })),
      apiFetch('/api/notes?limit=4&ownerId=me').then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([filesData, notesData]) => {
        if (!active) return;
        setRecentFiles(filesData.items || []);
        setRecentNotes(notesData.items || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiFetch]);

  if (!user) return null;

  const storageQuotaBytes = user.maxStorageMB * 1024 * 1024;
  const storagePct = Math.min(100, Math.round((user.usedStorageBytes / Math.max(1, storageQuotaBytes)) * 100));
  const canCreate = user.role === 'admin' || user.permissionLevel !== 'view_only';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Welcome back, {user.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {user.role === 'admin' ? 'Administrator' : 'Member'} · {formatPermissionLabel(user.permissionLevel)} · {user.canPublishPublic ? 'Public publishing enabled' : 'Private workspace only'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canCreate && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('/gallery')}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Upload Files</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/notes/new')}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                <span>New Note</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Gallery Files</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {user.fileCount}
            <span className="text-sm font-normal text-slate-400"> / {user.role === 'admin' ? '∞' : user.maxFileCount}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Notes & Articles</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {user.noteCount}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Storage Used</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatBytes(user.usedStorageBytes)}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${storagePct}%` }}
            />
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-500">
            {storagePct}% of {user.maxStorageMB} MB limit
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Max Upload Size</div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {user.maxFileSizeMB} MB
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Per-file server limit
          </div>
        </div>
      </div>

      {/* Two-Column Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Files */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recent Gallery Uploads
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/gallery')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <span>Open Gallery</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : recentFiles.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
              <FolderOpen className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No files uploaded yet.
              </p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => onNavigate('/gallery')}
                  className="mt-3 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Upload First File
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {recentFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onNavigate('/gallery')}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {file.category === 'image' ? (
                      <AuthImage
                        file={file}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {file.extension.replace('.', '').toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {file.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono tabular-nums">{formatBytes(file.sizeBytes)}</span>
                        <span className="mx-1.5">·</span>
                        <span>{file.visibility === 'public' ? 'Public' : 'Private'}</span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">
                    {formatDate(file.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent Notes */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recent Notes & Blogs
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/notes')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <span>All Notes</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : recentNotes.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
              <FileText className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No notes written yet.
              </p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => onNavigate('/notes/new')}
                  className="mt-3 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Write First Note
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {recentNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onNavigate(`/notes/${note.id}`)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {note.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{note.status === 'published' ? 'Published' : 'Draft'}</span>
                      <span className="mx-1.5">·</span>
                      <span>{note.visibility === 'public' ? 'Public' : 'Private'}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono tabular-nums">{note.wordCount} words</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">
                    {formatDate(note.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Public Gallery Callout */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Explore the Public Gallery
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Browse published notes, code snippets, and shared media curated across approved workspace members.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/public')}
          className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Globe className="h-4 w-4" />
          <span>Browse Public Gallery</span>
        </button>
      </div>
    </div>
  );
}
