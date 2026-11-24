import React, { useEffect, useState } from 'react';
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import { common, createLowlight } from 'lowlight';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Code,
  Code2,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
} from 'lucide-react';
import { toast } from 'sonner';

const lowlight = createLowlight(common);

const LANGUAGES = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'css', label: 'CSS' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

function CodeBlockNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const currentLang = (node.attrs.language as string) || 'typescript';
  const editable = editor.isEditable;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent || '');
      setCopied(true);
      toast.success('Code snippet copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Unable to copy code');
    }
  };

  return (
    <NodeViewWrapper className="my-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100">
      <div
        contentEditable={false}
        className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3.5 py-2 text-xs"
      >
        {editable ? (
          <select
            value={currentLang}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            aria-label="Code language"
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-xs font-medium text-slate-400">{currentLang}</span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy Code'}</span>
        </button>
      </div>
      <pre className="!m-0 !rounded-none !border-0 !bg-transparent p-4 font-mono text-sm leading-relaxed">
        <code>
          <NodeViewContent />
        </code>
      </pre>
    </NodeViewWrapper>
  );
}

const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({
  lowlight,
  defaultLanguage: 'typescript',
});

function buildExtensions(placeholderText = 'Write your note, documentation, or technical post...') {
  return [
    StarterKit.configure({
      codeBlock: false,
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    Image.configure({
      allowBase64: true,
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    CustomCodeBlock,
    Placeholder.configure({
      placeholder: placeholderText,
    }),
  ];
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onRequestImageUpload?: () => Promise<string | null>;
  onEditorReady?: (editor: Editor | null) => void;
}

export function RichTextEditor({
  value,
  onChange,
  onRequestImageUpload,
  onEditorReady,
}: RichTextEditorProps) {
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imagePromptOpen, setImagePromptOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const editor = useEditor({
    extensions: buildExtensions(),
    content: value,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const btnClass = (active = false) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors ${
      active
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
    }`;

  const applyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      const normalized = /^https?:\/\//i.test(linkUrl.trim())
        ? linkUrl.trim()
        : `https://${linkUrl.trim()}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
    }
    setLinkUrl('');
    setLinkPromptOpen(false);
  };

  const applyImageUrl = () => {
    if (imageUrl.trim()) {
      editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    }
    setImageUrl('');
    setImagePromptOpen(false);
  };

  const handleUploadInlineImage = async () => {
    if (!onRequestImageUpload) return;
    const url = await onRequestImageUpload();
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/90">
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={`${btnClass(false)} disabled:opacity-40`}
          title="Undo"
          aria-label="Undo"
        >
          <Undo className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={`${btnClass(false)} disabled:opacity-40`}
          title="Redo"
          aria-label="Redo"
        >
          <Redo className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={btnClass(editor.isActive('heading', { level: 1 }))}
          title="Heading 1"
          aria-label="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive('heading', { level: 2 }))}
          title="Heading 2"
          aria-label="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnClass(editor.isActive('heading', { level: 3 }))}
          title="Heading 3"
          aria-label="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnClass(editor.isActive('bold'))}
          title="Bold"
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnClass(editor.isActive('italic'))}
          title="Italic"
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={btnClass(editor.isActive('underline'))}
          title="Underline"
          aria-label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={btnClass(editor.isActive('strike'))}
          title="Strikethrough"
          aria-label="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={btnClass(editor.isActive({ textAlign: 'left' }))}
          title="Align left"
          aria-label="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={btnClass(editor.isActive({ textAlign: 'center' }))}
          title="Align center"
          aria-label="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={btnClass(editor.isActive({ textAlign: 'right' }))}
          title="Align right"
          aria-label="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          className={btnClass(editor.isActive({ textAlign: 'justify' }))}
          title="Justify"
          aria-label="Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}
          title="Bullet list"
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive('orderedList'))}
          title="Ordered list"
          aria-label="Ordered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnClass(editor.isActive('blockquote'))}
          title="Quote"
          aria-label="Blockquote"
        >
          <Quote className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={btnClass(editor.isActive('code'))}
          title="Inline code"
          aria-label="Inline code"
        >
          <Code className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={btnClass(editor.isActive('codeBlock'))}
          title="Code block with syntax highlighting"
          aria-label="Code block"
        >
          <Code2 className="h-4 w-4" />
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() => {
            setLinkUrl(editor.getAttributes('link').href || '');
            setLinkPromptOpen((v) => !v);
            setImagePromptOpen(false);
          }}
          className={btnClass(editor.isActive('link'))}
          title="Insert hyperlink"
          aria-label="Insert hyperlink"
        >
          <Link2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setImagePromptOpen((v) => !v);
            setLinkPromptOpen(false);
          }}
          className={btnClass(false)}
          title="Insert image"
          aria-label="Insert image"
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className={btnClass(editor.isActive('table'))}
          title="Insert 3x3 table"
          aria-label="Insert table"
        >
          <TableIcon className="h-4 w-4" />
        </button>

        {editor.isActive('table') && (
          <div className="ml-1 flex items-center gap-1 border-l border-slate-200 pl-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              +Row
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              +Col
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              Remove Table
            </button>
          </div>
        )}
      </div>

      {/* Inline Link Bar */}
      {linkPromptOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={applyLink}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Apply Link
          </button>
          <button
            type="button"
            onClick={() => setLinkPromptOpen(false)}
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline Image Bar */}
      {imagePromptOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Paste image URL (https://...)"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={applyImageUrl}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Embed URL
          </button>
          {onRequestImageUpload && (
            <button
              type="button"
              onClick={handleUploadInlineImage}
              className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Upload Image File
            </button>
          )}
          <button
            type="button"
            onClick={() => setImagePromptOpen(false)}
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="px-6 py-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function RichTextViewer({
  contentHtml,
  onEditorReady,
}: {
  contentHtml: string;
  onEditorReady?: (editor: Editor | null) => void;
}) {
  const editor = useEditor({
    editable: false,
    extensions: buildExtensions(''),
    content: contentHtml,
  });

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor && contentHtml !== editor.getHTML()) {
      editor.commands.setContent(contentHtml, { emitUpdate: false });
    }
  }, [contentHtml, editor]);

  if (!editor) return null;

  return <EditorContent editor={editor} />;
}
