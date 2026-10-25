export function createFileTree(container, { list, open, report }) {
  let root, active, epoch = 0, refreshRequest = 0;
  const snapshots = new Map();
  const expanded = new Set();
  const message = (element, text) => {
    const p = document.createElement('p'); p.className = 'muted'; p.textContent = text;
    element.replaceChildren(p);
  };
  function highlight() {
    for (const button of container.querySelectorAll('button[data-path]')) {
      const selected = button.dataset.path === active;
      button.classList.toggle('current-file', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }
  function render(folder, target, generation) {
    snapshots.set(folder.path, JSON.stringify(folder));
    target.replaceChildren();
    if (!folder.entries.length) message(target, '没有 Markdown 或文本文件');
    for (const entry of folder.entries) {
      if (!entry.directory) {
        const button = document.createElement('button');
        button.textContent = entry.name; button.title = entry.path; button.dataset.path = entry.path;
        button.onclick = () => open(entry.path); target.append(button);
        continue;
      }
      const details = document.createElement('details'), summary = document.createElement('summary'), children = document.createElement('div');
      details.dataset.path = entry.path; summary.textContent = entry.name; summary.title = entry.path;
      children.className = 'folder-children'; details.append(summary, children); target.append(details);
      let loaded = false, pending;
      details.load = () => {
        if (loaded) return Promise.resolve();
        if (pending) return pending;
        message(children, '正在读取…');
        pending = (async () => {
          try {
            const result = await list(entry.path);
            if (epoch !== generation || !details.isConnected) return;
            render(result, children, generation); loaded = true; highlight();
          } catch (error) {
            if (epoch !== generation || !details.isConnected) return;
            message(children, '无法读取，收起后展开可重试'); report(error.message);
          } finally { pending = undefined; }
        })();
        return pending;
      };
      details.ontoggle = () => {
        if (epoch !== generation || !details.isConnected) return;
        if (details.open) { expanded.add(entry.path); void details.load(); }
        else expanded.delete(entry.path);
      };
      details.open = expanded.has(entry.path);
      if (details.open) void details.load();
    }
    highlight();
  }
  async function reveal() {
    const generation = epoch, requested = active;
    const prefix = root?.path === '/' ? '/' : root?.path + '/';
    if (!active || !root || !active.startsWith(prefix)) { report('当前文档不在此工作空间中'); return; }
    const parts = active.slice(prefix.length).split('/'); parts.pop();
    let path = root.path === '/' ? '' : root.path;
    for (const part of parts) {
      path += '/' + part;
      const details = [...container.querySelectorAll('details')].find(item => item.dataset.path === path);
      if (!details) break;
      expanded.add(path); details.open = true; await details.load();
      if (generation !== epoch || active !== requested) return;
    }
    const button = [...container.querySelectorAll('button[data-path]')].find(item => item.dataset.path === active);
    if (button) { button.scrollIntoView({ block: 'nearest' }); button.focus(); }
    else report('当前文件未出现在目录中，请刷新或检查文件是否已移动');
  }
  return {
    set(folder) { root = folder; expanded.clear(); snapshots.clear(); render(folder, container, ++epoch); },
    setActive(path) { active = path; highlight(); },
    reveal,
    async refresh(silent = false) {
      if (!root) { if (!silent) report('请先打开工作空间文件夹'); return; }
      const generation = epoch, request = ++refreshRequest;
      try {
        const folder = await list(root.path);
        if (generation !== epoch || request !== refreshRequest) return;
        if (silent && JSON.stringify(folder) === snapshots.get(folder.path)) {
          const known = [...snapshots.keys()].filter(path => path !== folder.path);
          const children = await Promise.all(known.map(async path => {
            try { return [path, JSON.stringify(await list(path))]; } catch { return [path, null]; }
          }));
          if (generation !== epoch || request !== refreshRequest) return;
          if (children.every(([path, snapshot]) => snapshot === snapshots.get(path))) return;
        }
        root = folder; snapshots.clear(); render(folder, container, ++epoch);
        if (!silent) report('目录已刷新');
      } catch (error) {
        if (generation === epoch && request === refreshRequest) report('刷新失败：' + error.message);
      }
    }
  };
}
