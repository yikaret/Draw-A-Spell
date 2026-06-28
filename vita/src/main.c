#include <stdbool.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include <psp2/ctrl.h>
#include <psp2/kernel/processmgr.h>

#include "game_core.h"
#include "input.h"
#include "render.h"
#include "save_state.h"

typedef enum AppScene {
  APP_SCENE_BOOT = 0,
  APP_SCENE_BOARD = 1,
} AppScene;

typedef enum BootMenuItem {
  BOOT_MENU_RESUME = 0,
  BOOT_MENU_NEW_SOLO = 1,
  BOOT_MENU_NEW_HOTSEAT = 2,
  BOOT_MENU_LOAD_SAVE = 3,
  BOOT_MENU_QUIT = 4,
  BOOT_MENU_COUNT = 5,
} BootMenuItem;

static void set_status(char *status, size_t status_size, int *ttl_frames, const char *fmt, ...) {
  if (!status || !status_size || !ttl_frames || !fmt) return;
  va_list args;
  va_start(args, fmt);
  vsnprintf(status, status_size, fmt, args);
  va_end(args);
  *ttl_frames = 360;
}

static void menu_move(int *index, int delta) {
  if (!index) return;
  int next = *index + delta;
  if (next < 0) next = BOOT_MENU_COUNT - 1;
  if (next >= BOOT_MENU_COUNT) next = 0;
  *index = next;
}

static int deck_count(void) {
  const CardDB *db = game_core_card_db();
  if (!db || db->deck_count <= 0) return 0;
  return db->deck_count;
}

static int cycle_deck(int current, int delta) {
  int count = deck_count();
  if (count <= 0) return 0;
  int next = current + delta;
  while (next < 0) next += count;
  next %= count;
  return next;
}

static const char *deck_name(int idx) {
  const CardDB *db = game_core_card_db();
  static const char *fallback = "(none)";
  if (!db || db->deck_count <= 0) return fallback;
  const DeckDef *deck = card_db_get_deck(db, idx);
  if (!deck || !deck->name[0]) return fallback;
  return deck->name;
}

int main(int argc, const char *argv[]) {
  (void)argc;
  (void)argv;

  Renderer renderer;
  if (renderer_init(&renderer) < 0) {
    sceKernelExitProcess(1);
    return 1;
  }

  input_init();

  GameCore game;
  game_core_init(&game);
  AppScene scene = APP_SCENE_BOOT;
  int boot_menu = BOOT_MENU_NEW_SOLO;
  int has_active_match = 1;
  int save_available = save_state_exists();
  int menu_p1_deck = 0;
  int menu_p2_deck = deck_count() > 1 ? 1 : 0;
  int ai_cooldown_frames = 0;
  int autosave_turn = -1;
  int autosave_player = -1;
  int status_ttl_frames = 0;
  char status_line[128];
  char last_log_line[GAME_LOG_LINE_MAX];
  memset(status_line, 0, sizeof(status_line));
  memset(last_log_line, 0, sizeof(last_log_line));
  set_status(status_line, sizeof(status_line), &status_ttl_frames, "Select a mode to start.");

  bool running = true;
  while (running) {
    int exit_requested = 0;
    InputState input;
    input_poll(&input);

    if (input_pressed(&input, SCE_CTRL_START)) {
      exit_requested = 1;
    }
    if (exit_requested) break;

    if (status_ttl_frames > 0) {
      status_ttl_frames--;
      if (status_ttl_frames == 0) {
        status_line[0] = '\0';
      }
    }

    if (scene == APP_SCENE_BOOT) {
      if (input_pressed(&input, SCE_CTRL_UP)) menu_move(&boot_menu, -1);
      if (input_pressed(&input, SCE_CTRL_DOWN)) menu_move(&boot_menu, 1);
      if (boot_menu == BOOT_MENU_NEW_SOLO || boot_menu == BOOT_MENU_NEW_HOTSEAT) {
        if (input_pressed(&input, SCE_CTRL_LEFT)) menu_p1_deck = cycle_deck(menu_p1_deck, -1);
        if (input_pressed(&input, SCE_CTRL_RIGHT)) menu_p1_deck = cycle_deck(menu_p1_deck, 1);
        if (input_pressed(&input, SCE_CTRL_LTRIGGER)) menu_p2_deck = cycle_deck(menu_p2_deck, -1);
        if (input_pressed(&input, SCE_CTRL_RTRIGGER)) menu_p2_deck = cycle_deck(menu_p2_deck, 1);
      }

      if (input_pressed(&input, SCE_CTRL_CROSS)) {
        if (boot_menu == BOOT_MENU_RESUME) {
          if (has_active_match) {
            scene = APP_SCENE_BOARD;
          } else {
            set_status(status_line, sizeof(status_line), &status_ttl_frames, "No active match to resume.");
          }
        } else if (boot_menu == BOOT_MENU_NEW_SOLO) {
          int p2 = menu_p2_deck;
          if (deck_count() > 1 && p2 == menu_p1_deck) p2 = cycle_deck(menu_p1_deck, 1);
          game_core_new_match(&game, 1, menu_p1_deck, p2);
          last_log_line[0] = '\0';
          has_active_match = 1;
          scene = APP_SCENE_BOARD;
          ai_cooldown_frames = 0;
          autosave_turn = -1;
          autosave_player = -1;
          set_status(status_line, sizeof(status_line), &status_ttl_frames, "New solo match started.");
        } else if (boot_menu == BOOT_MENU_NEW_HOTSEAT) {
          int p2 = menu_p2_deck;
          if (deck_count() > 1 && p2 == menu_p1_deck) p2 = cycle_deck(menu_p1_deck, 1);
          game_core_new_match(&game, 0, menu_p1_deck, p2);
          last_log_line[0] = '\0';
          has_active_match = 1;
          scene = APP_SCENE_BOARD;
          autosave_turn = -1;
          autosave_player = -1;
          set_status(status_line, sizeof(status_line), &status_ttl_frames, "New hotseat match started.");
        } else if (boot_menu == BOOT_MENU_LOAD_SAVE) {
          const int load_ret = save_state_read(&game);
          if (load_ret == 0) {
            last_log_line[0] = '\0';
            menu_p1_deck = game.active_deck_index[1] >= 0 ? game.active_deck_index[1] : menu_p1_deck;
            menu_p2_deck = game.active_deck_index[2] >= 0 ? game.active_deck_index[2] : menu_p2_deck;
            has_active_match = 1;
            save_available = 1;
            scene = APP_SCENE_BOARD;
            ai_cooldown_frames = 0;
            autosave_turn = game.turn_number;
            autosave_player = game.current_player;
            set_status(status_line, sizeof(status_line), &status_ttl_frames, "Loaded save: %s", save_state_path());
          } else {
            set_status(status_line, sizeof(status_line), &status_ttl_frames, "Load failed (%d).", load_ret);
          }
        } else if (boot_menu == BOOT_MENU_QUIT) {
          exit_requested = 1;
        }
      } else if (input_pressed(&input, SCE_CTRL_CIRCLE)) {
        exit_requested = 1;
      }
    } else {
      if (input_pressed(&input, SCE_CTRL_TRIANGLE)) {
        scene = APP_SCENE_BOOT;
      }
      const int select_held = (input.held & SCE_CTRL_SELECT) != 0;
      if (select_held && input_pressed(&input, SCE_CTRL_LTRIGGER)) {
        const int save_ret = save_state_write(&game);
        if (save_ret == 0) {
          save_available = 1;
          autosave_turn = game.turn_number;
          autosave_player = game.current_player;
          set_status(status_line, sizeof(status_line), &status_ttl_frames, "Saved match to %s", save_state_path());
        } else {
          set_status(status_line, sizeof(status_line), &status_ttl_frames, "Save failed (%d).", save_ret);
        }
      } else if (select_held && input_pressed(&input, SCE_CTRL_RTRIGGER)) {
        const int load_ret = save_state_read(&game);
        if (load_ret == 0) {
          last_log_line[0] = '\0';
          save_available = 1;
          ai_cooldown_frames = 0;
          autosave_turn = game.turn_number;
          autosave_player = game.current_player;
          set_status(status_line, sizeof(status_line), &status_ttl_frames, "Loaded save from %s", save_state_path());
        } else {
          set_status(status_line, sizeof(status_line), &status_ttl_frames, "Load failed (%d).", load_ret);
        }
      } else if (input_pressed(&input, SCE_CTRL_LTRIGGER)) {
        game_core_hand_prev(&game);
      } else if (input_pressed(&input, SCE_CTRL_RTRIGGER)) {
        game_core_hand_next(&game);
      }

      if (select_held && input_pressed(&input, SCE_CTRL_CROSS)) {
        game_core_reset(&game);
        last_log_line[0] = '\0';
        has_active_match = 1;
        autosave_turn = -1;
        autosave_player = -1;
        set_status(status_line, sizeof(status_line), &status_ttl_frames, "Match reset.");
      }

      const int ai_turn = game_core_is_single_player(&game) && game.current_player == 2 && !game.winner;
      if (!ai_turn && !select_held) {
        if (input_pressed(&input, SCE_CTRL_UP)) game_core_move_cursor(&game, 0, -1);
        if (input_pressed(&input, SCE_CTRL_DOWN)) game_core_move_cursor(&game, 0, 1);
        if (input_pressed(&input, SCE_CTRL_LEFT)) game_core_move_cursor(&game, -1, 0);
        if (input_pressed(&input, SCE_CTRL_RIGHT)) game_core_move_cursor(&game, 1, 0);

        if (input_pressed(&input, SCE_CTRL_CROSS)) game_core_select_or_act(&game);
        if (input_pressed(&input, SCE_CTRL_CIRCLE)) game_core_cancel(&game);
        if (input_pressed(&input, SCE_CTRL_SQUARE)) game_core_end_turn(&game);
      } else {
        if (ai_cooldown_frames > 0) {
          ai_cooldown_frames--;
        } else {
          const int acted = game_core_ai_take_action(&game);
          ai_cooldown_frames = acted ? 16 : 8;
        }
      }

      has_active_match = 1;
      const char *latest = game_core_log_get(&game, 0);
      if (latest && latest[0] && strcmp(latest, last_log_line) != 0) {
        snprintf(last_log_line, sizeof(last_log_line), "%s", latest);
        set_status(status_line, sizeof(status_line), &status_ttl_frames, "%s", latest);
      }

      if (has_active_match &&
          (game.turn_number != autosave_turn || game.current_player != autosave_player)) {
        if (save_state_write(&game) == 0) {
          save_available = 1;
          autosave_turn = game.turn_number;
          autosave_player = game.current_player;
        }
      }
    }

    if (exit_requested) break;

    renderer_begin_frame();
    if (scene == APP_SCENE_BOOT) {
      renderer_draw_boot(&renderer, boot_menu, has_active_match, save_available,
                         deck_name(menu_p1_deck), deck_name(menu_p2_deck), status_line);
    } else {
      renderer_draw_board(&renderer, &game, status_line);
    }
    renderer_end_frame();
  }

  renderer_term(&renderer);
  sceKernelExitProcess(0);
  return 0;
}
