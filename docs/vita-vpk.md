# PSVita VPK Build

This repo includes a native PSVita runtime app under `vita/` that packages to a `.vpk`.

## What it does

- Builds a native PSVita homebrew bubble.
- Runs a Vita2D renderer and controller-native gameplay loop.
- Does not depend on the Vita web browser.

## Current native slice

- Boot scene + board scene + menu navigation
- Solo mode (simple AI for Player 2) and hotseat mode
- Cursor navigation and unit selection
- Data-driven card/deck loading from `app0:data/cards.csv` and `app0:data/decks.csv`
- Precon-driven card pool generation (300+ cards from project sources)
- Hand/deck/graveyard state with mana and per-turn draw
- 5x4 tactical board layout (non-browser native renderer)
- Card play actions (unit summon, spell damage/heal/draw/ramp/buff/summon)
- CSV-driven spell flags for target rules and adjacent-area effects
- Card art thumbnails rendered in-hand and selected-card preview
- Tile-numbered board overlay (1..20) with avatars starting at tiles 3 and 18
- Turn switching and basic melee attacks
- Match reset/win detection
- Persistent save/load (`ux0:data/sorcery-native/save.bin`)
- Autosave at turn transitions
- On-screen action log + status bar

## Prerequisites

- VitaSDK installed and available in `VITASDK`, or installed at `/tmp/vitasdk`.
- `cmake` and `make`.
- `pngquant` and `sips` for PNG normalization + card art thumbnail generation.

## Build

```bash
chmod +x ./scripts/build-vita-vpk.sh
./scripts/build-vita-vpk.sh
```

Output:

- `output/sorcery-online-vita.vpk`

`build-vita-vpk.sh` now regenerates Vita data files automatically from:

- `json/cards.sorcery.raw.json`
- `public/cards.sorcery.pool.json`
- `decks/decks.ts`

Generated files:

- `vita/data/cards.csv`
- `vita/data/decks.csv`
- `vita/data/card-art.csv`
- `vita/data/generation-report.txt`
- `vita/data/art/*.png`
- `vita/data/art-report.txt`

Packaging hardening:

- `build-vita-vpk.sh` re-encodes `sce_sys`/LiveArea PNGs with `pngquant` (indexed + stripped metadata) to avoid Vita install error `0x8010113D`.

Release guard:

- Build fails if any deck card name is unmatched (prevents shipping fallback placeholder cards).
- Override only for local debugging with `ALLOW_VITA_FALLBACK_CARDS=1`.

## Release package

```bash
chmod +x ./scripts/release-vita-vpk.sh
./scripts/release-vita-vpk.sh
```

Outputs:

- `output/sorcery-online-vita.vpk`
- `output/sorcery-online-vita.sha256`
- `output/sorcery-online-vita-release.txt`

## Native controls

- Boot menu
  - `D-Pad Up/Down`: menu navigation
  - `D-Pad Left/Right`: change Player 1 deck (New Solo/New Hotseat rows)
  - `L/R Trigger`: change Player 2 deck (New Solo/New Hotseat rows)
  - `Cross`: select
  - `Circle` or `Start`: quit
- Board scene
  - `D-Pad`: move board cursor
  - `Cross`: select unit / confirm action
  - `Circle`: clear selection
  - `Square`: end turn
  - `Triangle`: return to boot menu
  - `L Trigger`: previous hand card
  - `R Trigger`: next hand card
  - `Select + L Trigger`: save match
  - `Select + R Trigger`: load match
  - `Select + Cross`: reset match
  - `Start`: quit

## Install on Vita

1. Copy `output/sorcery-online-vita.vpk` to the Vita.
2. Install it using VitaShell.
3. Launch the bubble from LiveArea.
