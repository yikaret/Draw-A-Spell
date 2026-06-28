import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(rootDir, 'public', 'assets');
const outputDir = path.join(rootDir, '.cf-pages-assets');
const outputAssetsDir = path.join(outputDir, 'assets');

const headers = `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/assets/Images/*
  Cache-Control: public, max-age=31536000, immutable
`;

async function removeNamedFiles(dir, fileName) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await removeNamedFiles(entryPath, fileName);
    } else if (entry.isFile() && entry.name === fileName) {
      await rm(entryPath, { force: true });
    }
  }
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputAssetsDir, { recursive: true });
await removeNamedFiles(outputAssetsDir, '.DS_Store');
await writeFile(path.join(outputDir, '_headers'), headers, 'utf8');

console.log(`Prepared Cloudflare asset deploy at ${path.relative(rootDir, outputDir)}`);
