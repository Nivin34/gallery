import type { JSONContent } from '@tiptap/react';
import type { NoteImageItem, NoteStatus, Visibility } from '../types';

function escapeMarkdownTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n+/g, '<br>').trim();
}

function wrapWithFence(code: string, language?: string): string {
  const matches = code.match(/`+/g) || [];
  const maxRun = matches.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxRun + 1));
  const lang = (language || '').trim();
  return `${fence}${lang}\n${code}\n${fence}`;
}

function wrapInlineCode(text: string): string {
  const matches = text.match(/`+/g) || [];
  const maxRun = matches.reduce((max, run) => Math.max(max, run.length), 0);
  const ticks = '`'.repeat(maxRun + 1);
  const needsPad = text.startsWith('`') || text.endsWith('`');
  return needsPad ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
}

function applyMarks(text: string, marks?: JSONContent['marks']): string {
  if (!marks || marks.length === 0) return text;

  const hasCode = marks.some((m) => m.type === 'code');
  if (hasCode) {
    let out = wrapInlineCode(text);
    const linkMark = marks.find((m) => m.type === 'link');
    if (linkMark?.attrs?.href) {
      out = `[${out}](${String(linkMark.attrs.href)})`;
    }
    return out;
  }

  // Preserve leading/trailing whitespace outside emphasis markers for valid CommonMark
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = match?.[1] || '';
  const core = match?.[2] || '';
  const trail = match?.[3] || '';

  if (!core) return text;

  let formatted = core;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        formatted = `**${formatted}**`;
        break;
      case 'italic':
        formatted = `*${formatted}*`;
        break;
      case 'strike':
        formatted = `~~${formatted}~~`;
        break;
      case 'underline':
        formatted = `<u>${formatted}</u>`;
        break;
      case 'link': {
        const href = String(mark.attrs?.href || '').trim();
        const title = mark.attrs?.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : '';
        if (href) {
          formatted = `[${formatted}](${href}${title})`;
        }
        break;
      }
      default:
        break;
    }
  }

  return `${lead}${formatted}${trail}`;
}

function serializeInlineNodes(nodes?: JSONContent[]): string {
  if (!nodes || nodes.length === 0) return '';

  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return applyMarks(node.text || '', node.marks);
      }
      if (node.type === 'hardBreak') {
        return '  \n';
      }
      if (node.type === 'image') {
        const src = String(node.attrs?.src || '');
        const alt = String(node.attrs?.alt || '').replace(/[\[\]]/g, '');
        const title = node.attrs?.title
          ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"`
          : '';
        return src ? `![${alt}](${src}${title})` : '';
      }
      if (node.content) {
        return serializeInlineNodes(node.content);
      }
      return '';
    })
    .join('');
}

function serializeTable(node: JSONContent): string {
  const rows = node.content || [];
  if (rows.length === 0) return '';

  const matrix: string[][] = [];
  let hasHeaderRow = false;

  rows.forEach((row, rowIdx) => {
    const cells = row.content || [];
    const rowValues: string[] = [];
    cells.forEach((cell) => {
      if (rowIdx === 0 && cell.type === 'tableHeader') {
        hasHeaderRow = true;
      }
      const cellText = (cell.content || [])
        .map((block) => serializeInlineNodes(block.content))
        .filter(Boolean)
        .join(' ');
      rowValues.push(escapeMarkdownTableCell(cellText));
    });
    if (rowValues.length > 0) {
      matrix.push(rowValues);
    }
  });

  if (matrix.length === 0) return '';

  const colCount = Math.max(...matrix.map((r) => r.length));
  const normalizeRow = (r: string[]) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push('');
    return `| ${padded.join(' | ')} |`;
  };

  const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
  const lines: string[] = [];

  if (hasHeaderRow) {
    lines.push(normalizeRow(matrix[0]));
    lines.push(separator);
    for (let i = 1; i < matrix.length; i += 1) {
      lines.push(normalizeRow(matrix[i]));
    }
  } else {
    lines.push(normalizeRow(Array(colCount).fill('')));
    lines.push(separator);
    for (const row of matrix) {
      lines.push(normalizeRow(row));
    }
  }

  return lines.join('\n');
}

function serializeList(node: JSONContent, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth);
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  const items = node.content || [];

  return items
    .map((item, idx) => {
      const marker = ordered ? `${start + idx}.` : '-';
      const children = item.content || [];
      if (children.length === 0) {
        return `${indent}${marker} `;
      }

      const renderedParts: string[] = [];
      children.forEach((child, childIdx) => {
        if (child.type === 'bulletList') {
          renderedParts.push(serializeList(child, false, depth + 1));
        } else if (child.type === 'orderedList') {
          renderedParts.push(serializeList(child, true, depth + 1));
        } else {
          const blockText = serializeBlockNode(child, depth + 1);
          if (childIdx === 0) {
            const firstLines = blockText.split('\n');
            renderedParts.push(`${indent}${marker} ${firstLines[0] || ''}`);
            for (let i = 1; i < firstLines.length; i += 1) {
              renderedParts.push(`${indent}  ${firstLines[i]}`);
            }
          } else if (blockText) {
            const indented = blockText
              .split('\n')
              .map((line) => (line ? `${indent}  ${line}` : ''))
              .join('\n');
            renderedParts.push(indented);
          }
        }
      });

      return renderedParts.join('\n');
    })
    .join('\n');
}

function serializeBlockNode(node: JSONContent, listDepth = 0): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level || 1)));
      const content = serializeInlineNodes(node.content).trim();
      return `${'#'.repeat(level)} ${content}`;
    }
    case 'paragraph': {
      return serializeInlineNodes(node.content);
    }
    case 'blockquote': {
      const inner = (node.content || [])
        .map((child) => serializeBlockNode(child, listDepth))
        .filter((s) => s.length > 0)
        .join('\n\n');
      return inner
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'codeBlock': {
      const code = (node.content || []).map((c) => c.text || '').join('');
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return wrapWithFence(code, lang);
    }
    case 'bulletList':
      return serializeList(node, false, listDepth);
    case 'orderedList':
      return serializeList(node, true, listDepth);
    case 'horizontalRule':
      return '---';
    case 'image': {
      const src = String(node.attrs?.src || '');
      const alt = String(node.attrs?.alt || '').replace(/[\[\]]/g, '');
      const title = node.attrs?.title
        ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"`
        : '';
      return src ? `![${alt}](${src}${title})` : '';
    }
    case 'table':
      return serializeTable(node);
    default: {
      if (node.content) {
        return node.content.map((c) => serializeBlockNode(c, listDepth)).join('\n\n');
      }
      return node.text || '';
    }
  }
}

export function serializeTipTapJsonToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return '';
  const blocks = doc.content
    .map((node) => serializeBlockNode(node, 0))
    .filter((block) => block.trim().length > 0);
  return blocks.join('\n\n').trim();
}

export function fallbackHtmlToMarkdown(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const walkInline = (el: Node): string => {
    if (el.nodeType === Node.TEXT_NODE) {
      return el.textContent || '';
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return '';
    const elem = el as HTMLElement;
    const tag = elem.tagName.toLowerCase();
    const inner = Array.from(elem.childNodes).map(walkInline).join('');

    switch (tag) {
      case 'strong':
      case 'b':
        return inner.trim() ? `**${inner.trim()}**` : inner;
      case 'em':
      case 'i':
        return inner.trim() ? `*${inner.trim()}*` : inner;
      case 's':
      case 'del':
        return inner.trim() ? `~~${inner.trim()}~~` : inner;
      case 'u':
        return inner.trim() ? `<u>${inner}</u>` : inner;
      case 'code':
        return wrapInlineCode(inner);
      case 'a': {
        const href = elem.getAttribute('href') || '';
        return href ? `[${inner || href}](${href})` : inner;
      }
      case 'br':
        return '  \n';
      case 'img': {
        const src = elem.getAttribute('src') || '';
        const alt = elem.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
      }
      default:
        return inner;
    }
  };

  const blocks: string[] = [];
  for (const child of Array.from(doc.body.children)) {
    const tag = child.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = walkInline(child).trim();
      if (text) blocks.push(`${'#'.repeat(level)} ${text}`);
    } else if (tag === 'pre') {
      const codeEl = child.querySelector('code');
      const langClass = codeEl?.className.match(/language-([a-z0-9_-]+)/i)?.[1] || '';
      const codeText = codeEl?.textContent ?? child.textContent ?? '';
      blocks.push(wrapWithFence(codeText, langClass));
    } else if (tag === 'blockquote') {
      const text = (child.textContent || '').trim();
      if (text) {
        blocks.push(
          text
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        );
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      const items = Array.from(child.querySelectorAll(':scope > li'))
        .map((li, i) => `${ordered ? `${i + 1}.` : '-'} ${walkInline(li).trim()}`)
        .join('\n');
      if (items) blocks.push(items);
    } else if (tag === 'hr') {
      blocks.push('---');
    } else {
      const text = walkInline(child).trim();
      if (text) blocks.push(text);
    }
  }

  return blocks.join('\n\n').trim();
}

export interface NoteMarkdownExportInput {
  title: string;
  tags: string[];
  status: NoteStatus;
  visibility: Visibility;
  updatedAt?: string;
  images?: NoteImageItem[];
  tiptapJson?: JSONContent | null;
  fallbackHtml?: string;
}

export function buildNoteMarkdownDocument(input: NoteMarkdownExportInput): string {
  const safeTitle = input.title.trim() || 'Untitled Note';
  const cleanTags = input.tags.map((t) => t.trim()).filter(Boolean);

  const frontmatterLines = [
    '---',
    `title: "${safeTitle.replace(/"/g, '\\"')}"`,
    `status: ${input.status}`,
    `visibility: ${input.visibility}`,
  ];
  if (cleanTags.length > 0) {
    frontmatterLines.push(
      `tags: [${cleanTags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]`
    );
  }
  if (input.updatedAt) {
    frontmatterLines.push(`updated: ${input.updatedAt}`);
  }
  frontmatterLines.push('---');

  const sections: string[] = [frontmatterLines.join('\n'), `# ${safeTitle}`];

  if (input.images && input.images.length > 0) {
    const ordered = [...input.images].sort((a, b) => a.order - b.order);
    const imageLines = ['## Image Collection'];
    ordered.forEach((img, index) => {
      const alt = (img.caption || img.fileName || `Image ${index + 1}`).replace(/[\[\]]/g, '');
      const marker = img.marked ? ' [Marked]' : '';
      imageLines.push(`### ${index + 1}. ${img.fileName}${marker}`);
      imageLines.push(`![${alt}](${img.src})`);
      if (img.caption.trim()) {
        imageLines.push(`*${img.caption.trim()}*`);
      }
    });
    sections.push(imageLines.join('\n\n'));
  }

  const bodyMarkdown = input.tiptapJson
    ? serializeTipTapJsonToMarkdown(input.tiptapJson)
    : fallbackHtmlToMarkdown(input.fallbackHtml || '');

  if (bodyMarkdown) {
    sections.push(bodyMarkdown);
  }

  return `${sections.join('\n\n')}\n`;
}

export function slugifyMarkdownFilename(title: string): string {
  const base = (title || 'untitled-note')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'untitled-note'}.md`;
}

export function downloadMarkdownFile(filename: string, markdownContent: string): void {
  const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
