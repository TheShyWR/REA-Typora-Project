export const defaultWritingSettings = { theme: 'light', fontFamily: 'system', fontSize: 16, lineHeight: 1.9, contentWidth: 900, typewriter: false };
export function createWritingSettings({ read, write, apply, report }) {
  let value = { ...defaultWritingSettings }, saving = false;
  return {
    get value() { return value; },
    async load() {
      try { value = await read(); }
      catch (error) { report('读取写作设置失败：' + error.message); }
      apply(value);
    },
    async change(patch) {
      if (saving) { report('写作设置正在保存，请稍后再试'); return false; }
      saving = true;
      try {
        const saved = await write({ ...value, ...patch });
        value = saved; apply(value); return true;
      } catch (error) { report('保存写作设置失败：' + error.message); return false; }
      finally { saving = false; }
    }
  };
}
