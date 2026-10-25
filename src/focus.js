import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

// Highlight every text block touched by the current selection, including nested lists.
export function focusDecorations(state) {
  const { from, to } = state.selection;
  const dimmed = [];
  state.doc.descendants((node, position) => {
    if (node.isTextblock && (to < position || from > position + node.nodeSize)) {
      dimmed.push(Decoration.node(position, position + node.nodeSize, { class: 'rea-unfocused' }));
    }
  });
  return DecorationSet.create(state.doc, dimmed);
}
