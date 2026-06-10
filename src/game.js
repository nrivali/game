/* ============================================================================
 * Last Wall — a 2D zombie wave-defense game built with Phaser 3
 *
 * The whole game lives in one Phaser scene plus a thin DOM layer (top bar +
 * shop) defined in index.html. All artwork is generated procedurally at
 * runtime in BootScene, so there are no image or audio assets to manage.
 *
 *   BootScene  — builds every texture from shapes, then starts GameScene
 *   GameScene  — waves, zombies, turret, bullets, economy and the shop
 *
 * Gameplay loop:
 *   • Zombies spawn on the right and shuffle toward your wall on the left.
 *   • A turret on the wall auto-fires at the nearest zombie; clicking the
 *     field fires bonus shots.
 *   • Each kill pays a bounty (scaled by your income multiplier); clearing a
 *     wave pays a bonus.
 *   • Spend cash in the live shop on damage, fire rate, multi-shot, pierce,
 *     income, max wall HP, and emergency repairs.
 *   • The wall losing all its HP ends the run. It is endless — survive as
 *     many waves as you can.
 *
 * All the knobs worth tuning live in the CONFIG block right below.
 * ==========================================================================*/

const CONFIG = {
  WIDTH: 900,
  HEIGHT: 560,

  PLAY_TOP: 40,        // zombies roam between these y bounds
  PLAY_BOTTOM: 524,
  WALL_X: 78,          // right face of the wall — zombies attack on contact
  TURRET_X: 70,        // turret pivot, mounted on the wall

  BULLET_SPEED: 660,
  MANUAL_COOLDOWN: 150, // ms between player-clicked shots

  PREP_TIME: 12,        // seconds of build time between waves (auto-starts)
  EARLY_BONUS: 20,      // cash for starting a wave during prep
};

/* zombie archetypes. hp / speed / bounty scale up with the wave number; the
 * values here are the wave-1 baseline. tint colours the (white) sprite. */
const ZTYPES = {
  walker: { hp: 22,  speed: 30, bounty: 5,   dmg: 8,  scale: 1.0, tint: 0x8fbf6f, label: false },
  runner: { hp: 14,  speed: 74, bounty: 7,   dmg: 6,  scale: 0.8, tint: 0xe6d36a, label: false },
  brute:  { hp: 90,  speed: 19, bounty: 22,  dmg: 22, scale: 1.6, tint: 0x6f9f95, label: true  },
  boss:   { hp: 700, speed: 17, bounty: 180, dmg: 65, scale: 2.7, tint: 0xc25b5b, label: true  },
};

/* ----------------------------------------------------------------------------
 * BootScene — procedural textures
 * --------------------------------------------------------------------------*/
class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  create() {
    this.makeZombie();
    this.makeBits();
    this.scene.start('game');
  }

  // A simple white humanoid silhouette; tinted per zombie type at spawn.
  makeZombie() {
    const w = 30, h = 40;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    // body
    g.fillRoundedRect(5, 12, 20, 26, 6);
    // head
    g.fillCircle(15, 9, 8);
    // stubby arms reaching forward
    g.fillRoundedRect(0, 16, 9, 6, 3);
    // darker detail (eyes / shading) so it reads even when tinted
    g.fillStyle(0x000000, 0.35);
    g.fillRect(10, 6, 3, 3);
    g.fillRect(17, 6, 3, 3);
    g.fillRect(8, 24, 14, 3);
    g.generateTexture('zombie', w, h);
    g.destroy();
  }

  makeBits() {
    // bullet — bright tracer
    let g = this.make.graphics({ add: false });
    g.fillStyle(0xfff2a8, 1); g.fillCircle(5, 5, 4);
    g.fillStyle(0xffffff, 1); g.fillCircle(5, 5, 2);
    g.generateTexture('bullet', 10, 10); g.destroy();

    // square particle (tinted for blood / sparks / dust)
    g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 6, 6);
    g.generateTexture('bit', 6, 6); g.destroy();

    // turret hub
    g = this.make.graphics({ add: false });
    g.fillStyle(0x4a5568, 1); g.fillCircle(18, 18, 17);
    g.fillStyle(0x2d3748, 1); g.fillCircle(18, 18, 12);
    g.fillStyle(0x718096, 1); g.fillCircle(18, 18, 5);
    g.generateTexture('turret', 36, 36); g.destroy();

    // turret barrel — origin will be set to the pivot (left, centred)
    g = this.make.graphics({ add: false });
    g.fillStyle(0x2d3748, 1); g.fillRoundedRect(0, 0, 34, 12, 4);
    g.fillStyle(0x4a5568, 1); g.fillRect(28, 2, 8, 8);
    g.generateTexture('barrel', 36, 12); g.destroy();

    // muzzle flash
    g = this.make.graphics({ add: false });
    g.fillStyle(0xfff2a8, 1); g.fillCircle(11, 11, 10);
    g.fillStyle(0xffffff, 1); g.fillCircle(11, 11, 5);
    g.generateTexture('flash', 22, 22); g.destroy();
  }
}

/* ----------------------------------------------------------------------------
 * GameScene — everything else
 * --------------------------------------------------------------------------*/
class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    const C = CONFIG;

    // ---- run state ----
    this.wave = 0;            // incremented to 1 when the first wave starts
    this.money = 60;
    this.state = 'prep';      // 'prep' | 'active' | 'over'
    this.prepTimer = C.PREP_TIME;
    this.spawnQueue = [];     // pending zombies for the active wave
    this.spawnTimer = 0;
    this.autoCd = 0;          // turret auto-fire cooldown (ms)
    this.manualCd = 0;        // player-click cooldown (ms)

    // upgrade levels (0-based). Derived stats are getters below.
    this.lv = { damage: 0, fireRate: 0, multishot: 0, pierce: 0, income: 0, maxhp: 0 };
    this.baseHp = this.maxHp;

    // ---- world ----
    this.cameras.main.setBackgroundColor('#15131f');
    this.drawBackground();

    // physics groups
    this.zombies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.physics.add.overlap(this.bullets, this.zombies, this.onBulletHit, null, this);

    // turret
    this.add.image(C.TURRET_X, C.HEIGHT / 2, 'turret').setDepth(6);
    this.barrel = this.add.image(C.TURRET_X, C.HEIGHT / 2, 'barrel')
      .setOrigin(0.12, 0.5).setDepth(7);
    this.muzzle = this.add.image(0, 0, 'flash').setDepth(8).setVisible(false);

    // hp-bar overlay for zombies (one Graphics, redrawn each frame)
    this.hpGfx = this.add.graphics().setDepth(9);

    // ---- input: click the field to fire bonus shots ----
    this.input.on('pointerdown', (p) => {
      if (this.state === 'over') return;
      if (p.x < CONFIG.TURRET_X + 8) return; // ignore clicks on the wall itself
      if (this.manualCd > 0) return;
      this.manualCd = CONFIG.MANUAL_COOLDOWN;
      const a = Phaser.Math.Angle.Between(CONFIG.TURRET_X, CONFIG.HEIGHT / 2, p.x, p.y);
      this.fireBullet(a, 1.35); // manual shots hit a little harder
      this.barrel.rotation = a;
    });

    // ---- DOM wiring ----
    this.buildShop();
    this.wireDom();
    this.refreshUI();
  }

  /* ---- derived stats (read straight off upgrade levels) ---- */
  get damage()      { return 8 + this.lv.damage * 5; }
  get cooldown()    { return Math.max(95, 620 - this.lv.fireRate * 42); } // ms between auto shots
  get projectiles() { return 1 + this.lv.multishot; }
  get pierce()      { return this.lv.pierce; }            // extra enemies pierced
  get incomeMult()  { return 1 + this.lv.income * 0.25; }
  get maxHp()       { return 100 + this.lv.maxhp * 45; }

  /* ====================================================================== */
  /* main loop                                                              */
  /* ====================================================================== */
  update(_t, dms) {
    if (this.state === 'over') return;
    const dt = dms / 1000;

    this.manualCd = Math.max(0, this.manualCd - dms);

    if (this.state === 'prep') {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) this.startWave();
    } else if (this.state === 'active') {
      this.handleSpawning(dms);
    }

    this.updateTurret(dms);
    this.updateZombies();
    this.cullBullets();
    this.drawHpBars();
    this.refreshUI();
  }

  /* ====================================================================== */
  /* waves                                                                  */
  /* ====================================================================== */
  startWave() {
    if (this.state === 'active') return;
    if (this.state === 'prep' && this.prepTimer > 0 && this.wave > 0) {
      // rewarded for not idling through the whole build phase
      this.addMoney(CONFIG.EARLY_BONUS, CONFIG.WIDTH / 2, 90, '#f9e2af');
    }
    this.wave += 1;
    this.state = 'active';
    this.spawnQueue = this.buildWave(this.wave);
    this.spawnTimer = 0;
  }

  // produce an ordered list of { type, gap } where gap is ms before spawning
  buildWave(w) {
    const q = [];
    const count = 5 + Math.floor(w * 2.4);
    const baseGap = Math.max(280, 820 - w * 22); // zombies arrive faster later

    // type availability + weighting ramps up with the wave
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let type = 'walker';
      if (w >= 4 && roll > 0.82) type = 'brute';
      else if (w >= 3 && roll > 0.55) type = 'runner';
      q.push({ type, gap: baseGap * Phaser.Math.FloatBetween(0.6, 1.25) });
    }

    // a boss leads every 5th wave
    if (w % 5 === 0) {
      q.unshift({ type: 'walker', gap: 200 });
      q.unshift({ type: 'boss', gap: 600 });
    }
    return q;
  }

  handleSpawning(dms) {
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dms;
      if (this.spawnTimer <= 0) {
        const next = this.spawnQueue.shift();
        this.spawnZombie(next.type);
        this.spawnTimer = next.gap;
      }
    } else if (this.zombies.countActive(true) === 0) {
      this.endWave();
    }
  }

  endWave() {
    const bonus = 25 + this.wave * 12;
    this.addMoney(bonus, CONFIG.WIDTH / 2, 80, '#a6e3a1', `WAVE ${this.wave} CLEARED  +`);
    this.state = 'prep';
    this.prepTimer = CONFIG.PREP_TIME;
  }

  /* ====================================================================== */
  /* zombies                                                                */
  /* ====================================================================== */
  spawnZombie(typeKey) {
    const t = ZTYPES[typeKey];
    const w = this.wave;

    // scale baseline stats by wave number
    const hpScale = 1 + (w - 1) * (typeKey === 'boss' ? 0.55 : 0.17);
    const maxHp = Math.round(t.hp * hpScale);
    const speed = t.speed + w * 0.6;
    const bounty = Math.round(t.bounty * (1 + (w - 1) * 0.08));

    const y = Phaser.Math.Between(CONFIG.PLAY_TOP + 14, CONFIG.PLAY_BOTTOM - 14);
    const z = this.zombies.create(CONFIG.WIDTH + 24, y, 'zombie');
    z.setTint(t.tint).setScale(t.scale).setDepth(4);
    z.body.setSize(20, 30).setOffset(5, 8);
    z.setVelocityX(-speed);

    z.zType = typeKey;
    z.hp = maxHp;
    z.maxHp = maxHp;
    z.dmg = t.dmg;
    z.bounty = bounty;
    z.showBar = t.label;
    return z;
  }

  updateZombies() {
    const reach = CONFIG.WALL_X;
    this.zombies.getChildren().forEach((z) => {
      if (!z.active) return;
      // shamble bob
      z.y += Math.sin(this.time.now / 120 + z.x) * 0.18;
      if (z.x <= reach) {
        this.damageWall(z.dmg, z.y);
        this.spawnBits(reach + 6, z.y, 0x9b6b6b, 7);
        z.destroy();
      }
    });
  }

  damageZombie(z, dmg) {
    z.hp -= dmg;
    if (z.hp <= 0) {
      this.killZombie(z);
      return true;
    }
    // brief white flash on hit
    z.setTintFill(0xffffff);
    this.time.delayedCall(45, () => { if (z.active) z.setTint(ZTYPES[z.zType].tint); });
    return false;
  }

  killZombie(z) {
    const gained = Math.round(z.bounty * this.incomeMult);
    this.addMoney(gained, z.x, z.y - 8, '#a6e3a1');
    this.spawnBits(z.x, z.y, 0x7a3b3b, z.zType === 'boss' ? 26 : 10);
    z.destroy();
  }

  /* ====================================================================== */
  /* turret + bullets                                                       */
  /* ====================================================================== */
  updateTurret(dms) {
    this.autoCd = Math.max(0, this.autoCd - dms);

    const target = this.nearestZombie();
    if (target) {
      const a = Phaser.Math.Angle.Between(CONFIG.TURRET_X, CONFIG.HEIGHT / 2, target.x, target.y);
      // ease the barrel toward the target for a smooth swivel
      this.barrel.rotation = Phaser.Math.Angle.RotateTo(this.barrel.rotation, a, 0.25);
      if (this.autoCd <= 0) {
        this.fireSpread(this.barrel.rotation);
        this.autoCd = this.cooldown;
      }
    }
  }

  nearestZombie() {
    let best = null, bestD = Infinity;
    this.zombies.getChildren().forEach((z) => {
      if (!z.active) return;
      const d = Phaser.Math.Distance.Squared(CONFIG.TURRET_X, CONFIG.HEIGHT / 2, z.x, z.y);
      if (d < bestD) { bestD = d; best = z; }
    });
    return best;
  }

  // auto-fire honours the multi-shot upgrade as an even spread
  fireSpread(angle) {
    const n = this.projectiles;
    const spread = 0.16;
    const start = -spread * (n - 1) / 2;
    for (let i = 0; i < n; i++) this.fireBullet(angle + start + i * spread, 1);
    this.flashMuzzle(angle);
  }

  fireBullet(angle, dmgMult) {
    const tipX = CONFIG.TURRET_X + Math.cos(angle) * 28;
    const tipY = CONFIG.HEIGHT / 2 + Math.sin(angle) * 28;
    const b = this.bullets.create(tipX, tipY, 'bullet').setDepth(5);
    b.body.setSize(8, 8);
    this.physics.velocityFromRotation(angle, CONFIG.BULLET_SPEED, b.body.velocity);
    b.rotation = angle;
    b.dmg = this.damage * dmgMult;
    b.pierceLeft = this.pierce;
    b.hitSet = new Set(); // avoid hitting the same zombie on consecutive frames
  }

  flashMuzzle(angle) {
    const x = CONFIG.TURRET_X + Math.cos(angle) * 30;
    const y = CONFIG.HEIGHT / 2 + Math.sin(angle) * 30;
    this.muzzle.setPosition(x, y).setVisible(true).setScale(Phaser.Math.FloatBetween(0.7, 1.1));
    this.time.delayedCall(45, () => this.muzzle.setVisible(false));
    // recoil kick
    this.barrel.x = CONFIG.TURRET_X - Math.cos(angle) * 3;
    this.barrel.y = CONFIG.HEIGHT / 2 - Math.sin(angle) * 3;
    this.tweens.add({ targets: this.barrel, x: CONFIG.TURRET_X, y: CONFIG.HEIGHT / 2, duration: 70 });
  }

  onBulletHit(bullet, zombie) {
    if (!bullet.active || !zombie.active) return;
    if (bullet.hitSet.has(zombie)) return;
    bullet.hitSet.add(zombie);

    this.spawnBits(zombie.x, zombie.y, 0xfff2a8, 3);
    this.damageZombie(zombie, bullet.dmg);

    if (bullet.pierceLeft > 0) bullet.pierceLeft -= 1;
    else bullet.destroy();
  }

  cullBullets() {
    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (b.x < -40 || b.x > CONFIG.WIDTH + 40 || b.y < -40 || b.y > CONFIG.HEIGHT + 40) {
        b.destroy();
      }
    });
  }

  /* ====================================================================== */
  /* the wall                                                               */
  /* ====================================================================== */
  damageWall(dmg, y) {
    if (this.state === 'over') return;
    this.baseHp = Math.max(0, this.baseHp - dmg);
    this.cameras.main.shake(120, 0.006);
    this.flashWall();
    if (this.baseHp <= 0) this.gameOver();
  }

  flashWall() {
    if (!this.wallFlash) return;
    this.wallFlash.setAlpha(0.5);
    this.tweens.add({ targets: this.wallFlash, alpha: 0, duration: 200 });
  }

  gameOver() {
    this.state = 'over';
    this.physics.pause();
    const sub = document.getElementById('overlay-sub');
    sub.innerHTML = `You held the wall through <b>${this.wave - 1}</b> wave${this.wave - 1 === 1 ? '' : 's'}` +
      ` and banked <b>$${this.money}</b>.<br>Can you push deeper?`;
    document.getElementById('overlay-title').textContent = 'The Wall Has Fallen';
    document.getElementById('overlay').classList.remove('hidden');
  }

  /* ====================================================================== */
  /* economy + floating text                                                */
  /* ====================================================================== */
  addMoney(amount, x, y, color, prefix = '+') {
    this.money += amount;
    const big = prefix.length > 1; // wave-clear / bonus banners are larger
    const txt = this.add.text(x, y, big ? `${prefix}$${amount}` : `+$${amount}`, {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: big ? '20px' : '15px',
      color, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: txt, y: y - 34, alpha: 0, duration: 900, ease: 'Cubic.out',
      onComplete: () => txt.destroy(),
    });
  }

  /* ====================================================================== */
  /* shop                                                                   */
  /* ====================================================================== */
  buildShop() {
    // id, name, icon, description, cost curve, level cap, current-value text
    this.UPG = [
      { id: 'damage', name: 'Damage', icon: '🔫', desc: 'More punch per bullet',
        base: 30, mul: 1.55, max: 60, val: () => `${this.damage} dmg / shot` },
      { id: 'fireRate', name: 'Fire Rate', icon: '⚡', desc: 'Shorter time between shots',
        base: 35, mul: 1.6, max: 12, val: () => `${(1000 / this.cooldown).toFixed(1)} shots / s` },
      { id: 'multishot', name: 'Multi-Shot', icon: '🎯', desc: 'Extra bullet per volley',
        base: 90, mul: 2.0, max: 6, val: () => `${this.projectiles} bullets / volley` },
      { id: 'pierce', name: 'Pierce', icon: '➶', desc: 'Bullets punch through more zombies',
        base: 110, mul: 2.1, max: 6, val: () => `hits ${this.pierce + 1} zombie${this.pierce ? 's' : ''}` },
      { id: 'income', name: 'Income', icon: '💰', desc: 'More cash from every kill',
        base: 70, mul: 1.7, max: 12, val: () => `x${this.incomeMult.toFixed(2)} bounty` },
      { id: 'maxhp', name: 'Reinforce', icon: '🧱', desc: 'Raises max wall HP (and heals it)',
        base: 60, mul: 1.6, max: 20, val: () => `${this.maxHp} max wall HP` },
      { id: 'repair', name: 'Repair Wall', icon: '🛠️', desc: 'Restore 35% of the wall now',
        repair: true, val: () => `${Math.round(this.baseHp)} / ${this.maxHp} HP` },
    ];

    const list = document.getElementById('upg-list');
    list.innerHTML = '';
    this.UPG.forEach((u) => {
      const btn = document.createElement('button');
      btn.className = 'upg';
      btn.innerHTML =
        `<div class="upg-top"><span class="upg-name">${u.icon} ${u.name}</span>` +
        `<span class="upg-cost"></span></div>` +
        `<div class="upg-desc">${u.desc}</div>` +
        `<div class="upg-val"></div>`;
      btn.addEventListener('click', () => this.buyUpgrade(u));
      list.appendChild(btn);
      u._btn = btn;
      u._cost = btn.querySelector('.upg-cost');
      u._val = btn.querySelector('.upg-val');
    });
  }

  costOf(u) {
    if (u.repair) {
      const missing = this.maxHp - this.baseHp;
      return Math.max(8, Math.round(missing * 0.7));
    }
    return Math.floor(u.base * Math.pow(u.mul, this.lv[u.id]));
  }

  isMaxed(u) {
    return !u.repair && this.lv[u.id] >= u.max;
  }

  buyUpgrade(u) {
    if (this.state === 'over') return;
    if (this.isMaxed(u)) return;

    if (u.repair) {
      if (this.baseHp >= this.maxHp) return;
      const cost = this.costOf(u);
      if (this.money < cost) return;
      this.money -= cost;
      this.baseHp = Math.min(this.maxHp, this.baseHp + this.maxHp * 0.35);
    } else {
      const cost = this.costOf(u);
      if (this.money < cost) return;
      this.money -= cost;
      this.lv[u.id] += 1;
      if (u.id === 'maxhp') this.baseHp += 45; // reinforcing also patches the wall
    }

    u._btn.classList.remove('flash'); void u._btn.offsetWidth; // restart anim
    u._btn.classList.add('flash');
    this.refreshUI();
  }

  /* ====================================================================== */
  /* DOM HUD                                                                */
  /* ====================================================================== */
  wireDom() {
    document.getElementById('ui-wave-btn').onclick = () => {
      if (this.state === 'prep') this.startWave();
    };
    document.getElementById('overlay-btn').onclick = () => {
      document.getElementById('overlay').classList.add('hidden');
      this.scene.restart();
    };
  }

  refreshUI() {
    document.getElementById('ui-wave').textContent = Math.max(1, this.wave);
    document.getElementById('ui-money').textContent = '$' + this.money;

    const pct = Math.max(0, this.baseHp / this.maxHp) * 100;
    document.getElementById('ui-hp-fill').style.width = pct + '%';
    document.getElementById('ui-hp-text').textContent = Math.round(this.baseHp);

    // wave button reflects current state
    const btn = document.getElementById('ui-wave-btn');
    if (this.state === 'active') {
      const left = this.spawnQueue.length + this.zombies.countActive(true);
      btn.disabled = true;
      btn.textContent = `Wave ${this.wave} — ${left} left`;
    } else if (this.state === 'over') {
      btn.disabled = true;
      btn.textContent = 'Overrun';
    } else {
      btn.disabled = false;
      const next = this.wave + 1;
      btn.textContent = this.wave === 0
        ? 'Start Wave 1'
        : `Start Wave ${next}  (${Math.ceil(this.prepTimer)}s)`;
    }

    // shop buttons
    this.UPG.forEach((u) => {
      const maxed = this.isMaxed(u);
      const cost = this.costOf(u);
      const repairFull = u.repair && this.baseHp >= this.maxHp;
      u._val.textContent = u.val();
      if (maxed) {
        u._cost.textContent = 'MAX';
        u._cost.classList.add('maxed');
      } else {
        u._cost.textContent = '$' + cost;
        u._cost.classList.remove('maxed');
      }
      const affordable = !maxed && !repairFull && this.money >= cost && this.state !== 'over';
      u._btn.disabled = maxed || repairFull || this.money < cost || this.state === 'over';
      u._btn.classList.toggle('can-afford', affordable);
    });
  }

  /* ====================================================================== */
  /* visuals                                                                */
  /* ====================================================================== */
  drawBackground() {
    const C = CONFIG, g = this.add.graphics().setDepth(0);

    // ground band the zombies walk on
    g.fillStyle(0x1b2436, 1);
    g.fillRect(0, C.PLAY_TOP, C.WIDTH, C.PLAY_BOTTOM - C.PLAY_TOP);
    // faint marching lanes
    g.fillStyle(0xffffff, 0.025);
    for (let y = C.PLAY_TOP + 40; y < C.PLAY_BOTTOM; y += 60) g.fillRect(0, y, C.WIDTH, 2);

    // the wall on the left
    g.fillStyle(0x3a3550, 1);
    g.fillRect(0, 0, C.WALL_X, C.HEIGHT);
    g.fillStyle(0x2a2740, 1);
    for (let y = 0; y < C.HEIGHT; y += 28) {
      const off = (y / 28) % 2 ? 14 : 0;
      for (let x = -off; x < C.WALL_X; x += 28) g.fillRect(x + 2, y + 2, 24, 24);
    }
    g.fillStyle(0x4a4566, 1);
    g.fillRect(C.WALL_X - 4, 0, 4, C.HEIGHT); // bright inner edge

    // red flash overlay used when the wall is struck
    this.wallFlash = this.add.rectangle(C.WALL_X / 2, C.HEIGHT / 2, C.WALL_X, C.HEIGHT, 0xf38ba8)
      .setAlpha(0).setDepth(2);
  }

  spawnBits(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const p = this.add.image(x, y, 'bit').setTint(color).setDepth(10)
        .setScale(Phaser.Math.FloatBetween(0.6, 1.6));
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = Phaser.Math.FloatBetween(30, 140);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp,
        alpha: 0, scale: 0, duration: Phaser.Math.Between(250, 500),
        onComplete: () => p.destroy(),
      });
    }
  }

  drawHpBars() {
    const g = this.hpGfx;
    g.clear();
    this.zombies.getChildren().forEach((z) => {
      if (!z.active) return;
      if (!z.showBar && z.hp >= z.maxHp) return; // only show when damaged or tanky
      const w = 26 * z.scale, frac = Phaser.Math.Clamp(z.hp / z.maxHp, 0, 1);
      const x = z.x - w / 2, y = z.y - 24 * z.scale;
      g.fillStyle(0x000000, 0.6); g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle(0xf38ba8, 1);   g.fillRect(x, y, w, 4);
      g.fillStyle(0xa6e3a1, 1);   g.fillRect(x, y, w * frac, 4);
    });
  }
}

/* ----------------------------------------------------------------------------
 * boot Phaser
 * --------------------------------------------------------------------------*/
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.WIDTH,
  height: CONFIG.HEIGHT,
  backgroundColor: '#15131f',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BootScene, GameScene],
});
