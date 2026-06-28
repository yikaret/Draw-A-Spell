#include "input.h"

#include <string.h>

#include <psp2/ctrl.h>

static uint32_t previous_buttons = 0;

void input_init(void) {
  previous_buttons = 0;
  sceCtrlSetSamplingMode(SCE_CTRL_MODE_ANALOG);
}

void input_poll(InputState *state) {
  if (!state) return;

  SceCtrlData pad;
  memset(&pad, 0, sizeof(pad));
  sceCtrlPeekBufferPositive(0, &pad, 1);

  state->held = pad.buttons;
  state->pressed = pad.buttons & ~previous_buttons;
  state->released = previous_buttons & ~pad.buttons;
  previous_buttons = pad.buttons;
}

int input_pressed(const InputState *state, uint32_t button_mask) {
  if (!state) return 0;
  return (state->pressed & button_mask) == button_mask;
}
