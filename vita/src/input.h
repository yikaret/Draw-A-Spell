#ifndef SORCERY_VITA_INPUT_H
#define SORCERY_VITA_INPUT_H

#include <stdint.h>

typedef struct InputState {
  uint32_t held;
  uint32_t pressed;
  uint32_t released;
} InputState;

void input_init(void);
void input_poll(InputState *state);
int input_pressed(const InputState *state, uint32_t button_mask);

#endif
