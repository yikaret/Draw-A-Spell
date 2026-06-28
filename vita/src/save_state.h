#ifndef SORCERY_VITA_SAVE_STATE_H
#define SORCERY_VITA_SAVE_STATE_H

#include "game_core.h"

int save_state_exists(void);
int save_state_write(const GameCore *game);
int save_state_read(GameCore *game);
const char *save_state_path(void);

#endif
