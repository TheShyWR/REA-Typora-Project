// DOM URLs are separate from the Markdown model so file paths survive saving.
export function imageURL(source, token) {
  if (/^(https:|data:image\/)/i.test(source)) return source;
  if (!source || !token) return '';
  return `rea-image://${token}/?src=${encodeURIComponent(source)}`;
}

export function imageMarkdown({ src, alt }) {
  return `![${alt.replace(/[\\[\]]/g, '\\$&')}](${src})`;
}
