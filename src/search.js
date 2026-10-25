import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

export function textMatches(text, query, caseSensitive = false) {
  if (!query) return [];
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'gu' : 'giu');
  return Array.from(text.matchAll(expression), match => ({ from: match.index, to: match.index + match[0].length }));
}

// Adjacent text nodes may have different marks. Never join across blocks or images.
export function documentMatches(doc, query, caseSensitive = false) {
  if (!query) return [];
  const matches = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let text = '', start = pos + 1;
    const flush = () => {
      matches.push(...textMatches(text, query, caseSensitive).map(match => ({ from: start + match.from, to: start + match.to })));
      text = '';
    };
    node.forEach((child, offset) => {
      if (child.isText) { if (!text) start = pos + 1 + offset; text += child.text; }
      else flush();
    });
    flush(); return false;
  });
  return matches;
}

export function replaceTextMatches(text, matches, replacement) {
  for (const match of [...matches].reverse()) text = text.slice(0, match.from) + replacement + text.slice(match.to);
  return text;
}

export function replaceDocumentMatches(state, matches, replacement) {
  const tr = state.tr;
  for (const match of [...matches].reverse()) tr.insertText(replacement, match.from, match.to);
  return tr;
}

export const searchKey = new PluginKey('rea-search');
export function searchPlugin(changed) {
  return new Plugin({
    key: searchKey,
    state: {
      init: () => ({ query: '', caseSensitive: false, matches: [], index: 0 }),
      apply(tr, previous) {
        const update = tr.getMeta(searchKey);
        if (!update && !tr.docChanged) return previous;
        const next = { ...previous, ...update };
        next.matches = documentMatches(tr.doc, next.query, next.caseSensitive);
        next.index = Math.max(0, Math.min(next.index, next.matches.length - 1));
        return next;
      }
    },
    props: {
      decorations(state) {
        const { matches, index } = searchKey.getState(state);
        return DecorationSet.create(state.doc, matches.map((match, i) => Decoration.inline(match.from, match.to, { class: i === index ? 'search-match search-current' : 'search-match' })));
      }
    },
    view: () => ({ update: () => changed() })
  });
}
