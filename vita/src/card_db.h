#ifndef SORCERY_VITA_CARD_DB_H
#define SORCERY_VITA_CARD_DB_H

#define CARD_DB_MAX_CARDS 2048
#define CARD_DB_MAX_DECKS 64
#define CARD_DB_MAX_DECK_CARDS 160

typedef enum CardKind {
  CARD_KIND_UNIT = 0,
  CARD_KIND_SPELL_DAMAGE = 1,
  CARD_KIND_SPELL_HEAL = 2,
  CARD_KIND_SPELL_DRAW = 3,
  CARD_KIND_SPELL_RAMP = 4,
  CARD_KIND_SPELL_BUFF = 5,
  CARD_KIND_SPELL_SUMMON = 6,
  CARD_KIND_SPELL_DEBUFF = 7,
} CardKind;

typedef enum CardFlags {
  CARD_FLAG_NONE = 0,
  CARD_FLAG_TARGET_ENEMY = 1 << 0,
  CARD_FLAG_TARGET_ALLY = 1 << 1,
  CARD_FLAG_TARGET_ANY = 1 << 2,
  CARD_FLAG_AOE_TILE = 1 << 3,
  CARD_FLAG_AOE_ADJACENT = 1 << 4,
} CardFlags;

typedef struct CardDef {
  int id;
  char name[40];
  CardKind kind;
  int cost;
  int atk;
  int hp;
  int flags;
} CardDef;

typedef struct DeckDef {
  char name[40];
  int cards[CARD_DB_MAX_DECK_CARDS];
  int card_count;
} DeckDef;

typedef struct CardDB {
  CardDef cards[CARD_DB_MAX_CARDS];
  int card_count;
  DeckDef decks[CARD_DB_MAX_DECKS];
  int deck_count;
  int loaded_from_file;
} CardDB;

int card_db_load(CardDB *db);
int card_db_load_from_files(CardDB *db, const char *cards_path, const char *decks_path);
void card_db_load_builtin(CardDB *db);

const CardDef *card_db_get_card(const CardDB *db, int id);
int card_db_find_deck(const CardDB *db, const char *name);
const DeckDef *card_db_get_deck(const CardDB *db, int deck_index);

#endif
