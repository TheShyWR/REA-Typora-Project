// Use the editor's Markdown AST; code examples and ordinary links are not images.
export function imageTransferPlan(text, parse) {
  try {
    const tree = parse(text), definitions = new Map(), references = [], sources = new Set();
    let issue = '';
    function visit(node) {
      if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
      if (node.type === 'image') sources.add(node.url);
      if (node.type === 'imageReference') references.push(node.identifier);
      if (node.type === 'html' && /<(?:img|picture|source)\b/i.test(node.value)) issue = 'HTML 图片暂不支持自动复制，请手动处理，或取消“同时复制本地相对图片”。';
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
    for (const id of references) { if (definitions.has(id)) sources.add(definitions.get(id)); }
    if (sources.size && /^\uFEFF?(?:---|\+\+\+)[ \t]*\r?\n/.test(text)) issue = '含 Front Matter 的图片路径尚未验证，暂不自动复制；可手动处理或取消图片复制。';
    return { sources: [...sources], issue };
  } catch { return { sources: [], issue: '无法可靠识别图片链接，暂不自动复制；可取消图片复制，仅保存文档。' }; }
}
