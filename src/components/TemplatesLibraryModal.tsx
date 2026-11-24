import React, { useCallback, useEffect, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  LayoutTemplate,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { RichTextViewer } from './RichTextEditor';
import type { CollectionLayout, NoteTemplateDTO, TemplateCategory } from '../types';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  general: 'General',
  technical: 'Technical',
  editorial: 'Editorial',
  collection: 'Visual Collection',
  meeting: 'Meeting Notes',
};

const LAYOUT_LABELS: Record<CollectionLayout, string> = {
  grid: '3-Col Grid',
  columns: '2-Col Layout',
  stack: 'Full Stack',
};

interface TemplatesLibraryModalProps {
  open: boolean;
  hasExistingContent: boolean;
  onClose: () => void;
  onApply: (template: NoteTemplateDTO, applyMode: 'replace' | 'append') => void;
}

export function TemplatesLibraryModal({
  open,
  hasExistingContent,
  onClose,
  onApply,
}: TemplatesLibraryModalProps) {
  const { user, apiFetch } = useAuth();
  const [templates, setTemplates] = useState<NoteTemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'mine' | 'builtin'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/templates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const items = (data.items || []) as NoteTemplateDTO[];
        setTemplates(items);
        setSelectedId((prev) =>
          prev && items.some((t) => t.id === prev) ? prev : items[0]?.id ?? null
        );
      }
    } catch {
      toast.error('Unable to load templates.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, scope, search]);

  useEffect(() => {
    if (open) {
      void loadTemplates();
    }
  }, [open, loadTemplates]);

  if (!open) return null;

  const selectedTemplate = templates.find((t) => t.id === selectedId) || templates[0] || null;

  const canDelete = (tpl: NoteTemplateDTO) =>
    !tpl.isBuiltIn && (tpl.ownerId === user?.id || user?.role === 'admin');

  const handleDelete = async (tpl: NoteTemplateDTO) => {
    setDeletingId(tpl.id);
    try {
      const res = await apiFetch(`/api/templates/${tpl.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not delete template.');
        return;
      }
      toast.success(`Template "${tpl.name}" deleted.`);
      await loadTemplates();
    } catch {
      toast.error('Network error deleting template.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="templates-library-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="templates-library-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Templates Library
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reuse saved document structures, code outlines, and collection layouts across notes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close templates library"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates by name or tag..."
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
            {(
              [
                { id: 'all', label: 'All Templates' },
                { id: 'mine', label: 'My Saved' },
                { id: 'builtin', label: 'Starters' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  scope === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two-Pane Body */}
        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-12">
          {/* Left List */}
          <div className="overflow-y-auto border-b border-slate-200 p-4 dark:border-slate-800 md:col-span-5 md:border-b-0 md:border-r">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="py-12 text-center">
                <LayoutTemplate className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  No matching templates
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Save any note layout with &ldquo;Save as Template&rdquo; in the editor.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {templates.map((tpl) => {
                  const active = selectedTemplate?.id === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedId(tpl.id)}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {tpl.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{CATEGORY_LABELS[tpl.category] || 'General'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{tpl.isBuiltIn ? 'Starter' : tpl.isShared ? 'Shared' : 'Personal'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{LAYOUT_LABELS[tpl.collectionLayout]}</span>
                          </div>
                        </div>

                        {canDelete(tpl) && (
                          <button
                            type="button"
                            disabled={deletingId === tpl.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(tpl);
                            }}
                            className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            title="Delete template"
                            aria-label={`Delete ${tpl.name}`}
                          >
                            {deletingId === tpl.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {tpl.description && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                          {tpl.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Preview */}
          <div className="flex min-h-0 flex-col overflow-hidden bg-slate-50/40 dark:bg-slate-950/30 md:col-span-7">
            {selectedTemplate ? (
              <>
                <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {CATEGORY_LABELS[selectedTemplate.category]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>By {selectedTemplate.ownerName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{LAYOUT_LABELS[selectedTemplate.collectionLayout]}</span>
                  </div>
                  <h3 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedTemplate.name}
                  </h3>
                  {selectedTemplate.defaultTitle && (
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Default title:{' '}
                      <span className="font-mono text-slate-800 dark:text-slate-200">
                        {selectedTemplate.defaultTitle}
                      </span>
                    </div>
                  )}
                  {selectedTemplate.tags.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Tags: {selectedTemplate.tags.join(', ')}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {selectedTemplate.contentHtml ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <RichTextViewer contentHtml={selectedTemplate.contentHtml} />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                      This template applies collection layout ({LAYOUT_LABELS[selectedTemplate.collectionLayout]}) and tags with an empty body canvas.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {hasExistingContent
                      ? 'Your note already has content — choose Replace or Append.'
                      : 'Applies layout, tags, and structured body to your editor.'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    {hasExistingContent ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onApply(selectedTemplate, 'append')}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
                        >
                          <span>Append Below</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onApply(selectedTemplate, 'replace')}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Replace Content</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onApply(selectedTemplate, 'replace')}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Apply Template</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-10 text-sm text-slate-500">
                Select a template from the list to inspect its structure.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SaveTemplateModalProps {
  open: boolean;
  currentTitle: string;
  currentContentHtml: string;
  currentTagsText: string;
  currentLayout: CollectionLayout;
  onClose: () => void;
  onSaved: (tpl: NoteTemplateDTO) => void;
}

export function SaveTemplateModal({
  open,
  currentTitle,
  currentContentHtml,
  currentTagsText,
  currentLayout,
  onClose,
  onSaved,
}: SaveTemplateModalProps) {
  const { apiFetch } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('general');
  const [defaultTitle, setDefaultTitle] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentTitle.trim() ? `${currentTitle.trim()} Template` : '');
      setDefaultTitle(currentTitle.trim());
      setDescription('');
      setCategory('general');
      setIsShared(false);
    }
  }, [open, currentTitle]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a template name.');
      return;
    }

    setSaving(true);
    try {
      const tags = currentTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);

      const res = await apiFetch('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          defaultTitle: defaultTitle.trim(),
          contentHtml: currentContentHtml,
          tags,
          collectionLayout: currentLayout,
          isShared,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not save template.');
        return;
      }
      toast.success(`Saved "${data.template.name}" to Templates Library.`);
      onSaved(data.template);
      onClose();
    } catch {
      toast.error('Network error saving template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-template-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <BookmarkPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2
              id="save-template-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Save Structure as Template
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close save template modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Template Name
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Engineering Review"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="general">General</option>
                <option value="technical">Technical</option>
                <option value="editorial">Editorial</option>
                <option value="collection">Visual Collection</option>
                <option value="meeting">Meeting Notes</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Default Note Title (Optional)
              </label>
              <input
                type="text"
                maxLength={200}
                value={defaultTitle}
                onChange={(e) => setDefaultTitle(e.target.value)}
                placeholder="Prefilled note headline"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe when to use this structure..."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Share this template with all approved workspace members</span>
          </label>

          <div className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Captures rich-text layout, tags, and image collection grid mode ({LAYOUT_LABELS[currentLayout]}).
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{saving ? 'Saving...' : 'Save Template'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
