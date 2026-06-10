# Crystal Caverns

A small, self-contained 2D platformer built with **[Phaser 3](https://phaser.io/)**.
All artwork is generated procedurally at runtime, so the entire game is just a
few text files — no image or audio assets to manage.

![level](https://img.shields.io/badge/levels-3-89b4fa) ![engine](https://img.shields.io/badge/engine-Phaser%203-a6e3a1)

## Play

Because the game loads Phaser from a CDN and uses relative script paths, the
simplest way to run it is a tiny local web server:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Any static server works (`npx serve`, VS Code Live Server, etc.). Opening
`index.html` directly via `file://` also works in most browsers, but a server
avoids any cross-origin quirks.

> An internet connection is required the first time, to pull Phaser from the
> CDN. To run fully offline, download `phaser.min.js` and point the
> `<script>` tag in `index.html` at the local copy.

## Controls

| Action        | Keys                          |
| ------------- | ----------------------------- |
| Move          | `←` `→` or `A` `D`            |
| Jump          | `↑` `W` or `Space`            |
| Double jump   | press jump again mid-air       |
| Restart level | `R`                           |

Jump feel includes **coyote time**, a **jump buffer**, and **variable jump
height** (tap for a short hop, hold for a full jump).

## Goal

Collect crystals (`✦`), **stomp** enemies from above for bonus points, avoid
spikes and enemy contact, and reach the green **flag** to clear each level.
Clear all three levels to win. You have three lives.

## Project layout

```
index.html      # page shell, loads Phaser + the game scripts
style.css       # page styling around the canvas
src/levels.js   # the three levels as editable ASCII grids
src/game.js     # all game logic (Boot, Menu, Game, End scenes)
```

## Designing your own levels

Levels live in `src/levels.js` as arrays of equal-length strings, one character
per 32×32 tile:

| Char | Meaning                              |
| ---- | ------------------------------------ |
| `X`  | solid ground / wall                  |
| `o`  | coin                                 |
| `^`  | spike (costs a life)                 |
| `e`  | enemy (patrols its platform)         |
| `-`  | horizontally-moving platform         |
| `\|` | vertically-moving platform           |
| `P`  | player spawn (exactly one)           |
| `G`  | goal flag (exactly one)              |
| `.`  | empty space                          |

Keep every row in a level the same length, then add a new array to the `LEVELS`
list to create a new stage — the game picks it up automatically.

## Tuning the feel

Gameplay constants (gravity, move speed, jump strength, coyote/buffer windows,
number of lives, etc.) are all in the `CONFIG` block at the top of
`src/game.js`. Tweak and reload.
