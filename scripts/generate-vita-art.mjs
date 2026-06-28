#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dataDir = path.join(root, "vita", "data");
const manifestPath = path.join(dataDir, "card-art.csv");
const outDir = path.join(dataDir, "art");
const reportPath = path.join(dataDir, "art-report.txt");

function hasCommand(cmd) {
  const ret = spawnSync("which", [cmd], { encoding: "utf8" });
  return ret.status === 0;
}

function parseManifest(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const comma = line.indexOf(",");
    if (comma <= 0) continue;
    const idRaw = line.slice(0, comma).trim();
    let source = line.slice(comma + 1).trim();
    if (source.startsWith("\"") && source.endsWith("\"")) {
      source = source.slice(1, -1).replace(/""/g, "\"");
    }
    const cardId = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(cardId) || cardId <= 0 || !source) continue;
    rows.push({ cardId, source });
  }
  return rows;
}

function run(cmd, args) {
  const ret = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    ok: ret.status === 0,
    stdout: ret.stdout || "",
    stderr: ret.stderr || "",
  };
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error(`Missing manifest: ${manifestPath}`);
    process.exit(1);
  }
  if (!hasCommand("sips")) {
    console.error("sips is required to generate Vita card art.");
    process.exit(1);
  }
  const hasPngquant = hasCommand("pngquant");

  const rows = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let generated = 0;
  let missingSource = 0;
  let failed = 0;

  for (const row of rows) {
    const srcAbs = path.join(root, row.source);
    if (!fs.existsSync(srcAbs)) {
      missingSource++;
      continue;
    }
    const tmpPng = path.join(outDir, `${row.cardId}.tmp.png`);
    const outPng = path.join(outDir, `${row.cardId}.png`);

    const convert = run("sips", ["-s", "format", "png", "-Z", "220", srcAbs, "--out", tmpPng]);
    if (!convert.ok || !fs.existsSync(tmpPng)) {
      failed++;
      continue;
    }

    if (hasPngquant) {
      const quant = run("pngquant", ["--force", "--strip", "--quality=55-90", "--output", outPng, "--", tmpPng]);
      if (!quant.ok || !fs.existsSync(outPng)) {
        fs.renameSync(tmpPng, outPng);
      } else {
        fs.rmSync(tmpPng, { force: true });
      }
    } else {
      fs.renameSync(tmpPng, outPng);
    }

    if (fs.existsSync(outPng)) {
      generated++;
    } else {
      failed++;
    }
  }

  const report = [
    `Generated at: ${new Date().toISOString()}`,
    `Manifest rows: ${rows.length}`,
    `Card art generated: ${generated}`,
    `Missing source files: ${missingSource}`,
    `Failed conversions: ${failed}`,
    `pngquant used: ${hasPngquant ? "yes" : "no"}`,
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, report);

  console.log(`Generated ${generated} card art thumbnails.`);
  console.log(`Report: ${reportPath}`);
}

main();
