import { Crepe } from '@milkdown/crepe';
import { parserCtx, serializerCtx, editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { imageURL, imageMarkdown } from './images.js';
import { importImageFiles } from './image-import.js';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import { focusDecorations } from './focus.js';
import { markdownProtection } from './safety.js';
import { Plugin } from '@milkdown/kit/prose/state';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { $prose, $view, replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './style.css';
(async () => {
const $ = id => document.getElementById(id);
const api = window.desktop;
const protection = document.createElement('div');
protection.id = 'protection'; protection.setAttribute('role', 'status');
protection.style.cssText = 'padding:12px 20px;background:#fff0ce;color:#654300;font-size:13px;line-height:1.6';
protection.hidden = true; $('editor').before(protection);
let editorRaw, imageToken, importing = false, composing = false;
document.addEventListener('compositionstart', () => { composing = true; }, true);
document.addEventListener('compositionend', () => { composing = false; }, true);
let name = '未命名.md', raw = '# 开始写作\n\n让想法在这里生长。输入 **Markdown**，即时看到排版。\n\n## 一个安静的写作空间\n\n- 使用顶部按钮打开和保存文件\n- 输入 `/` 插入标题、表格或代码块\n- 在源码与排版视图之间自由切换\n\n> 好的文字，始于一个简单的念头。\n\n## 今天的计划\n\n- [ ] 记录灵感\n- [ ] 写下第一段\n- [ ] 整理成篇\n', saved = raw, sourceMode = false, loading = true, busy = false;
const crepe = new Crepe({ root: '#editor', defaultValue: raw, features: { [Crepe.Feature.Latex]: true, [Crepe.Feature.ImageBlock]: false } });
crepe.editor.config(ctx => ctx.update(remarkStringifyOptionsCtx, options => ({ ...options, bullet: '-', listItemIndent: 'one' })));
crepe.editor.config(ctx => ctx.update(uploadConfig.key, options => ({ ...options, uploader: async (files, schema) => {
  if (busy || importing || composing) { $('status').textContent = '请完成当前操作后再插入图片'; return []; }
  importing = true;
  $('status').textContent = '正在保存图片附件…';
  try {
    const images = await importImageFiles(files, { api, token: imageToken, currentToken: () => imageToken });
    return images.map(image => schema.nodes.image.create(image));
  } catch (error) {
    $('status').textContent = error.message;
    return [];
  } finally { importing = false; }
} })));
crepe.editor.use($prose(() => new Plugin({
  props: { decorations: state => document.body.classList.contains('focus') ? focusDecorations(state) : null },
  view: () => ({ update(view, previous) {
    if (!loading && !sourceMode && !view.state.doc.eq(previous.doc)) {
      raw = crepe.getMarkdown(); editorRaw = raw; refresh();
    }
  } })
})));
crepe.editor.use($view(imageSchema.node, () => node => {
  const dom = document.createElement('img');
  const update = next => {
    if (next.type !== node.type) return false;
    dom.dataset.reaSrc = next.attrs.src;
    dom.alt = next.attrs.alt; dom.title = next.attrs.title;
    dom.src = imageURL(next.attrs.src, imageToken);
    return true;
  };
  dom.onerror = () => { $('status').textContent = `图片无法显示：${dom.dataset.reaSrc}`; };
  update(node);
  return { dom, update };
}));
await crepe.create();
editorRaw = raw;
loading = false;
function refresh() {
  const dirty = raw !== saved;
  $('status').textContent = dirty ? '尚未保存' : '无未保存修改';
  $('title').textContent = name + (dirty ? ' •' : '');
  document.title = `${name}${dirty ? ' •' : ''} — REA Markdown`;
  try {
    Promise.resolve(api?.dirty(dirty, raw)).catch(error => {
      $('status').textContent = `恢复副本更新失败：${error.message || error}`;
    });
  } catch (error) { $('status').textContent = `恢复副本更新失败：${error.message || error}`; }
  $('count').textContent = `${raw.replace(/\s/g, '').length} 字符 · ${raw.split('\n').length} 行`;
  $('outline').replaceChildren();
  let fenced = false, index = 0;
  for (const line of raw.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = !fenced && /^(#{1,6})\s+(.+)$/.exec(line);
    if (!match) continue;
    const n = index++, button = document.createElement('button');
    button.textContent = match[2]; button.style.paddingLeft = `${12 + (match[1].length - 1) * 12}px`;
    button.onclick = () => { if (!sourceMode) document.querySelectorAll('.milkdown h1,.milkdown h2,.milkdown h3,.milkdown h4,.milkdown h5,.milkdown h6')[n]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('outline').append(button);
  }
}
function checkProtection() {
  const reason = markdownProtection(raw, text => crepe.editor.action(ctx => {
    const parsed = ctx.get(parserCtx)(text);
    return parsed ? ctx.get(serializerCtx)(parsed) : null;
  }));
  protection.hidden = !reason;
  protection.textContent = reason === '当前排版引擎会改写的语法或格式'
    ? '源码保护：排版转换会改写源格式。为保留原文，当前使用源码模式，仍可编辑和保存。这不一定代表语法不受支持。'
    : (reason ? `源码保护：检测到${reason}，尚未确认排版编辑能完整保留。请在源码模式继续编辑和保存。` : '');
  return reason;
}
function showMode() {
  $('source').hidden = !sourceMode; $('editor').hidden = sourceMode;
  $('mode').textContent = sourceMode ? '排版' : '源码';
}
async function load(doc) {
  if (!doc) return;
  loading = true; imageToken = doc.path ? doc.imageToken : undefined; raw = doc.text; saved = doc.savedText ?? doc.text; name = doc.name;
  const protectedSource = checkProtection();
  // Every newly opened document starts with a separate undo history.
  crepe.editor.action(replaceAll('', true));
  crepe.editor.action(replaceAll(protectedSource ? '' : raw, true));
  editorRaw = protectedSource ? null : raw;
  $('source').value = raw;
  if (protectedSource) sourceMode = true;
  showMode(); loading = false; refresh();
  $('status').textContent = raw !== saved ? '已恢复未保存内容，请检查后保存' : (protectedSource ? '已载入 · 源码保护' : '已载入');
}
async function toggleSource() {
  if (sourceMode) {
    if (raw !== editorRaw && checkProtection()) {
      $('status').textContent = '已保留源码模式，详见上方保护提示';
      $('source').focus(); return false;
    }
    if (raw !== editorRaw) {
      loading = true;
      try { crepe.editor.action(replaceAll(raw)); editorRaw = raw; }
      finally { loading = false; }
    }
  } else $('source').value = raw;
  sourceMode = !sourceMode;
  showMode();
  if (sourceMode) $('source').focus();
  else crepe.editor.action(ctx => ctx.get(editorViewCtx).focus());
  return true;
}
$('source').addEventListener('input', () => { raw = $('source').value; refresh(); });
for (const kind of ['paste', 'drop']) $('source').addEventListener(kind, event => {
  const files = (event.clipboardData || event.dataTransfer)?.files;
  if (files?.length) {
    event.preventDefault();
    $('status').textContent = '请切换到排版模式粘贴或拖入图片，源码模式可使用顶部“图片”按钮';
  }
});
async function action(kind, file) {
  if (importing) { $('status').textContent = '图片正在导入，请稍后再操作'; return; }
  if (busy) return;
  if (composing && ['source', 'new', 'open', 'save', 'saveAs', 'pdf', 'image'].includes(kind)) {
    $('status').textContent = '请先完成当前输入法候选字，再执行操作'; return;
  }
  busy = true;
  try {
    if (kind === 'source') await toggleSource();
    else if (kind === 'theme') document.body.classList.toggle('dark');
    else if (kind === 'focus') {
      if (sourceMode) { $('status').textContent = '段落专注用于排版模式，请先切换到排版'; return; }
      document.body.classList.toggle('focus');
      crepe.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr); view.focus(); });
      $('status').textContent = document.body.classList.contains('focus') ? '段落专注已开启' : '段落专注已关闭';
    }
    else if (kind === 'find') { $('findbar').hidden = !$('findbar').hidden; if (!$('findbar').hidden) $('query').focus(); else await api?.find(''); }
    else if (!api) $('status').textContent = '请通过桌面应用使用文件功能';
    else if (kind === 'new') await load(await api.new());
    else if (kind === 'open') await load(await api.open(file));
    else if (kind === 'save' || kind === 'saveAs') {
      const snapshot = raw;
      const result = await api.save(snapshot, kind === 'saveAs');
      if (result) {
        name = result.name; saved = snapshot; imageToken = result.imageToken;
        document.querySelectorAll('#editor img[data-rea-src]').forEach(img => { img.src = imageURL(img.dataset.reaSrc, imageToken); });
        refresh(); $('status').textContent = '已保存';
      }
    } else if (kind === 'image') {
      const image = await api.pickImage();
      if (!image) return;
      if (sourceMode) {
        $('source').setRangeText(`\n\n${imageMarkdown(image)}\n\n`, $('source').selectionStart, $('source').selectionEnd, 'end');
        raw = $('source').value; refresh(); $('source').focus();
      } else crepe.editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create(image)).scrollIntoView());
        view.focus();
      });
    } else if (kind === 'folder') {
      const folder = await api.folder();
      if (folder) {
        $('files').replaceChildren();
        for (const entry of folder.files) { const b = document.createElement('button'); b.textContent = entry.name; b.onclick = () => action('open', entry.path); $('files').append(b); }
        $('status').textContent = `${folder.name} · ${folder.files.length} 个文件（当前层级）`;
      }
    } else if (kind === 'pdf') {
      if (sourceMode && !(await toggleSource())) { $('status').textContent = '源码保护文档暂不支持排版 PDF 导出'; return; }
      const focused = document.body.classList.contains('focus');
      if (focused) document.body.classList.toggle('focus');
      try { $('status').textContent = await api.pdf() ? 'PDF 已导出' : '已取消导出'; }
      finally { if (focused) document.body.classList.toggle('focus'); }
    }
  } catch (error) { $('status').textContent = error.message; }
  finally { busy = false; }
}
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => action(button.dataset.action));
$('find-next').onclick = () => api?.find($('query').value);
$('query').onkeydown = e => { if (e.key === 'Enter') api?.find($('query').value); };
api?.onAction(action);
api?.onDocument(doc => load(doc));
refresh();
await api?.ready();

})().catch(error => { document.getElementById("status").textContent = "编辑器加载失败：" + error.message; });
