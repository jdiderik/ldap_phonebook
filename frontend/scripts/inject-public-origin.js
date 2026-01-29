/**
 * Generates .pwamanifestrc (gitignored) from .pwamanifestrc.template by substituting
 * PUBLIC_ORIGIN from env or .env. Only build/generated files are written; no source is changed.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const templatePath = path.join(root, '.pwamanifestrc.template');
const outputPath = path.join(root, '.pwamanifestrc');
const defaultOrigin = 'http://127.0.0.1:8188';

let publicOrigin = process.env.PUBLIC_ORIGIN;
if (!publicOrigin && fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*PUBLIC_ORIGIN\s*=\s*(.+?)\s*$/);
    if (m) {
      publicOrigin = m[1].replace(/^["']|["']$/g, '').trim();
      break;
    }
  }
}
publicOrigin = publicOrigin || defaultOrigin;

let content = fs.readFileSync(templatePath, 'utf8');
content = content.replace(/\{\{\{\s*PUBLIC_ORIGIN\s*\}\}\}/g, publicOrigin);
fs.writeFileSync(outputPath, content);
