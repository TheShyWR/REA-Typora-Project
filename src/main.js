import { createWritingSettings, defaultWritingSettings } from './writing-settings.js';
import { typewriterPlugin } from './typewriter.js';
import { Crepe } from '@milkdown/crepe';
import { parserCtx, serializerCtx, editorViewCtx, remarkCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { createFileTree } from './file-tree.js';
import { createWorkspaceSearch } from './workspace-search.js';
import { imageURL, imageMarkdown } from './images.js';
import { imageTransferPlan } from './image-transfer.js';
import { importImageFiles } from './image-import.js';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import { focusDecorations } from './focus.js';
import { markdownProtection } from './safety.js';
import { frontMatterNode, frontMatterRemark, frontMatterGuard, frontMatterPrefix, validFrontMatter, frontMatterError } from './front-matter.js';
import { textMatches, documentMatches, replaceTextMatches, replaceDocumentMatches, searchKey, searchPlugin } from './search.js';
import { closeHistory } from '@milkdown/kit/prose/history';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { $prose, $view, replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './style.css';
(async () => {
const $ = id => document.getElementById(id);
const api = window.desktop;
const fileTree = createFileTree($('files'), { list: path => api.listFolder(path), open: path => action('open', path), report: text => { $('status').textContent = text; } });
const workspaceSearch = createWorkspaceSearch({ panel: $('workspace-search'), query: $('workspace-query'), matchCase: $('workspace-case'), run: $('workspace-run'), close: $('workspace-close'), summary: $('workspace-summary'), results: $('workspace-results') }, { search: (query, matchCase) => api.searchWorkspace(query, matchCase), open: row => action('openSearch', row) });
const protection = document.createElement('div');
protection.id = 'protection'; protection.setAttribute('role', 'status');
protection.style.cssText = 'padding:12px 20px;background:#fff0ce;color:#654300;font-size:13px;line-height:1.6';
protection.hidden = true; $('editor').before(protection);
let editorRaw, imageToken, importing = false, composing = false, sourceSearchIndex = 0;
let documentRevision = 0;
let currentPath, workspacePath, pendingFilesChange = false, checkingFiles = false;
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
  } finally { importing = false; if (pendingFilesChange) void checkFiles(); }
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
crepe.editor.use(frontMatterRemark).use(frontMatterNode);
crepe.editor.use($prose(() => frontMatterGuard(message => { $('status').textContent = message; })));
crepe.editor.use($prose(() => searchPlugin(renderSearch)));
crepe.editor.use($prose(() => typewriterPlugin(document.querySelector('main'), () => !loading && !sourceMode && !composing && document.body.classList.contains('typewriter') && !document.body.classList.contains('exporting'))));
await crepe.create();
editorRaw = raw;
loading = false;
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const settings = createWritingSettings({
  read: () => api ? api.preferences() : Promise.resolve({ ...defaultWritingSettings }),
  write: value => api ? api.savePreferences(value) : Promise.resolve(value),
  apply: applyWritingSettings, report: text => { $('settings-status').textContent = text; $('status').textContent = text; }
});
function applyWritingSettings(value) {
  document.body.classList.toggle('dark', value.theme === 'dark' || (value.theme === 'system' && systemTheme.matches));
  document.body.classList.toggle('typewriter', value.typewriter && !sourceMode);
  const fonts = { system: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif", serif: "'Songti SC', Georgia, serif", mono: 'ui-monospace, Menlo, monospace' };
  const style = document.documentElement.style;
  style.setProperty('--writing-font', fonts[value.fontFamily]);
  style.setProperty('--writing-size', `${value.fontSize}px`);
  style.setProperty('--writing-line-height', value.lineHeight);
  style.setProperty('--writing-width', `${value.contentWidth}px`);
  for (const key of Object.keys(defaultWritingSettings)) {
    const field = $('pref-' + key);
    if (key === 'typewriter') field.checked = value[key]; else field.value = value[key];
  }
  $('typewriter-toggle').setAttribute('aria-pressed', String(value.typewriter && !sourceMode));
  const view = editorView(); view.dispatch(view.state.tr.setMeta('addToHistory', false));
}
systemTheme.addEventListener('change', () => applyWritingSettings(settings.value));
await settings.load();
for (const field of $('preferences').querySelectorAll('select,input')) field.onchange = async () => {
  const value = {};
  for (const [key, initial] of Object.entries(defaultWritingSettings)) {
    const input = $('pref-' + key);
    value[key] = typeof initial === 'boolean' ? input.checked : typeof initial === 'number' ? Number(input.value) : input.value;
  }
  const controls = $('preferences').querySelectorAll('select,input,button');
  controls.forEach(control => { control.disabled = true; });
  if (await settings.change(value)) $('settings-status').textContent = '设置已保存';
  else applyWritingSettings(settings.value);
  controls.forEach(control => { control.disabled = false; });
};
$('preferences').addEventListener('close', () => focusEditor());
function refresh(syncDraft = true) {
  renderSearch();
  const dirty = raw !== saved;
  $('status').textContent = dirty ? '尚未保存' : '无未保存修改';
  $('title').textContent = name + (dirty ? ' •' : '');
  document.title = `${name}${dirty ? ' •' : ''} — REA Markdown`;
  try {
    Promise.resolve(syncDraft ? api?.dirty(dirty, raw) : undefined).catch(error => {
      $('status').textContent = `恢复副本更新失败：${error.message || error}`;
    });
  } catch (error) { $('status').textContent = `恢复副本更新失败：${error.message || error}`; }
  $('count').textContent = `${raw.replace(/\s/g, '').length} 字符 · ${raw.split('\n').length} 行`;
  $('outline').replaceChildren();
  let fenced = false, index = 0;
  for (const line of raw.slice(frontMatterPrefix(raw).length).split('\n')) {
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
  document.body.classList.toggle('typewriter', settings.value.typewriter && !sourceMode);
  $('typewriter-toggle').setAttribute('aria-pressed', String(settings.value.typewriter && !sourceMode));
  syncSearch();
}
async function load(doc) {
  if (!doc) return;
  documentRevision++; currentPath = doc.path; $('external-change').hidden = true;
  fileTree.setActive(doc.path);
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
function sourceText() {
  const value = $('source').value;
  return saved.includes('\r\n') && !saved.replace(/\r\n/g, '').includes('\n') ? value.replace(/\n/g, '\r\n') : value;
}
$('source').addEventListener('input', () => { raw = sourceText(); refresh(); });
for (const kind of ['paste', 'drop']) $('source').addEventListener(kind, event => {
  const files = (event.clipboardData || event.dataTransfer)?.files;
  if (files?.length) {
    event.preventDefault();
    $('status').textContent = '请切换到排版模式粘贴或拖入图片，源码模式可使用顶部“图片”按钮';
  }
});
async function action(kind, file) {
  if ($('preferences').open && !['preferences', 'closePreferences', 'resetPreferences'].includes(kind)) return;
  if (importing) { $('status').textContent = '图片正在导入，请稍后再操作'; return; }
  if (busy) return;
  if (composing && ['source', 'new', 'open', 'save', 'saveAs', 'pdf', 'image', 'find', 'findNext', 'findPrevious', 'replace', 'replaceOne', 'replaceAll', 'rename', 'reload', 'workspaceSearch', 'openSearch', 'preferences', 'typewriter', 'frontMatter', 'createDocument', 'createFolder'].includes(kind)) {
    $('status').textContent = '请先完成当前输入法候选字，再执行操作'; return;
  }
  busy = true;
  try {
    if (kind === 'source') await toggleSource();
    else if (kind === 'frontMatter') {
      if (sourceMode && !(await toggleSource())) return;
      const view = editorView();
      if (view.state.doc.firstChild?.type.name === 'front_matter') {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).scrollIntoView().setMeta('addToHistory', false));
      } else {
        const node = view.state.schema.nodes.front_matter.create(null, view.state.schema.text('title: 无标题'));
        const tr = view.state.tr.insert(0, node);
        view.dispatch(closeHistory(tr).setSelection(TextSelection.create(tr.doc, 1 + node.content.size)).scrollIntoView());
        view.dispatch(closeHistory(view.state.tr).setMeta('addToHistory', false));
      }
      view.focus(); $('status').textContent = '可编辑 YAML 元数据；⌘Enter 返回正文。元数据配置不会自动执行。';
    }
    else if (kind === 'preferences') { $('settings-status').textContent = ''; $('preferences').showModal(); }
    else if (kind === 'closePreferences') $('preferences').close();
    else if (kind === 'resetPreferences') {
      if (await settings.change(defaultWritingSettings)) $('settings-status').textContent = '已恢复默认写作设置';
    }
    else if (kind === 'theme') await settings.change({ theme: document.body.classList.contains('dark') ? 'light' : 'dark' });
    else if (kind === 'typewriter') {
      if (sourceMode) { $('status').textContent = '打字机模式用于排版编辑，请先切换到排版'; return; }
      if (await settings.change({ typewriter: !settings.value.typewriter })) {
        focusEditor(); $('status').textContent = settings.value.typewriter ? '打字机模式已开启' : '打字机模式已关闭';
      }
    }
    else if (kind === 'focus') {
      if (sourceMode) { $('status').textContent = '段落专注用于排版模式，请先切换到排版'; return; }
      document.body.classList.toggle('focus');
      crepe.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr); view.focus(); });
      $('status').textContent = document.body.classList.contains('focus') ? '段落专注已开启' : '段落专注已关闭';
    }
    else if (kind === 'workspaceSearch') workspaceSearch.show();
    else if (kind === 'closeWorkspaceSearch') { workspaceSearch.close(); focusEditor(); }
    else if (kind === 'find' || kind === 'replace') {
      $('findbar').hidden = false; syncSearch();
      const field = $(kind === 'replace' ? 'replacement' : 'query'); field.focus(); field.select();
    }
    else if (kind === 'closeFind') { $('findbar').hidden = true; syncSearch(); focusEditor(); }
    else if (kind === 'findNext' || kind === 'findPrevious') navigateSearch(kind === 'findNext' ? 1 : -1);
    else if (kind === 'replaceOne' || kind === 'replaceAll') replaceSearch(kind === 'replaceAll');
    else if (!api) $('status').textContent = '请通过桌面应用使用文件功能';
    else if (kind === 'createDocument' || kind === 'createFolder') {
      const created = await api[kind]();
      if (!created) return;
      if (kind === 'createDocument') await load(created);
      await fileTree.refresh(true);
      if (kind === 'createDocument') await fileTree.reveal();
      $('status').textContent = kind === 'createDocument' ? '文档已创建并打开' : '文件夹已创建：' + created.name;
    }
    else if (kind === 'new') await load(await api.new());
    else if (kind === 'open') await load(await api.open(file));
    else if (kind === 'openSearch') {
      const doc = await api.openSearch(file.path);
      if (!doc) return;
      await load(doc);
      if (doc.searchFingerprint !== file.fingerprint) { $('status').textContent = '文件内容已变化，已打开当前版本，请重新搜索后定位'; return; }
      sourceMode = true; $('source').value = raw; showMode();
      $('source').focus(); $('source').setSelectionRange(file.from, file.to);
      const lineHeight = parseFloat(getComputedStyle($('source')).lineHeight);
      $('source').scrollTop = Math.max(0, (file.line - 3) * lineHeight);
      $('status').textContent = `已定位到源码第 ${file.line} 行`;
    }
    else if (kind === 'reload') await load(await api.reload(currentPath));
    else if (kind === 'rename') {
      if (!currentPath || raw !== saved) { $('status').textContent = '请先保存文档和修改，再重命名'; return; }
      const result = await api.rename();
      if (result) {
        documentRevision++; currentPath = result.path; name = result.name; imageToken = result.imageToken;
        fileTree.setActive(currentPath); $('external-change').hidden = true;
        document.querySelectorAll('#editor img[data-rea-src]').forEach(img => { img.src = imageURL(img.dataset.reaSrc, imageToken); });
        refresh(); await fileTree.refresh(true); $('status').textContent = '文件已重命名，现有图片链接保持不变';
      }
    }
    else if (kind === 'save' || kind === 'saveAs') {
      const snapshot = raw;
      const plan = kind === 'saveAs' ? imageTransferPlan(snapshot, text => crepe.editor.action(ctx => ctx.get(remarkCtx).parse(text))) : { sources: [], issue: '' };
      const result = await api.save(snapshot, kind === 'saveAs', plan);
      if (result) {
        documentRevision++; currentPath = result.path; $('external-change').hidden = true;
        name = result.name; saved = snapshot; imageToken = result.imageToken; fileTree.setActive(result.path);
        document.querySelectorAll('#editor img[data-rea-src]').forEach(img => { img.src = imageURL(img.dataset.reaSrc, imageToken); });
        // Native save already cleared the draft; only resync if newer edits arrived.
        refresh(raw !== saved); $('status').textContent = result.saveStatus || '已保存';
      }
    } else if (kind === 'image') {
      const image = await api.pickImage();
      if (!image) return;
      if (sourceMode) {
        $('source').setRangeText(`\n\n${imageMarkdown(image)}\n\n`, $('source').selectionStart, $('source').selectionEnd, 'end');
        raw = sourceText(); refresh(); $('source').focus();
      } else crepe.editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create(image)).scrollIntoView());
        view.focus();
      });
    } else if (kind === 'folder') {
      const folder = await api.folder();
      if (folder) {
        workspacePath = folder.path; fileTree.set(folder); workspaceSearch.setRoot(folder.path);
        $('folder-name').textContent = folder.name; $('folder-name').title = folder.path;
        $('folder-tools').hidden = false;
        $('status').textContent = '工作空间已打开，展开文件夹查看文档';
      }
    } else if (kind === 'refreshFolder') await fileTree.refresh();
    else if (kind === 'revealFile') await fileTree.reveal();
    else if (kind === 'pdf') {
      if (frontMatterPrefix(raw)) { $('status').textContent = '含 YAML 元数据的 PDF 导出暂未支持，请先保存为 Markdown'; return; }
      if (sourceMode && !(await toggleSource())) { $('status').textContent = '源码保护文档暂不支持排版 PDF 导出'; return; }
      const focused = document.body.classList.contains('focus');
      if (focused) document.body.classList.toggle('focus');
      document.body.classList.add('exporting');
      try { $('status').textContent = await api.pdf() ? 'PDF 已导出' : '已取消导出'; }
      finally { document.body.classList.remove('exporting'); if (focused) document.body.classList.toggle('focus'); }
    }
  } catch (error) { $('status').textContent = error.message; }
  finally { busy = false; if (pendingFilesChange) void checkFiles(); }
}
function editorView() { return crepe.editor.action(ctx => ctx.get(editorViewCtx)); }
function focusEditor() { if (sourceMode) $('source').focus(); else editorView().focus(); }
function searchState() {
  if (!sourceMode) return searchKey.getState(editorView().state);
  const matches = $('findbar').hidden ? [] : textMatches($('source').value, $('query').value, $('match-case').checked);
  sourceSearchIndex = Math.max(0, Math.min(sourceSearchIndex, matches.length - 1));
  return { matches, index: sourceSearchIndex };
}
function renderSearch() {
  if (loading) return;
  const { matches, index } = searchState();
  $('find-count').textContent = matches.length ? `${index + 1} / ${matches.length}` : '0 / 0';
  $('find-scope').textContent = sourceMode ? '范围：Markdown 源码' : '范围：排版文本（含元数据，不跨段落）';
  for (const id of ['find-previous', 'find-next', 'replace-one', 'replace-all']) $(id).disabled = !matches.length;
}
function syncSearch() {
  sourceSearchIndex = 0;
  const view = editorView();
  view.dispatch(view.state.tr.setMeta(searchKey, { query: sourceMode || $('findbar').hidden ? '' : $('query').value, caseSensitive: $('match-case').checked, index: 0 }).setMeta('addToHistory', false));
  renderSearch();
}
function selectSearchMatch(focus) {
  const { matches, index } = searchState(), match = matches[index];
  if (!match) return;
  if (sourceMode) {
    if (focus) $('source').focus();
    $('source').setSelectionRange(match.from, match.to);
  } else {
    const view = editorView();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView().setMeta('addToHistory', false));
    if (focus) view.focus();
  }
}
function navigateSearch(direction) {
  if ($('findbar').hidden) { $('findbar').hidden = false; syncSearch(); }
  const { matches, index } = searchState();
  if (!matches.length) return;
  const next = (index + direction + matches.length) % matches.length;
  if (sourceMode) sourceSearchIndex = next;
  else { const view = editorView(); view.dispatch(view.state.tr.setMeta(searchKey, { index: next }).setMeta('addToHistory', false)); }
  renderSearch(); selectSearchMatch(!$('findbar').contains(document.activeElement));
}
function replaceSearch(all) {
  if ($('findbar').hidden) return;
  const { matches, index } = searchState();
  if (!matches.length) return;
  const selected = all ? matches : [matches[index]], replacement = $('replacement').value;
  const end = selected[0].from + replacement.length;
  if (sourceMode) {
    const first = selected[0].from, last = selected.at(-1).to;
    const text = replaceTextMatches($('source').value.slice(first, last), selected.map(match => ({ from: match.from - first, to: match.to - first })), replacement);
    const source = $('source'); source.focus(); source.setSelectionRange(first, last);
    // WebKit's editing command records one native undo operation, including replace-all.
    if (!document.execCommand('insertText', false, text)) { $('status').textContent = '替换未执行，请在源码编辑区重试'; return; }
    raw = sourceText(); refresh();
    const remaining = searchState().matches;
    sourceSearchIndex = all ? 0 : Math.max(0, remaining.findIndex(match => match.from >= end));
  } else {
    const view = editorView(), tr = replaceDocumentMatches(view.state, selected, replacement);
    if (!validFrontMatter(tr.doc)) { $('status').textContent = frontMatterError; return; }
    const remaining = documentMatches(tr.doc, $('query').value, $('match-case').checked);
    const next = all ? 0 : Math.max(0, remaining.findIndex(match => match.from >= end));
    view.dispatch(closeHistory(tr).setMeta(searchKey, { index: next }));
    view.dispatch(closeHistory(view.state.tr).setMeta('addToHistory', false));
    view.focus();
  }
  renderSearch(); selectSearchMatch(true);
  $('status').textContent = `已替换 ${selected.length} 处，可撤销`;
}
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => action(button.dataset.action));
$('query').oninput = () => { if (!composing) { syncSearch(); selectSearchMatch(false); } };
$('query').addEventListener('compositionend', () => { syncSearch(); selectSearchMatch(false); });
$('match-case').onchange = () => { syncSearch(); selectSearchMatch(false); };
$('findbar').onkeydown = event => {
  if (event.isComposing || composing) return;
  if (event.key === 'Escape') { event.preventDefault(); action('closeFind'); }
  else if (event.key === 'Enter' && event.target === $('query')) { event.preventDefault(); action(event.shiftKey ? 'findPrevious' : 'findNext'); }
  else if (event.key === 'Enter' && event.target === $('replacement')) { event.preventDefault(); action('replaceOne'); }
};
api?.onAction(action);
api?.onDocument(doc => load(doc));
async function checkFiles() {
  if (!api || busy || importing || composing || checkingFiles) return;
  pendingFilesChange = false; checkingFiles = true;
  const path = currentPath, revision = documentRevision;
  try {
    const result = await api.fileState();
    if (revision !== documentRevision || busy || importing || composing) { pendingFilesChange = true; return; }
    if (path === currentPath && result.path === (currentPath || '')) {
      $('external-change').hidden = result.state === 'unchanged';
      $('external-message').textContent = ({ modified: '磁盘文件已在外部修改，编辑区内容已保留。', missing: '磁盘文件已删除或移动，编辑区内容已保留，请另存为。', unreadable: '无法读取磁盘文件，编辑区内容已保留。' })[result.state] || '';
    }
    if (workspacePath) await fileTree.refresh(true);
  } catch (error) { $('status').textContent = '检查文件变化失败：' + error.message; }
  finally { checkingFiles = false; if (pendingFilesChange) void checkFiles(); }
}
api?.onFilesChanged(() => { workspaceSearch.changed(); pendingFilesChange = true; void checkFiles(); });
document.addEventListener('compositionend', () => { if (pendingFilesChange) void checkFiles(); });
refresh();
await api?.ready();

})().catch(error => { document.getElementById("status").textContent = "编辑器加载失败：" + error.message; });
