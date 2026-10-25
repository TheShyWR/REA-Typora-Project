// Preserve original Markdown whenever the rich-text model cannot round-trip it.
export function markdownProtection(text, roundTrip) {
  const content = text.replace(/^\uFEFF/, '');
  if (/^(?:---|\+\+\+)[ \t]*\r?\n/.test(content)) return 'Front Matter 元数据';
  // Ignore fenced code when checking Markdown/HTML-like constructs.
  let fence = null;
  const visible = content.split(/\r?\n/).filter(line => {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
      return false;
    }
    return !fence;
  }).join('\n');
  if (/\[\^[^\]\n]+\]/.test(visible)) return '脚注';
  if (/<(?:!--|\/?[A-Za-z][\w:-]*(?:\s[^>]*|\s*\/?)>|![A-Z]|\?)/.test(visible)) return 'HTML 或自定义标签';
  if (/^\s*(?::::|\$\$\$)/m.test(visible)) return '自定义扩展块';
  if (text.startsWith('\uFEFF') || text.includes('\r')) return 'BOM 或原始换行格式';
  try {
    const rendered = roundTrip(text);
    // Only a final newline may differ. Everything else is intentionally conservative.
    if (typeof rendered !== 'string' || rendered.replace(/\n$/, '') !== text.replace(/\n$/, '')) {
      return '当前排版引擎会改写的语法或格式';
    }
  } catch { return '当前排版引擎无法解析的语法'; }
  return null;
}
