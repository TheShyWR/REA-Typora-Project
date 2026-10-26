import { Plugin } from '@milkdown/kit/prose/state';

export function centerCaret(view, container, enabled) {
  if (!enabled || view.composing || !view.hasFocus() || !view.state.selection.empty) return;
  const caret = view.coordsAtPos(view.state.selection.head);
  const rect = container.getBoundingClientRect();
  const find = container.querySelector('#findbar');
  const inset = find && !find.hidden ? find.getBoundingClientRect().height : 0;
  const center = rect.top + inset + (container.clientHeight - inset) / 2;
  container.scrollTop += (caret.top + caret.bottom) / 2 - center;
}

export function typewriterPlugin(container, enabled) {
  return new Plugin({
    view(view) {
      let frame, dragging = false;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { if (!dragging) centerCaret(view, container, enabled()); });
      };
      const down = () => { dragging = true; };
      const up = () => { dragging = false; schedule(); };
      const observer = new ResizeObserver(() => {
        container.style.setProperty('--typewriter-space', `${container.clientHeight / 2}px`);
        schedule();
      });
      observer.observe(container);
      view.dom.addEventListener('focus', schedule);
      view.dom.addEventListener('compositionend', schedule);
      view.dom.addEventListener('pointerdown', down);
      window.addEventListener('pointerup', up);
      return {
        update: schedule,
        destroy() {
          cancelAnimationFrame(frame); observer.disconnect();
          view.dom.removeEventListener('focus', schedule);
          view.dom.removeEventListener('compositionend', schedule);
          view.dom.removeEventListener('pointerdown', down);
          window.removeEventListener('pointerup', up);
        }
      };
    }
  });
}
