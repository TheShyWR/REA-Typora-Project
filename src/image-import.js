const MAX_BYTES = 20 * 1024 * 1024;

export function readImageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(new Error('无法读取图片：' + file.name));
    reader.onabort = () => reject(new Error('图片读取已取消'));
    reader.readAsDataURL(file);
  });
}

// Keep both sides bound to the document that received the paste/drop event.
export async function importImageFiles(files, { api, token, currentToken, read = readImageData }) {
  const images = Array.from(files).filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name));
  if (!images.length) throw new Error('请拖入 PNG、JPEG、GIF 或 WebP 图片');
  if (!api?.importImages || !token) throw new Error('请先保存文档，再粘贴或拖入图片');
  if (images.reduce((size, file) => size + file.size, 0) > MAX_BYTES) throw new Error('一次导入的图片总大小不能超过 20 MB');
  const payload = [];
  for (const file of images) payload.push({ name: file.name, data: await read(file) });
  if (currentToken() !== token) throw new Error('文档已切换，已取消图片插入');
  const result = await api.importImages(payload, token);
  if (currentToken() !== token) throw new Error('文档已切换，已取消图片插入');
  return result;
}
