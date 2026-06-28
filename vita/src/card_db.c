#include "card_db.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <psp2/io/fcntl.h>

typedef struct BuiltinDeckRow {
  const char *deck_name;
  int card_id;
  int count;
} BuiltinDeckRow;

static char *trim_inplace(char *s) {
  if (!s) return s;
  while (*s && isspace((unsigned char)*s)) s++;
  if (!*s) return s;
  char *end = s + strlen(s) - 1;
  while (end > s && isspace((unsigned char)*end)) {
    *end = '\0';
    end--;
  }
  return s;
}

static int split_csv(char *line, char **cols, int max_cols) {
  if (!line || !cols || max_cols <= 0) return 0;

  int count = 0;
  int in_quotes = 0;
  char *src = line;
  char *dst = line;
  cols[count++] = dst;

  while (*src) {
    const char c = *src++;
    if (c == '"') {
      if (in_quotes && *src == '"') {
        *dst++ = '"';
        src++;
      } else {
        in_quotes = !in_quotes;
      }
      continue;
    }
    if (c == ',' && !in_quotes) {
      *dst++ = '\0';
      if (count < max_cols) cols[count++] = dst;
      continue;
    }
    if ((c == '\r' || c == '\n') && !in_quotes) break;
    *dst++ = c;
  }
  *dst = '\0';

  for (int i = 0; i < count; i++) {
    cols[i] = trim_inplace(cols[i]);
  }
  return count;
}

static int parse_card_kind(const char *raw, CardKind *kind_out) {
  if (!raw || !kind_out) return -1;
  if (strcmp(raw, "UNIT") == 0) {
    *kind_out = CARD_KIND_UNIT;
    return 0;
  }
  if (strcmp(raw, "SPELL_DAMAGE") == 0) {
    *kind_out = CARD_KIND_SPELL_DAMAGE;
    return 0;
  }
  if (strcmp(raw, "SPELL_HEAL") == 0) {
    *kind_out = CARD_KIND_SPELL_HEAL;
    return 0;
  }
  if (strcmp(raw, "SPELL_DRAW") == 0) {
    *kind_out = CARD_KIND_SPELL_DRAW;
    return 0;
  }
  if (strcmp(raw, "SPELL_RAMP") == 0) {
    *kind_out = CARD_KIND_SPELL_RAMP;
    return 0;
  }
  if (strcmp(raw, "SPELL_BUFF") == 0) {
    *kind_out = CARD_KIND_SPELL_BUFF;
    return 0;
  }
  if (strcmp(raw, "SPELL_SUMMON") == 0) {
    *kind_out = CARD_KIND_SPELL_SUMMON;
    return 0;
  }
  if (strcmp(raw, "SPELL_DEBUFF") == 0) {
    *kind_out = CARD_KIND_SPELL_DEBUFF;
    return 0;
  }
  return -1;
}

static int default_flags_for_kind(CardKind kind) {
  switch (kind) {
    case CARD_KIND_UNIT:
      return CARD_FLAG_NONE;
    case CARD_KIND_SPELL_DAMAGE:
      return CARD_FLAG_TARGET_ENEMY;
    case CARD_KIND_SPELL_HEAL:
      return CARD_FLAG_TARGET_ALLY;
    case CARD_KIND_SPELL_DRAW:
      return CARD_FLAG_NONE;
    case CARD_KIND_SPELL_RAMP:
      return CARD_FLAG_NONE;
    case CARD_KIND_SPELL_BUFF:
      return CARD_FLAG_TARGET_ALLY;
    case CARD_KIND_SPELL_SUMMON:
      return CARD_FLAG_NONE;
    case CARD_KIND_SPELL_DEBUFF:
      return CARD_FLAG_TARGET_ENEMY;
    default:
      return CARD_FLAG_NONE;
  }
}

static int load_text_file(const char *path, char *buffer, int cap) {
  if (!path || !buffer || cap < 2) return -1;

  SceUID fd = sceIoOpen(path, SCE_O_RDONLY, 0);
  if (fd < 0) return (int)fd;

  int read_size = (int)sceIoRead(fd, buffer, cap - 1);
  sceIoClose(fd);
  if (read_size < 0) return read_size;

  buffer[read_size] = '\0';
  return read_size;
}

static int find_or_add_deck(CardDB *db, const char *name) {
  if (!db || !name || !name[0]) return -1;

  for (int i = 0; i < db->deck_count; i++) {
    if (strcmp(db->decks[i].name, name) == 0) return i;
  }

  if (db->deck_count >= CARD_DB_MAX_DECKS) return -1;
  DeckDef *deck = &db->decks[db->deck_count];
  memset(deck, 0, sizeof(*deck));
  snprintf(deck->name, sizeof(deck->name), "%s", name);
  db->deck_count++;
  return db->deck_count - 1;
}

static int add_card_to_deck(DeckDef *deck, int card_id, int count) {
  if (!deck || count <= 0) return -1;
  for (int i = 0; i < count; i++) {
    if (deck->card_count >= CARD_DB_MAX_DECK_CARDS) return -1;
    deck->cards[deck->card_count++] = card_id;
  }
  return 0;
}

static int parse_cards_csv(CardDB *db, char *text) {
  if (!db || !text) return -1;
  char *line = text;

  while (line && *line) {
    char *next = strchr(line, '\n');
    if (next) {
      *next = '\0';
      next++;
    }
    char *row = trim_inplace(line);
    if (row[0] && row[0] != '#') {
      char *cols[8];
      int col_count = split_csv(row, cols, 8);
      if (col_count >= 6 && strcmp(cols[0], "id") != 0) {
        if (db->card_count >= CARD_DB_MAX_CARDS) return -1;
        CardDef *card = &db->cards[db->card_count];
        memset(card, 0, sizeof(*card));
        card->id = atoi(cols[0]);
        snprintf(card->name, sizeof(card->name), "%s", cols[1]);
        if (parse_card_kind(cols[2], &card->kind) < 0) return -1;
        card->cost = atoi(cols[3]);
        card->atk = atoi(cols[4]);
        card->hp = atoi(cols[5]);
        card->flags = default_flags_for_kind(card->kind);
        if (col_count >= 7 && cols[6] && cols[6][0]) {
          card->flags = atoi(cols[6]);
        }
        db->card_count++;
      }
    }
    line = next;
  }

  return db->card_count > 0 ? 0 : -1;
}

static int parse_decks_csv(CardDB *db, char *text) {
  if (!db || !text) return -1;
  char *line = text;

  while (line && *line) {
    char *next = strchr(line, '\n');
    if (next) {
      *next = '\0';
      next++;
    }
    char *row = trim_inplace(line);
    if (row[0] && row[0] != '#') {
      char *cols[3];
      int col_count = split_csv(row, cols, 3);
      if (col_count == 3 && strcmp(cols[0], "deck") != 0) {
        const char *deck_name = cols[0];
        const int card_id = atoi(cols[1]);
        const int count = atoi(cols[2]);
        const int deck_idx = find_or_add_deck(db, deck_name);
        if (deck_idx < 0) return -1;
        if (!card_db_get_card(db, card_id)) return -1;
        if (add_card_to_deck(&db->decks[deck_idx], card_id, count) < 0) return -1;
      }
    }
    line = next;
  }

  return db->deck_count > 0 ? 0 : -1;
}

const CardDef *card_db_get_card(const CardDB *db, int id) {
  if (!db) return NULL;
  for (int i = 0; i < db->card_count; i++) {
    if (db->cards[i].id == id) return &db->cards[i];
  }
  return NULL;
}

int card_db_find_deck(const CardDB *db, const char *name) {
  if (!db || !name) return -1;
  for (int i = 0; i < db->deck_count; i++) {
    if (strcmp(db->decks[i].name, name) == 0) return i;
  }
  return -1;
}

const DeckDef *card_db_get_deck(const CardDB *db, int deck_index) {
  if (!db) return NULL;
  if (deck_index < 0 || deck_index >= db->deck_count) return NULL;
  return &db->decks[deck_index];
}

void card_db_load_builtin(CardDB *db) {
  if (!db) return;
  memset(db, 0, sizeof(*db));
  db->loaded_from_file = 0;

  static const CardDef cards[] = {
      {1, "Air Acolyte", CARD_KIND_UNIT, 1, 1, 2, CARD_FLAG_NONE},
      {2, "Cloud Knight", CARD_KIND_UNIT, 2, 2, 3, CARD_FLAG_NONE},
      {3, "Storm Adept", CARD_KIND_UNIT, 3, 3, 3, CARD_FLAG_NONE},
      {4, "Healing Rain", CARD_KIND_SPELL_HEAL, 2, 3, 0, CARD_FLAG_TARGET_ALLY},
      {5, "Lightning Bolt", CARD_KIND_SPELL_DAMAGE, 2, 3, 0, CARD_FLAG_TARGET_ENEMY},
      {6, "Arcane Insight", CARD_KIND_SPELL_DRAW, 2, 2, 0, CARD_FLAG_NONE},
      {7, "Fire Imp", CARD_KIND_UNIT, 1, 2, 1, CARD_FLAG_NONE},
      {8, "Ember Knight", CARD_KIND_UNIT, 2, 3, 2, CARD_FLAG_NONE},
      {9, "Flame Golem", CARD_KIND_UNIT, 3, 4, 4, CARD_FLAG_NONE},
      {10, "Fireball", CARD_KIND_SPELL_DAMAGE, 3, 4, 0, CARD_FLAG_TARGET_ENEMY | CARD_FLAG_AOE_TILE},
      {11, "Battle Chant", CARD_KIND_SPELL_HEAL, 1, 2, 0, CARD_FLAG_TARGET_ALLY},
      {12, "Tactical Study", CARD_KIND_SPELL_DRAW, 1, 1, 0, CARD_FLAG_NONE},
      {13, "Guard Captain", CARD_KIND_UNIT, 2, 2, 4, CARD_FLAG_NONE},
      {14, "Spear Scout", CARD_KIND_UNIT, 1, 2, 2, CARD_FLAG_NONE},
      {15, "Frost Nova", CARD_KIND_SPELL_DAMAGE, 2, 2, 0, CARD_FLAG_TARGET_ENEMY},
      {16, "Renew", CARD_KIND_SPELL_HEAL, 1, 2, 0, CARD_FLAG_TARGET_ALLY},
  };

  for (int i = 0; i < (int)(sizeof(cards) / sizeof(cards[0])); i++) {
    db->cards[db->card_count++] = cards[i];
  }

  static const BuiltinDeckRow rows[] = {
      {"Air Vanguard", 1, 4}, {"Air Vanguard", 2, 4}, {"Air Vanguard", 3, 3},
      {"Air Vanguard", 4, 2}, {"Air Vanguard", 5, 3}, {"Air Vanguard", 6, 2},
      {"Air Vanguard", 13, 2}, {"Air Vanguard", 14, 2},

      {"Fire Assault", 7, 4}, {"Fire Assault", 8, 4}, {"Fire Assault", 9, 3},
      {"Fire Assault", 10, 3}, {"Fire Assault", 11, 2}, {"Fire Assault", 12, 2},
      {"Fire Assault", 13, 2}, {"Fire Assault", 14, 2},

      {"Balanced Tactics", 1, 3}, {"Balanced Tactics", 2, 3}, {"Balanced Tactics", 7, 3},
      {"Balanced Tactics", 8, 3}, {"Balanced Tactics", 5, 2}, {"Balanced Tactics", 10, 2},
      {"Balanced Tactics", 4, 2}, {"Balanced Tactics", 11, 2},
  };

  for (int i = 0; i < (int)(sizeof(rows) / sizeof(rows[0])); i++) {
    int deck_idx = find_or_add_deck(db, rows[i].deck_name);
    if (deck_idx < 0) continue;
    add_card_to_deck(&db->decks[deck_idx], rows[i].card_id, rows[i].count);
  }
}

int card_db_load_from_files(CardDB *db, const char *cards_path, const char *decks_path) {
  if (!db || !cards_path || !decks_path) return -1;
  memset(db, 0, sizeof(*db));

  static char cards_text[512 * 1024];
  static char decks_text[256 * 1024];
  int cards_read = load_text_file(cards_path, cards_text, sizeof(cards_text));
  if (cards_read <= 0) return -1;
  int decks_read = load_text_file(decks_path, decks_text, sizeof(decks_text));
  if (decks_read <= 0) return -1;

  if (parse_cards_csv(db, cards_text) < 0) return -1;
  if (parse_decks_csv(db, decks_text) < 0) return -1;

  db->loaded_from_file = 1;
  return 0;
}

int card_db_load(CardDB *db) {
  if (!db) return -1;
  if (card_db_load_from_files(db, "app0:data/cards.csv", "app0:data/decks.csv") == 0) return 0;
  card_db_load_builtin(db);
  return 1;
}
