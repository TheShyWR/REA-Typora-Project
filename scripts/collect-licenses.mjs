import fs from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const sections = ['Third-party package license texts\nGenerated from installed packages listed in package-lock.json.\n'];
for (const [directory, pkg] of Object.entries(lock.packages).sort()) {
  if (!directory.startsWith('node_modules/') || !fs.existsSync(directory)) continue;
  const files = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(file);
      else if (entry.isFile() && /^(licen[cs]e|copying|notice|ofl)([._-].*)?$/i.test(entry.name)) files.push(file);
    }
  }
  walk(directory);
  if (!files.length) continue;
  sections.push(`\n${'='.repeat(72)}\n${directory} @ ${pkg.version}\nLicense identifier: ${pkg.license || 'see included text'}\n`);
  for (const file of files.sort()) sections.push(`\n--- ${path.relative(directory, file)} ---\n${fs.readFileSync(file, 'utf8')}`);
}
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/THIRD_PARTY_LICENSES.txt', sections.join('\n'));
