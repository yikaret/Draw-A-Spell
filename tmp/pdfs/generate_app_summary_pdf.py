from pathlib import Path

# Simple, dependency-free PDF generator (single page, Helvetica fonts).

PAGE_W = 612  # 8.5 in * 72
PAGE_H = 792  # 11 in * 72
MARGIN_X = 40
TOP_Y = 760

lines = []

def add_line(text, *, font="F1", size=10, x=MARGIN_X, y=None):
    if y is None:
        raise ValueError("y must be provided")
    lines.append({"text": text, "font": font, "size": size, "x": x, "y": y})

# Manual layout
cursor_y = TOP_Y

def gap(points):
    global cursor_y
    cursor_y -= points


def heading(text):
    global cursor_y
    add_line(text, font="F2", size=12, x=MARGIN_X, y=cursor_y)
    cursor_y -= 16


def body(text):
    global cursor_y
    add_line(text, font="F1", size=10, x=MARGIN_X, y=cursor_y)
    cursor_y -= 12


# Title
add_line("Sorcery Solo Vite - App Summary", font="F2", size=16, x=MARGIN_X, y=cursor_y)
cursor_y -= 22

gap(4)

# What it is
heading("What It Is")
body("A React + Vite app (with optional Capacitor builds) that implements the Sorcery")
body("card game board, rules, and play flow in a single-page UI.")

gap(4)

# Who it's for
heading("Who It Is For")
body("Primary user/persona: Sorcery players who want to play or test decks locally or online.")
body("Explicit persona statement: Not found in repo.")

gap(4)

# What it does
heading("What It Does")
body("- Play Sorcery matches on a grid board with avatars, units, sites, spells, auras, artifacts.")
body("- Solo vs CPU opponents with Aggro, Control, or Ramp AI profiles.")
body("- Online multiplayer via WebSocket room relay (host/join).")
body("- Pick from preconstructed decks and adventure precons.")
body("- Import Curiosa decklists by URL and build decks from them.")
body("- Analyze deck composition/cost curve/thresholds and simulate draws.")
body("- Export game logs to TXT or RTF.")

gap(4)

# How it works
heading("How It Works")
body("- UI: React app in src/App.tsx with layout/presentation components in src/ui/.")
body("- Game state/rules live in src/App.tsx (Game type + turn/board logic) and src/abilities/.")
body("- Deck data/tools: decks/ precons, src/curiosaImport.ts, src/brewing/ stats/sim.")
body("- AI: src/ai/ runtime + profiles; createCPU and rules adapter drive CPU turns.")
body("- Multiplayer: src/net/mpClient.ts connects to WebSocket relay server/ws.js.")
body("- Data flow: UI input or AI/MP messages -> actions -> game state updates -> render.")

gap(4)

# How to run
heading("How To Run")
body("- Install deps: npm install (repo root).")
body("- Start app: npm run dev.")
body("- Optional multiplayer relay: cd server; npm install; npm run dev (listens on :3001).")
body("- Node version/OS requirements: Not found in repo.")

# Safety: ensure content fits on one page
if cursor_y < 40:
    raise SystemExit(f"Content overflow: cursor_y={cursor_y}")


def pdf_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )

# Build content stream
content_lines = []
for ln in lines:
    t = pdf_escape(ln["text"])
    content_lines.append(
        f"BT /{ln['font']} {ln['size']} Tf {ln['x']} {ln['y']} Td ({t}) Tj ET"
    )

content = "\n".join(content_lines) + "\n"
content_bytes = content.encode("latin1")

# PDF objects
objects = []

# 1: Catalog
objects.append("<< /Type /Catalog /Pages 2 0 R >>")

# 2: Pages
objects.append("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")

# 3: Page
objects.append(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
    "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> "
    "/Contents 6 0 R >>"
)

# 4: Font Helvetica
objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

# 5: Font Helvetica-Bold
objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

# 6: Content stream
objects.append(
    f"<< /Length {len(content_bytes)} >>\nstream\n{content}\nendstream"
)

# Assemble PDF
pdf = bytearray()
pdf.extend(b"%PDF-1.4\n")
offsets = [0]
for i, obj in enumerate(objects, start=1):
    offsets.append(len(pdf))
    pdf.extend(f"{i} 0 obj\n{obj}\nendobj\n".encode("latin1"))

xref_pos = len(pdf)
pdf.extend(f"xref\n0 {len(offsets)}\n".encode("latin1"))
pdf.extend(b"0000000000 65535 f \n")
for off in offsets[1:]:
    pdf.extend(f"{off:010d} 00000 n \n".encode("latin1"))

pdf.extend(
    f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin1")
)

out_path = Path("output/pdf/sorcery_app_summary.pdf")
out_path.write_bytes(pdf)
print(str(out_path))
