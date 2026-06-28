#include "save_state.h"

#include <string.h>

#include <psp2/io/fcntl.h>
#include <psp2/io/stat.h>

#define SAVE_DIR "ux0:data/sorcery-native"
#define SAVE_FILE "ux0:data/sorcery-native/save.bin"
#define SAVE_MAGIC 0x53525631u /* SRV1 */
#define SAVE_VERSION 3u

typedef struct SaveBlob {
  unsigned int magic;
  unsigned int version;
  unsigned int payload_size;
  unsigned int checksum;
  GameCore game;
} SaveBlob;

static unsigned int fnv1a_32(const void *data, unsigned int len) {
  const unsigned char *bytes = (const unsigned char *)data;
  unsigned int hash = 2166136261u;
  for (unsigned int i = 0; i < len; i++) {
    hash ^= bytes[i];
    hash *= 16777619u;
  }
  return hash;
}

static int validate_game(GameCore *game) {
  if (!game) return -1;
  if (game->cursor_x < 0 || game->cursor_x >= GAME_BOARD_W) return -1;
  if (game->cursor_y < 0 || game->cursor_y >= GAME_BOARD_H) return -1;
  if (game->unit_count < 0 || game->unit_count > GAME_MAX_UNITS) return -1;
  if (game->turn_number < 1) game->turn_number = 1;
  if (game->current_player != 1 && game->current_player != 2) return -1;
  if (game->selected_unit >= game->unit_count) game->selected_unit = -1;
  if (game->selected_unit < -1) game->selected_unit = -1;
  if (game->mode_single_player != 0 && game->mode_single_player != 1) game->mode_single_player = 1;
  for (int i = 0; i < game->unit_count; i++) {
    GameUnit *u = &game->units[i];
    if (u->owner != 1 && u->owner != 2) return -1;
    if (u->x < 0 || u->y < 0 || u->x >= GAME_BOARD_W || u->y >= GAME_BOARD_H) return -1;
    if (u->max_hp < 1) u->max_hp = 1;
    if (u->hp > u->max_hp) u->hp = u->max_hp;
  }
  for (int p = 1; p <= 2; p++) {
    if (game->deck_count[p] < 0 || game->deck_count[p] > GAME_MAX_DECK_CARDS) return -1;
    if (game->hand_count[p] < 0 || game->hand_count[p] > GAME_MAX_HAND_CARDS) return -1;
    if (game->grave_count[p] < 0 || game->grave_count[p] > GAME_MAX_GRAVE_CARDS) return -1;
    if (game->selected_hand_index[p] >= game->hand_count[p]) game->selected_hand_index[p] = game->hand_count[p] - 1;
    if (game->selected_hand_index[p] < -1) game->selected_hand_index[p] = -1;
    game->max_mana[p] = game->max_mana[p] < 1 ? 1 : game->max_mana[p];
    game->max_mana[p] = game->max_mana[p] > 9 ? 9 : game->max_mana[p];
    game->mana[p] = game->mana[p] < 0 ? 0 : game->mana[p];
    if (game->mana[p] > game->max_mana[p]) game->mana[p] = game->max_mana[p];
  }
  return 0;
}

const char *save_state_path(void) { return SAVE_FILE; }

int save_state_exists(void) {
  SceIoStat st;
  memset(&st, 0, sizeof(st));
  return sceIoGetstat(SAVE_FILE, &st) >= 0 ? 1 : 0;
}

int save_state_write(const GameCore *game) {
  if (!game) return -1;

  /* Creating an existing dir can return an error; ignore it. */
  sceIoMkdir(SAVE_DIR, 0777);

  SaveBlob blob;
  memset(&blob, 0, sizeof(blob));
  blob.magic = SAVE_MAGIC;
  blob.version = SAVE_VERSION;
  blob.payload_size = sizeof(GameCore);
  blob.game = *game;
  blob.checksum = fnv1a_32(&blob.game, sizeof(GameCore));

  SceUID fd = sceIoOpen(SAVE_FILE, SCE_O_WRONLY | SCE_O_CREAT | SCE_O_TRUNC, 0666);
  if (fd < 0) return (int)fd;

  int written = (int)sceIoWrite(fd, &blob, sizeof(blob));
  sceIoClose(fd);
  if (written != (int)sizeof(blob)) return -2;
  return 0;
}

int save_state_read(GameCore *game) {
  if (!game) return -1;

  SceUID fd = sceIoOpen(SAVE_FILE, SCE_O_RDONLY, 0);
  if (fd < 0) return (int)fd;

  SaveBlob blob;
  memset(&blob, 0, sizeof(blob));
  int read_size = (int)sceIoRead(fd, &blob, sizeof(blob));
  sceIoClose(fd);
  if (read_size != (int)sizeof(blob)) return -2;

  if (blob.magic != SAVE_MAGIC) return -3;
  if (blob.version != SAVE_VERSION) return -4;
  if (blob.payload_size != sizeof(GameCore)) return -5;
  if (blob.checksum != fnv1a_32(&blob.game, sizeof(GameCore))) return -6;

  *game = blob.game;
  if (validate_game(game) < 0) return -7;
  return 0;
}
