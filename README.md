# Last Wall

A small, self-contained **2D zombie wave-defense game** built with
**[Phaser 3](https://phaser.io/)**. All artwork is generated procedurally at
runtime, so the entire game is just a few text files — no image or audio assets
to manage.

![waves](https://img.shields.io/badge/mode-endless%20waves-f38ba8) ![engine](https://img.shields.io/badge/engine-Phaser%203-a6e3a1)

## Play

The game runs **fully offline** — Phaser ships with the repo in `vendor/`, so no
internet connection is needed. The simplest way to play is to open the page in
your browser:

- **Quickest:** double-click `index.html` (or, on Windows PowerShell, run
  `start index.html`). It works over `file://` in most browsers.
- **Or via a tiny local server** (avoids any `file://` quirks):

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

> Phaser is vendored as `vendor/phaser.min.js` (v3.80.1) and loaded with a
> relative path, so the game needs nothing from the network. To switch back to
> the CDN, point the `<script>` tag in `index.html` at
> `https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js`.

## How it plays

Zombies spawn on the right and shamble toward **your wall** on the left.
Turrets mounted on the wall **auto-fire at the nearest zombie** — the fight is
won by building an arsenal, not by aiming. Every kill pays a cash bounty;
clearing a wave pays a bonus. Spend that cash in the live shop on **more
turrets, new turret types, and global upgrades** to survive deeper, tougher
waves. The run ends when the wall's HP hits zero — it's **endless**, so the goal
is to reach the highest wave you can.

| Action                | How                                            |
| --------------------- | ---------------------------------------------- |
| Fire                  | automatic — each turret tracks the nearest enemy |
| Buy turrets/upgrades  | click an item in the shop (any time)            |
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

## Turrets

You start with a single **Gunner**. Buy more from the shop — up to six slots
along the wall — mixing and matching types. Each extra turret costs more than
the last, regardless of type, so an arsenal is a real investment.

| Turret   | Role                                              |
| -------- | ------------------------------------------------- |
| Gunner   | reliable, balanced single shot                    |
| Gatling  | very fast fire, low damage — melts crowds          |
| Sniper   | slow, huge damage, pierces deep through a line     |
| Scatter  | a wide six-pellet shotgun blast                    |
| Frost    | low damage but **chills zombies, slowing them**    |
| Cannon   | slow shots that **explode for area damage**        |

## Upgrades

Global upgrades scale **every turret you own**, so they get stronger the bigger
your arsenal:

| Upgrade      | Effect                                         |
| ------------ | ---------------------------------------------- |
| Damage       | +% damage to all turrets                       |
| Fire Rate    | all turrets fire faster                         |
| Multi-Shot   | +1 bullet per turret volley                     |
| Pierce       | all bullets punch through more zombies          |
| Income       | more cash from every kill                       |
| Reinforce    | raises max wall HP (and patches the wall)       |
| Repair Wall  | instantly restore 35% of the wall               |

Each level of an upgrade costs more than the last, so deciding what to invest in
— more turrets, the right turret mix, raw firepower, economy, or staying alive —
is the core of the game.

## Project layout

```
index.html           # page shell + top bar / shop DOM, loads Phaser + the game
style.css            # page, HUD, shop, and overlay styling
src/game.js          # all game logic (BootScene builds textures, GameScene runs it)
vendor/phaser.min.js # bundled Phaser 3 (so the game runs fully offline)
```

## Tuning the game

The knobs worth tweaking live at the top of `src/game.js`:

- **`CONFIG`** — canvas size, wall/turret positions, turret-slot count, the
  build-phase timer, and the early-start bonus.
- **`ZTYPES`** — each zombie archetype's wave-1 baseline HP, speed, bounty,
  damage, size, and colour. (Per-wave scaling is applied in `spawnZombie`.)
- **`TURRET_TYPES`** — each turret's price, damage, fire rate, projectile count,
  spread, pierce, bullet speed, and special (`splash` radius or `slow`). The
  `Turret` class turns those into shots; `turretCost()` sets the price curve.
- **Wave composition** — `buildWave()` controls how many zombies spawn, which
  types are unlocked when, and the boss cadence.
- **Upgrades** — the `this.UPG` array in `buildUpgradeShop()` defines each global
  upgrade's cost curve, cap, and effect; the modifier getters near the top of
  `GameScene` (`damageMult`, `cooldownMult`, …) turn levels into actual numbers.

Tweak and reload — no build step.
