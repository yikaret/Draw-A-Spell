#ifndef SORCERY_VITA_GAME_CORE_H
#define SORCERY_VITA_GAME_CORE_H

#include <stdint.h>

#include "card_db.h"

#define GAME_BOARD_W 5
#define GAME_BOARD_H 4
#define GAME_MAX_UNITS 20
#define GAME_LOG_LINES 8
#define GAME_LOG_LINE_MAX 96
#define GAME_MAX_DECK_CARDS 160
#define GAME_MAX_HAND_CARDS 10
#define GAME_MAX_GRAVE_CARDS 80

typedef struct GameUnit {
  int x;
  int y;
  int hp;
  int max_hp;
  int atk;
  int owner; /* 1 or 2 */
  int alive;
  int is_avatar;
  int acted_turn;
  char name[24];
} GameUnit;

typedef struct GameCore {
  int cursor_x;
  int cursor_y;
  int selected_unit;
  int current_player;
  int turn_number;
  int winner;
  int mode_single_player;
  int card_data_loaded_from_file;

  int p1_life;
  int p2_life;

  GameUnit units[GAME_MAX_UNITS];
  int unit_count;

  char deck_name[3][40];
  int active_deck_index[3];
  int deck_cards[3][GAME_MAX_DECK_CARDS];
  int deck_count[3];
  int hand_cards[3][GAME_MAX_HAND_CARDS];
  int hand_count[3];
  int grave_cards[3][GAME_MAX_GRAVE_CARDS];
  int grave_count[3];
  int selected_hand_index[3];
  int max_mana[3];
  int mana[3];

  char log[GAME_LOG_LINES][GAME_LOG_LINE_MAX];
  int log_count;
  int log_head;
} GameCore;

void game_core_init(GameCore *game);
void game_core_reset(GameCore *game);
void game_core_new_match(GameCore *game, int single_player, int deck1_index, int deck2_index);

void game_core_move_cursor(GameCore *game, int dx, int dy);
void game_core_select_or_act(GameCore *game);
void game_core_cancel(GameCore *game);
void game_core_end_turn(GameCore *game);
int game_core_ai_take_action(GameCore *game);
void game_core_set_single_player(GameCore *game, int enabled);
int game_core_is_single_player(const GameCore *game);

int game_core_unit_at(const GameCore *game, int x, int y);
const char *game_core_log_get(const GameCore *game, int index_from_latest);
void game_core_add_log(GameCore *game, const char *fmt, ...);

int game_core_get_hand_count(const GameCore *game, int player);
int game_core_get_hand_card_id(const GameCore *game, int player, int index);
int game_core_get_selected_hand_index(const GameCore *game, int player);
void game_core_hand_next(GameCore *game);
void game_core_hand_prev(GameCore *game);
int game_core_get_mana(const GameCore *game, int player);
int game_core_get_max_mana(const GameCore *game, int player);
int game_core_get_deck_remaining(const GameCore *game, int player);
const char *game_core_get_deck_name(const GameCore *game, int player);
int game_core_card_data_from_file(const GameCore *game);

const CardDef *game_core_get_card_def(int card_id);
const CardDB *game_core_card_db(void);

#endif
