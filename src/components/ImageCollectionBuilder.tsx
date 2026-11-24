import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  GripVertical,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { convertFileToBase64 } from '../lib/fileConverter';
import type { CollectionLayout, GalleryFileDTO, NoteImageItem } from '../types';

interface ImageCollectionBuilderProps {
  images: NoteImageItem[];
  layout: CollectionLayout;
  onChangeImages: (next: NoteImageItem[]) => void;
  onChangeLayout: (next: CollectionLayout) => void;
}

export function ImageCollectionBuilder({
  images,
  layout,
  onChangeImages,
  onChangeLayout,
}: ImageCollectionBuilderProps) {
  const { user, apiFetch } = useAuth();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Gallery Picker Modal State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryFileDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const maxFileSizeMB = Math.min(user?.maxFileSizeMB || 10, 10);

  const reindex = (list: NoteImageItem[]): NoteImageItem[] =>
    list.map((item, idx) => ({ ...item, order: idx }));

  const handleUploadImages = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, Math.max(0, 40 - images.length));
    if (files.length === 0) {
      toast.error('Collection limit reached (40 images per note).');
      return;
    }

    setProcessing(true);
    const added: NoteImageItem[] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        toast.error(`"${f.name}" is not an image file.`);
        continue;
      }
      try {
        const converted = await convertFileToBase64(f, {
          maxSizeMB: maxFileSizeMB,
          maxDimension: 1024,
          quality: 0.85,
        });
        added.push({
          id: crypto.randomUUID(),
          fileId: null,
          src: converted.base64,
          fileName: converted.fileName,
          caption: '',
          marked: false,
          order: images.length + added.length,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Unable to process "${f.name}".`);
      }
    }

    if (added.length > 0) {
      onChangeImages(reindex([...images, ...added]));
      toast.success(
        `Added ${added.length} ${added.length === 1 ? 'image' : 'images'} to collection.`
      );
    }
    setProcessing(false);
  };

  const openGalleryPicker = async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    setSelectedIds(new Set());
    try {
      const res = await apiFetch('/api/files?category=image&limit=40&ownerId=me');
      if (res.ok) {
        const data = await res.json();
        setGalleryImages(data.items || []);
      }
    } catch {
      toast.error('Unable to load gallery images.');
    } finally {
      setPickerLoading(false);
    }
  };

  const toggleSelectGalleryImage = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddFromGallery = () => {
    const picked = galleryImages.filter((f) => selectedIds.has(f.id));
    const added: NoteImageItem[] = picked
      .filter((f) => Boolean(f.fileData || f.previewDataUrl))
      .map((f, i) => ({
        id: crypto.randomUUID(),
        fileId: f.id,
        src: (f.fileData || f.previewDataUrl)!,
        fileName: f.originalName,
        caption: f.description || '',
        marked: false,
        order: images.length + i,
      }));
    if (added.length > 0) {
      onChangeImages(reindex([...images, ...added].slice(0, 40)));
      toast.success(`Added ${added.length} gallery ${added.length === 1 ? 'image' : 'images'}.`);
    }
    setPickerOpen(false);
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= images.length || fromIndex === toIndex) return;
    const copy = [...images];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    onChangeImages(reindex(copy));
  };

  const updateItem = (id: string, patch: Partial<NoteImageItem>) => {
    onChangeImages(images.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };

  const removeItem = (id: string) => {
    onChangeImages(reindex(images.filter((img) => img.id !== id)));
  };

  const toggleParentCardDraggable = (el: HTMLElement, value: boolean) => {
    const card = el.closest('[data-collection-card="true"]') as HTMLElement | null;
    if (card) {
      card.draggable = value;
    }
  };

  const gridColsClass =
    layout === 'stack'
      ? 'grid-cols-1'
      : layout === 'columns'
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <input
        ref={uploadInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleUploadImages(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Header Toolbar */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Image Collection & Captions
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Drag and drop any image thumbnail or grip handle to rearrange order, and edit captions or mark notes below each image.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {images.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  { id: 'grid', label: '3-Col Grid' },
                  { id: 'columns', label: '2-Col' },
                  { id: 'stack', label: 'Stack' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeLayout(opt.id)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    layout === opt.id
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={openGalleryPicker}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>Pick from Gallery</span>
          </button>

          <button
            type="button"
            disabled={processing}
            onClick={() => uploadInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {processing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            <span>{processing ? 'Processing...' : 'Add Images'}</span>
          </button>
        </div>
      </div>

      {/* Items Grid / Stack */}
      {images.length === 0 ? (
        <div
          onClick={() => !processing && uploadInputRef.current?.click()}
          className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-8 text-center hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/40"
        >
          <ImagePlus className="h-7 w-7 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            No images grouped in this note yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Click to upload multiple PNG, JPG, WEBP, or GIF files, or pick existing images from your Note Gallery.
          </p>
        </div>
      ) : (
        <div className={`mt-5 grid gap-4 ${gridColsClass}`}>
          {images.map((item, idx) => {
            const isDragging = dragIndex === idx;
            const isDropTarget = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
            return (
              <div
                key={item.id}
                data-collection-card="true"
                draggable
                onDragStart={(e) => {
                  const activeTag = document.activeElement?.tagName;
                  if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.id);
                  setDragIndex(idx);
                  setDragOverIndex(idx);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIndex !== idx) setDragOverIndex(idx);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (dragOverIndex !== idx) setDragOverIndex(idx);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedId = e.dataTransfer.getData('text/plain');
                  const sourceIdx =
                    dragIndex !== null
                      ? dragIndex
                      : images.findIndex((candidate) => candidate.id === droppedId);
                  if (sourceIdx !== -1 && sourceIdx !== idx) {
                    moveItem(sourceIdx, idx);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-all dark:bg-slate-950 ${
                  isDragging
                    ? 'scale-[0.98] border-dashed border-blue-400 opacity-50'
                    : isDropTarget
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : item.marked
                        ? 'border-amber-400 dark:border-amber-600'
                        : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Controls Header */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                  <div
                    className="flex cursor-grab items-center gap-1.5 text-xs text-slate-500 active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, idx - 1)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200/70 disabled:opacity-30 dark:hover:bg-slate-800"
                      title="Move earlier"
                      aria-label="Move image earlier"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === images.length - 1}
                      onClick={() => moveItem(idx, idx + 1)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200/70 disabled:opacity-30 dark:hover:bg-slate-800"
                      title="Move later"
                      aria-label="Move image later"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, { marked: !item.marked })}
                      className={`rounded p-1 transition-colors ${
                        item.marked
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800'
                      }`}
                      title={item.marked ? 'Unmark note' : 'Mark / Highlight note'}
                      aria-label={item.marked ? 'Unmark note' : 'Mark note'}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      title="Remove from collection"
                      aria-label="Remove image"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Image Thumbnail (draggable via parent card) */}
                <div className="relative aspect-[4/3] cursor-grab overflow-hidden bg-slate-100 active:cursor-grabbing dark:bg-slate-900">
                  <img
                    src={item.src}
                    alt={item.caption || item.fileName}
                    draggable={false}
                    className="h-full w-full select-none object-cover"
                  />
                  {isDropTarget && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-600/20 backdrop-blur-[1px]">
                      <span className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                        Move to #{String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Editable Caption / Note Field Below Thumbnail */}
                <div
                  className="p-3"
                  onMouseEnter={(e) => toggleParentCardDraggable(e.currentTarget, false)}
                  onMouseLeave={(e) => toggleParentCardDraggable(e.currentTarget, true)}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate font-mono">{item.fileName}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.marked && (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          Marked
                        </span>
                      )}
                      <span className="font-mono tabular-nums text-[10px] text-slate-400">
                        {item.caption.length}/500
                      </span>
                    </div>
                  </div>
                  <label className="sr-only" htmlFor={`caption-${item.id}`}>
                    Caption for {item.fileName}
                  </label>
                  <textarea
                    id={`caption-${item.id}`}
                    rows={2}
                    maxLength={500}
                    value={item.caption}
                    onFocus={(e) => toggleParentCardDraggable(e.currentTarget, false)}
                    onBlur={(e) => toggleParentCardDraggable(e.currentTarget, true)}
                    onChange={(e) => updateItem(item.id, { caption: e.target.value })}
                    placeholder="Write a caption or note for this image..."
                    className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gallery Image Picker Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Select Images from Note Gallery
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose one or more uploaded images to append to this note collection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close picker"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {pickerLoading ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                  ))}
                </div>
              ) : galleryImages.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No uploaded images found in your Note Gallery yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {galleryImages.map((img) => {
                    const checked = selectedIds.has(img.id);
                    const previewSrc = img.fileData || img.previewDataUrl || img.contentUrl;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => toggleSelectGalleryImage(img.id)}
                        className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                          checked
                            ? 'border-blue-600 ring-2 ring-blue-500/25'
                            : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                        }`}
                      >
                        <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-950">
                          <img
                            src={previewSrc}
                            alt={img.originalName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 p-2.5 text-xs">
                          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {img.title}
                          </span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <span className="font-mono text-xs tabular-nums text-slate-500">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={handleAddFromGallery}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Add Selected Images
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function ImageCollectionViewer({
  images,
  layout = 'grid',
  editable = false,
  onCaptionChange,
  onCaptionCommit,
}: {
  images: NoteImageItem[];
  layout?: CollectionLayout;
  editable?: boolean;
  onCaptionChange?: (imageId: string, caption: string) => void;
  onCaptionCommit?: (imageId: string, caption: string) => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (!images || images.length === 0) return null;

  const sorted = [...images].sort((a, b) => a.order - b.order);
  const gridColsClass =
    layout === 'stack'
      ? 'grid-cols-1'
      : layout === 'columns'
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  const currentItem = lightboxIdx !== null ? sorted[lightboxIdx] : null;

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          Image Collection · <span className="font-mono tabular-nums">{sorted.length}</span>{' '}
          {sorted.length === 1 ? 'frame' : 'frames'}
        </span>
        <span>Click any image to inspect full frame</span>
      </div>

      <div className={`grid gap-5 ${gridColsClass}`}>
        {sorted.map((item, idx) => (
          <figure
            key={item.id}
            className={`overflow-hidden rounded-xl border bg-slate-50/50 transition-colors hover:border-slate-300 dark:bg-slate-950/60 dark:hover:border-slate-700 ${
              item.marked
                ? 'border-amber-400 dark:border-amber-600'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setLightboxIdx(idx)}
              className="group block aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left dark:bg-slate-900"
              aria-label={`Inspect ${item.caption || item.fileName}`}
            >
              <img
                src={item.src}
                alt={item.caption || item.fileName}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </button>

            <figcaption className="p-3.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="truncate font-mono tabular-nums">
                  {String(idx + 1).padStart(2, '0')} · {item.fileName}
                </span>
                {item.marked && (
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                    <Bookmark className="h-3 w-3" />
                    <span>Marked</span>
                  </span>
                )}
              </div>

              {editable && onCaptionChange ? (
                <div className="mt-2">
                  <label className="sr-only" htmlFor={`viewer-caption-${item.id}`}>
                    Caption for {item.fileName}
                  </label>
                  <input
                    id={`viewer-caption-${item.id}`}
                    type="text"
                    maxLength={500}
                    value={item.caption}
                    onChange={(e) => onCaptionChange(item.id, e.target.value)}
                    onBlur={(e) => onCaptionCommit?.(item.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Add a caption..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              ) : item.caption ? (
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {item.caption}
                </p>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Collection Lightbox */}
      {currentItem && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute right-5 top-5 rounded-lg bg-slate-900/80 p-2 text-slate-300 hover:text-white"
            aria-label="Close lightbox"
          >
            <X className="h-5 w-5" />
          </button>

          <button
            type="button"
            disabled={lightboxIdx === 0}
            onClick={() => setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i))}
            className="mr-3 rounded-lg bg-slate-900/80 p-2.5 text-slate-200 hover:bg-slate-800 disabled:opacity-30"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex max-h-[88vh] max-w-4xl flex-col items-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <img
              src={currentItem.src}
              alt={currentItem.caption || currentItem.fileName}
              className="max-h-[70vh] w-auto object-contain bg-black"
            />
            <div className="w-full border-t border-slate-800 px-6 py-4 text-left">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                <span className="font-mono tabular-nums">
                  {String(lightboxIdx + 1).padStart(2, '0')} / {String(sorted.length).padStart(2, '0')} · {currentItem.fileName}
                </span>
                {currentItem.marked && (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-400">
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>Marked Note</span>
                  </span>
                )}
              </div>
              {currentItem.caption && (
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {currentItem.caption}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={lightboxIdx === sorted.length - 1}
            onClick={() =>
              setLightboxIdx((i) => (i !== null && i < sorted.length - 1 ? i + 1 : i))
            }
            className="ml-3 rounded-lg bg-slate-900/80 p-2.5 text-slate-200 hover:bg-slate-800 disabled:opacity-30"
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
