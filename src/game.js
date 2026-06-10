/* ============================================================================
 * Crystal Caverns — a Phaser 3 platformer
 *
 * Architecture: four scenes
 *   BootScene  — builds every texture procedurally (no image files needed)
 *   MenuScene  — title screen
 *   GameScene  — the actual gameplay; reads a level grid from levels.js
 *   EndScene   — win / game-over overlay
 *
 * Tunables live in the CONFIG block right below so the feel is easy to tweak.
 * ==========================================================================*/

const TILE = 32; // pixel size of one grid cell

const CONFIG = {
  width: 896,
  height: 512,
  gravity: 1100,
  moveSpeed: 230,
  accel: 2400,        // ground acceleration (snappy)
  airAccel: 1400,
  drag: 1800,         // horizontal damping when no input
  jumpVel: 520,
  doubleJumpVel: 470,
  coyoteMs: 90,       // grace window to still jump just after leaving a ledge
  jumpBufferMs: 110,  // grace window to register a jump pressed just before landing
  enemySpeed: 60,
  startLives: 3,
};

/* ----------------------------------------------------------------------------
 * BootScene — generate all art at runtime with the Graphics API.
 * Keeping art procedural means the whole game is three text files, no binaries.
 * ------------------------------------------------------------------------- */
class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }

  create() {
    this.makeTile();
    this.makePlayer();
    this.makeCoin();
    this.makeSpike();
    this.makeEnemy();
    this.makeFlag();
    this.makePlatform();
    this.makeParticle();
    this.scene.start("menu");
  }

  // Helper: draw into a Graphics object then bake it to a reusable texture.
  bake(key, w, h, drawFn) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    drawFn(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeTile() {
    this.bake("tile", TILE, TILE, (g) => {
      g.fillStyle(0x3b3a5a, 1).fillRect(0, 0, TILE, TILE);          // base
      g.fillStyle(0x4f4e74, 1).fillRect(0, 0, TILE, 5);            // lit top edge
      g.fillStyle(0x2a2940, 1).fillRect(0, TILE - 4, TILE, 4);     // shadow bottom
      g.lineStyle(1, 0x232238, 1).strokeRect(0, 0, TILE, TILE);    // seam
      g.fillStyle(0x5a6cff, 0.18).fillRect(6, 10, 5, 5);           // crystal flecks
      g.fillStyle(0x7f9bff, 0.16).fillRect(20, 18, 4, 4);
    });
  }

  makePlayer() {
    // 26 x 32 little explorer with a glowing visor.
    this.bake("player", 26, 32, (g) => {
      g.fillStyle(0x89b4fa, 1).fillRoundedRect(2, 4, 22, 26, 6);   // body
      g.fillStyle(0xb4d0ff, 1).fillRoundedRect(2, 4, 22, 12, 6);   // head highlight
      g.fillStyle(0x11111b, 1).fillRoundedRect(7, 9, 14, 6, 3);    // visor
      g.fillStyle(0x94e2d5, 1).fillRect(9, 10, 4, 3);              // visor shine
      g.fillStyle(0x5a78c8, 1).fillRect(5, 28, 6, 4);             // feet
      g.fillStyle(0x5a78c8, 1).fillRect(15, 28, 6, 4);
    });
  }

  makeCoin() {
    this.bake("coin", 20, 20, (g) => {
      g.fillStyle(0xf9e2af, 1).fillCircle(10, 10, 9);
      g.fillStyle(0xfab387, 1).fillCircle(10, 10, 6);
      g.fillStyle(0xfff4d6, 1).fillCircle(7, 7, 2.5);
    });
  }

  makeSpike() {
    this.bake("spike", TILE, TILE, (g) => {
      g.fillStyle(0xf38ba8, 1);
      for (let i = 0; i < 4; i++) {
        const x = i * 8;
        g.fillTriangle(x, TILE, x + 4, TILE - 14, x + 8, TILE);
      }
      g.fillStyle(0x6e2740, 1).fillRect(0, TILE - 4, TILE, 4);
    });
  }

  makeEnemy() {
    this.bake("enemy", 28, 24, (g) => {
      g.fillStyle(0xf38ba8, 1).fillRoundedRect(1, 2, 26, 20, 8);
      g.fillStyle(0x11111b, 1).fillCircle(9, 11, 3).fillCircle(19, 11, 3);
      g.fillStyle(0xffffff, 1).fillCircle(10, 10, 1).fillCircle(20, 10, 1);
      g.fillStyle(0x6e2740, 1);                                    // little teeth
      g.fillTriangle(8, 22, 12, 22, 10, 18);
      g.fillTriangle(16, 22, 20, 22, 18, 18);
    });
  }

  makeFlag() {
    this.bake("flag", 28, 48, (g) => {
      g.fillStyle(0x9399b2, 1).fillRect(2, 0, 4, 48);             // pole
      g.fillStyle(0xa6e3a1, 1).fillTriangle(6, 2, 6, 20, 26, 11); // banner
      g.fillStyle(0x40a02b, 1).fillTriangle(6, 11, 6, 20, 16, 15);
    });
  }

  makePlatform() {
    const w = TILE * 3, h = 18;
    this.bake("platform", w, h, (g) => {
      g.fillStyle(0x585b70, 1).fillRoundedRect(0, 0, w, h, 6);
      g.fillStyle(0x7f849c, 1).fillRoundedRect(0, 0, w, 6, 6);
      g.fillStyle(0x313244, 1).fillRect(0, h - 4, w, 4);
    });
  }

  makeParticle() {
    this.bake("spark", 6, 6, (g) => {
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 6, 6);
    });
  }
}

/* ----------------------------------------------------------------------------
 * MenuScene — title + start prompt.
 * ------------------------------------------------------------------------- */
class MenuScene extends Phaser.Scene {
  constructor() { super("menu"); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#13112a");

    this.add.text(width / 2, height / 2 - 70, "CRYSTAL CAVERNS", {
      fontFamily: "Segoe UI, sans-serif", fontSize: "52px",
      color: "#89b4fa", fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 24, "a tiny Phaser 3 platformer", {
      fontFamily: "Segoe UI, sans-serif", fontSize: "18px", color: "#7f849c",
    }).setOrigin(0.5);

    const prompt = this.add.text(width / 2, height / 2 + 50, "Press SPACE or ENTER to begin", {
      fontFamily: "Segoe UI, sans-serif", fontSize: "22px", color: "#cdd6f4",
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height - 48,
      "Collect coins  ·  stomp enemies  ·  dodge spikes  ·  reach the flag", {
      fontFamily: "Segoe UI, sans-serif", fontSize: "15px", color: "#9399b2",
    }).setOrigin(0.5);

    // Decorative drifting coins.
    for (let i = 0; i < 6; i++) {
      const c = this.add.image(Phaser.Math.Between(40, width - 40),
        Phaser.Math.Between(40, height - 40), "coin").setAlpha(0.5);
      this.tweens.add({ targets: c, y: c.y - 14, duration: Phaser.Math.Between(900, 1500),
        yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }

    const start = () => this.scene.start("game", { level: 0, lives: CONFIG.startLives, score: 0 });
    this.input.keyboard.once("keydown-SPACE", start);
    this.input.keyboard.once("keydown-ENTER", start);
  }
}

/* ----------------------------------------------------------------------------
 * GameScene — gameplay for a single level.
 * Receives { level, lives, score } so progress carries between levels.
 * ------------------------------------------------------------------------- */
class GameScene extends Phaser.Scene {
  constructor() { super("game"); }

  init(data) {
    this.levelIndex = data.level ?? 0;
    this.lives = data.lives ?? CONFIG.startLives;
    this.score = data.score ?? 0;
  }

  create() {
    const grid = LEVELS[this.levelIndex];
    const cols = grid[0].length, rows = grid.length;
    this.worldW = cols * TILE;
    this.worldH = rows * TILE;

    this.buildBackground();

    // Physics groups.
    this.solids = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    this.enemies = this.physics.add.group();
    // Moving platforms are static bodies we reposition each frame (the standard
    // kinematic-platform trick) so updateFromGameObject() keeps collisions in sync.
    this.movers = this.physics.add.staticGroup();

    this.parseGrid(grid);

    // World + camera bounds.
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(180, 120);

    // Collisions / overlaps.
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.collider(this.player, this.movers);
    this.physics.add.collider(this.enemies, this.movers);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, null, this);
    this.physics.add.overlap(this.player, this.spikes, this.hitHazard, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.touchEnemy, null, this);
    this.physics.add.overlap(this.player, this.goal, this.reachGoal, null, this);

    this.setupInput();
    this.buildHud();

    // Jump-feel state.
    this.lastGroundedAt = -1e9;
    this.jumpPressedAt = -1e9;
    this.canDoubleJump = false;
    this.invulnUntil = 0;
    this.finished = false;

    this.cameras.main.fadeIn(350, 12, 10, 30);
  }

  buildBackground() {
    this.cameras.main.setBackgroundColor("#13112a");
    // Parallax star/crystal dots that scroll slower than the world.
    const g = this.add.graphics().setScrollFactor(0.3).setDepth(-10);
    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.Between(0, this.scale.width);
      const y = Phaser.Math.Between(0, this.scale.height);
      const a = Phaser.Math.FloatBetween(0.05, 0.35);
      g.fillStyle(0x89b4fa, a).fillCircle(x, y, Phaser.Math.FloatBetween(0.5, 2));
    }
  }

  parseGrid(grid) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        switch (ch) {
          case "X":
          case "#":
            this.solids.create(x, y, "tile");
            break;
          case "o":
            this.spawnCoin(x, y);
            break;
          case "^": {
            const s = this.spikes.create(x, y, "spike");
            s.body.setSize(TILE, 14).setOffset(0, TILE - 14); // hurt only the points
            break;
          }
          case "e":
            this.spawnEnemy(x, y);
            break;
          case "-":
            this.spawnMover(x, y, "h");
            break;
          case "|":
            this.spawnMover(x, y, "v");
            break;
          case "P":
            this.spawnX = x; this.spawnY = y;
            this.spawnPlayer(x, y);
            break;
          case "G":
            this.goal = this.physics.add.staticImage(x, y, "flag");
            this.goal.body.setSize(20, 48);
            this.tweens.add({ targets: this.goal, y: y - 4, duration: 1100,
              yoyo: true, repeat: -1, ease: "Sine.inOut" });
            break;
        }
      }
    }
  }

  spawnPlayer(x, y) {
    this.player = this.physics.add.sprite(x, y, "player");
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(20, 30).setOffset(3, 2);
    this.player.setMaxVelocity(CONFIG.moveSpeed, 1400);
    this.player.setDragX(CONFIG.drag);
  }

  spawnCoin(x, y) {
    const coin = this.coins.create(x, y, "coin");
    coin.body.setCircle(9, 1, 1);
    this.tweens.add({ targets: coin, y: y - 6, duration: 800, yoyo: true,
      repeat: -1, ease: "Sine.inOut", delay: Phaser.Math.Between(0, 400) });
    this.tweens.add({ targets: coin, scaleX: 0.4, duration: 600, yoyo: true, repeat: -1 });
  }

  spawnEnemy(x, y) {
    const e = this.enemies.create(x, y, "enemy");
    e.body.setSize(24, 20).setOffset(2, 4);
    e.setBounceX(1).setCollideWorldBounds(true);
    e.setVelocityX(Phaser.Math.RND.sign() * CONFIG.enemySpeed);
    e.body.onWorldBounds = true;
  }

  spawnMover(x, y, axis) {
    const m = this.movers.create(x, y, "platform");
    m.refreshBody();
    m.startX = x; m.startY = y; m.axis = axis;
    m.range = axis === "h" ? TILE * 2.5 : TILE * 2;
    m.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
    m.speed = 1.3; // radians/sec of the oscillation
    m.prevX = x; m.prevY = y;
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      w: "W", a: "A", d: "D", space: "SPACE", r: "R",
    });
    this.keys.r.on("down", () => {
      if (!this.finished) this.scene.restart({ level: this.levelIndex, lives: this.lives, score: this.score });
    });
  }

  buildHud() {
    const style = { fontFamily: "Segoe UI, sans-serif", fontSize: "20px", color: "#cdd6f4" };
    this.coinText = this.add.text(16, 12, "", style).setScrollFactor(0).setDepth(50);
    this.livesText = this.add.text(16, 38, "", style).setScrollFactor(0).setDepth(50);
    this.levelText = this.add.text(this.scale.width - 16, 12, "", style)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(50);
    this.refreshHud();
  }

  refreshHud() {
    this.coinText.setText(`✦ ${this.score}`);
    this.livesText.setText(`♥ ${this.lives}`);
    this.levelText.setText(`Level ${this.levelIndex + 1} / ${LEVELS.length}`);
  }

  /* ---- update loop -------------------------------------------------------*/
  update(time) {
    if (this.finished) return;
    this.moveMovers(time);
    this.handleMovement(time);
    this.enforceEnemyPatrol();
  }

  moveMovers(time) {
    const t = time / 1000;
    this.movers.children.iterate((m) => {
      if (!m) return;
      m.prevX = m.x; m.prevY = m.y;
      const off = Math.sin(t * m.speed + m.phase) * m.range;
      if (m.axis === "h") m.x = m.startX + off;
      else m.y = m.startY + off;
      m.body.updateFromGameObject(); // keep the static-style body in sync
      // Carry the player if they're standing on this platform.
      const p = this.player;
      const onTop = p.body.bottom <= m.body.top + 8 && p.body.bottom >= m.body.top - 8;
      const overlapX = p.body.right > m.body.left + 2 && p.body.left < m.body.right - 2;
      if (p.body.touching.down && onTop && overlapX) {
        p.x += m.x - m.prevX;
        p.y += m.y - m.prevY;
      }
    });
  }

  handleMovement(time) {
    const p = this.player;
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;
    const onGround = p.body.blocked.down || p.body.touching.down;

    if (onGround) {
      this.lastGroundedAt = time;
      this.canDoubleJump = true;
    }

    const accel = onGround ? CONFIG.accel : CONFIG.airAccel;
    if (left && !right) {
      p.setAccelerationX(-accel);
      p.setFlipX(true);
    } else if (right && !left) {
      p.setAccelerationX(accel);
      p.setFlipX(false);
    } else {
      p.setAccelerationX(0); // drag handles the stop
    }

    // Buffer the jump key so an early press still fires on landing.
    const jumpDown = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.w) ||
      Phaser.Input.Keyboard.JustDown(this.keys.space);
    if (jumpDown) this.jumpPressedAt = time;

    const wantsJump = time - this.jumpPressedAt <= CONFIG.jumpBufferMs;
    const hasCoyote = time - this.lastGroundedAt <= CONFIG.coyoteMs;

    if (wantsJump && (onGround || hasCoyote)) {
      p.setVelocityY(-CONFIG.jumpVel);
      this.jumpPressedAt = -1e9;
      this.lastGroundedAt = -1e9;
      this.squash(1.25, 0.7);
      this.dust(p.x, p.body.bottom);
    } else if (wantsJump && this.canDoubleJump && !onGround) {
      p.setVelocityY(-CONFIG.doubleJumpVel);
      this.canDoubleJump = false;
      this.jumpPressedAt = -1e9;
      this.squash(1.2, 0.75);
      this.dust(p.x, p.body.bottom);
    }

    // Variable jump height: release early = shorter hop.
    const jumpHeld = this.cursors.up.isDown || this.cursors.space.isDown ||
      this.keys.w.isDown || this.keys.space.isDown;
    if (!jumpHeld && p.body.velocity.y < -200) {
      p.setVelocityY(p.body.velocity.y * 0.55);
    }

    // Fell out of the world.
    if (p.y > this.worldH + 80) this.loseLife();
  }

  enforceEnemyPatrol() {
    // Reverse an enemy before it walks off the edge of its platform.
    this.enemies.children.iterate((e) => {
      if (!e || !e.body) return;
      if (e.body.velocity.x === 0) e.setVelocityX(CONFIG.enemySpeed);
      e.setFlipX(e.body.velocity.x < 0);
      if (!e.body.blocked.down) return;
      const ahead = e.body.velocity.x > 0 ? e.body.right + 4 : e.body.left - 4;
      const footY = e.body.bottom + 6;
      let groundAhead = false;
      this.solids.children.iterate((s) => {
        if (!s) return;
        if (ahead >= s.body.left && ahead <= s.body.right &&
            footY >= s.body.top && footY <= s.body.bottom + 2) groundAhead = true;
      });
      if (!groundAhead) e.setVelocityX(-e.body.velocity.x);
    });
  }

  /* ---- interactions ------------------------------------------------------*/
  collectCoin(player, coin) {
    coin.disableBody(true, true);
    this.score += 1;
    this.refreshHud();
    this.burst(coin.x, coin.y, 0xf9e2af, 6);
    this.popText(coin.x, coin.y, "+1", "#f9e2af");
  }

  hitHazard() {
    if (this.time.now < this.invulnUntil) return;
    this.loseLife();
  }

  touchEnemy(player, enemy) {
    if (this.finished) return;
    const stomped = player.body.velocity.y > 60 &&
      player.body.bottom <= enemy.body.top + 14;
    if (stomped) {
      enemy.disableBody(true, true);
      player.setVelocityY(-CONFIG.jumpVel * 0.7); // bounce
      this.canDoubleJump = true;
      this.score += 2;
      this.refreshHud();
      this.burst(enemy.x, enemy.y, 0xf38ba8, 8);
      this.popText(enemy.x, enemy.y, "+2", "#f38ba8");
      this.cameras.main.shake(120, 0.006);
    } else if (this.time.now >= this.invulnUntil) {
      this.loseLife();
    }
  }

  loseLife() {
    if (this.finished) return;
    this.lives -= 1;
    this.refreshHud();
    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(180, 120, 20, 40);

    if (this.lives <= 0) {
      this.finished = true;
      this.cameras.main.fade(450, 12, 10, 30);
      this.time.delayedCall(480, () =>
        this.scene.start("end", { won: false, score: this.score }));
      return;
    }
    // Respawn at the level start with brief invulnerability.
    this.invulnUntil = this.time.now + 1200;
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.spawnX, this.spawnY);
    this.player.setScale(1, 1);
    this.tweens.add({ targets: this.player, alpha: 0.3, duration: 120,
      yoyo: true, repeat: 5, onComplete: () => this.player.setAlpha(1) });
  }

  reachGoal() {
    if (this.finished) return;
    this.finished = true;
    this.player.setVelocity(0, 0);
    this.player.setAccelerationX(0);
    this.burst(this.goal.x, this.goal.y, 0xa6e3a1, 18);
    this.cameras.main.fade(550, 12, 10, 30);

    const next = this.levelIndex + 1;
    this.time.delayedCall(600, () => {
      if (next < LEVELS.length) {
        this.scene.start("game", { level: next, lives: this.lives, score: this.score });
      } else {
        this.scene.start("end", { won: true, score: this.score });
      }
    });
  }

  /* ---- juice helpers -----------------------------------------------------*/
  squash(sx, sy) {
    this.player.setScale(sx, sy);
    this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 160, ease: "Back.out" });
  }

  dust(x, y) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 20, max: 80 }, angle: { min: 200, max: 340 },
      scale: { start: 0.8, end: 0 }, lifespan: 300, quantity: 6,
      tint: 0x9399b2, blendMode: "ADD",
    });
    this.time.delayedCall(320, () => e.destroy());
  }

  burst(x, y, tint, qty) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 40, max: 160 }, scale: { start: 1, end: 0 },
      lifespan: 450, quantity: qty, tint, blendMode: "ADD",
    });
    this.time.delayedCall(480, () => e.destroy());
  }

  popText(x, y, msg, color) {
    const t = this.add.text(x, y - 10, msg, {
      fontFamily: "Segoe UI, sans-serif", fontSize: "18px", color, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 650,
      ease: "Cubic.out", onComplete: () => t.destroy() });
  }
}

/* ----------------------------------------------------------------------------
 * EndScene — win or game over, with a replay prompt.
 * ------------------------------------------------------------------------- */
class EndScene extends Phaser.Scene {
  constructor() { super("end"); }

  init(data) { this.won = data.won; this.score = data.score ?? 0; }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(this.won ? "#14241a" : "#241019");

    this.add.text(width / 2, height / 2 - 70, this.won ? "YOU ESCAPED!" : "GAME OVER", {
      fontFamily: "Segoe UI, sans-serif", fontSize: "54px", fontStyle: "bold",
      color: this.won ? "#a6e3a1" : "#f38ba8",
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, `Crystals collected: ✦ ${this.score}`, {
      fontFamily: "Segoe UI, sans-serif", fontSize: "24px", color: "#cdd6f4",
    }).setOrigin(0.5);

    const prompt = this.add.text(width / 2, height / 2 + 70, "Press SPACE to play again", {
      fontFamily: "Segoe UI, sans-serif", fontSize: "20px", color: "#9399b2",
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    this.input.keyboard.once("keydown-SPACE", () => this.scene.start("menu"));
    this.input.keyboard.once("keydown-ENTER", () => this.scene.start("menu"));
  }
}

/* ----------------------------------------------------------------------------
 * Boot the game.
 * ------------------------------------------------------------------------- */
new Phaser.Game({
  type: Phaser.AUTO,
  width: CONFIG.width,
  height: CONFIG.height,
  parent: "game",
  backgroundColor: "#13112a",
  pixelArt: false,
  physics: {
    default: "arcade",
    arcade: { gravity: { y: CONFIG.gravity }, debug: false },
  },
  scene: [BootScene, MenuScene, GameScene, EndScene],
});
