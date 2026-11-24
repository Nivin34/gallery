import React, { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ListTree } from 'lucide-react';

export interface TocHeadingItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  pos: number;
}

interface TableOfContentsProps {
  editor: Editor | null;
  className?: string;
}

function extractHeadings(editor: Editor | null): TocHeadingItem[] {
  if (!editor || editor.isDestroyed) return [];
  const items: TocHeadingItem[] = [];
  let index = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs?.level || 1);
      if (level >= 1 && level <= 3) {
        const text = node.textContent.trim();
        if (text) {
          items.push({
            id: `toc-${pos}-${level}-${index}`,
            level: level as 1 | 2 | 3,
            text,
            pos,
          });
          index += 1;
        }
      }
    }
  });

  return items;
}

export function TableOfContents({ editor, className = '' }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TocHeadingItem[]>(() => extractHeadings(editor));
  const [activePos, setActivePos] = useState<number | null>(null);

  const syncHeadings = useCallback(() => {
    setHeadings(extractHeadings(editor));
  }, [editor]);

  useEffect(() => {
    syncHeadings();
    if (!editor) return;

    const handleTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) {
        syncHeadings();
      }
    };

    editor.on('update', syncHeadings);
    editor.on('create', syncHeadings);
    editor.on('transaction', handleTransaction);

    return () => {
      editor.off('update', syncHeadings);
      editor.off('create', syncHeadings);
      editor.off('transaction', handleTransaction);
    };
  }, [editor, syncHeadings]);

  const handleNavigateHeading = (item: TocHeadingItem) => {
    if (!editor || editor.isDestroyed) return;
    setActivePos(item.pos);

    try {
      const domNode = editor.view.nodeDOM(item.pos);
      let targetEl: HTMLElement | null = domNode instanceof HTMLElement ? domNode : null;

      if (!targetEl) {
        const safePos = Math.min(item.pos + 1, editor.state.doc.content.size);
        const resolved = editor.view.domAtPos(safePos);
        const raw = resolved.node;
        const el = raw instanceof HTMLElement ? raw : raw.parentElement;
        targetEl = (el?.closest('h1, h2, h3') as HTMLElement | null) ?? el;
      }

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {
      // Ignore transient ProseMirror position resolution errors
    }
  };

  return (
    <aside
      aria-label="Table of Contents"
      className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          <ListTree className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>Table of Contents</span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-slate-400">
          {headings.length}
        </span>
      </div>

      {headings.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Add H1, H2, or H3 headings in your note to generate clickable section links.
        </p>
      ) : (
        <nav className="mt-3 space-y-1">
          {headings.map((item) => {
            const isActive = activePos === item.pos;
            const indentClass =
              item.level === 1 ? 'pl-2' : item.level === 2 ? 'pl-5' : 'pl-8';
            const weightClass =
              item.level === 1
                ? 'font-semibold text-slate-900 dark:text-slate-100'
                : item.level === 2
                  ? 'font-medium text-slate-700 dark:text-slate-300'
                  : 'font-normal text-slate-600 dark:text-slate-400';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigateHeading(item)}
                title={item.text}
                className={`group flex w-full items-baseline gap-2 rounded-lg py-1.5 pr-2 text-left text-xs transition-colors ${indentClass} ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : `hover:bg-slate-100 dark:hover:bg-slate-800/70 ${weightClass}`
                }`}
              >
                <span className="shrink-0 font-mono text-[10px] text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  H{item.level}
                </span>
                <span className="truncate">{item.text}</span>
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
