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

  MAX_TURRETS: 6,      // slots available along the wall

  PREP_TIME: 9,         // seconds of build time between waves (auto-starts)
  EARLY_BONUS: 20,      // cash for starting a wave during prep
};

/* zombie archetypes. hp / speed / bounty scale up with the wave number; the
 * values here are the wave-1 baseline. tint colours the (white) sprite. */
const ZTYPES = {
  walker: { hp: 26,  speed: 32, bounty: 5,   dmg: 11,  scale: 1.0, tint: 0x8fbf6f, label: false },
  runner: { hp: 16,  speed: 82, bounty: 7,   dmg: 9,   scale: 0.8, tint: 0xe6d36a, label: false },
  brute:  { hp: 120, speed: 21, bounty: 22,  dmg: 30,  scale: 1.6, tint: 0x6f9f95, label: true  },
  boss:   { hp: 900, speed: 19, bounty: 180, dmg: 95,  scale: 2.7, tint: 0xc25b5b, label: true  },
};

/* turret archetypes. Each defines its own base firepower and a behaviour; the
 * global shop upgrades (damage / fire rate / multi-shot / pierce) then scale
 * every turret you own. `cost` is the base price — buying more turrets makes
 * the next one pricier regardless of type (see turretCost). Specials:
 *   splash — bullet explodes on impact, damaging everything in a radius
 *   slow   — bullet chills the zombie it hits, cutting its speed for a while  */
const TURRET_TYPES = {
  gunner:  { name: 'Gunner',  icon: '🔫', cost: 55,  color: 0x89b4fa, bullet: 0xfff2a8,
             dmg: 9,  cd: 500,  proj: 1, spread: 0.12, pierce: 0, speed: 660,
             desc: 'Reliable all-rounder', stat: 'balanced single shot' },
  gatling: { name: 'Gatling', icon: '⚙️', cost: 120, color: 0xf9e2af, bullet: 0xfff2a8,
             dmg: 4,  cd: 120,  proj: 1, spread: 0.10, pierce: 0, speed: 760,
             desc: 'Very fast, low damage', stat: 'rapid fire' },
  sniper:  { name: 'Sniper',  icon: '🎯', cost: 150, color: 0xf38ba8, bullet: 0xff8a8a,
             dmg: 48, cd: 1150, proj: 1, spread: 0,    pierce: 4, speed: 1200,
             desc: 'Slow, huge damage, deep pierce', stat: 'high dmg · pierces 5' },
  scatter: { name: 'Scatter', icon: '💥', cost: 140, color: 0xfab387, bullet: 0xffd9a8,
             dmg: 6,  cd: 720,  proj: 6, spread: 0.55, pierce: 0, speed: 580,
             desc: 'Wide shotgun blast', stat: '6-pellet spread' },
  frost:   { name: 'Frost',   icon: '❄️', cost: 160, color: 0x9bd3ff, bullet: 0xc4ecff,
             dmg: 4,  cd: 420,  proj: 1, spread: 0.12, pierce: 1, speed: 620,
             desc: 'Chills and slows zombies', stat: 'slows on hit',
             slow: { factor: 0.45, dur: 1300 } },
  cannon:  { name: 'Cannon',  icon: '🧨', cost: 190, color: 0xa6e3a1, bullet: 0xcaffc4,
             dmg: 20, cd: 1050, proj: 1, spread: 0,    pierce: 0, speed: 470,
             desc: 'Explosive area damage', stat: 'splash damage',
             splash: 72 },
};
const TURRET_ORDER = ['gunner', 'gatling', 'sniper', 'scatter', 'frost', 'cannon'];

/* ----------------------------------------------------------------------------
 * Turret — one auto-firing emplacement on the wall. Stats come from its type
 * crossed with the player's global upgrade multipliers (read off the scene).
 * --------------------------------------------------------------------------*/
class Turret {
  constructor(scene, typeKey) {
    this.scene = scene;
    this.typeKey = typeKey;
    this.type = TURRET_TYPES[typeKey];
    this.cd = 0;
    this.x = CONFIG.TURRET_X;
    this.y = CONFIG.HEIGHT / 2;

    this.hub = scene.add.image(this.x, this.y, 'turret').setDepth(6);
    this.barrel = scene.add.image(this.x, this.y, 'barrel')
      .setOrigin(0.12, 0.5).setDepth(7).setTint(this.type.color);
    this.muzzle = scene.add.image(0, 0, 'flash').setDepth(8).setVisible(false)
      .setTint(this.type.bullet);
  }

  place(x, y) {
    this.x = x; this.y = y;
    this.hub.setPosition(x, y);
    this.barrel.setPosition(x, y);
  }

  update(dms) {
    this.cd -= dms;
    const target = this.scene.nearestZombieTo(this.x, this.y);
    if (!target) return;
    const a = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    this.barrel.rotation = Phaser.Math.Angle.RotateTo(this.barrel.rotation, a, 0.3);
    if (this.cd <= 0) {
      this.fire(this.barrel.rotation);
      this.cd = this.type.cd * this.scene.cooldownMult;
    }
  }

  fire(angle) {
    const s = this.scene, t = this.type;
    const n = t.proj + s.extraProjectiles;
    // tight-firing turrets still fan out a little once multi-shot is added
    const spread = t.spread || (n > 1 ? 0.09 : 0);
    const start = -spread * (n - 1) / 2;
    const dmg = t.dmg * s.damageMult;
    for (let i = 0; i < n; i++) {
      const ang = n > 1 ? angle + start + i * spread : angle;
      s.spawnBullet({
        x: this.x + Math.cos(ang) * 28,
        y: this.y + Math.sin(ang) * 28,
        angle: ang, speed: t.speed, dmg,
        pierce: t.pierce + s.extraPierce,
        splash: t.splash || 0,
        slow: t.slow || null,
        color: t.bullet,
      });
    }
    this.flash(angle);
  }

  flash(angle) {
    const mx = this.x + Math.cos(angle) * 30, my = this.y + Math.sin(angle) * 30;
    this.muzzle.setPosition(mx, my).setVisible(true)
      .setScale(Phaser.Math.FloatBetween(0.6, 1.0));
    this.scene.time.delayedCall(45, () => this.muzzle.setVisible(false));
    // recoil kick back along the firing line
    this.barrel.setPosition(this.x - Math.cos(angle) * 3, this.y - Math.sin(angle) * 3);
    this.scene.tweens.add({ targets: this.barrel, x: this.x, y: this.y, duration: 70 });
  }
}

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
    this.money = 45;
    this.state = 'prep';      // 'prep' | 'active' | 'over'
    this.prepTimer = C.PREP_TIME;
    this.spawnQueue = [];     // pending zombies for the active wave
    this.spawnTimer = 0;

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

    // turrets — start with a single free Gunner; buy more in the shop
    this.turrets = [];
    this.placeTurret('gunner');

    // hp-bar overlay for zombies (one Graphics, redrawn each frame)
    this.hpGfx = this.add.graphics().setDepth(9);

    // ---- DOM wiring ----
    this.buildShop();
    this.wireDom();
    this.refreshUI();
  }

  /* ---- global modifiers: these scale every turret you own ---- */
  get damageMult()       { return 1 + this.lv.damage * 0.22; }
  get cooldownMult()     { return Math.max(0.35, 1 - this.lv.fireRate * 0.07); }
  get extraProjectiles() { return this.lv.multishot; }   // +bullets per turret volley
  get extraPierce()      { return this.lv.pierce; }      // +enemies pierced
  get incomeMult()       { return 1 + this.lv.income * 0.25; }
  get maxHp()            { return 100 + this.lv.maxhp * 45; }

  /* ---- turrets ---- */
  placeTurret(typeKey) {
    this.turrets.push(new Turret(this, typeKey));
    this.reflowTurrets();
  }

  // spread the turrets evenly down the wall whenever their number changes
  reflowTurrets() {
    const n = this.turrets.length;
    const top = CONFIG.PLAY_TOP + 8, bot = CONFIG.PLAY_BOTTOM - 8;
    this.turrets.forEach((t, i) => {
      const y = n === 1 ? (top + bot) / 2 : top + (bot - top) * (i / (n - 1));
      t.place(CONFIG.TURRET_X, y);
    });
  }

  turretCost(typeKey) {
    return Math.round(TURRET_TYPES[typeKey].cost * Math.pow(1.3, this.turrets.length));
  }

  /* ====================================================================== */
  /* main loop                                                              */
  /* ====================================================================== */
  update(_t, dms) {
    if (this.state === 'over') return;
    const dt = dms / 1000;

    if (this.state === 'prep') {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) this.startWave();
    } else if (this.state === 'active') {
      this.handleSpawning(dms);
    }

    this.turrets.forEach((t) => t.update(dms));
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
    const count = 6 + Math.floor(w * 3.2);
    const baseGap = Math.max(160, 760 - w * 28); // zombies arrive faster later

    // type availability + weighting ramps up with the wave
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let type = 'walker';
      if (w >= 3 && roll > 0.72) type = 'brute';
      else if (w >= 2 && roll > 0.42) type = 'runner';
      q.push({ type, gap: baseGap * Phaser.Math.FloatBetween(0.55, 1.2) });
    }

    // a boss with a brute escort leads every 5th wave
    if (w % 5 === 0) {
      q.unshift({ type: 'brute', gap: 180 });
      q.unshift({ type: 'brute', gap: 220 });
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
    const bonus = 18 + this.wave * 7;
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
    const hpScale = 1 + (w - 1) * (typeKey === 'boss' ? 0.7 : 0.27);
    const maxHp = Math.round(t.hp * hpScale);
    const speed = t.speed + w * 1.2;
    const bounty = Math.round(t.bounty * (1 + (w - 1) * 0.05));

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
    z.speed = speed;        // full-speed magnitude, restored when a slow wears off
    z.slowUntil = 0;
    z.wasSlowed = false;
    return z;
  }

  updateZombies() {
    const reach = CONFIG.WALL_X, now = this.time.now;
    this.zombies.getChildren().forEach((z) => {
      if (!z.active) return;
      // shamble bob
      z.y += Math.sin(now / 120 + z.x) * 0.18;

      // frost slow: keep a chilled tint while active, restore speed when it ends
      const slowed = z.slowUntil > now;
      if (slowed) {
        z.wasSlowed = true;
        z.setTint(0x9bd3ff);
      } else if (z.wasSlowed) {
        z.wasSlowed = false;
        z.body.velocity.x = -z.speed;
        z.setTint(ZTYPES[z.zType].tint);
      }

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
  /* bullets + targeting                                                    */
  /* ====================================================================== */
  nearestZombieTo(x, y) {
    let best = null, bestD = Infinity;
    this.zombies.getChildren().forEach((z) => {
      if (!z.active) return;
      const d = Phaser.Math.Distance.Squared(x, y, z.x, z.y);
      if (d < bestD) { bestD = d; best = z; }
    });
    return best;
  }

  // create a single bullet from a turret's firing parameters
  spawnBullet(o) {
    const b = this.bullets.create(o.x, o.y, 'bullet').setDepth(5).setTint(o.color);
    b.body.setSize(8, 8);
    this.physics.velocityFromRotation(o.angle, o.speed, b.body.velocity);
    b.rotation = o.angle;
    b.dmg = o.dmg;
    b.pierceLeft = o.pierce;
    b.splash = o.splash;
    b.slow = o.slow;
    b.hitSet = new Set(); // avoid hitting the same zombie on consecutive frames
    if (o.splash) b.setScale(1.5);
  }

  onBulletHit(bullet, zombie) {
    if (!bullet.active || !zombie.active) return;
    if (bullet.hitSet.has(zombie)) return;
    bullet.hitSet.add(zombie);

    // explosive rounds detonate on first contact and ignore pierce
    if (bullet.splash) {
      this.explode(bullet.x, bullet.y, bullet.splash, bullet.dmg);
      bullet.destroy();
      return;
    }

    this.spawnBits(zombie.x, zombie.y, 0xfff2a8, 3);
    if (bullet.slow) this.applySlow(zombie, bullet.slow);
    this.damageZombie(zombie, bullet.dmg);

    if (bullet.pierceLeft > 0) bullet.pierceLeft -= 1;
    else bullet.destroy();
  }

  // area damage for cannon rounds
  explode(x, y, radius, dmg) {
    const ring = this.add.circle(x, y, radius, 0xfab387, 0.35).setDepth(11);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 240,
      onComplete: () => ring.destroy() });
    this.spawnBits(x, y, 0xffb86c, 14);
    const r2 = radius * radius;
    this.zombies.getChildren().forEach((z) => {
      if (!z.active) return;
      if (Phaser.Math.Distance.Squared(x, y, z.x, z.y) <= r2) this.damageZombie(z, dmg);
    });
  }

  applySlow(z, slow) {
    z.slowUntil = this.time.now + slow.dur;
    z.body.velocity.x = -z.speed * slow.factor;
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
    this.buildTurretShop();
    this.buildUpgradeShop();
  }

  // a card per turret type — buying one drops it into the next free slot
  buildTurretShop() {
    const list = document.getElementById('turret-list');
    list.innerHTML = '';
    this.turretBtns = {};
    TURRET_ORDER.forEach((key) => {
      const t = TURRET_TYPES[key];
      const btn = document.createElement('button');
      btn.className = 'upg';
      btn.innerHTML =
        `<div class="upg-top"><span class="upg-name">${t.icon} ${t.name}</span>` +
        `<span class="upg-cost"></span></div>` +
        `<div class="upg-desc">${t.desc}</div>` +
        `<div class="upg-val">${t.stat}</div>`;
      btn.addEventListener('click', () => this.buyTurret(key));
      list.appendChild(btn);
      this.turretBtns[key] = { btn, cost: btn.querySelector('.upg-cost') };
    });
  }

  buildUpgradeShop() {
    // global upgrades — each one scales every turret you own
    this.UPG = [
      { id: 'damage', name: 'Damage', icon: '💪', desc: 'All turrets hit harder',
        base: 35, mul: 1.55, max: 40,
        val: () => `+${Math.round((this.damageMult - 1) * 100)}% damage` },
      { id: 'fireRate', name: 'Fire Rate', icon: '⚡', desc: 'All turrets fire faster',
        base: 40, mul: 1.6, max: 9,
        val: () => `+${Math.round((1 - this.cooldownMult) * 100)}% fire rate` },
      { id: 'multishot', name: 'Multi-Shot', icon: '🎯', desc: '+1 bullet per turret volley',
        base: 110, mul: 2.0, max: 5, val: () => `+${this.extraProjectiles} bullets / volley` },
      { id: 'pierce', name: 'Pierce', icon: '➶', desc: 'All bullets pierce more zombies',
        base: 120, mul: 2.1, max: 5, val: () => `+${this.extraPierce} pierce` },
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

  buyTurret(key) {
    if (this.state === 'over') return;
    if (this.turrets.length >= CONFIG.MAX_TURRETS) return;
    const cost = this.turretCost(key);
    if (this.money < cost) return;
    this.money -= cost;
    this.placeTurret(key);

    const b = this.turretBtns[key].btn;
    b.classList.remove('flash'); void b.offsetWidth; // restart anim
    b.classList.add('flash');
    this.refreshUI();
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

    // turret cards
    const full = this.turrets.length >= CONFIG.MAX_TURRETS;
    document.getElementById('turret-count').textContent = `${this.turrets.length}/${CONFIG.MAX_TURRETS}`;
    TURRET_ORDER.forEach((key) => {
      const ref = this.turretBtns[key];
      const cost = this.turretCost(key);
      if (full) {
        ref.cost.textContent = 'FULL';
        ref.cost.classList.add('maxed');
      } else {
        ref.cost.textContent = '$' + cost;
        ref.cost.classList.remove('maxed');
      }
      const affordable = !full && this.money >= cost && this.state !== 'over';
      ref.btn.disabled = full || this.money < cost || this.state === 'over';
      ref.btn.classList.toggle('can-afford', affordable);
    });

    // upgrade cards
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
