# Last Wall

A small, self-contained **2D zombie wave-defense game** built with
**[Phaser 3](https://phaser.io/)**. All artwork is generated procedurally at
runtime, so the entire game is just a few text files — no image or audio assets
to manage.

![waves](https://img.shields.io/badge/mode-endless%20waves-f38ba8) ![engine](https://img.shields.io/badge/engine-Phaser%203-a6e3a1)

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

## How it plays

Zombies spawn on the right and shamble toward **your wall** on the left. A
turret mounted on the wall **auto-fires at the nearest zombie** — the fight is
won through upgrades, not aim. Every kill pays a cash bounty; clearing a wave
pays a bonus. Spend that cash in the live shop to survive deeper, tougher waves.
The run ends when the wall's HP hits zero — it's **endless**, so the goal is to
reach the highest wave you can.

| Action                | How                                            |
| --------------------- | ---------------------------------------------- |
| Fire                  | automatic — the turret tracks the nearest enemy |
| Buy upgrades          | click an upgrade in the shop (any time)         |
| Start the next wave   | the **Start Wave** button (early start = bonus) |
| Restart after a loss  | **Play Again** on the game-over screen          |

Waves auto-start after a short build phase, or you can start early for a cash
bonus.

## Enemies

| Type     | Appears   | Trait                                   |
| -------- | --------- | --------------------------------------- |
| Walker   | wave 1+   | the baseline shambler                   |
| Runner   | wave 3+   | fast and fragile, shows up in numbers   |
| Brute    | wave 4+   | slow, heavily armoured, big bounty      |
| Boss     | every 5th | a giant with a huge health pool         |

Enemy health, speed, and bounty all scale up with the wave number, and zombies
arrive faster the deeper you get.

## Upgrades

| Upgrade      | Effect                                         |
| ------------ | ---------------------------------------------- |
| Damage       | more punch per bullet                          |
| Fire Rate    | shorter time between shots                     |
| Multi-Shot   | extra bullet per volley (spread)               |
| Pierce       | bullets punch through more zombies             |
| Income       | more cash from every kill                      |
| Reinforce    | raises max wall HP (and patches the wall)      |
| Repair Wall  | instantly restore 35% of the wall              |

Each level of an upgrade costs more than the last, so deciding what to invest in
— raw firepower, economy, or staying alive — is the core of the game.

## Project layout

```
index.html   # page shell + top bar / shop DOM, loads Phaser + the game
style.css    # page, HUD, shop, and overlay styling
src/game.js  # all game logic (BootScene builds textures, GameScene runs it)
```

## Tuning the game

The knobs worth tweaking live at the top of `src/game.js`:

- **`CONFIG`** — canvas size, wall/turret positions, bullet speed, the build-phase
  timer, and the early-start bonus.
- **`ZTYPES`** — each zombie archetype's wave-1 baseline HP, speed, bounty,
  damage, size, and colour. (Per-wave scaling is applied in `spawnZombie`.)
- **Wave composition** — `buildWave()` controls how many zombies spawn, which
  types are unlocked when, and the boss cadence.
- **Upgrades** — the `this.UPG` array in `buildShop()` defines each shop item's
  cost curve, cap, and effect; the derived-stat getters near the top of
  `GameScene` turn upgrade levels into actual numbers.

Tweak and reload — no build step.
