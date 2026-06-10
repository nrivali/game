/*
 * Level layouts, drawn as ASCII grids. One character per 32x32 tile.
 *
 * Legend:
 *   X  solid ground / wall
 *   #  one-way / decorative platform block (same collision as X here)
 *   P  player spawn (exactly one per level)
 *   o  coin
 *   ^  spike hazard (touching it costs a life)
 *   e  enemy spawn (patrols its platform)
 *   -  moving platform anchor (oscillates horizontally)
 *   |  moving platform anchor (oscillates vertically)
 *   G  goal flag (reach it to clear the level)
 *   .  empty space
 *
 * Every row in a level is the same length. Add a new array to LEVELS to add a level.
 */
const LEVELS = [
  // ── Level 1: gentle introduction ────────────
  [
    ".............................................",
    ".............................................",
    "..........o.o................................",
    ".........XXXXX..........o.o.o................",
    "....................................G........",
    "...............^^.........XXXXX....XX........",
    "..P.......o.........e........................",
    "XXXXXX..XXXXXXXX..XXXXXXXXXX.......XXXXXXXXXX",
    "XXXXXX..XXXXXXXX..XXXXXXXXXX.......XXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  ],
  // ── Level 2: moving platforms + enemies ─────
  [
    ".................................................",
    "..........o.o.o..................................",
    ".........XXXXXXX...........o.....................",
    ".......................e..XXXX.........o.o.......",
    "..P...o........----...............e...XXXXX..G...",
    "XXXXX.XX.......................^^^....XX...XXXXXX",
    "XXXXX.XX......o......XXXXX.....XXX...............",
    "XXXXX.XX...|...................XXX...............",
    "XXXXX.XXXXXXXXXX....^^^....XXXXXXX...............",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  ],
  // ── Level 3: the gauntlet ───────────────────
  [
    "...................................................",
    "....o.o.o.....................o.o.o................",
    "...XXXXXXX...e.......|.......XXXXXXX.......G.......",
    "...............----.........................XX.....",
    "..P.......^^^.........e.........----...............",
    "XXXX....XXXXXX...XXXX.....XXXX.........o..o........",
    "XXXX............XXXX..............XXXXXXXXX........",
    "XXXX...o.o..............^^^^^......................",
    "XXXX..XXXXX....e.........XXX..............e........",
    "XXXXXXXXXXXXXXXXXXXXXX...XXXXXXXXXXXXXXXXXXXXXXXXXX",
  ],
];
