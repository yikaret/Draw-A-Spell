#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cardsJsonPath = path.join(root, "json", "cards.sorcery.raw.json");
const poolJsonPath = path.join(root, "public", "cards.sorcery.pool.json");
const decksTsPath = path.join(root, "decks", "decks.ts");
const outDir = path.join(root, "vita", "data");
const outCardsCsv = path.join(outDir, "cards.csv");
const outDecksCsv = path.join(outDir, "decks.csv");
const outCardArtManifestCsv = path.join(outDir, "card-art.csv");
const allowFallbackCards = process.env.ALLOW_VITA_FALLBACK_CARDS === "1";

const CARD_FLAG_TARGET_ENEMY = 1 << 0;
const CARD_FLAG_TARGET_ALLY = 1 << 1;
const CARD_FLAG_TARGET_ANY = 1 << 2;
const CARD_FLAG_AOE_TILE = 1 << 3;
const CARD_FLAG_AOE_ADJACENT = 1 << 4;

const NORMALIZED_NAME_ALIASES = new Map([
  ["rimlandsnomad", "rimlandnomads"],
  ["versuvius", "vesuvius"],
]);

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

function normalizeName(input) {
  return (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function normalizedAliases(name) {
  const base = normalizeName(name);
  const out = new Set();
  if (base) out.add(base);
  if (base.endsWith("s") && base.length > 4) out.add(base.slice(0, -1));
  if (base.endsWith("es") && base.length > 5) out.add(base.slice(0, -2));
  return [...out];
}

function allLookupAliases(name) {
  const out = new Set();
  const queue = [...normalizedAliases(name)];
  while (queue.length > 0) {
    const key = queue.shift();
    if (!key || out.has(key)) continue;
    out.add(key);
    const mapped = NORMALIZED_NAME_ALIASES.get(key);
    if (mapped) {
      for (const alias of normalizedAliases(mapped)) {
        if (!out.has(alias)) queue.push(alias);
      }
    }
  }
  return [...out];
}

function parseDeckLine(line) {
  let name = String(line || "").trim();
  let count = 1;
  const m1 = name.match(/x\s*(\d+)$/i);
  const m2 = name.match(/^(\d+)\s+(.+)$/);
  if (m1) {
    count = Math.max(1, parseInt(m1[1], 10) || 1);
    name = name.replace(m1[0], "").trim();
  } else if (m2) {
    count = Math.max(1, parseInt(m2[1], 10) || 1);
    name = m2[2].trim();
  }
  return { name, count };
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function extractPreconDecks(tsSource) {
  const start = tsSource.indexOf("export const PRECONS");
  const end = tsSource.indexOf("export const PRECON_COLLECTIONS");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not locate PRECONS block in decks.ts");
  }

  const block = tsSource.slice(start, end);
  const lines = block.split(/\r?\n/);
  const decks = [];
  let current = null;

  for (const raw of lines) {
    const deckHeader = raw.match(/^\s*"([^"]+)":\s*\[\s*$/);
    if (deckHeader) {
      current = { name: deckHeader[1], cards: [] };
      decks.push(current);
      continue;
    }
    if (!current) continue;
    if (/^\s*\],?\s*$/.test(raw)) {
      current = null;
      continue;
    }
    const cardLine = raw.match(/^\s*"([^"]+)"\s*,?\s*$/);
    if (cardLine) current.cards.push(cardLine[1]);
  }

  return decks;
}

function chooseCardMeta(card) {
  if (!card || !Array.isArray(card.sets) || card.sets.length === 0) {
    return null;
  }
  const withMeta = card.sets.find((s) => s?.metadata && typeof s.metadata === "object");
  return withMeta?.metadata || card.sets[0]?.metadata || null;
}

function chooseCardArtSource(card) {
  if (!card || !Array.isArray(card.sets)) return "";
  const seen = new Set();
  for (const set of card.sets) {
    const variants = Array.isArray(set?.variants) ? set.variants : [];
    for (const variant of variants) {
      const slug = String(variant?.slug || "").trim();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      for (const ext of IMAGE_EXTENSIONS) {
        const rel = path.posix.join("public", "assets", "Images", `${slug}.${ext}`);
        const abs = path.join(root, rel);
        if (fs.existsSync(abs)) return rel;
      }
    }
  }
  return "";
}

function firstNumber(text) {
  if (!text) return null;
  const m = String(text).match(/(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function classifyCard(cardName, meta) {
  const type = String(meta?.type || "").toLowerCase();
  const rules = String(meta?.rulesText || "").toLowerCase();
  const source = `${type} ${rules} ${String(cardName || "").toLowerCase()}`;

  if (type.includes("minion") || type.includes("avatar")) return "UNIT";
  if (type.includes("site")) return "SPELL_RAMP";
  if (/\bsummon\b|\bconjure\b|\bcreate\b|\btoken\b/.test(source)) return "SPELL_SUMMON";
  if (/\b(gains?|gets?)\s+\+?\d|\b(gain|gains)\b|\+\d+\s*\/\s*\+?\d+|\bempower\b|\bbolster\b|\benchant\b|\bward\b|\bairborne\b|\bcharge\b/.test(source)) {
    return "SPELL_BUFF";
  }
  if (/\bweaken\b|\blose\b.*\bpower\b|\breduce\b.*\bpower\b|-\d+\s*power|\bcan't\b.*\bmove\b|\bcannot\b.*\bmove\b/.test(source)) {
    return "SPELL_DEBUFF";
  }
  if (/\bmana\b|\bthreshold\b|\briver\b|\bdesert\b|\btower\b|\bvillage\b/.test(source)) {
    return "SPELL_RAMP";
  }
  if (/\bdraw\b/.test(source)) return "SPELL_DRAW";
  if (/\bheal|restore|recover|life\b/.test(source)) return "SPELL_HEAL";
  if (/\bdamage|destroy|kill|banish|bury|strike|bolt|fireball|explosion|smite|burn|drown|frost|quake\b/.test(source)) {
    return "SPELL_DAMAGE";
  }
  return "SPELL_DRAW";
}

function flagsForCard(kind, cardName, meta) {
  const type = String(meta?.type || "").toLowerCase();
  const rules = String(meta?.rulesText || "").toLowerCase();
  const source = `${type} ${rules} ${String(cardName || "").toLowerCase()}`;

  let flags = 0;
  if (kind === "SPELL_DAMAGE") flags |= CARD_FLAG_TARGET_ENEMY;
  if (kind === "SPELL_HEAL") flags |= CARD_FLAG_TARGET_ALLY;
  if (kind === "SPELL_BUFF") flags |= CARD_FLAG_TARGET_ALLY;
  if (kind === "SPELL_DEBUFF") flags |= CARD_FLAG_TARGET_ENEMY;

  const hitsAnyUnits = /\beach\s+unit\b|\ball\s+units?\b/.test(source);
  const aoeNearby = /\beach\s+unit\b|\ball\s+units?\b|\bnearby\s+sites?\b|\badjacent\b/.test(source);
  const tileBurst = /\bsite\b/.test(source) && /\bdamage|destroy|kill|bury|banish|smite|burn\b/.test(source);

  if ((kind === "SPELL_DAMAGE" || kind === "SPELL_HEAL") && hitsAnyUnits) {
    flags |= CARD_FLAG_TARGET_ANY;
    flags &= ~(CARD_FLAG_TARGET_ENEMY | CARD_FLAG_TARGET_ALLY);
  }

  if ((kind === "SPELL_DAMAGE" || kind === "SPELL_HEAL") && aoeNearby) {
    flags |= CARD_FLAG_AOE_ADJACENT;
  }
  if (kind === "SPELL_DAMAGE" && tileBurst) {
    flags |= CARD_FLAG_AOE_TILE;
  }
  return flags;
}

function makeCardRow(cardName, meta, fallbackKind = null) {
  const kind = fallbackKind || classifyCard(cardName, meta);
  const flags = flagsForCard(kind, cardName, meta);
  const rawCost = Number(meta?.cost);
  let cost = Number.isFinite(rawCost) ? Math.floor(rawCost) : 1;
  cost = Math.max(0, Math.min(9, cost));

  const atkMeta = Number(meta?.attack);
  const defMeta = Number(meta?.defence);
  const lifeMeta = Number(meta?.life);
  const rulesNumber = firstNumber(meta?.rulesText);

  if (kind === "UNIT") {
    const atk = Number.isFinite(atkMeta) && atkMeta > 0 ? Math.floor(atkMeta) : 1;
    const hp0 = Number.isFinite(defMeta) && defMeta > 0 ? Math.floor(defMeta) : Number.isFinite(lifeMeta) && lifeMeta > 0 ? Math.floor(lifeMeta) : atk;
    const hp = Math.max(1, hp0);
    return { name: cardName, kind, cost, atk, hp, flags };
  }

  let power = Number.isFinite(rulesNumber) && rulesNumber > 0 ? Math.floor(rulesNumber) : Math.max(1, cost);
  if (kind === "SPELL_DRAW") power = Math.max(1, Math.min(3, power));
  if (kind === "SPELL_RAMP") power = Math.max(1, Math.min(2, power));
  if (kind === "SPELL_SUMMON") power = Math.max(1, Math.min(4, power));
  if (kind === "SPELL_BUFF") power = Math.max(1, Math.min(4, power));
  if (kind === "SPELL_DEBUFF") power = Math.max(1, Math.min(4, power));
  if (kind === "SPELL_DAMAGE") power = Math.max(1, Math.min(8, power));
  if (kind === "SPELL_HEAL") power = Math.max(1, Math.min(8, power));

  if (kind === "SPELL_SUMMON") {
    const summonHp = Math.max(1, Math.min(6, Number.isFinite(defMeta) && defMeta > 0 ? Math.floor(defMeta) : power + 1));
    return { name: cardName, kind, cost, atk: power, hp: summonHp, flags };
  }
  if (kind === "SPELL_BUFF") {
    const hpBuff = Math.max(1, Math.min(4, Number.isFinite(defMeta) && defMeta > 0 ? Math.floor(defMeta) : 1));
    return { name: cardName, kind, cost, atk: power, hp: hpBuff, flags };
  }
  if (kind === "SPELL_DEBUFF") {
    const hpDebuff = Math.max(0, Math.min(3, Number.isFinite(defMeta) && defMeta > 0 ? Math.floor(defMeta) : 0));
    return { name: cardName, kind, cost, atk: power, hp: hpDebuff, flags };
  }
  return { name: cardName, kind, cost, atk: power, hp: 0, flags };
}

function main() {
  const cardsRaw = JSON.parse(fs.readFileSync(cardsJsonPath, "utf8"));
  const cardsPool = fs.existsSync(poolJsonPath) ? JSON.parse(fs.readFileSync(poolJsonPath, "utf8")) : [];
  const decksTs = fs.readFileSync(decksTsPath, "utf8");
  const decks = extractPreconDecks(decksTs);

  const cardByNorm = new Map();
  for (const source of [cardsPool, cardsRaw]) {
    for (const card of source) {
      for (const norm of allLookupAliases(card.name)) {
        if (!norm) continue;
        if (!cardByNorm.has(norm)) cardByNorm.set(norm, card);
      }
    }
  }

  const generatedCards = [];
  const cardIdByNorm = new Map();
  const deckRows = [];
  const missing = [];

  for (const deck of decks) {
    for (const rawLine of deck.cards) {
      const { name, count } = parseDeckLine(rawLine);
      const aliases = allLookupAliases(name);
      if (aliases.length === 0) continue;

      let cardId = null;
      for (const alias of aliases) {
        const existing = cardIdByNorm.get(alias);
        if (existing) {
          cardId = existing;
          break;
        }
      }
      if (!cardId) {
        let matched = null;
        for (const alias of aliases) {
          matched = cardByNorm.get(alias);
          if (matched) break;
        }
        if (matched) {
          const meta = chooseCardMeta(matched);
          const row = makeCardRow(matched.name, meta);
          cardId = generatedCards.length + 1;
          generatedCards.push({ id: cardId, ...row, artSource: chooseCardArtSource(matched) });
          for (const alias of aliases) cardIdByNorm.set(alias, cardId);
          for (const alias of allLookupAliases(matched.name)) cardIdByNorm.set(alias, cardId);
        } else {
          // Keep deck integrity by creating a generic fallback card entry.
          const row = makeCardRow(name, null, "SPELL_DAMAGE");
          cardId = generatedCards.length + 1;
          generatedCards.push({ id: cardId, ...row, artSource: "" });
          for (const alias of aliases) cardIdByNorm.set(alias, cardId);
          missing.push(name);
        }
      }

      deckRows.push({ deck: deck.name, cardId, count });
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  const cardsCsvLines = ["id,name,kind,cost,atk,hp,flags"];
  for (const card of generatedCards) {
    cardsCsvLines.push(
      [
        card.id,
        csvEscape(card.name),
        card.kind,
        card.cost,
        card.atk,
        card.hp,
        card.flags,
      ].join(","),
    );
  }
  fs.writeFileSync(outCardsCsv, `${cardsCsvLines.join("\n")}\n`);

  const decksCsvLines = ["deck,card_id,count"];
  for (const row of deckRows) {
    decksCsvLines.push([csvEscape(row.deck), row.cardId, row.count].join(","));
  }
  fs.writeFileSync(outDecksCsv, `${decksCsvLines.join("\n")}\n`);

  let artCount = 0;
  const artManifestLines = ["card_id,source"];
  for (const card of generatedCards) {
    if (!card.artSource) continue;
    artManifestLines.push([card.id, csvEscape(card.artSource)].join(","));
    artCount++;
  }
  fs.writeFileSync(outCardArtManifestCsv, `${artManifestLines.join("\n")}\n`);

  const uniqueMissing = [...new Set(missing)];
  const reportPath = path.join(outDir, "generation-report.txt");
  const report = [
    `Generated at: ${new Date().toISOString()}`,
    `Decks parsed: ${decks.length}`,
    `Cards generated: ${generatedCards.length}`,
    `Deck rows: ${deckRows.length}`,
    `Card art sources: ${artCount}`,
    `Unmatched names (fallback generated): ${uniqueMissing.length}`,
    ...uniqueMissing.map((n) => `- ${n}`),
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, report);

  console.log(`Generated ${generatedCards.length} cards and ${deckRows.length} deck rows.`);
  if (uniqueMissing.length > 0) {
    if (!allowFallbackCards) {
      console.error(`Unmatched deck card names (${uniqueMissing.length}). See ${reportPath}`);
      console.error("Set ALLOW_VITA_FALLBACK_CARDS=1 to allow fallback generation.");
      process.exit(2);
    }
    console.log(`Fallback cards created for ${uniqueMissing.length} unmatched names. See ${reportPath}`);
  }
}

main();
