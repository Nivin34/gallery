import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlertCircle,
  ArrowLeft,
  BookmarkPlus,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Edit3,
  FileDown,
  FileText,
  Images,
  LayoutTemplate,
  ListTree,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ImageCollectionBuilder, ImageCollectionViewer } from '../components/ImageCollectionBuilder';
import { RichTextEditor, RichTextViewer } from '../components/RichTextEditor';
import { TableOfContents } from '../components/TableOfContents';
import { SaveTemplateModal, TemplatesLibraryModal } from '../components/TemplatesLibraryModal';
import { useAuth } from '../context/AuthContext';
import { convertFileToBase64 } from '../lib/fileConverter';
import { formatDate } from '../lib/format';
import {
  buildNoteMarkdownDocument,
  downloadMarkdownFile,
  slugifyMarkdownFilename,
} from '../lib/markdownSerializer';
import type {
  CollectionLayout,
  NoteDTO,
  NoteImageItem,
  NoteStatus,
  NoteTemplateDTO,
  PaginatedResponse,
  UserDTO,
  Visibility,
} from '../types';

export function NotesPage({
  noteIdParam,
  initialKindFilter = 'all',
  onNavigate,
}: {
  noteIdParam?: string; // undefined = list, 'new' = create, '<id>' = view/edit
  initialKindFilter?: 'all' | 'collections' | 'text';
  onNavigate: (path: string, state?: unknown) => void;
}) {
  const { user, apiFetch, refreshMe } = useAuth();
  const inlineImgInputRef = useRef<HTMLInputElement>(null);
  const inlineImgResolveRef = useRef<((url: string | null) => void) | null>(null);
  const tiptapEditorRef = useRef<Editor | null>(null);
  const [tiptapEditor, setTiptapEditor] = useState<Editor | null>(null);

  const handleEditorReady = useCallback((editor: Editor | null) => {
    tiptapEditorRef.current = editor;
    setTiptapEditor(editor);
  }, []);

  // List state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | NoteStatus>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | Visibility>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'collections' | 'text'>(initialKindFilter);
  const [ownerFilter, setOwnerFilter] = useState('me');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [notesData, setNotesData] = useState<PaginatedResponse<NoteDTO> | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [adminUsers, setAdminUsers] = useState<UserDTO[]>([]);

  // Editor / Viewer state
  const [activeNote, setActiveNote] = useState<NoteDTO | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [images, setImages] = useState<NoteImageItem[]>([]);
  const [collectionLayout, setCollectionLayout] = useState<CollectionLayout>('grid');
  const [status, setStatus] = useState<NoteStatus>('draft');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [saving, setSaving] = useState(false);

  // Auto-save state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
  >('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');
  const saveInFlightRef = useRef<boolean>(false);
  const skipInitialSyncRef = useRef<boolean>(true);

  const [noteToDelete, setNoteToDelete] = useState<NoteDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenMeta, setShowFullscreenMeta] = useState(false);
  const [showToc, setShowToc] = useState(false);

  useEffect(() => {
    setKindFilter(initialKindFilter);
    setPage(1);
  }, [initialKindFilter]);

  const canCreate =
    user?.role === 'admin' ||
    user?.permissionLevel === 'view_edit' ||
    user?.permissionLevel === 'view_edit_delete';

  useEffect(() => {
    if (user?.role === 'admin') {
      apiFetch('/api/admin/users?limit=50')
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((res) => setAdminUsers(res.items || []))
        .catch(() => {});
    }
  }, [user?.role, apiFetch]);

  const loadNotes = useCallback(async () => {
    if (noteIdParam) return;
    setLoadingList(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        sort,
        status: statusFilter,
        visibility: visibilityFilter,
        kind: kindFilter,
        ownerId: user?.role === 'admin' ? ownerFilter : 'me',
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/notes?${params.toString()}`);
      if (res.ok) {
        setNotesData(await res.json());
      }
    } catch {
      toast.error('Unable to load notes.');
    } finally {
      setLoadingList(false);
    }
  }, [
    noteIdParam,
    apiFetch,
    page,
    sort,
    statusFilter,
    visibilityFilter,
    kindFilter,
    ownerFilter,
    search,
    user?.role,
  ]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const buildSnapshot = useCallback(
    (fields: {
      title: string;
      contentHtml: string;
      tagsText: string;
      images: NoteImageItem[];
      collectionLayout: CollectionLayout;
      status: NoteStatus;
      visibility: Visibility;
    }) =>
      JSON.stringify({
        title: fields.title,
        contentHtml: fields.contentHtml,
        tagsText: fields.tagsText,
        images: fields.images.map((img, idx) => ({
          id: img.id,
          fileId: img.fileId ?? null,
          src: img.src,
          fileName: img.fileName,
          caption: img.caption,
          marked: img.marked,
          order: idx,
        })),
        collectionLayout: fields.collectionLayout,
        status: fields.status,
        visibility: fields.visibility,
      }),
    []
  );

  // Load individual note or reset for /notes/new
  useEffect(() => {
    if (!noteIdParam) {
      setActiveNote(null);
      setIsFullscreen(false);
      setShowFullscreenMeta(false);
      setAutoSaveStatus('idle');
      setLastSavedAt(null);
      setAutoSaveError(null);
      lastSavedSnapshotRef.current = '';
      skipInitialSyncRef.current = true;
      return;
    }
    if (noteIdParam === 'new') {
      const preselected = (window.history.state?.preselectedImages || []) as NoteImageItem[];
      const preselectedTemplate = window.history.state?.preselectedTemplate as
        | NoteTemplateDTO
        | undefined;
      const initialTitle =
        preselectedTemplate?.defaultTitle ||
        (preselected.length > 0 ? 'Image Collection' : '');
      const initialContent = preselectedTemplate?.contentHtml || '';
      const initialTags = preselectedTemplate?.tags?.join(', ') || '';
      const initialLayout = preselectedTemplate?.collectionLayout || 'grid';

      setActiveNote(null);
      setTitle(initialTitle);
      setContentHtml(initialContent);
      setTagsText(initialTags);
      setImages(preselected);
      setCollectionLayout(initialLayout);
      setStatus('draft');
      setVisibility('private');
      setMode('edit');
      setAutoSaveStatus('idle');
      setLastSavedAt(null);
      setAutoSaveError(null);
      lastSavedSnapshotRef.current = buildSnapshot({
        title: initialTitle,
        contentHtml: initialContent,
        tagsText: initialTags,
        images: preselected,
        collectionLayout: initialLayout,
        status: 'draft',
        visibility: 'private',
      });
      skipInitialSyncRef.current = false;
      return;
    }

    setLoadingNote(true);
    skipInitialSyncRef.current = true;
    apiFetch(`/api/notes/${noteIdParam}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Note unavailable.');
          onNavigate('/notes');
          return;
        }
        const n: NoteDTO = data.note;
        const loadedTags = n.tags.join(', ');
        const loadedImages = n.images || [];
        const loadedLayout = n.collectionLayout || 'grid';

        setActiveNote(n);
        setTitle(n.title);
        setContentHtml(n.contentHtml);
        setTagsText(loadedTags);
        setImages(loadedImages);
        setCollectionLayout(loadedLayout);
        setStatus(n.status);
        setVisibility(n.visibility);
        setAutoSaveStatus('saved');
        setLastSavedAt(n.updatedAt);
        setAutoSaveError(null);
        lastSavedSnapshotRef.current = buildSnapshot({
          title: n.title,
          contentHtml: n.contentHtml,
          tagsText: loadedTags,
          images: loadedImages,
          collectionLayout: loadedLayout,
          status: n.status,
          visibility: n.visibility,
        });
        skipInitialSyncRef.current = false;

        const editable =
          user?.role === 'admin' ||
          (n.ownerId === user?.id && user?.permissionLevel !== 'view_only');
        setMode(editable ? 'edit' : 'preview');
      })
      .catch(() => {
        toast.error('Unable to load note.');
        onNavigate('/notes');
      })
      .finally(() => setLoadingNote(false));
  }, [
    noteIdParam,
    apiFetch,
    onNavigate,
    buildSnapshot,
    user?.id,
    user?.role,
    user?.permissionLevel,
  ]);

  const currentSnapshot = useMemo(
    () =>
      buildSnapshot({
        title,
        contentHtml,
        tagsText,
        images,
        collectionLayout,
        status,
        visibility,
      }),
    [buildSnapshot, title, contentHtml, tagsText, images, collectionLayout, status, visibility]
  );

  const hasUnsavedChanges = Boolean(
    noteIdParam &&
      !loadingNote &&
      !skipInitialSyncRef.current &&
      currentSnapshot !== lastSavedSnapshotRef.current
  );

  const persistDraft = useCallback(
    async (options: { isAutoSave: boolean }): Promise<boolean> => {
      if (saveInFlightRef.current) return false;

      const snapshotAtStart = buildSnapshot({
        title,
        contentHtml,
        tagsText,
        images,
        collectionLayout,
        status,
        visibility,
      });

      const strippedBody = contentHtml
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      const hasMeaningfulContent = Boolean(
        title.trim() || strippedBody || images.length > 0 || tagsText.trim()
      );

      if (options.isAutoSave) {
        if (!hasMeaningfulContent) return false;
        if (snapshotAtStart === lastSavedSnapshotRef.current) return true;
      } else if (!title.trim()) {
        toast.error('Please enter a note title.');
        return false;
      }

      const effectiveTitle = title.trim() || 'Untitled Draft';
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
      const orderedImages = images.map((img, idx) => ({ ...img, order: idx }));

      const isNew = !activeNote;
      const endpoint = isNew ? '/api/notes' : `/api/notes/${activeNote.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      saveInFlightRef.current = true;
      if (options.isAutoSave) {
        setAutoSaveStatus('saving');
        setAutoSaveError(null);
      } else {
        setSaving(true);
      }

      try {
        const res = await apiFetch(endpoint, {
          method,
          body: JSON.stringify({
            title: effectiveTitle,
            contentHtml,
            tags,
            images: orderedImages,
            collectionLayout,
            status,
            visibility,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const errMsg = data.error || 'Failed to save note.';
          if (options.isAutoSave) {
            setAutoSaveStatus('error');
            setAutoSaveError(errMsg);
          } else {
            toast.error(errMsg);
          }
          return false;
        }

        const savedNote: NoteDTO = data.note;
        lastSavedSnapshotRef.current = snapshotAtStart;
        setActiveNote(savedNote);
        setLastSavedAt(savedNote.updatedAt);
        setAutoSaveStatus('saved');
        setAutoSaveError(null);

        if (isNew) {
          window.history.replaceState(
            window.history.state ?? {},
            '',
            `/notes/${savedNote.id}`
          );
          await refreshMe();
        } else if (!options.isAutoSave) {
          await refreshMe();
        }

        if (!options.isAutoSave) {
          setImages(savedNote.images || []);
          toast.success(isNew ? 'Note created.' : 'Note saved.');
        }

        return true;
      } catch {
        const errMsg = 'Network error saving note.';
        if (options.isAutoSave) {
          setAutoSaveStatus('error');
          setAutoSaveError(errMsg);
        } else {
          toast.error(errMsg);
        }
        return false;
      } finally {
        saveInFlightRef.current = false;
        if (!options.isAutoSave) {
          setSaving(false);
        }
      }
    },
    [
      activeNote,
      apiFetch,
      buildSnapshot,
      collectionLayout,
      contentHtml,
      images,
      refreshMe,
      status,
      tagsText,
      title,
      visibility,
    ]
  );

  const handleSaveNote = () => {
    void persistDraft({ isAutoSave: false });
  };

  const handleViewerCaptionChange = (imageId: string, caption: string) => {
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, caption } : img)));
  };

  const handleViewerCaptionCommit = async (imageId: string, caption: string) => {
    if (!activeNote || !canEditCurrent) return;
    const prevCaption = activeNote.images.find((img) => img.id === imageId)?.caption ?? '';
    const trimmed = caption.trim();
    if (trimmed === prevCaption) return;

    const updatedImages = images.map((img, idx) => ({
      ...img,
      caption: img.id === imageId ? trimmed : img.caption,
      order: idx,
    }));

    try {
      const res = await apiFetch(`/api/notes/${activeNote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ images: updatedImages }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not save caption.');
        return;
      }
      setActiveNote(data.note);
      const nextImages = updatedImages.map((img) =>
        img.id === imageId ? { ...img, caption: trimmed } : img
      );
      setImages(nextImages);
      lastSavedSnapshotRef.current = buildSnapshot({
        title,
        contentHtml,
        tagsText,
        images: nextImages,
        collectionLayout,
        status,
        visibility,
      });
      setLastSavedAt(data.note.updatedAt);
      setAutoSaveStatus('saved');
      toast.success('Caption saved to note.');
    } catch {
      toast.error('Network error saving caption.');
    }
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/notes/${noteToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not delete note.');
        return;
      }
      toast.success('Note deleted.');
      setNoteToDelete(null);
      await refreshMe();
      if (noteIdParam) {
        onNavigate('/notes');
      } else {
        loadNotes();
      }
    } catch {
      toast.error('Network error deleting note.');
    } finally {
      setDeleting(false);
    }
  };

  // Inline image upload inside TipTap editor
  const requestInlineImageUpload = () =>
    new Promise<string | null>((resolve) => {
      inlineImgResolveRef.current = resolve;
      inlineImgInputRef.current?.click();
    });

  const handleInlineFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      inlineImgResolveRef.current?.(null);
      return;
    }

    try {
      const converted = await convertFileToBase64(file, {
        maxSizeMB: Math.min(user?.maxFileSizeMB || 10, 10),
        maxDimension: 1024,
        quality: 0.85,
      });
      const res = await apiFetch('/api/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          files: [converted],
          visibility,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.files?.[0]) {
        toast.error(data.error || 'Image upload failed.');
        inlineImgResolveRef.current?.(null);
        return;
      }
      const uploaded = data.files[0];
      inlineImgResolveRef.current?.(uploaded.fileData || uploaded.previewDataUrl || converted.base64);
      toast.success('Image embedded into note.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to upload inline image.');
      inlineImgResolveRef.current?.(null);
    }
  };

  const canEditCurrent =
    noteIdParam === 'new'
      ? canCreate
      : activeNote
        ? user?.role === 'admin' ||
          (activeNote.ownerId === user?.id && user?.permissionLevel !== 'view_only')
        : false;

  const isReadOnly = !canEditCurrent || mode === 'preview';

  const persistDraftRef = useRef(persistDraft);
  persistDraftRef.current = persistDraft;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  // Debounced auto-save (2 seconds after last edit)
  useEffect(() => {
    if (!noteIdParam || loadingNote || skipInitialSyncRef.current || !canEditCurrent) return;
    if (!hasUnsavedChanges) return;

    setAutoSaveStatus((prev) => (prev === 'saving' ? prev : 'unsaved'));

    if (!autoSaveEnabled) return;

    const timer = window.setTimeout(() => {
      void persistDraftRef.current({ isAutoSave: true });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [
    noteIdParam,
    loadingNote,
    canEditCurrent,
    hasUnsavedChanges,
    autoSaveEnabled,
    currentSnapshot,
  ]);

  // Periodic auto-save safety net (every 15 seconds during continuous editing)
  useEffect(() => {
    if (!noteIdParam || !canEditCurrent || !autoSaveEnabled) return;
    const interval = window.setInterval(() => {
      if (hasUnsavedChangesRef.current && !saveInFlightRef.current) {
        void persistDraftRef.current({ isAutoSave: true });
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [noteIdParam, canEditCurrent, autoSaveEnabled]);

  // Warn before closing tab if unsaved changes have not been flushed yet
  useEffect(() => {
    if (!hasUnsavedChanges || !canEditCurrent) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges, canEditCurrent]);

  // Fullscreen keyboard shortcut (Escape) and background scroll lock
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !templatesModalOpen && !saveTemplateOpen && !noteToDelete) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen, templatesModalOpen, saveTemplateOpen, noteToDelete]);

  const handleBackToList = async () => {
    const target = initialKindFilter === 'collections' ? '/collections' : '/notes';
    setIsFullscreen(false);
    if (hasUnsavedChanges && autoSaveEnabled && canEditCurrent && !saveInFlightRef.current) {
      await persistDraft({ isAutoSave: true });
    }
    onNavigate(target);
  };

  const formatSavedTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const canDeleteNote = (note: NoteDTO) =>
    user?.role === 'admin' ||
    (note.ownerId === user?.id && user?.permissionLevel === 'view_edit_delete');

  const canChangeVis =
    canEditCurrent &&
    (user?.role === 'admin' ||
      (!activeNote?.lockedByAdmin && user?.canPublishPublic !== false));

  const hasBodyContent = Boolean(
    contentHtml
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
  );

  const handleApplyTemplate = (tpl: NoteTemplateDTO, applyMode: 'replace' | 'append') => {
    if (!noteIdParam) {
      setTemplatesModalOpen(false);
      onNavigate('/notes/new', { preselectedTemplate: tpl });
      toast.success(`Started new note from "${tpl.name}".`);
      return;
    }

    if (applyMode === 'replace') {
      setContentHtml(tpl.contentHtml || '');
      if (!title.trim() && tpl.defaultTitle) {
        setTitle(tpl.defaultTitle);
      }
    } else {
      setContentHtml((prev) => `${prev || ''}${tpl.contentHtml || ''}`);
    }

    if (tpl.collectionLayout) {
      setCollectionLayout(tpl.collectionLayout);
    }

    if (tpl.tags.length > 0) {
      const existing = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...tpl.tags])).slice(0, 12);
      setTagsText(merged.join(', '));
    }

    setTemplatesModalOpen(false);
    setMode('edit');
    toast.success(`Applied template "${tpl.name}".`);
  };

  const handleDownloadMarkdown = () => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const tiptapJson = tiptapEditorRef.current?.getJSON() ?? null;
    const markdown = buildNoteMarkdownDocument({
      title,
      tags,
      status,
      visibility,
      updatedAt: activeNote?.updatedAt || new Date().toISOString(),
      images,
      tiptapJson,
      fallbackHtml: contentHtml,
    });
    const filename = slugifyMarkdownFilename(title);
    downloadMarkdownFile(filename, markdown);
    toast.success(`Downloaded "${filename}".`);
  };

  // --- Detail / Editor View ---
  if (noteIdParam) {
    if (loadingNote) {
      return (
        <div className="space-y-4">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      );
    }

    return (
      <div
        className={
          isFullscreen
            ? 'fixed inset-0 z-40 overflow-y-auto bg-[#FAFAFA] px-4 py-5 dark:bg-[#090D16] sm:px-8 sm:py-6'
            : ''
        }
      >
        <div
          className={
            isFullscreen
              ? `mx-auto space-y-5 ${showToc ? 'max-w-6xl' : 'max-w-4xl'}`
              : 'space-y-6'
          }
        >
          <input
            ref={inlineImgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInlineFileSelected}
          />

          {/* Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isFullscreen ? (
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Focus Mode</span>
                <span aria-hidden="true">·</span>
                <span>Press Esc to exit</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleBackToList}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to {initialKindFilter === 'collections' ? 'Collections' : 'Notes'}</span>
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {canEditCurrent && (
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === 'edit'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Write</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('preview')}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      mode === 'preview'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Read-Only</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowToc((prev) => !prev)}
                aria-pressed={showToc}
                title="Toggle Table of Contents (H1–H3)"
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  showToc
                    ? 'border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                <span>Table of Contents</span>
              </button>

              {activeNote?.visibility === 'public' && activeNote.status === 'published' && (
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}/public/note/${activeNote.shareSlug}`;
                    await navigator.clipboard.writeText(url);
                    toast.success('Public note link copied.');
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Copy Share Link</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadMarkdown}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Serialize current note as a formatted .md file"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Download as Markdown</span>
              </button>

              {!isReadOnly && !isFullscreen && activeNote && canDeleteNote(activeNote) && (
                <button
                  type="button"
                  onClick={() => setNoteToDelete(activeNote)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              )}

              {canEditCurrent && !isReadOnly && (
                <>
                  {!isFullscreen && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTemplatesModalOpen(true)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <LayoutTemplate className="h-3.5 w-3.5" />
                        <span>Templates</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSaveTemplateOpen(true)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        <span>Save as Template</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveNote}
                    disabled={saving}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    <span>{saving ? 'Saving...' : 'Save Note'}</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                aria-pressed={isFullscreen}
                title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen focus mode'}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  isFullscreen
                    ? 'border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Fullscreen</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Auto-Save Status Bar (hidden in Read-Only mode) */}
          {canEditCurrent && !isReadOnly && (
            <div
              aria-live="polite"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3.5 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400"
            >
              <div className="flex items-center gap-2">
                {autoSaveStatus === 'saving' || saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Saving draft to database...
                    </span>
                  </>
                ) : autoSaveStatus === 'error' ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-red-700 dark:text-red-300">
                      Auto-save failed{autoSaveError ? `: ${autoSaveError}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void persistDraft({ isAutoSave: true })}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Retry
                    </button>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>
                      Unsaved changes
                      {autoSaveEnabled ? ' · Auto-saving shortly' : ' · Auto-save paused'}
                    </span>
                  </>
                ) : autoSaveStatus === 'saved' && lastSavedAt ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      Saved to database at{' '}
                      <span className="font-mono tabular-nums">{formatSavedTime(lastSavedAt)}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      {autoSaveEnabled
                        ? 'Auto-save enabled (debounced 2s · periodic 15s)'
                        : 'Auto-save paused'}
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setAutoSaveEnabled((prev) => !prev)}
                className="whitespace-nowrap font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              >
                Auto-save: {autoSaveEnabled ? 'On' : 'Off'}
              </button>
            </div>
          )}

          {/* Metadata Controls (hidden in Read-Only mode) */}
          {!isReadOnly ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note or image collection headline..."
                  className="w-full border-0 bg-transparent font-display text-2xl font-bold tracking-tight text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                />
                {isFullscreen && (
                  <button
                    type="button"
                    onClick={() => setShowFullscreenMeta((v) => !v)}
                    className="whitespace-nowrap shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {showFullscreenMeta ? 'Hide Details' : 'Note Details'}
                  </button>
                )}
              </div>

              {(!isFullscreen || showFullscreenMeta) && (
                <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Publication Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as NoteStatus)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Visibility
                    </label>
                    <select
                      value={visibility}
                      disabled={!canChangeVis}
                      onChange={(e) => setVisibility(e.target.value as Visibility)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="private">Private (Owner & Admin)</option>
                      <option value="public">Public (Shareable)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      value={tagsText}
                      onChange={(e) => setTagsText(e.target.value)}
                      placeholder="architecture, storyboard, notes"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}

              {activeNote?.lockedByAdmin && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span>Visibility for this note has been locked by an administrator.</span>
                </div>
              )}
            </div>
          ) : null}

          <div
            className={
              showToc
                ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_270px]'
                : ''
            }
          >
            {!isReadOnly ? (
              <div
                className={`${
                  isFullscreen
                    ? 'space-y-5 [&_.ProseMirror]:min-h-[calc(100vh-300px)]'
                    : 'space-y-6'
                } [&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24`}
              >
                {(!isFullscreen || images.length > 0 || showFullscreenMeta) && (
                  <ImageCollectionBuilder
                    images={images}
                    layout={collectionLayout}
                    onChangeImages={setImages}
                    onChangeLayout={setCollectionLayout}
                  />
                )}
                <RichTextEditor
                  value={contentHtml}
                  onChange={setContentHtml}
                  onRequestImageUpload={requestInlineImageUpload}
                  onEditorReady={handleEditorReady}
                />
              </div>
            ) : (
              <article className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900 [&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  <span>{status === 'published' ? 'Published' : 'Draft'}</span>
                  <span className="mx-1.5">·</span>
                  <span>{visibility === 'public' ? 'Public' : 'Private'}</span>
                  {activeNote && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>By {activeNote.ownerName}</span>
                      <span className="mx-1.5">·</span>
                      <span>{activeNote.readingTimeMinutes} min read</span>
                    </>
                  )}
                  {images.length > 0 && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono tabular-nums">{images.length} images</span>
                    </>
                  )}
                  <span className="mx-1.5">·</span>
                  <span>Read-Only</span>
                </div>
                <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {title || 'Untitled Note'}
                </h1>
                {tagsText && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {tagsText}
                  </div>
                )}

                <ImageCollectionViewer
                  images={images}
                  layout={collectionLayout}
                  editable={false}
                  onCaptionChange={handleViewerCaptionChange}
                  onCaptionCommit={handleViewerCaptionCommit}
                />

                <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
                  <RichTextViewer contentHtml={contentHtml} onEditorReady={handleEditorReady} />
                </div>
              </article>
            )}

            {showToc && (
              <TableOfContents
                editor={tiptapEditor}
                className="order-first lg:order-last lg:sticky lg:top-20"
              />
            )}
          </div>

        <ConfirmDialog
          open={Boolean(noteToDelete)}
          title="Delete Note"
          description={`Permanently delete "${noteToDelete?.title}"? This action cannot be undone.`}
          confirmLabel="Delete Note"
          destructive
          loading={deleting}
          onCancel={() => setNoteToDelete(null)}
          onConfirm={handleDeleteNote}
        />

          <TemplatesLibraryModal
            open={templatesModalOpen}
            hasExistingContent={hasBodyContent}
            onClose={() => setTemplatesModalOpen(false)}
            onApply={handleApplyTemplate}
          />

          <SaveTemplateModal
            open={saveTemplateOpen}
            currentTitle={title}
            currentContentHtml={contentHtml}
            currentTagsText={tagsText}
            currentLayout={collectionLayout}
            onClose={() => setSaveTemplateOpen(false)}
            onSaved={() => {}}
          />
        </div>
      </div>
    );
  }

  // --- Notes & Collections List View ---
  const isCollectionsView = kindFilter === 'collections';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isCollectionsView ? 'Image Collections' : 'Notes & Blogs'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isCollectionsView
              ? 'Grouped multi-image boards with custom sequence ordering, captions, and marked notes below each frame.'
              : 'Rich-text articles, image collections, tables, and syntax-highlighted code snippets.'}
          </p>
        </div>

        {canCreate && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setTemplatesModalOpen(true)}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LayoutTemplate className="h-4 w-4" />
              <span>Templates</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/notes/new')}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>{isCollectionsView ? 'New Image Collection' : 'Write New Note'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
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
              placeholder="Search title, captions, body text..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value as 'all' | 'collections' | 'text');
                setPage(1);
              }}
              aria-label="Filter by format"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">All Formats</option>
              <option value="collections">Image Collections</option>
              <option value="text">Text Notes Only</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | NoteStatus);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={visibilityFilter}
              onChange={(e) => {
                setVisibilityFilter(e.target.value as 'all' | Visibility);
                setPage(1);
              }}
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
                value={ownerFilter}
                onChange={(e) => {
                  setOwnerFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="me">My Notes</option>
                <option value="all">All Authors</option>
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
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="newest">Recently Updated</option>
                <option value="oldest">Oldest First</option>
                <option value="alpha_asc">Title (A-Z)</option>
                <option value="alpha_desc">Title (Z-A)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Notes List */}
      {loadingList ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : !notesData || notesData.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          {isCollectionsView ? (
            <Images className="mx-auto h-10 w-10 text-slate-400" />
          ) : (
            <FileText className="mx-auto h-10 w-10 text-slate-400" />
          )}
          <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {isCollectionsView ? 'No image collections yet' : 'No notes found'}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isCollectionsView
              ? 'Group multiple images into one note, reorder frames, and annotate each image.'
              : 'Start writing rich-text notes, image collections, or code snippet guides.'}
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => onNavigate('/notes/new')}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {isCollectionsView ? 'Create First Collection' : 'Write First Note'}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {notesData.items.map((note) => (
            <div
              key={note.id}
              onClick={() => onNavigate(`/notes/${note.id}`)}
              className="flex cursor-pointer flex-col justify-between gap-4 p-5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span
                    className={
                      note.status === 'published'
                        ? 'font-medium text-emerald-600 dark:text-emerald-400'
                        : 'font-medium text-amber-600 dark:text-amber-400'
                    }
                  >
                    {note.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{note.visibility === 'public' ? 'Public' : 'Private'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{note.ownerName}</span>
                  {note.images && note.images.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                        {note.images.length} {note.images.length === 1 ? 'image' : 'images'}
                      </span>
                    </>
                  )}
                </div>

                <h3 className="mt-1 truncate font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {note.title}
                </h3>

                {note.images && note.images.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-2 overflow-hidden">
                    {note.images.slice(0, 5).map((img) => (
                      <img
                        key={img.id}
                        src={img.src}
                        alt={img.caption || img.fileName}
                        className="h-12 w-16 shrink-0 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ))}
                    {note.images.length > 5 && (
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        +{note.images.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {note.excerpt && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                    {note.excerpt}
                  </p>
                )}

                {note.tags.length > 0 && (
                  <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    {note.tags.join(' · ')}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {formatDate(note.updatedAt)}
                </span>
                {note.visibility === 'public' && note.status === 'published' && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/public/note/${note.shareSlug}`;
                      await navigator.clipboard.writeText(url);
                      toast.success('Public link copied.');
                    }}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title="Copy public share link"
                    aria-label="Copy public share link"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                )}
                {canDeleteNote(note) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteToDelete(note);
                    }}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    title="Delete note"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {notesData && notesData.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Page {notesData.page} of {notesData.totalPages} ({notesData.total} notes)
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
              disabled={page >= notesData.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(noteToDelete)}
        title="Delete Note"
        description={`Permanently delete "${noteToDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete Note"
        destructive
        loading={deleting}
        onCancel={() => setNoteToDelete(null)}
        onConfirm={handleDeleteNote}
      />

      <TemplatesLibraryModal
        open={templatesModalOpen}
        hasExistingContent={false}
        onClose={() => setTemplatesModalOpen(false)}
        onApply={handleApplyTemplate}
      />
    </div>
  );
}
