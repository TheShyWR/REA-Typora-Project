import remarkFrontmatter from 'remark-frontmatter';
import { $node, $remark } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';

// Recognize only closed, document-leading YAML. Other formats remain protected.
export function frontMatterPrefix(text) {
  return text.match(/^---[ \t]*\n(?:[\s\S]*?\n)?---[ \t]*(?:\n|$)/)?.[0] || '';
}
export const frontMatterSpec = {
  group: 'block', content: 'text*', marks: '', code: true, defining: true, isolating: true,
  parseDOM: [{ tag: 'pre[data-rea-frontmatter]', preserveWhitespace: 'full' }],
  toDOM: () => ['pre', { 'data-rea-frontmatter': '', 'aria-label': 'YAML Front Matter' }, ['code', 0]],
  parseMarkdown: {
    match: node => node.type === 'yaml',
    runner: (state, node, type) => { state.openNode(type); if (node.value) state.addText(node.value); state.closeNode(); }
  },
  toMarkdown: {
    match: node => node.type.name === 'front_matter',
    runner: (state, node) => state.addNode('yaml', undefined, node.textContent)
  }
};
export const frontMatterNode = $node('front_matter', () => frontMatterSpec);
export const frontMatterRemark = $remark('reaFrontMatter', () => remarkFrontmatter, ['yaml']);
export const frontMatterError = 'YAML 元数据须保持在文首且仅有一块；块内独立的 --- 或 ... 请在源码模式编辑。';
export function validFrontMatter(doc) {
  let found = false, valid = true;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'front_matter') return;
    if (found || pos !== 0 || doc.firstChild !== node || /^(?:---|\.\.\.)[ \t]*$/m.test(node.textContent)) valid = false;
    found = true; return false;
  });
  return valid;
}
export function frontMatterGuard(report) {
  return new Plugin({ filterTransaction: tr => {
    if (!tr.docChanged || validFrontMatter(tr.doc)) return true;
    report(frontMatterError); return false;
  } });
}
