#include "render.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

enum {
  SCREEN_W = 960,
  SCREEN_H = 544,
  BOARD_X = 26,
  BOARD_Y = 76,
  TILE_SIZE = 96,
};

static unsigned int card_kind_color(CardKind kind) {
  switch (kind) {
    case CARD_KIND_UNIT:
      return RGBA8(78, 118, 182, 255);
    case CARD_KIND_SPELL_DAMAGE:
      return RGBA8(173, 74, 60, 255);
    case CARD_KIND_SPELL_HEAL:
      return RGBA8(70, 148, 94, 255);
    case CARD_KIND_SPELL_DRAW:
      return RGBA8(145, 110, 54, 255);
    case CARD_KIND_SPELL_RAMP:
      return RGBA8(86, 128, 66, 255);
    case CARD_KIND_SPELL_BUFF:
      return RGBA8(126, 84, 162, 255);
    case CARD_KIND_SPELL_SUMMON:
      return RGBA8(90, 112, 176, 255);
    case CARD_KIND_SPELL_DEBUFF:
      return RGBA8(118, 76, 88, 255);
    default:
      return RGBA8(90, 90, 90, 255);
  }
}

static void draw_text(const Renderer *renderer, int x, int y, unsigned int color, float scale, const char *fmt, ...) {
  if (!renderer || !renderer->font || !fmt) return;

  char buffer[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buffer, sizeof(buffer), fmt, args);
  va_end(args);
  vita2d_pgf_draw_text(renderer->font, x, y, color, scale, buffer);
}

static void draw_texture_fit(vita2d_texture *tex, float x, float y, float box_w, float box_h) {
  if (!tex || box_w <= 1.0f || box_h <= 1.0f) return;
  const float tw = (float)vita2d_texture_get_width(tex);
  const float th = (float)vita2d_texture_get_height(tex);
  if (tw <= 0.0f || th <= 0.0f) return;

  float scale_x = box_w / tw;
  float scale_y = box_h / th;
  float scale = scale_x < scale_y ? scale_x : scale_y;
  if (scale <= 0.0f) return;

  const float dw = tw * scale;
  const float dh = th * scale;
  const float dx = x + (box_w - dw) * 0.5f;
  const float dy = y + (box_h - dh) * 0.5f;
  vita2d_draw_texture_scale(tex, dx, dy, scale, scale);
}

static vita2d_texture *renderer_get_card_art(Renderer *renderer, int card_id) {
  if (!renderer || card_id <= 0) return NULL;
  const int slot = card_id % RENDER_CARD_ART_CACHE_SLOTS;
  if (renderer->art_ids[slot] == card_id && renderer->art_tex[slot]) {
    return renderer->art_tex[slot];
  }

  if (renderer->art_tex[slot]) {
    vita2d_free_texture(renderer->art_tex[slot]);
    renderer->art_tex[slot] = NULL;
  }
  renderer->art_ids[slot] = 0;

  char path[96];
  snprintf(path, sizeof(path), "app0:data/art/%d.png", card_id);
  vita2d_texture *tex = vita2d_load_PNG_file(path);
  if (!tex) return NULL;

  renderer->art_ids[slot] = card_id;
  renderer->art_tex[slot] = tex;
  return tex;
}

static const char *card_kind_short(CardKind kind) {
  switch (kind) {
    case CARD_KIND_UNIT:
      return "UNIT";
    case CARD_KIND_SPELL_DAMAGE:
      return "DMG";
    case CARD_KIND_SPELL_HEAL:
      return "HEAL";
    case CARD_KIND_SPELL_DRAW:
      return "DRAW";
    case CARD_KIND_SPELL_RAMP:
      return "RAMP";
    case CARD_KIND_SPELL_BUFF:
      return "BUFF";
    case CARD_KIND_SPELL_SUMMON:
      return "SUMMON";
    case CARD_KIND_SPELL_DEBUFF:
      return "DEBUFF";
    default:
      return "CARD";
  }
}

static int tile_number_at(int x, int y) { return y * GAME_BOARD_W + x + 1; }

int renderer_init(Renderer *renderer) {
  if (!renderer) return -1;
  memset(renderer, 0, sizeof(*renderer));

  if (vita2d_init() < 0) return -1;
  vita2d_set_vblank_wait(1);
  vita2d_set_clear_color(RGBA8(8, 12, 18, 255));

  renderer->font = vita2d_load_default_pgf();
  renderer->logo = vita2d_load_PNG_file("app0:sce_sys/icon0.png");
  return 0;
}

void renderer_term(Renderer *renderer) {
  if (renderer) {
    for (int i = 0; i < RENDER_CARD_ART_CACHE_SLOTS; i++) {
      if (renderer->art_tex[i]) {
        vita2d_free_texture(renderer->art_tex[i]);
        renderer->art_tex[i] = NULL;
      }
      renderer->art_ids[i] = 0;
    }
    if (renderer->logo) {
      vita2d_free_texture(renderer->logo);
      renderer->logo = NULL;
    }
    if (renderer->font) {
      vita2d_free_pgf(renderer->font);
      renderer->font = NULL;
    }
  }
  vita2d_fini();
}

void renderer_begin_frame(void) {
  vita2d_start_drawing();
  vita2d_clear_screen();
}

void renderer_end_frame(void) {
  vita2d_end_drawing();
  vita2d_swap_buffers();
}

void renderer_draw_boot(const Renderer *renderer, int menu_index, int has_active_match, int has_save,
                        const char *deck1_name, const char *deck2_name, const char *status_line) {
  static const char *menu[] = {
      "Resume Match",
      "New Solo Match",
      "New Hotseat Match",
      "Load Saved Match",
      "Quit",
  };

  vita2d_draw_rectangle(0, 0, SCREEN_W, SCREEN_H, RGBA8(12, 20, 30, 255));
  vita2d_draw_rectangle(48, 40, SCREEN_W - 96, SCREEN_H - 80, RGBA8(24, 34, 48, 235));
  vita2d_draw_rectangle(58, 50, SCREEN_W - 116, 90, RGBA8(35, 52, 76, 255));

  if (renderer && renderer->logo) {
    float scale = 1.8f;
    float logo_x = 86.0f;
    float logo_y = 168.0f;
    vita2d_draw_texture_scale(renderer->logo, logo_x, logo_y, scale, scale);
  } else {
    vita2d_draw_rectangle(86, 168, 228, 228, RGBA8(52, 74, 112, 255));
  }

  draw_text(renderer, 78, 103, RGBA8(245, 252, 255, 255), 1.0f, "Sorcery Online - Native Vita");
  draw_text(renderer, 340, 188, RGBA8(230, 240, 255, 255), 0.82f, "Controller-native runtime");
  draw_text(renderer, 340, 214, RGBA8(188, 210, 240, 255), 0.72f, "Landscape-only native UI (no webview).");

  int menu_y = 250;
  for (int i = 0; i < 5; i++) {
    unsigned int row_bg = (i == menu_index) ? RGBA8(250, 215, 124, 255) : RGBA8(38, 56, 83, 255);
    unsigned int row_fg = (i == menu_index) ? RGBA8(15, 21, 31, 255) : RGBA8(233, 243, 255, 255);
    if ((i == 0 && !has_active_match) || (i == 3 && !has_save)) {
      row_bg = RGBA8(33, 43, 58, 255);
      row_fg = RGBA8(124, 145, 172, 255);
    }
    vita2d_draw_rectangle(340, (float)(menu_y - 18), 540, 30, row_bg);
    draw_text(renderer, 352, menu_y + 2, row_fg, 0.72f, "%s", menu[i]);
    menu_y += 36;
  }

  draw_text(renderer, 340, 436, RGBA8(215, 231, 247, 255), 0.62f, "P1 Deck: %s", deck1_name && deck1_name[0] ? deck1_name : "(none)");
  draw_text(renderer, 340, 458, RGBA8(215, 231, 247, 255), 0.62f, "P2 Deck: %s", deck2_name && deck2_name[0] ? deck2_name : "(none)");
  draw_text(renderer, 340, 480, RGBA8(255, 255, 255, 255), 0.62f,
            "Up/Down: Menu  Left/Right: P1 Deck  L/R Trigger: P2 Deck");
  draw_text(renderer, 340, 506, RGBA8(170, 196, 225, 255), 0.60f, "Match save path: ux0:data/sorcery-native/save.bin");
  if (status_line && status_line[0]) {
    draw_text(renderer, 340, 514, RGBA8(255, 226, 144, 255), 0.62f, "%s", status_line);
  }
}

void renderer_draw_board(Renderer *renderer, const GameCore *game, const char *status_line) {
  if (!renderer || !game) return;

  const int board_w_px = GAME_BOARD_W * TILE_SIZE;
  const int board_h_px = GAME_BOARD_H * TILE_SIZE;
  const int side_x = BOARD_X + board_w_px + 14;
  const int side_w = SCREEN_W - side_x - 10;

  vita2d_draw_rectangle(0, 0, SCREEN_W, SCREEN_H, RGBA8(10, 14, 20, 255));
  vita2d_draw_rectangle(0, 0, SCREEN_W, 58, RGBA8(28, 44, 66, 255));
  draw_text(renderer, 14, 30, RGBA8(248, 252, 255, 255), 0.8f, "Turn %d - Player %d", game->turn_number, game->current_player);
  draw_text(renderer, 228, 30, RGBA8(180, 230, 255, 255), 0.8f, "P1 %d", game->p1_life);
  draw_text(renderer, 308, 30, RGBA8(255, 182, 180, 255), 0.8f, "P2 %d", game->p2_life);
  draw_text(renderer, 386, 30, RGBA8(255, 237, 168, 255), 0.8f, "Mana %d/%d",
            game_core_get_mana(game, game->current_player),
            game_core_get_max_mana(game, game->current_player));
  draw_text(renderer, 548, 30, RGBA8(215, 225, 235, 255), 0.63f, "Square: End Turn  Circle: Cancel  Triangle: Menu");
  draw_text(renderer, 14, 52, RGBA8(195, 214, 238, 255), 0.60f,
            "Board: %dx%d", GAME_BOARD_W, GAME_BOARD_H);
  draw_text(renderer, 145, 52, RGBA8(195, 214, 238, 255), 0.60f,
            "Mode: %s", game->mode_single_player ? "Solo (AI on Player 2)" : "Hotseat");
  draw_text(renderer, 360, 52, RGBA8(195, 214, 238, 255), 0.60f,
            "Deck %s (%d left)",
            game_core_get_deck_name(game, game->current_player),
            game_core_get_deck_remaining(game, game->current_player));
  draw_text(renderer, 724, 52, RGBA8(172, 210, 180, 255), 0.60f,
            "%s cards", game_core_card_data_from_file(game) ? "CSV" : "builtin");
  draw_text(renderer, 850, 30, RGBA8(255, 232, 150, 255), 0.60f,
            "Tile %d", tile_number_at(game->cursor_x, game->cursor_y));

  vita2d_draw_rectangle((float)(BOARD_X - 7), (float)(BOARD_Y - 7), (float)(board_w_px + 14), (float)(board_h_px + 14),
                        RGBA8(18, 32, 52, 255));
  for (int y = 0; y < GAME_BOARD_H; y++) {
    for (int x = 0; x < GAME_BOARD_W; x++) {
      unsigned int base = RGBA8(46, 62, 84, 255);
      if (y == 0 || y == GAME_BOARD_H - 1) base = RGBA8(52, 70, 96, 255);
      if (x == 0 || x == GAME_BOARD_W - 1) base = RGBA8(58, 78, 104, 255);

      const float px = (float)(BOARD_X + x * TILE_SIZE);
      const float py = (float)(BOARD_Y + y * TILE_SIZE);
      vita2d_draw_rectangle(px, py, TILE_SIZE - 2, TILE_SIZE - 2, base);
      vita2d_draw_rectangle(px + 3, py + 3, TILE_SIZE - 8, TILE_SIZE - 8, RGBA8(20, 34, 52, 80));
      draw_text(renderer, (int)px + 6, (int)py + 16, RGBA8(175, 195, 218, 255), 0.50f, "%d", tile_number_at(x, y));
    }
  }

  for (int i = 0; i < game->unit_count; i++) {
    const GameUnit *unit = &game->units[i];
    if (!unit->alive) continue;

    const float ux = (float)(BOARD_X + unit->x * TILE_SIZE + 13);
    const float uy = (float)(BOARD_Y + unit->y * TILE_SIZE + 13);
    const float uw = (float)(TILE_SIZE - 26);
    const float uh = (float)(TILE_SIZE - 26);

    unsigned int color = unit->owner == 1 ? RGBA8(86, 146, 255, 255) : RGBA8(245, 102, 96, 255);
    if (i == game->selected_unit) color = RGBA8(255, 216, 84, 255);
    if (unit->is_avatar) {
      vita2d_draw_rectangle(ux - 3, uy - 3, uw + 6, uh + 6, RGBA8(255, 215, 120, 255));
    }
    vita2d_draw_rectangle(ux, uy, uw, uh, color);
    draw_text(renderer, (int)ux + 4, (int)uy + 22, RGBA8(8, 12, 16, 255), 0.56f, "%s", unit->name);
    draw_text(renderer, (int)ux + 4, (int)uy + 44, RGBA8(8, 12, 16, 255), 0.55f, "HP %d", unit->hp);
  }

  {
    const float cx = (float)(BOARD_X + game->cursor_x * TILE_SIZE);
    const float cy = (float)(BOARD_Y + game->cursor_y * TILE_SIZE);
    const unsigned int cc = RGBA8(255, 238, 120, 255);
    vita2d_draw_rectangle(cx, cy, TILE_SIZE, 3, cc);
    vita2d_draw_rectangle(cx, cy + TILE_SIZE - 3, TILE_SIZE, 3, cc);
    vita2d_draw_rectangle(cx, cy, 3, TILE_SIZE, cc);
    vita2d_draw_rectangle(cx + TILE_SIZE - 3, cy, 3, TILE_SIZE, cc);
  }

  vita2d_draw_rectangle((float)side_x, (float)BOARD_Y, (float)side_w, (float)board_h_px, RGBA8(20, 28, 38, 255));
  draw_text(renderer, side_x + 8, BOARD_Y + 24, RGBA8(245, 252, 255, 255), 0.8f, "Controls");
  draw_text(renderer, side_x + 8, BOARD_Y + 48, RGBA8(210, 225, 240, 255), 0.55f, "D-Pad: Cursor");
  draw_text(renderer, side_x + 8, BOARD_Y + 66, RGBA8(210, 225, 240, 255), 0.55f, "Cross/Circle: Act/Cancel");
  draw_text(renderer, side_x + 8, BOARD_Y + 84, RGBA8(210, 225, 240, 255), 0.55f, "Square: End turn  L/R: Hand");
  draw_text(renderer, side_x + 8, BOARD_Y + 102, RGBA8(210, 225, 240, 255), 0.55f, "Sel+L/Sel+R: Save/Load");

  const int p = game->current_player;
  const int hand_count = game_core_get_hand_count(game, p);
  const int selected = game_core_get_selected_hand_index(game, p);
  int selected_card_id = 0;
  const CardDef *selected_card = NULL;
  if (selected >= 0 && selected < hand_count) {
    selected_card_id = game_core_get_hand_card_id(game, p, selected);
    selected_card = game_core_get_card_def(selected_card_id);
  }

  draw_text(renderer, side_x + 8, BOARD_Y + 132, RGBA8(245, 252, 255, 255), 0.8f, "Selected Card");
  vita2d_draw_rectangle((float)(side_x + 8), (float)(BOARD_Y + 140), (float)(side_w - 16), 136.0f, RGBA8(29, 41, 56, 255));
  if (selected_card) {
    vita2d_texture *preview = renderer_get_card_art(renderer, selected_card_id);
    if (preview) {
      draw_texture_fit(preview, (float)(side_x + 14), (float)(BOARD_Y + 146), (float)(side_w - 28), 84.0f);
    } else {
      vita2d_draw_rectangle((float)(side_x + 14), (float)(BOARD_Y + 146), (float)(side_w - 28), 84.0f, RGBA8(42, 54, 72, 255));
    }
    draw_text(renderer, side_x + 12, BOARD_Y + 244, RGBA8(236, 246, 255, 255), 0.55f, "%s", selected_card->name);
    draw_text(renderer, side_x + 12, BOARD_Y + 264, RGBA8(255, 248, 193, 255), 0.55f, "C%d %s", selected_card->cost,
              card_kind_short(selected_card->kind));
  } else {
    draw_text(renderer, side_x + 12, BOARD_Y + 212, RGBA8(186, 205, 227, 255), 0.60f, "No card selected.");
  }

  draw_text(renderer, side_x + 8, BOARD_Y + 296, RGBA8(245, 252, 255, 255), 0.8f, "Log");
  for (int i = 0; i < 3; i++) {
    const char *line = game_core_log_get(game, i);
    if (!line || !line[0]) break;
    draw_text(renderer, side_x + 8, BOARD_Y + 320 + (i * 20), RGBA8(186, 205, 227, 255), 0.52f, "%s", line);
  }

  /* Hand panel with card art thumbnails. */
  const int card_w = 94;
  const int card_h = 74;
  const int gap = 8;
  const int total_w = hand_count > 0 ? (hand_count * (card_w + gap) - gap) : 0;
  int start_x = (SCREEN_W - total_w) / 2;
  if (start_x < 10) start_x = 10;
  const int y = SCREEN_H - card_h - 36;

  vita2d_draw_rectangle(0, SCREEN_H - 118, SCREEN_W, 92, RGBA8(16, 24, 36, 240));
  if (hand_count <= 0) {
    draw_text(renderer, 18, SCREEN_H - 66, RGBA8(192, 208, 224, 255), 0.62f, "Hand empty.");
  } else {
    for (int i = 0; i < hand_count; i++) {
      const int x = start_x + i * (card_w + gap);
      const int card_id = game_core_get_hand_card_id(game, p, i);
      const CardDef *card = game_core_get_card_def(card_id);
      const unsigned int base = card ? card_kind_color(card->kind) : RGBA8(80, 80, 80, 255);
      if (i == selected) {
        vita2d_draw_rectangle((float)(x - 2), (float)(y - 2), card_w + 4, card_h + 4, RGBA8(255, 235, 132, 255));
      }
      vita2d_draw_rectangle((float)x, (float)y, (float)card_w, (float)card_h, base);

      if (card) {
        const int art_h = 44;
        vita2d_texture *art = renderer_get_card_art(renderer, card_id);
        if (art) {
          draw_texture_fit(art, (float)(x + 2), (float)(y + 2), (float)(card_w - 4), (float)(art_h - 2));
        } else {
          vita2d_draw_rectangle((float)(x + 2), (float)(y + 2), (float)(card_w - 4), (float)(art_h - 2), RGBA8(42, 54, 72, 255));
        }
        vita2d_draw_rectangle((float)x, (float)(y + art_h), (float)card_w, (float)(card_h - art_h), RGBA8(20, 28, 38, 215));
        draw_text(renderer, x + 4, y + art_h + 14, RGBA8(255, 248, 193, 255), 0.50f, "C%d %s", card->cost, card_kind_short(card->kind));
        if (card->kind == CARD_KIND_UNIT) {
          draw_text(renderer, x + 4, y + art_h + 30, RGBA8(245, 248, 252, 255), 0.50f, "A%d/H%d", card->atk, card->hp);
        } else {
          draw_text(renderer, x + 4, y + art_h + 30, RGBA8(245, 248, 252, 255), 0.50f, "PWR %d", card->atk);
        }
      }
    }
  }

  if (game->winner) {
    const float w = 420.0f;
    const float h = 110.0f;
    const float x = (SCREEN_W - w) * 0.5f;
    const float y = (SCREEN_H - h) * 0.5f;
    vita2d_draw_rectangle(x, y, w, h, RGBA8(15, 20, 30, 235));
    draw_text(renderer, (int)x + 24, (int)y + 48, RGBA8(255, 241, 160, 255), 1.0f, "Player %d wins!", game->winner);
    draw_text(renderer, (int)x + 24, (int)y + 78, RGBA8(225, 234, 248, 255), 0.7f, "Press Select to reset");
  }

  if (status_line && status_line[0]) {
    vita2d_draw_rectangle(0, SCREEN_H - 28, SCREEN_W, 28, RGBA8(18, 30, 44, 240));
    draw_text(renderer, 12, SCREEN_H - 8, RGBA8(255, 226, 144, 255), 0.58f, "%s", status_line);
  }
}
