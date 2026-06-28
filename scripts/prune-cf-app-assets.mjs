import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(rootDir, 'public', 'assets');
const distAssetsDir = path.join(rootDir, 'dist', 'assets');

async function listRelativeFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(path.join(dir, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function removeNamedFiles(dir, fileName) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await removeNamedFiles(entryPath, fileName);
    } else if (entry.isFile() && entry.name === fileName) {
      await rm(entryPath);
    }
  }
}

async function removeEmptyDirs(dir, stopDir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirs(path.join(dir, entry.name), stopDir);
    }
  }

  if (dir === stopDir) return;

  const remaining = await readdir(dir);
  if (remaining.length === 0) {
    await rm(dir, { recursive: true, force: true });
  }
}

const mirroredFiles = await listRelativeFiles(sourceDir);
let removed = 0;
let missing = 0;

for (const relativeFile of mirroredFiles) {
  const targetPath = path.join(distAssetsDir, relativeFile);
  try {
    await rm(targetPath);
    removed += 1;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      missing += 1;
      continue;
    }
    throw error;
  }
}

await removeEmptyDirs(distAssetsDir, distAssetsDir);
await removeNamedFiles(path.join(rootDir, 'dist'), '.DS_Store');

console.log(
  `Pruned ${removed} mirrored public/assets files from dist/assets for CDN-backed app deploy (${missing} already absent).`,
);
