#include "game_core.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

static CardDB g_card_db;
static int g_card_db_ready = 0;
static unsigned int g_rng_state = 0x9E3779B9u;

static int abs_i(int value) { return value < 0 ? -value : value; }

static int clamp_i(int value, int min, int max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

static int manhattan(int x0, int y0, int x1, int y1) {
  return abs_i(x0 - x1) + abs_i(y0 - y1);
}

static int tile_number(int x, int y) { return y * GAME_BOARD_W + x + 1; }

static unsigned int rng_next(void) {
  unsigned int x = g_rng_state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  g_rng_state = x;
  return x;
}

static void rng_seed_from_game(const GameCore *game) {
  unsigned int seed = 0xA341316Cu;
  if (game) {
    seed ^= (unsigned int)(game->turn_number * 1315423911u);
    seed ^= (unsigned int)(game->unit_count * 2654435761u);
  }
  if (seed == 0) seed = 0x9E3779B9u;
  g_rng_state = seed;
}

static void ensure_card_db_loaded(GameCore *game) {
  if (g_card_db_ready) {
    if (game) game->card_data_loaded_from_file = g_card_db.loaded_from_file;
    return;
  }
  card_db_load(&g_card_db);
  g_card_db_ready = 1;
  if (game) game->card_data_loaded_from_file = g_card_db.loaded_from_file;
}

static int is_actionable(const GameUnit *unit, int current_player, int turn_number) {
  if (!unit) return 0;
  if (!unit->alive) return 0;
  if (unit->owner != current_player) return 0;
  if (unit->acted_turn == turn_number) return 0;
  return 1;
}

static void clear_match_state(GameCore *game) {
  if (!game) return;

  game->cursor_x = 2;
  game->cursor_y = 0;
  game->selected_unit = -1;
  game->current_player = 1;
  game->turn_number = 1;
  game->winner = 0;
  game->p1_life = 20;
  game->p2_life = 20;
  game->unit_count = 0;
  game->log_count = 0;
  game->log_head = 0;

  for (int p = 1; p <= 2; p++) {
    game->deck_name[p][0] = '\0';
    game->active_deck_index[p] = -1;
    game->deck_count[p] = 0;
    game->hand_count[p] = 0;
    game->grave_count[p] = 0;
    game->selected_hand_index[p] = -1;
    game->max_mana[p] = 1;
    game->mana[p] = 1;
  }
}

static void spawn_unit(GameCore *game, const char *name, int owner, int x, int y, int hp, int atk, int is_avatar,
                       int acted_turn) {
  if (!game || game->unit_count >= GAME_MAX_UNITS) return;

  GameUnit *unit = &game->units[game->unit_count++];
  memset(unit, 0, sizeof(*unit));
  snprintf(unit->name, sizeof(unit->name), "%s", name ? name : "Unit");
  unit->owner = owner;
  unit->x = x;
  unit->y = y;
  unit->hp = hp;
  unit->max_hp = hp;
  unit->atk = atk;
  unit->alive = 1;
  unit->is_avatar = is_avatar;
  unit->acted_turn = acted_turn;
}

void game_core_add_log(GameCore *game, const char *fmt, ...) {
  if (!game || !fmt) return;

  va_list args;
  va_start(args, fmt);
  vsnprintf(game->log[game->log_head], GAME_LOG_LINE_MAX, fmt, args);
  va_end(args);

  game->log_head = (game->log_head + 1) % GAME_LOG_LINES;
  if (game->log_count < GAME_LOG_LINES) game->log_count++;
}

const char *game_core_log_get(const GameCore *game, int index_from_latest) {
  static const char *empty = "";
  if (!game) return empty;
  if (index_from_latest < 0 || index_from_latest >= game->log_count) return empty;

  int idx = game->log_head - 1 - index_from_latest;
  while (idx < 0) idx += GAME_LOG_LINES;
  idx %= GAME_LOG_LINES;
  return game->log[idx];
}

int game_core_unit_at(const GameCore *game, int x, int y) {
  if (!game) return -1;
  for (int i = 0; i < game->unit_count; i++) {
    const GameUnit *unit = &game->units[i];
    if (!unit->alive) continue;
    if (unit->x == x && unit->y == y) return i;
  }
  return -1;
}

static int find_avatar(const GameCore *game, int owner) {
  if (!game) return -1;
  for (int i = 0; i < game->unit_count; i++) {
    const GameUnit *unit = &game->units[i];
    if (unit->alive && unit->is_avatar && unit->owner == owner) return i;
  }
  return -1;
}

static void remove_hand_card(GameCore *game, int player, int index) {
  if (!game || player < 1 || player > 2) return;
  if (index < 0 || index >= game->hand_count[player]) return;

  for (int i = index; i + 1 < game->hand_count[player]; i++) {
    game->hand_cards[player][i] = game->hand_cards[player][i + 1];
  }
  game->hand_count[player]--;

  if (game->hand_count[player] <= 0) {
    game->selected_hand_index[player] = -1;
  } else if (game->selected_hand_index[player] >= game->hand_count[player]) {
    game->selected_hand_index[player] = game->hand_count[player] - 1;
  }
}

static void add_grave_card(GameCore *game, int player, int card_id) {
  if (!game || player < 1 || player > 2) return;
  if (game->grave_count[player] >= GAME_MAX_GRAVE_CARDS) return;
  game->grave_cards[player][game->grave_count[player]++] = card_id;
}

static int draw_card(GameCore *game, int player, int amount) {
  if (!game || player < 1 || player > 2 || amount <= 0) return 0;
  int drew = 0;
  for (int i = 0; i < amount; i++) {
    if (game->deck_count[player] <= 0) break;
    if (game->hand_count[player] >= GAME_MAX_HAND_CARDS) break;
    int card_id = game->deck_cards[player][game->deck_count[player] - 1];
    game->deck_count[player]--;
    game->hand_cards[player][game->hand_count[player]++] = card_id;
    if (game->selected_hand_index[player] < 0) game->selected_hand_index[player] = 0;
    drew++;
  }
  return drew;
}

static void shuffle_deck(GameCore *game, int player) {
  if (!game || player < 1 || player > 2) return;
  for (int i = game->deck_count[player] - 1; i > 0; i--) {
    int j = (int)(rng_next() % (unsigned int)(i + 1));
    int tmp = game->deck_cards[player][i];
    game->deck_cards[player][i] = game->deck_cards[player][j];
    game->deck_cards[player][j] = tmp;
  }
}

static int load_player_deck(GameCore *game, int player, int deck_index) {
  if (!game || player < 1 || player > 2) return -1;

  const DeckDef *deck = card_db_get_deck(&g_card_db, deck_index);
  int used_idx = deck_index;
  if (!deck && g_card_db.deck_count > 0) {
    deck = &g_card_db.decks[0];
    used_idx = 0;
  }
  if (!deck) return -1;

  snprintf(game->deck_name[player], sizeof(game->deck_name[player]), "%s", deck->name);
  game->deck_count[player] = clamp_i(deck->card_count, 0, GAME_MAX_DECK_CARDS);
  for (int i = 0; i < game->deck_count[player]; i++) {
    game->deck_cards[player][i] = deck->cards[i];
  }
  return used_idx;
}

static void sync_avatar_life(GameCore *game) {
  if (!game) return;
  game->p1_life = 0;
  game->p2_life = 0;
  for (int i = 0; i < game->unit_count; i++) {
    const GameUnit *unit = &game->units[i];
    if (!unit->alive || !unit->is_avatar) continue;
    if (unit->owner == 1) game->p1_life = unit->hp;
    if (unit->owner == 2) game->p2_life = unit->hp;
  }
}

static int can_summon_at(const GameCore *game, int player, int x, int y) {
  if (!game || player < 1 || player > 2) return 0;
  if (x < 0 || y < 0 || x >= GAME_BOARD_W || y >= GAME_BOARD_H) return 0;
  if (game_core_unit_at(game, x, y) >= 0) return 0;

  int avatar_idx = find_avatar(game, player);
  if (avatar_idx < 0) return 0;
  const GameUnit *avatar = &game->units[avatar_idx];
  return manhattan(avatar->x, avatar->y, x, y) <= 1;
}

static int spell_target_matches(const GameUnit *unit, int player, int flags) {
  if (!unit || !unit->alive) return 0;
  if (flags & CARD_FLAG_TARGET_ANY) return 1;

  int matches = 0;
  if (flags & CARD_FLAG_TARGET_ENEMY) matches |= unit->owner != player;
  if (flags & CARD_FLAG_TARGET_ALLY) matches |= unit->owner == player;
  if ((flags & (CARD_FLAG_TARGET_ENEMY | CARD_FLAG_TARGET_ALLY)) == 0) return 1;
  return matches ? 1 : 0;
}

static int apply_damage_spell(GameCore *game, int player, const CardDef *card, int primary_target_idx) {
  if (!game || !card) return 0;
  if (primary_target_idx < 0 || primary_target_idx >= game->unit_count) return 0;
  GameUnit *primary = &game->units[primary_target_idx];
  if (!spell_target_matches(primary, player, card->flags)) return 0;

  int hits = 0;
  int defeated = 0;
  for (int i = 0; i < game->unit_count; i++) {
    GameUnit *unit = &game->units[i];
    if (!unit->alive) continue;
    if (i != primary_target_idx) {
      if ((card->flags & CARD_FLAG_AOE_ADJACENT) == 0) continue;
      if (manhattan(unit->x, unit->y, primary->x, primary->y) > 1) continue;
      if (!spell_target_matches(unit, player, card->flags)) continue;
    }
    unit->hp -= card->atk;
    hits++;
    if (unit->is_avatar) sync_avatar_life(game);
    if (unit->hp <= 0) {
      unit->alive = 0;
      defeated++;
      game_core_add_log(game, "%s is defeated.", unit->name);
      if (unit->is_avatar) {
        game->winner = player;
        sync_avatar_life(game);
      }
    }
  }

  if (hits <= 0) return 0;
  if (card->flags & CARD_FLAG_AOE_ADJACENT) {
    game_core_add_log(game, "%s blasts %d unit(s) for %d.", card->name, hits, card->atk);
  } else {
    game_core_add_log(game, "%s hits %s for %d.", card->name, primary->name, card->atk);
  }
  if (game->winner) game_core_add_log(game, "Player %d wins.", player);
  (void)defeated;
  return 1;
}

static int apply_heal_spell(GameCore *game, int player, const CardDef *card, int primary_target_idx) {
  if (!game || !card) return 0;
  if (primary_target_idx < 0 || primary_target_idx >= game->unit_count) return 0;
  GameUnit *primary = &game->units[primary_target_idx];
  if (!spell_target_matches(primary, player, card->flags)) return 0;

  int healed_units = 0;
  int total_heal = 0;
  for (int i = 0; i < game->unit_count; i++) {
    GameUnit *unit = &game->units[i];
    if (!unit->alive) continue;
    if (i != primary_target_idx) {
      if ((card->flags & CARD_FLAG_AOE_ADJACENT) == 0) continue;
      if (manhattan(unit->x, unit->y, primary->x, primary->y) > 1) continue;
      if (!spell_target_matches(unit, player, card->flags)) continue;
    }
    int before = unit->hp;
    unit->hp = clamp_i(unit->hp + card->atk, 0, unit->max_hp);
    int gained = unit->hp - before;
    if (gained > 0) {
      healed_units++;
      total_heal += gained;
    }
    if (unit->is_avatar) sync_avatar_life(game);
  }

  if (card->flags & CARD_FLAG_AOE_ADJACENT) {
    game_core_add_log(game, "%s restores %d across %d unit(s).", card->name, total_heal, healed_units);
  } else {
    game_core_add_log(game, "%s heals %s for %d.", card->name, primary->name, total_heal);
  }
  return 1;
}

static int apply_buff_spell(GameCore *game, int player, const CardDef *card, int primary_target_idx) {
  if (!game || !card) return 0;
  if (primary_target_idx < 0 || primary_target_idx >= game->unit_count) return 0;
  GameUnit *target = &game->units[primary_target_idx];
  if (!spell_target_matches(target, player, card->flags)) return 0;

  const int atk_up = clamp_i(card->atk, 1, 6);
  const int hp_up = clamp_i(card->hp > 0 ? card->hp : 1, 1, 6);
  target->atk = clamp_i(target->atk + atk_up, 0, 20);
  target->max_hp = clamp_i(target->max_hp + hp_up, 1, 30);
  target->hp = clamp_i(target->hp + hp_up, 0, target->max_hp);
  if (target->is_avatar) sync_avatar_life(game);

  game_core_add_log(game, "%s empowers %s (+%d/+%d).", card->name, target->name, atk_up, hp_up);
  return 1;
}

static int apply_summon_spell(GameCore *game, int player, const CardDef *card, int x, int y) {
  if (!game || !card) return 0;
  if (!can_summon_at(game, player, x, y)) return 0;

  const int hp = clamp_i(card->hp > 0 ? card->hp : card->atk, 1, 12);
  const int atk = clamp_i(card->atk, 1, 12);
  spawn_unit(game, card->name, player, x, y, hp, atk, 0, game->turn_number);
  game_core_add_log(game, "%s summons %s on tile %d.", card->name, card->name, tile_number(x, y));
  return 1;
}

static int apply_debuff_spell(GameCore *game, int player, const CardDef *card, int primary_target_idx) {
  if (!game || !card) return 0;
  if (primary_target_idx < 0 || primary_target_idx >= game->unit_count) return 0;
  GameUnit *target = &game->units[primary_target_idx];
  if (!spell_target_matches(target, player, card->flags)) return 0;

  const int atk_down = clamp_i(card->atk, 1, 6);
  const int hp_down = clamp_i(card->hp, 0, 4);
  target->atk = clamp_i(target->atk - atk_down, 0, 20);
  if (hp_down > 0) {
    target->hp = clamp_i(target->hp - hp_down, -30, target->max_hp);
  }
  target->acted_turn = game->turn_number; /* soft stun for this turn */
  if (target->is_avatar) sync_avatar_life(game);

  game_core_add_log(game, "%s weakens %s (-%d atk%s).", card->name, target->name, atk_down,
                    hp_down > 0 ? ", -hp" : "");
  if (target->hp <= 0) {
    target->alive = 0;
    game_core_add_log(game, "%s is defeated.", target->name);
    if (target->is_avatar) {
      game->winner = player;
      sync_avatar_life(game);
      game_core_add_log(game, "Player %d wins.", player);
    }
  }
  return 1;
}

static int play_selected_card(GameCore *game) {
  if (!game || game->winner) return 0;

  const int player = game->current_player;
  int selected = game->selected_hand_index[player];
  if (selected < 0 || selected >= game->hand_count[player]) return 0;

  int card_id = game->hand_cards[player][selected];
  const CardDef *card = card_db_get_card(&g_card_db, card_id);
  if (!card) return 0;

  if (card->cost > game->mana[player]) {
    game_core_add_log(game, "Not enough mana for %s (%d/%d).", card->name, game->mana[player], card->cost);
    return 0;
  }

  int action_done = 0;
  int target_idx = game_core_unit_at(game, game->cursor_x, game->cursor_y);

  if (card->kind == CARD_KIND_UNIT) {
    if (!can_summon_at(game, player, game->cursor_x, game->cursor_y)) {
      game_core_add_log(game, "Summon %s on an empty tile near your avatar.", card->name);
      return 0;
    }
    spawn_unit(game, card->name, player, game->cursor_x, game->cursor_y, card->hp, card->atk, 0, game->turn_number);
    game_core_add_log(game, "%s summoned on tile %d.", card->name, tile_number(game->cursor_x, game->cursor_y));
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_DAMAGE) {
    if (target_idx < 0) {
      game_core_add_log(game, "%s needs a valid target.", card->name);
      return 0;
    }
    if (target_idx >= 0 && !spell_target_matches(&game->units[target_idx], player, card->flags)) {
      game_core_add_log(game, "%s cannot target that unit.", card->name);
      return 0;
    }
    if (!apply_damage_spell(game, player, card, target_idx)) return 0;
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_HEAL) {
    if (target_idx < 0) {
      game_core_add_log(game, "%s needs a valid target.", card->name);
      return 0;
    }
    if (target_idx >= 0 && !spell_target_matches(&game->units[target_idx], player, card->flags)) {
      game_core_add_log(game, "%s cannot target that unit.", card->name);
      return 0;
    }
    if (!apply_heal_spell(game, player, card, target_idx)) return 0;
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_DRAW) {
    int drew = draw_card(game, player, clamp_i(card->atk, 1, 3));
    game_core_add_log(game, "%s draws %d card(s).", card->name, drew);
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_RAMP) {
    int before_max = game->max_mana[player];
    game->max_mana[player] = clamp_i(game->max_mana[player] + clamp_i(card->atk, 1, 2), 1, 9);
    game->mana[player] = clamp_i(game->mana[player] + 1, 0, game->max_mana[player]);
    game_core_add_log(game, "%s increases mana cap %d->%d.", card->name, before_max, game->max_mana[player]);
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_BUFF) {
    if (target_idx < 0) {
      game_core_add_log(game, "%s needs a friendly target.", card->name);
      return 0;
    }
    if (!spell_target_matches(&game->units[target_idx], player, card->flags)) {
      game_core_add_log(game, "%s cannot target that unit.", card->name);
      return 0;
    }
    if (!apply_buff_spell(game, player, card, target_idx)) return 0;
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_SUMMON) {
    if (!apply_summon_spell(game, player, card, game->cursor_x, game->cursor_y)) {
      game_core_add_log(game, "%s needs an empty tile near your avatar.", card->name);
      return 0;
    }
    action_done = 1;
  } else if (card->kind == CARD_KIND_SPELL_DEBUFF) {
    if (target_idx < 0) {
      game_core_add_log(game, "%s needs an enemy target.", card->name);
      return 0;
    }
    if (!spell_target_matches(&game->units[target_idx], player, card->flags)) {
      game_core_add_log(game, "%s cannot target that unit.", card->name);
      return 0;
    }
    if (!apply_debuff_spell(game, player, card, target_idx)) return 0;
    action_done = 1;
  }

  if (!action_done) return 0;

  game->mana[player] = clamp_i(game->mana[player] - card->cost, 0, 99);
  remove_hand_card(game, player, selected);
  add_grave_card(game, player, card_id);
  return 1;
}

void game_core_set_single_player(GameCore *game, int enabled) {
  if (!game) return;
  game->mode_single_player = enabled ? 1 : 0;
}

int game_core_is_single_player(const GameCore *game) {
  if (!game) return 0;
  return game->mode_single_player ? 1 : 0;
}

void game_core_new_match(GameCore *game, int single_player, int deck1_index, int deck2_index) {
  if (!game) return;
  ensure_card_db_loaded(game);
  clear_match_state(game);
  game->mode_single_player = single_player ? 1 : 0;
  game->card_data_loaded_from_file = g_card_db.loaded_from_file;

  rng_seed_from_game(game);
  game->active_deck_index[1] = load_player_deck(game, 1, deck1_index);
  game->active_deck_index[2] = load_player_deck(game, 2, deck2_index);
  shuffle_deck(game, 1);
  shuffle_deck(game, 2);

  spawn_unit(game, "Avatar Air", 1, 2, 0, 20, 3, 1, 0);                  /* tile 3 */
  spawn_unit(game, "Avatar Fire", 2, 2, GAME_BOARD_H - 1, 20, 3, 1, 0);  /* tile 18 */
  sync_avatar_life(game);

  draw_card(game, 1, 5);
  draw_card(game, 2, 5);

  game_core_add_log(game, "Native runtime online.");
  game_core_add_log(game, "P1 deck: %s", game->deck_name[1]);
  game_core_add_log(game, "P2 deck: %s", game->deck_name[2]);
  game_core_add_log(game, "Avatars: P1 tile 3, P2 tile 18.");
  game_core_add_log(game, "Turn 1: Player 1");
}

void game_core_init(GameCore *game) {
  if (!game) return;
  memset(game, 0, sizeof(*game));
  game_core_new_match(game, 1, 0, 1);
}

void game_core_reset(GameCore *game) {
  if (!game) return;
  int single = game->mode_single_player ? 1 : 0;
  int deck1 = game->active_deck_index[1] >= 0 ? game->active_deck_index[1] : 0;
  int deck2 = game->active_deck_index[2] >= 0 ? game->active_deck_index[2] : (single ? 1 : 2);
  game_core_new_match(game, single, deck1, deck2);
}

void game_core_move_cursor(GameCore *game, int dx, int dy) {
  if (!game || game->winner) return;
  game->cursor_x = clamp_i(game->cursor_x + dx, 0, GAME_BOARD_W - 1);
  game->cursor_y = clamp_i(game->cursor_y + dy, 0, GAME_BOARD_H - 1);
}

void game_core_hand_next(GameCore *game) {
  if (!game) return;
  int player = game->current_player;
  if (game->hand_count[player] <= 0) return;
  int idx = game->selected_hand_index[player];
  if (idx < 0) idx = 0;
  idx = (idx + 1) % game->hand_count[player];
  game->selected_hand_index[player] = idx;
}

void game_core_hand_prev(GameCore *game) {
  if (!game) return;
  int player = game->current_player;
  if (game->hand_count[player] <= 0) return;
  int idx = game->selected_hand_index[player];
  if (idx < 0) idx = 0;
  idx--;
  if (idx < 0) idx = game->hand_count[player] - 1;
  game->selected_hand_index[player] = idx;
}

void game_core_cancel(GameCore *game) {
  if (!game) return;
  if (game->selected_unit >= 0) {
    game->selected_unit = -1;
    game_core_add_log(game, "Selection cleared.");
  }
}

void game_core_end_turn(GameCore *game) {
  if (!game || game->winner) return;

  game->selected_unit = -1;
  game->current_player = game->current_player == 1 ? 2 : 1;
  game->turn_number += 1;

  int p = game->current_player;
  game->max_mana[p] = clamp_i(game->max_mana[p] + 1, 1, 9);
  game->mana[p] = game->max_mana[p];

  int drew = draw_card(game, p, 1);
  if (drew <= 0 && game->deck_count[p] <= 0) {
    game_core_add_log(game, "Player %d has no cards left to draw.", p);
  }

  game_core_add_log(game, "Turn %d: Player %d", game->turn_number, p);
}

void game_core_select_or_act(GameCore *game) {
  if (!game || game->winner) return;

  const int target_x = game->cursor_x;
  const int target_y = game->cursor_y;
  const int target_idx = game_core_unit_at(game, target_x, target_y);

  if (game->selected_unit < 0) {
    if (target_idx >= 0) {
      GameUnit *unit = &game->units[target_idx];
      if (unit->owner == game->current_player) {
        if (unit->acted_turn == game->turn_number) {
          game_core_add_log(game, "%s has already acted.", unit->name);
          return;
        }
        game->selected_unit = target_idx;
        game_core_add_log(game, "Selected %s.", unit->name);
        return;
      }
    }

    if (play_selected_card(game)) return;

    if (target_idx < 0) {
      game_core_add_log(game, "No unit/card action at tile %d.", tile_number(target_x, target_y));
    } else {
      game_core_add_log(game, "Select one of your units or play a card.");
    }
    return;
  }

  GameUnit *active = &game->units[game->selected_unit];
  if (!active->alive || active->owner != game->current_player) {
    game->selected_unit = -1;
    return;
  }
  if (active->acted_turn == game->turn_number) {
    game->selected_unit = -1;
    game_core_add_log(game, "%s has already acted.", active->name);
    return;
  }

  if (active->x == target_x && active->y == target_y) {
    game->selected_unit = -1;
    game_core_add_log(game, "Selection cleared.");
    return;
  }

  const int dist = manhattan(target_x, target_y, active->x, active->y);
  if (dist != 1) {
    game_core_add_log(game, "Choose an adjacent tile.");
    return;
  }

  if (target_idx < 0) {
    active->x = target_x;
    active->y = target_y;
    active->acted_turn = game->turn_number;
    game->selected_unit = -1;
    game_core_add_log(game, "%s moved to tile %d.", active->name, tile_number(target_x, target_y));
    return;
  }

  GameUnit *target = &game->units[target_idx];
  if (target->owner == active->owner) {
    if (target->acted_turn == game->turn_number) {
      game_core_add_log(game, "%s has already acted.", target->name);
      return;
    }
    game->selected_unit = target_idx;
    game_core_add_log(game, "Selected %s.", target->name);
    return;
  }

  target->hp -= active->atk;
  active->acted_turn = game->turn_number;
  game->selected_unit = -1;
  game_core_add_log(game, "%s hit %s for %d.", active->name, target->name, active->atk);

  if (target->is_avatar) sync_avatar_life(game);
  if (target->hp <= 0) {
    target->alive = 0;
    game_core_add_log(game, "%s is defeated.", target->name);
    if (target->is_avatar) {
      game->winner = active->owner;
      sync_avatar_life(game);
      game_core_add_log(game, "Player %d wins.", game->winner);
    }
  }
}

int game_core_ai_take_action(GameCore *game) {
  if (!game || game->winner) return 0;
  if (!game->mode_single_player || game->current_player != 2) return 0;

  /* Try to play a card first. */
  for (int i = 0; i < game->hand_count[2]; i++) {
    int card_id = game->hand_cards[2][i];
    const CardDef *card = card_db_get_card(&g_card_db, card_id);
    if (!card) continue;
    if (card->cost > game->mana[2]) continue;

    if (card->kind == CARD_KIND_UNIT) {
      int avatar_idx = find_avatar(game, 2);
      if (avatar_idx >= 0) {
        const GameUnit *avatar = &game->units[avatar_idx];
        static const int steps[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int s = 0; s < 4; s++) {
          int nx = avatar->x + steps[s][0];
          int ny = avatar->y + steps[s][1];
          if (can_summon_at(game, 2, nx, ny)) {
            game->cursor_x = nx;
            game->cursor_y = ny;
            game->selected_hand_index[2] = i;
            return play_selected_card(game) ? 1 : 0;
          }
        }
      }
    } else if (card->kind == CARD_KIND_SPELL_DAMAGE) {
      int avatar_idx = find_avatar(game, 1);
      if (avatar_idx >= 0) {
        GameUnit *avatar = &game->units[avatar_idx];
        game->cursor_x = avatar->x;
        game->cursor_y = avatar->y;
        game->selected_hand_index[2] = i;
        if (play_selected_card(game)) return 1;
      }
    } else if (card->kind == CARD_KIND_SPELL_HEAL) {
      for (int u = 0; u < game->unit_count; u++) {
        GameUnit *ally = &game->units[u];
        if (!ally->alive || ally->owner != 2) continue;
        if (ally->hp >= ally->max_hp) continue;
        game->cursor_x = ally->x;
        game->cursor_y = ally->y;
        game->selected_hand_index[2] = i;
        if (play_selected_card(game)) return 1;
      }
    } else if (card->kind == CARD_KIND_SPELL_DRAW) {
      game->selected_hand_index[2] = i;
      if (play_selected_card(game)) return 1;
    } else if (card->kind == CARD_KIND_SPELL_RAMP) {
      if (game->max_mana[2] < 9 || game->mana[2] < game->max_mana[2]) {
        game->selected_hand_index[2] = i;
        if (play_selected_card(game)) return 1;
      }
    } else if (card->kind == CARD_KIND_SPELL_BUFF) {
      for (int u = 0; u < game->unit_count; u++) {
        GameUnit *ally = &game->units[u];
        if (!ally->alive || ally->owner != 2) continue;
        game->cursor_x = ally->x;
        game->cursor_y = ally->y;
        game->selected_hand_index[2] = i;
        if (play_selected_card(game)) return 1;
      }
    } else if (card->kind == CARD_KIND_SPELL_SUMMON) {
      int avatar_idx = find_avatar(game, 2);
      if (avatar_idx >= 0) {
        const GameUnit *avatar = &game->units[avatar_idx];
        static const int steps[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int s = 0; s < 4; s++) {
          int nx = avatar->x + steps[s][0];
          int ny = avatar->y + steps[s][1];
          if (can_summon_at(game, 2, nx, ny)) {
            game->cursor_x = nx;
            game->cursor_y = ny;
            game->selected_hand_index[2] = i;
            if (play_selected_card(game)) return 1;
          }
        }
      }
    } else if (card->kind == CARD_KIND_SPELL_DEBUFF) {
      int best_enemy = -1;
      int best_atk = -1;
      for (int u = 0; u < game->unit_count; u++) {
        GameUnit *enemy = &game->units[u];
        if (!enemy->alive || enemy->owner == 2) continue;
        if (enemy->atk > best_atk) {
          best_atk = enemy->atk;
          best_enemy = u;
        }
      }
      if (best_enemy >= 0) {
        game->cursor_x = game->units[best_enemy].x;
        game->cursor_y = game->units[best_enemy].y;
        game->selected_hand_index[2] = i;
        if (play_selected_card(game)) return 1;
      }
    }
  }

  /* Then try unit actions. */
  int active_idx = -1;
  int nearest_enemy_dist = 999;

  for (int i = 0; i < game->unit_count; i++) {
    const GameUnit *unit = &game->units[i];
    if (!is_actionable(unit, 2, game->turn_number)) continue;

    int best_for_unit = 999;
    for (int j = 0; j < game->unit_count; j++) {
      const GameUnit *enemy = &game->units[j];
      if (!enemy->alive || enemy->owner == unit->owner) continue;
      const int dist = manhattan(unit->x, unit->y, enemy->x, enemy->y);
      if (dist < best_for_unit) best_for_unit = dist;
    }
    if (best_for_unit < nearest_enemy_dist) {
      nearest_enemy_dist = best_for_unit;
      active_idx = i;
    }
  }

  if (active_idx < 0) {
    game_core_end_turn(game);
    return 0;
  }

  GameUnit *active = &game->units[active_idx];
  int target_idx = -1;
  int target_dist = 999;
  for (int j = 0; j < game->unit_count; j++) {
    const GameUnit *enemy = &game->units[j];
    if (!enemy->alive || enemy->owner == active->owner) continue;
    const int dist = manhattan(active->x, active->y, enemy->x, enemy->y);
    if (dist < target_dist) {
      target_dist = dist;
      target_idx = j;
    }
  }

  if (target_idx < 0) {
    active->acted_turn = game->turn_number;
    return 1;
  }

  GameUnit *enemy = &game->units[target_idx];
  if (target_dist == 1) {
    enemy->hp -= active->atk;
    active->acted_turn = game->turn_number;
    game_core_add_log(game, "%s strikes %s for %d.", active->name, enemy->name, active->atk);
    if (enemy->is_avatar) sync_avatar_life(game);
    if (enemy->hp <= 0) {
      enemy->alive = 0;
      game_core_add_log(game, "%s is defeated.", enemy->name);
      if (enemy->is_avatar) {
        game->winner = active->owner;
        sync_avatar_life(game);
        game_core_add_log(game, "Player %d wins.", game->winner);
      }
    }
    return 1;
  }

  static const int steps[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
  int best_x = active->x;
  int best_y = active->y;
  int best_dist = target_dist;
  for (int i = 0; i < 4; i++) {
    int nx = active->x + steps[i][0];
    int ny = active->y + steps[i][1];
    if (nx < 0 || ny < 0 || nx >= GAME_BOARD_W || ny >= GAME_BOARD_H) continue;
    if (game_core_unit_at(game, nx, ny) >= 0) continue;
    int dist = manhattan(nx, ny, enemy->x, enemy->y);
    if (dist < best_dist) {
      best_dist = dist;
      best_x = nx;
      best_y = ny;
    }
  }

  if (best_x == active->x && best_y == active->y) {
    active->acted_turn = game->turn_number;
    game_core_add_log(game, "%s holds position.", active->name);
    return 1;
  }

  active->x = best_x;
  active->y = best_y;
  active->acted_turn = game->turn_number;
  game_core_add_log(game, "%s advances.", active->name);
  return 1;
}

int game_core_get_hand_count(const GameCore *game, int player) {
  if (!game || player < 1 || player > 2) return 0;
  return game->hand_count[player];
}

int game_core_get_hand_card_id(const GameCore *game, int player, int index) {
  if (!game || player < 1 || player > 2) return 0;
  if (index < 0 || index >= game->hand_count[player]) return 0;
  return game->hand_cards[player][index];
}

int game_core_get_selected_hand_index(const GameCore *game, int player) {
  if (!game || player < 1 || player > 2) return -1;
  return game->selected_hand_index[player];
}

int game_core_get_mana(const GameCore *game, int player) {
  if (!game || player < 1 || player > 2) return 0;
  return game->mana[player];
}

int game_core_get_max_mana(const GameCore *game, int player) {
  if (!game || player < 1 || player > 2) return 0;
  return game->max_mana[player];
}

int game_core_get_deck_remaining(const GameCore *game, int player) {
  if (!game || player < 1 || player > 2) return 0;
  return game->deck_count[player];
}

const char *game_core_get_deck_name(const GameCore *game, int player) {
  static const char *empty = "";
  if (!game || player < 1 || player > 2) return empty;
  return game->deck_name[player];
}

int game_core_card_data_from_file(const GameCore *game) {
  if (!game) return 0;
  return game->card_data_loaded_from_file ? 1 : 0;
}

const CardDef *game_core_get_card_def(int card_id) { return card_db_get_card(&g_card_db, card_id); }

const CardDB *game_core_card_db(void) { return &g_card_db; }
