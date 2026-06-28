#ifndef SORCERY_VITA_RENDER_H
#define SORCERY_VITA_RENDER_H

#include "game_core.h"

#include <vita2d.h>

#define RENDER_CARD_ART_CACHE_SLOTS 32

typedef struct Renderer {
  vita2d_pgf *font;
  vita2d_texture *logo;
  int art_ids[RENDER_CARD_ART_CACHE_SLOTS];
  vita2d_texture *art_tex[RENDER_CARD_ART_CACHE_SLOTS];
} Renderer;

int renderer_init(Renderer *renderer);
void renderer_term(Renderer *renderer);

void renderer_begin_frame(void);
void renderer_end_frame(void);

void renderer_draw_boot(const Renderer *renderer, int menu_index, int has_active_match, int has_save,
                        const char *deck1_name, const char *deck2_name, const char *status_line);
void renderer_draw_board(Renderer *renderer, const GameCore *game, const char *status_line);

#endif
