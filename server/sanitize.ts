const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  'span', 'div',
]);

const STRIP_CONTENT_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'textarea'];

function isSafeUrl(rawUrl: string, allowDataImage: boolean): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/files/') || trimmed.startsWith('/api/public/')) {
    return true;
  }
  if (allowDataImage && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeRichHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let html = input;

  // Remove dangerous tags together with their contents
  for (const tag of STRIP_CONTENT_TAGS) {
    const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    html = html.replace(regex, '');
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    html = html.replace(selfClosing, '');
  }

  // Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Filter tags and attributes
  html = html.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (fullMatch, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }
    if (fullMatch.startsWith('</')) {
      return `</${tag}>`;
    }

    const keptAttrs: string[] = [];
    const attrRegex = /([a-zA-Z0-9-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = match[1].toLowerCase();
      const attrVal = match[2] ?? match[3] ?? match[4] ?? '';

      // Strip all event handlers
      if (attrName.startsWith('on')) continue;

      if (tag === 'a' && attrName === 'href') {
        if (isSafeUrl(attrVal, false)) {
          keptAttrs.push(`href="${attrVal.replace(/"/g, '&quot;')}"`);
          keptAttrs.push('rel="noopener noreferrer"');
          keptAttrs.push('target="_blank"');
        }
      } else if (tag === 'img' && attrName === 'src') {
        if (isSafeUrl(attrVal, true)) {
          keptAttrs.push(`src="${attrVal.replace(/"/g, '&quot;')}"`);
        }
      } else if (tag === 'img' && (attrName === 'alt' || attrName === 'title')) {
        keptAttrs.push(`${attrName}="${attrVal.replace(/"/g, '&quot;')}"`);
      } else if ((tag === 'td' || tag === 'th') && (attrName === 'colspan' || attrName === 'rowspan')) {
        const num = parseInt(attrVal, 10);
        if (!Number.isNaN(num) && num >= 1 && num <= 20) {
          keptAttrs.push(`${attrName}="${num}"`);
        }
      } else if (attrName === 'class') {
        // Allow only language-* classes on code blocks
        const safeClasses = attrVal
          .split(/\s+/)
          .filter((c) => /^language-[a-zA-Z0-9_-]+$/.test(c));
        if (safeClasses.length > 0) {
          keptAttrs.push(`class="${safeClasses.join(' ')}"`);
        }
      } else if (attrName === 'style') {
        // Allow only safe text-align styles from TipTap TextAlign
        const alignMatch = attrVal.match(/text-align:\s*(left|center|right|justify)/i);
        if (alignMatch) {
          keptAttrs.push(`style="text-align: ${alignMatch[1].toLowerCase()}"`);
        }
      }
    }

    const selfClose = fullMatch.endsWith('/>') || tag === 'br' || tag === 'hr' || tag === 'img' ? ' /' : '';
    return keptAttrs.length > 0
      ? `<${tag} ${keptAttrs.join(' ')}${selfClose}>`
      : `<${tag}${selfClose}>`;
  });

  return html;
}

export function extractPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeReadingMetrics(html: string): {
  plainText: string;
  excerpt: string;
  wordCount: number;
  readingTimeMinutes: number;
} {
  const plainText = extractPlainText(html);
  const words = plainText ? plainText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
  const excerpt = plainText.length > 180 ? `${plainText.slice(0, 177).trim()}...` : plainText;
  return { plainText, excerpt, wordCount, readingTimeMinutes };
}
