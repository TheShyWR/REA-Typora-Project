export function createWorkspaceSearch(ui, { search, open }) {
  let root, revision = 0, pending = false;
  function clear(message = '搜索磁盘上已保存的 Markdown / 文本，每个匹配行显示一条结果。') {
    revision++; ui.results.replaceChildren(); ui.summary.textContent = message;
  }
  async function submit() {
    if (pending) return;
    clear();
    if (!root) { ui.summary.textContent = '请先打开工作空间文件夹'; return; }
    if (!ui.query.value) { ui.summary.textContent = '请输入搜索文本'; return; }
    const version = revision, path = root;
    pending = true; ui.run.disabled = true; ui.summary.textContent = '正在搜索已保存文件…';
    try {
      const result = await search(ui.query.value, ui.matchCase.checked);
      if (version !== revision || root !== path || result.root !== path) return;
      ui.summary.textContent = `磁盘快照 · ${result.rows.length} 个匹配行 · 已读 ${result.scanned} 个文档` + (result.skipped ? ` · 跳过 ${result.skipped} 项（过大、非 UTF-8 或不可读）` : '') + (result.limit ? `。${result.limit}` : '');
      for (const row of result.rows) {
        const button = document.createElement('button');
        const label = document.createElement('strong'), preview = document.createElement('span');
        label.textContent = `${row.relative}:${row.line}`; preview.textContent = row.preview;
        button.title = row.path; button.append(label, preview);
        button.onclick = () => { if (version === revision && path === root) open(row); };
        ui.results.append(button);
      }
    } catch (error) { if (version === revision) ui.summary.textContent = '搜索失败：' + error.message; }
    finally { pending = false; ui.run.disabled = false; }
  }
  ui.run.onclick = submit;
  ui.query.oninput = () => clear();
  ui.matchCase.onchange = () => clear();
  ui.panel.onkeydown = event => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && event.target === ui.query) { event.preventDefault(); void submit(); }
    if (event.key === 'Escape') { event.preventDefault(); ui.close.click(); }
  };
  return {
    setRoot(path) { root = path; clear(); },
    show() { ui.panel.hidden = false; ui.query.focus(); ui.query.select(); },
    close() { ui.panel.hidden = true; clear(); },
    changed() { if (ui.results.children.length) ui.summary.textContent = '文件可能已变化，点击“搜索”更新结果。搜索仅包含磁盘上的已保存内容。'; }
  };
}
