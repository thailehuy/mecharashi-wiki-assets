// ../4_source-code/engine/gachaFxFlow1.ts
var TO_ID = [1, 1, 0, 0];
var cs = (a) => a ? [Math.cos(a), Math.sin(a)] : [1, 0];
function flow1Uniforms(f) {
  const d = f.disturb, s = f.dissolve;
  return {
    mainRot: cs(f.mainRotate),
    colorRot: cs(f.colorTex?.rotate),
    mask1Rot: cs(f.mask1?.rotate),
    mainFlow: f.mainFlow ?? [0, 0],
    disturbFlow: d?.flow ?? [0, 0],
    dissolveFlow: s?.flow ?? [0, 0],
    axis: d?.axis === "u" ? [1, 0] : d?.axis === "v" ? [0, 1] : [1, 1],
    dissolveAxis: d?.axis ? [0, 1] : [1, 1],
    mainTO: f.mainTO ?? TO_ID,
    disturbTO: d?.to ?? TO_ID,
    colorST: f.colorTex?.st ?? TO_ID,
    mask1ST: f.mask1?.st ?? TO_ID,
    mask2ST: f.mask2?.st ?? TO_ID,
    dissolveST: s?.st ?? TO_ID,
    dissolveMaskST: s?.maskST ?? TO_ID,
    k: d ? 0.1 * d.value : 0,
    vClamp: f.vClamp ? 1 : 0,
    channelR: f.channelR ? 1 : 0,
    mask1Soft: f.mask1?.softness ?? 0,
    mask1Rev: f.mask1?.revert ? 1 : 0,
    mask2Soft: f.mask2?.softness ?? 0,
    mask2Rev: f.mask2?.revert ? 1 : 0,
    dissolveRev: s?.revert ? 1 : 0,
    dissolveC: 2 * (0.55 - 1.05 * (s?.value ?? 0)),
    dissolveSoft: s?.softness ?? 0,
    mainValue: f.mainValue
  };
}
var isFlow1 = (f) => f.shader === "flow1";
var isImage = (f) => f.shader === "alpha";
function splitFlows(items, at) {
  const out = { under: [], over: [], before: [] };
  for (const x of items) {
    const a = at(x);
    if (a.under) out.under.push(x);
    else if (a.beforeGroup) (out.before[a.beforeGroup] ??= []).push(x);
    else out.over.push(x);
  }
  return out;
}

// ../4_source-code/engine/gachaFxSim.ts
var lerp = (a, b, t) => a + (b - a) * t;
function evalCurve(keys, t) {
  if (!keys || !keys.length) return 1;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, va, , outA] = keys[i];
    const [tb, vb, inB] = keys[i + 1];
    if (t < ta || t > tb) continue;
    const dt = tb - ta;
    if (dt <= 0) return vb;
    if (outA === null || inB === null) return va;
    const s = (t - ta) / dt, s2 = s * s, s3 = s2 * s;
    const m0 = outA * dt, m1 = inB * dt;
    return (2 * s3 - 3 * s2 + 1) * va + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * vb + (s3 - s2) * m1;
  }
  return 1;
}
function evalMinMax(c, t, r) {
  if (!c) return 0;
  switch (c.mode) {
    case 0:
      return c.scalar;
    case 1:
      return c.scalar * evalCurve(c.maxCurve, t);
    case 2:
      return lerp((c.minScalar ?? c.scalar) * evalCurve(c.minCurve, t), c.scalar * evalCurve(c.maxCurve, t), r);
    case 3:
      return lerp(c.minScalar ?? 0, c.scalar, r);
    default:
      return c.scalar;
  }
}
function pickKeys(keys, t, ch, fixed) {
  if (!keys.length) return 1;
  if (t <= keys[0][0]) return keys[0][ch];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t > b[0]) continue;
    if (fixed) return b[ch];
    const s = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    return a[ch] + (b[ch] - a[ch]) * s;
  }
  return keys[keys.length - 1][ch];
}
function evalGradient(g, t) {
  const fixed = !!g.fixed;
  return [pickKeys(g.colors, t, 1, fixed), pickKeys(g.colors, t, 2, fixed), pickKeys(g.colors, t, 3, fixed), pickKeys(g.alphas, t, 1, fixed)];
}
var WHITE = [1, 1, 1, 1];
var lerp4 = (a, b, r) => [lerp(a[0], b[0], r), lerp(a[1], b[1], r), lerp(a[2], b[2], r), lerp(a[3], b[3], r)];
function evalMinMaxGradient(g, t, r) {
  if (!g) return WHITE;
  const max = g.maxGradient, min = g.minGradient;
  switch (g.mode) {
    case 0:
      return g.maxColor ?? WHITE;
    case 1:
      return max ? evalGradient(max, t) : WHITE;
    case 2:
      return lerp4(g.minColor ?? WHITE, g.maxColor ?? WHITE, r);
    case 3:
      return max && min ? lerp4(evalGradient(min, t), evalGradient(max, t), r) : WHITE;
    case 4:
      return max ? evalGradient(max, r) : WHITE;
    default:
      return g.maxColor ?? WHITE;
  }
}
var uvFrameCount = (uv) => uv.animationType === 1 ? uv.tilesX : uv.tilesX * uv.tilesY;
function uvFrame(uv, age, life, r) {
  const n = uvFrameCount(uv);
  const t = uv.timeMode === 2 ? age * (uv.fps ?? 0) / n : evalMinMax(uv.frameOverTime, age / life, r[0]) * (uv.cycles ?? 1);
  const x = evalMinMax(uv.startFrame, 0, r[1]) + t;
  const k = Math.min(Math.floor((x - Math.floor(x)) * n), n - 1);
  if (uv.animationType !== 1) return k;
  const row = uv.rowMode === 1 ? Math.min(Math.floor(r[2] * uv.tilesY), uv.tilesY - 1) : Math.min(uv.rowIndex ?? 0, uv.tilesY - 1);
  return row * uv.tilesX + k;
}
function uvRect(uv, k) {
  const du = 1 / uv.tilesX, dv = 1 / uv.tilesY;
  const u0 = k % uv.tilesX * du, v0 = 1 - (Math.floor(k / uv.tilesX) + 1) * dv;
  return [u0, v0, u0 + du, v0 + dv];
}
var D2R = Math.PI / 180;
var ORBITAL_RAD = 1;
var ORBITAL_DEG = D2R;
function rotEuler(v, ex, ey, ez) {
  let [x, y, z] = v;
  let c = Math.cos(ez * D2R), s = Math.sin(ez * D2R);
  [x, y] = [c * x - s * y, s * x + c * y];
  c = Math.cos(ex * D2R);
  s = Math.sin(ex * D2R);
  [y, z] = [c * y - s * z, s * y + c * z];
  c = Math.cos(ey * D2R);
  s = Math.sin(ey * D2R);
  [x, z] = [c * x + s * z, -s * x + c * z];
  return [x, y, z];
}
function rotQuat(v, q) {
  const [qx, qy, qz, qw] = q, [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}
var norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
var randUnit = (rand) => {
  const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
};
var fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
var grad3 = (h, x, y, z) => {
  const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return (h & 1 ? -u : u) + (h & 2 ? -v : v);
};
function makePerlin(rand) {
  const P = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    return lerp(
      lerp(lerp(grad3(P[AA] & 15, x, y, z), grad3(P[BA] & 15, x - 1, y, z), u), lerp(grad3(P[AB] & 15, x, y - 1, z), grad3(P[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(lerp(grad3(P[AA + 1] & 15, x, y, z - 1), grad3(P[BA + 1] & 15, x - 1, y, z - 1), u), lerp(grad3(P[AB + 1] & 15, x, y - 1, z - 1), grad3(P[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
      w
    );
  };
}
var ParticleSim = class {
  sys;
  parts = [];
  /** 粒子死了、拖尾還沒消完的（dieWithParticles 關時）：age 停在 life，只剩拖尾的點繼續過期 */
  orphans = [];
  /** 播放時間（秒，不含 startDelay，跟 Unity 的 ParticleSystem.time 一樣） */
  t = 0;
  /** startDelay 還剩幾秒：等的時候整個系統停住（t 不走、不發射） */
  wait;
  /** 被片段關掉的時候 false（sys.active，見 setActive） */
  on = true;
  /** 這一格系統原點的畫布座標（sys.pos，被 TweenPos2 平移時引擎每格改，見 sys.move） */
  origin;
  /** 這一格發射用的位移（模擬單位）與旋轉（sys.emitter，world 空間的系統被片段移動時引擎每格改；預設 0 與 sys.rot） */
  emitOff = [0, 0, 0];
  emitRot;
  emitAcc = 0;
  bursts = [];
  rand;
  perlin;
  orbitalScale;
  simSpeed;
  constructor(sys, rand = Math.random, perlin = makePerlin(rand), opts = {}) {
    this.sys = sys;
    this.rand = rand;
    this.perlin = perlin;
    this.orbitalScale = opts.orbitalScale ?? ORBITAL_RAD;
    this.simSpeed = opts.honorSimSpeed ? sys.simSpeed || 1 : 1;
    this.origin = sys.pos;
    this.emitRot = sys.rot;
    this.wait = 0;
    this.start();
  }
  /** 從頭播：延遲、burst、預熱都重來（建構時與 setActive 打開時） */
  start() {
    const S = this.sys;
    this.t = 0;
    this.emitAcc = 0;
    this.bursts = (S.emission?.bursts ?? []).map((b) => ({ time: b.time, next: b.time, done: 0, burst: b }));
    const d = S.delay;
    this.wait = d ? Math.max(0, evalMinMax(d, 0, d.mode === 3 ? this.rand() : 0)) : 0;
    if (S.prewarm) for (let i = 0; i < Math.ceil(S.duration * 30); i++) this.update(1 / 30);
  }
  /**
   * 片段開關 GameObject（sys.active，10-29 起）：關掉時粒子與拖尾清掉、不再跑；再打開時從頭播（Unity 的 OnEnable＋playOnAwake）
   */
  setActive(on) {
    if (on === this.on) return;
    this.on = on;
    this.parts.length = 0;
    this.orphans.length = 0;
    if (on) this.start();
  }
  /** 丟掉年齡超過拖尾壽命的點（最舊的在後面） */
  trimTrail(T) {
    while (T.pts.length && this.t - T.pts[T.pts.length - 1][3] > T.life) T.pts.pop();
  }
  emit(n) {
    const S = this.sys, I = S.initial, sh = S.shape, R = this.rand;
    const tn = this.t % S.duration / S.duration;
    for (let k = 0; k < n; k++) {
      if (this.parts.length >= I.maxParticles) return;
      const life = evalMinMax(I.lifetime, tn, R()), speed = evalMinMax(I.speed, tn, R());
      const size = evalMinMax(I.size, tn, R());
      const sizeY = I.sizeY ? evalMinMax(I.sizeY, tn, R()) || size : size;
      let lp = [0, 0, 0];
      let dir = randUnit(R);
      if (sh && (sh.type === 4 || sh.type === 8)) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(lerp((1 - sh.thickness) ** 2, 1, R()));
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        lp = [px * sh.radius, py * sh.radius, sh.type === 8 ? R() * sh.length : 0];
        const tan = Math.tan(sh.angle * D2R);
        dir = norm3([px * tan, py * tan, 1]);
        if (sh.type === 8) {
          lp[0] += dir[0] * lp[2];
          lp[1] += dir[1] * lp[2];
        }
      } else if (sh && sh.type === 0) {
        const u = randUnit(R), rr = sh.radius * Math.cbrt(lerp((1 - sh.thickness) ** 3, 1, R()));
        lp = [u[0] * rr, u[1] * rr, u[2] * rr];
        dir = u;
      } else if (sh && sh.type === 10) {
        const a = R() * (sh.arc != null ? sh.arc * D2R : Math.PI * 2), rr = Math.sqrt(lerp((1 - sh.thickness) ** 2, 1, R()));
        lp = [Math.cos(a) * rr * sh.radius, Math.sin(a) * rr * sh.radius, 0];
        dir = [Math.cos(a), Math.sin(a), 0];
      } else if (sh && sh.type === 5) {
        lp = [R() - 0.5, R() - 0.5, R() - 0.5];
        dir = [0, 0, 1];
      }
      if (sh) {
        if (sh.randomDir) {
          const d = dir;
          dir = norm3([0, 1, 2].map((i) => lerp(d[i], randUnit(R)[i], sh.randomDir)));
        }
        const [sx, sy, sz] = sh.scale, [rx, ry, rz] = sh.rotation, [ox, oy, oz] = sh.position;
        const p = rotEuler([lp[0] * sx, lp[1] * sy, lp[2] * sz], rx, ry, rz);
        lp = [p[0] + ox, p[1] + oy, p[2] + oz];
        dir = rotEuler(dir, rx, ry, rz);
      }
      const sc = S.scale, eo = this.emitOff;
      lp = rotQuat([lp[0] * sc[0], lp[1] * sc[1], lp[2] * sc[2]], this.emitRot);
      lp = [lp[0] + eo[0], lp[1] + eo[1], lp[2] + eo[2]];
      dir = rotQuat(dir, this.emitRot);
      const vel = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
      let trail;
      if (S.trail && R() < S.trail.ratio) {
        const T = S.trail, LT = T.lifetime;
        const lt = LT.mode === 2 ? lerp(LT.scalar * evalCurve(LT.minCurve, tn), LT.scalar * evalCurve(LT.maxCurve, tn), R()) : evalMinMax(LT, tn, R());
        const k2 = lt * (T.sizeAffectsLifetime ? size * sc[0] : 1);
        trail = { pts: [[lp[0], lp[1], lp[2], this.t]], life: Math.max(Math.max(life, 1e-3) * k2, 1e-3), r: R() };
      }
      this.parts.push({
        pos: lp,
        vel,
        vel3: [...vel],
        age: 0,
        life: Math.max(life, 1e-3),
        size: size * sc[0],
        sizeY: sizeY * sc[1],
        rot: -evalMinMax(I.rotation, tn, R()),
        col: evalMinMaxGradient(I.color, tn, R()),
        r: [R(), R(), R(), R(), R()],
        ...S.uv ? { uvr: [R(), R(), R()] } : {},
        ...trail ? { trail } : {}
      });
    }
  }
  update(dt) {
    if (!this.on) return;
    const S = this.sys;
    dt *= this.simSpeed;
    if (this.wait > 0) {
      if (dt < this.wait) {
        this.wait -= dt;
        return;
      }
      dt -= this.wait;
      this.wait = 0;
    }
    this.t += dt;
    for (let i = this.orphans.length - 1; i >= 0; i--) {
      const tr = this.orphans[i].trail;
      this.trimTrail(tr);
      if (!tr.pts.length) this.orphans.splice(i, 1);
    }
    const dur = S.duration, tn = this.t % dur / dur;
    const V = S.velocity, F = S.force, L = S.clamp, N = S.noise, RM = S.rotationOverLife, RS = S.rotationBySpeed;
    const grav = evalMinMax(S.initial.gravity, tn, 0.5) * 9.81;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.age += dt;
      if (q.age >= q.life) {
        this.parts.splice(i, 1);
        if (q.trail && !S.trail?.dieWithParticles) {
          q.age = q.life;
          this.orphans.push(q);
        }
        continue;
      }
      const a = q.age / q.life;
      q.vel[1] -= grav * dt;
      if (F) {
        let f = [evalMinMax(F.x, a, q.r[0]), evalMinMax(F.y, a, q.r[1]), evalMinMax(F.z, a, q.r[2])];
        if (!F.world) f = rotQuat(f, S.rot);
        q.vel = [q.vel[0] + f[0] * dt, q.vel[1] + f[1] * dt, q.vel[2] + f[2] * dt];
      }
      if (L) {
        const lim = evalMinMax(L.magnitude, a, q.r[3]), sp = Math.hypot(...q.vel);
        if (sp > lim && sp > 0) {
          const k = 1 - Math.pow(1 - L.dampen, dt * 30), s = lerp(1, lim / sp, k);
          q.vel = [q.vel[0] * s, q.vel[1] * s, q.vel[2] * s];
        }
      }
      let ext = [0, 0, 0];
      if (V) {
        ext = [evalMinMax(V.x, a, q.r[0]), evalMinMax(V.y, a, q.r[1]), evalMinMax(V.z, a, q.r[2])];
        if (!V.world) ext = rotQuat(ext, S.rot);
      }
      let nz = [0, 0, 0];
      if (N) {
        const fr = N.frequency, sc = evalMinMax(N.scroll, a, q.r[4]) * this.t;
        const st = evalMinMax(N.strength, a, q.r[4]) * evalMinMax(N.amount, a, q.r[4]) * 2;
        const [x, y, z] = q.pos;
        nz = [
          this.perlin(x * fr + sc, y * fr, z * fr + 11.3) * st,
          this.perlin(x * fr, y * fr + sc + 37.1, z * fr) * st,
          this.perlin(x * fr + 71.7, y * fr, z * fr + sc) * st
        ];
      }
      let ob = [0, 0, 0];
      if (V && (V.orbital || V.radial) && dt > 0) {
        const inv = [-S.rot[0], -S.rot[1], -S.rot[2], S.rot[3]];
        const p = V.world ? q.pos : rotQuat(q.pos, inv);
        const c = V.offset ? [evalMinMax(V.offset.x, a, q.r[0]), evalMinMax(V.offset.y, a, q.r[1]), evalMinMax(V.offset.z, a, q.r[2])] : [0, 0, 0];
        const rel = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        let np = rel;
        if (V.orbital) {
          const k = dt * this.orbitalScale / D2R;
          np = rotEuler(rel, evalMinMax(V.orbital.x, a, q.r[0]) * k, evalMinMax(V.orbital.y, a, q.r[1]) * k, evalMinMax(V.orbital.z, a, q.r[2]) * k);
        }
        if (V.radial) {
          const n2 = norm3(rel), r = evalMinMax(V.radial, a, q.r[3]) * dt;
          np = [np[0] + n2[0] * r, np[1] + n2[1] * r, np[2] + n2[2] * r];
        }
        let d = [(np[0] - rel[0]) / dt, (np[1] - rel[1]) / dt, (np[2] - rel[2]) / dt];
        if (!V.world) d = rotQuat(d, S.rot);
        ob = d;
      }
      const SM = V?.speedModifier;
      if (SM) {
        const k = evalMinMax(SM, a, q.r[3]);
        let mv = [0, 1, 2].map((i2) => (q.vel[i2] + ext[i2] + ob[i2]) * k);
        if (L) {
          const lim = evalMinMax(L.magnitude, a, q.r[3]), sp = Math.hypot(...mv);
          if (sp > lim && sp > 0) {
            const s = lerp(1, lim / sp, 1 - Math.pow(1 - L.dampen, dt * 30));
            mv = [mv[0] * s, mv[1] * s, mv[2] * s];
          }
        }
        q.vel3 = [mv[0] + nz[0], mv[1] + nz[1], mv[2] + nz[2]];
      } else q.vel3 = [q.vel[0] + ext[0] + nz[0] + ob[0], q.vel[1] + ext[1] + nz[1] + ob[1], q.vel[2] + ext[2] + nz[2] + ob[2]];
      q.pos = [q.pos[0] + q.vel3[0] * dt, q.pos[1] + q.vel3[1] * dt, q.pos[2] + q.vel3[2] * dt];
      if (q.trail) {
        const T = q.trail, last = T.pts[0];
        if (!last || Math.hypot(q.pos[0] - last[0], q.pos[1] - last[1], q.pos[2] - last[2]) >= S.trail.minVertexDistance) T.pts.unshift([q.pos[0], q.pos[1], q.pos[2], this.t]);
        this.trimTrail(T);
      }
      if (RM) q.rot -= evalMinMax(RM, a, q.r[2]) * dt;
      if (RS) {
        const [lo, hi] = RS.range, sp = Math.hypot(...q.vel3);
        const t = hi > lo ? Math.min(1, Math.max(0, (sp - lo) / (hi - lo))) : 0;
        q.rot -= evalMinMax(RS.curve, t, q.r[2]) * dt;
      }
    }
    const E = S.emission;
    if (!E || !(S.looping || this.t <= dur)) return;
    this.emitAcc += evalMinMax(E.rate, tn, this.rand()) * dt;
    const n = Math.floor(this.emitAcc);
    this.emitAcc -= n;
    if (n) this.emit(n);
    for (const b of this.bursts) {
      const cycleT = this.t % dur, B = b.burst;
      while (this.t >= b.next) {
        if (!B.cycles || b.done < B.cycles) {
          const c = Math.round(evalMinMax(B.count, cycleT / dur, this.rand()));
          if (this.rand() <= B.probability) this.emit(c);
        }
        b.done++;
        if (B.interval > 0 && (!B.cycles || b.done < B.cycles)) b.next += B.interval;
        else {
          b.next = Math.ceil((this.t + 1e-6) / dur) * dur + b.time;
          b.done = 0;
        }
      }
    }
  }
};

// ../4_source-code/engine/gachaFxEngine.ts
var FLOW_DISTURB_K = 0.1;
var FLOW_GAIN = 0.85;
var ST_ID = [1, 1, 0, 0];
var WHITE2 = [1, 1, 1, 1];
var VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aCol; uniform vec4 uView; out vec2 vUV; out vec4 vCol;
void main(){ vec2 c = (aPos - uView.xy) / uView.zw * 2.0 - 1.0; gl_Position = vec4(c, 0.0, 1.0); vUV = aUV; vCol = aCol; }`;
var FS_BG = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; out vec4 o; void main(){ o = texture(uTex, vUV); }`;
var FS_PARTICLE = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; uniform float uStr; uniform float uStrA; uniform float uRot; uniform vec4 uTint; out vec4 o;
void main(){ vec2 uv = vUV - 0.5; float c = cos(uRot), s = sin(uRot); uv = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y) + 0.5;
  vec4 t = texture(uTex, uv) * uTint; o = vec4(t.rgb * vCol.rgb * uStr, t.a * vCol.a * uStrA); }`;
var FS_FLOW = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol;
uniform sampler2D uMain, uDst, uMask; uniform float uTime, uMainValue, uDstVal, uVRepeat, uRepeatU, uMaskSoft, uMaskRev, uMaskDst;
uniform vec2 uDstFlow, uMainFlow, uMainRot, uMaskRot, uDstAxis; uniform vec4 uMainTO, uDstTO, uMainST, uDstST, uMaskST, uMaskTO; out vec4 o;
vec2 rot(vec2 p, vec2 r){ return vec2(r.x * p.x + r.y * p.y, r.x * p.y - r.y * p.x) + (0.5 - vec2(r.x + r.y, r.x - r.y) * 0.5); }
vec2 to(vec2 p, vec4 t){ return p * t.xy + ((t.zw - 0.5) * t.xy + 0.5); }
void main(){
  float d = texture(uDst, to(rot(vUV * uDstST.xy + uDstST.zw, uMainRot) + uTime * uDstFlow, uDstTO)).r;
  float dx = (d - 0.5) * uDstVal;
  vec2 muv = rot(vUV * uMainST.xy + uMainST.zw, uMainRot);
  muv += uDstAxis * dx;
  muv = to(muv + uTime * uMainFlow, uMainTO);
  muv.x = uRepeatU > 0.5 ? muv.x : clamp(muv.x, 0.0, 1.0);
  muv.y = uVRepeat > 0.5 ? fract(muv.y) : clamp(muv.y, 0.0, 1.0);
  vec4 m = texture(uMain, muv);
  vec2 kuv = rot(vUV * uMaskST.xy + uMaskST.zw, uMaskRot);
  if (uMaskDst > 0.5) kuv += uDstAxis * dx;
  vec4 k = texture(uMask, to(kuv, uMaskTO));
  float s = clamp((k.r * k.a - uMaskSoft) / (1.0 - 2.0 * uMaskSoft), 0.0, 1.0);
  s = s * s * (3.0 - 2.0 * s);
  if (uMaskRev > 0.5) s = 1.0 - s;
  o = vec4(m.rgb * vCol.rgb * uMainValue, m.a * vCol.a * s);
}`;
var FS_FLOW1 = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol;
uniform sampler2D uMain, uColor, uDst, uDis, uDisMask, uMask1, uMask2;
uniform float uTime, uK, uVClamp, uChR, uM1Soft, uM1Rev, uM2Soft, uM2Rev, uDisRev, uDisC, uDisSoft, uMainValue;
uniform vec2 uMainRot, uColRot, uM1Rot, uMainFlow, uDstFlow, uDisFlow, uAxis, uDisAxis;
uniform vec4 uMainTO, uDstTO, uColST, uM1ST, uM2ST, uDisST, uDisMaskST; out vec4 o;
vec2 rot(vec2 p, vec2 r){ return vec2(r.x * p.x + r.y * p.y, r.x * p.y - r.y * p.x) + (0.5 - vec2(r.x + r.y, r.x - r.y) * 0.5); }
vec2 to(vec2 p, vec4 t){ return p * t.xy + ((t.zw - 0.5) * t.xy + 0.5); }
vec2 sc(vec2 p, vec4 t){ return p * t.xy + (0.5 - 0.5 * t.xy); }
float mask(vec4 k, float soft, float rev){
  float s = clamp((k.r * k.a - soft) / (1.0 - 2.0 * soft), 0.0, 1.0);
  s = s * s * (3.0 - 2.0 * s);
  return rev > 0.5 ? 1.0 - s : s;
}
void main(){
  vec2 uvR = rot(vUV, uMainRot);
  float d = texture(uDst, to(uvR + uTime * (uMainFlow + uDstFlow), uDstTO)).r;
  vec2 q = uvR + uTime * uMainFlow + uMainTO.zw;
  q += uK * (d - q) * uAxis;
  q = sc(q, uMainTO);
  if (uVClamp > 0.5) q.y = clamp(q.y, 0.0, 1.0);
  vec4 m = texture(uMain, q);
  if (uChR > 0.5) m = m.rrrr;
  m.a = clamp(m.a, 0.0, 1.0);
  m *= mask(texture(uMask1, rot(vUV * uM1ST.xy + uM1ST.zw, uM1Rot)), uM1Soft, uM1Rev);
  m *= mask(texture(uMask2, vUV * uM2ST.xy + uM2ST.zw), uM2Soft, uM2Rev);
  vec2 dq = vUV * uDisST.xy + uDisST.zw + uTime * uDisFlow;
  dq += uK * (d - dq) * uDisAxis;
  vec4 dn = texture(uDis, dq), dm = texture(uDisMask, vUV * uDisMaskST.xy + uDisMaskST.zw);
  float n = dn.r * dn.a;
  if (uDisRev > 0.5) n = 1.0 - n;
  float x = clamp((dm.r * dm.a * n + uDisC - uDisSoft) / (1.0 - 2.0 * uDisSoft), 0.0, 1.0);
  m *= min(x * x * (3.0 - 2.0 * x), 1.0);
  o = m * texture(uColor, rot(vUV * uColST.xy + uColST.zw, uColRot)) * vCol * uMainValue;
}`;
var FS_GENERAL = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol;
uniform sampler2D uNoise, uMain, uEdge, uMask1, uSoft, uMask2;
uniform float uTime, uMainRot, uNoiseVal, uNoiseU, uEdgeOn, uEdgeVal, uEdgeRev, uEdgeW, uM1Rev, uM1Rot, uSoftRev, uSoftOn, uSoftVal, uF4, uM2Rev, uM2Rot, uCentre;
uniform vec2 uMainSpeed, uNoiseSpeed, uRB, uEdgeSpeed, uM1Speed, uSoftSpeed, uM2Speed;
uniform vec4 uMainST, uNoiseST, uEdgeST, uM1ST, uSoftST, uM2ST, uEdgeColor, uMainColor; out vec4 o;
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, c * p.y - s * p.x); }
void main(){
  vec2 uv = vUV; float T = uTime;
  vec4 r0 = (rot(uv * uMainST.xy + uMainST.zw - 0.5, uMainRot) + 0.5 + T * uMainSpeed).xyxy;
  float n = texture(uNoise, uv * uNoiseST.xy + uNoiseST.zw + T * uNoiseSpeed).x;
  r0 += uNoiseVal * (n - r0);
  vec2 uvA = uNoiseU > 0.5 ? vec2((n - 0.5) * uNoiseVal + uv.x, uv.y) : r0.xy;
  r0 += uRB.xxyy * 0.1;
  vec4 s1 = texture(uMain, uvA);
  float e = texture(uEdge, uv * uEdgeST.xy + uEdgeST.zw + T * uEdgeSpeed).x;
  if (uEdgeRev > 0.5) e = 1.0 - e;
  float thr = uEdgeOn > 0.5 ? uEdgeVal : 0.0;
  float outer = e + uEdgeW >= thr ? 1.0 : 0.0, edge = outer - (e >= thr ? 1.0 : 0.0);
  vec3 col = vec3(texture(uMain, r0.xy).x, s1.y, texture(uMain, r0.zw).z);
  col += edge * (edge * uEdgeColor.rgb - col);
  col *= vCol.rgb;
  float m1 = texture(uMask1, rot(uv * uM1ST.xy + uM1ST.zw - 0.5, uM1Rot) + 0.5 + T * uM1Speed).x;
  if (uM1Rev > 0.5) m1 = 1.0 - m1;
  float sd = texture(uSoft, uv * uSoftST.xy + uSoftST.zw + T * uSoftSpeed).x;
  if (uSoftRev > 0.5) sd = 1.0 - sd;
  sd += 1.0 + (uSoftOn > 0.5 ? -2.0 * uSoftVal : 2.0) - (1.0 - uF4);
  float t = clamp(sd / (2.0 * uF4 - 1.0), 0.0, 1.0);
  float a = t * t * (3.0 - 2.0 * t) * m1 * s1.w * outer * (floor(vCol.a * 255.0 + 0.5) / 255.0);
  float m2 = texture(uMask2, rot(uv * uM2ST.xy + uM2ST.zw - 0.5, uM2Rot) + 0.5 + T * uM2Speed).x;
  if (uM2Rev > 0.5) m2 = 1.0 - m2;
  o = vec4(col, a * m2) * uMainColor * uCentre;
}`;
var FS_UI_COMMON = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol;
uniform sampler2D uDist, uMain, uAlpha, uAlpha3, uGrad;
uniform float uTime, uPower, uInt, uAll, uPA, uDMain, uDAlpha;
uniform vec2 uMainSpeed, uDistSpeed, uDistK, uAlphaSpeed, uAlpha3Speed, uGradSpeed;
uniform vec3 uMainColor;
uniform vec4 uMainST, uDistST, uAlphaST, uAlpha3ST, uGradST, uAlphaSel; out vec4 o;
void main(){
  vec2 uv = vUV; float T = uTime;
  vec2 d = texture(uDist, uv * uDistST.xy + uDistST.zw + T * uDistSpeed).x * uDistK;
  float a3 = texture(uAlpha3, uv * uAlpha3ST.xy + uAlpha3ST.zw + T * uAlpha3Speed).x;
  vec2 auv = uv * uAlphaST.xy + uAlphaST.zw + T * uAlphaSpeed;
  if (uDAlpha > 0.5) auv += auv * d;
  float a = texture(uAlpha, auv).x * a3;
  vec2 muv = uv * uMainST.xy + uMainST.zw + (0.5 * T) * uMainSpeed;
  if (uDMain > 0.5) muv += d;
  vec4 m = texture(uMain, muv);
  float ma = m.a * uAlphaSel.w; vec3 mc = m.rgb;
  if (uPower != 1.0) { ma = pow(ma, uPower); mc = pow(mc, vec3(uPower)); }
  a *= min(ma, 1.0) + dot(m.rgb, uAlphaSel.rgb);
  if (uPA > 0.5) a *= vCol.a;
  vec3 col = min(mc, 1.0) * uInt * vCol.rgb * uMainColor;
  o = vec4(texture(uGrad, uv * uGradST.xy + uGradST.zw + T * uGradSpeed).rgb * col, a * uAll);
}`;
var FS_SHINY = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; uniform vec4 uShine, uCorner; uniform float uGloss; out vec4 o;
void main(){
  vec4 c = texture(uTex, vUV) * vCol;
  vec4 k = uCorner; vec2 q = vUV;
  float p = q.x >= q.y ? k.x + q.x * (k.y - k.x) + q.y * (k.z - k.y) : k.x + q.x * (k.z - k.w) + q.y * (k.w - k.x);
  float n = 1.0 - min(abs((p - (uShine.x * 2.0 - 0.5)) / uShine.y), 1.0);
  float s = clamp(n / uShine.z, 0.0, 1.0);
  s = s * s * (3.0 - 2.0 * s) * 0.5 * c.a * uShine.w;
  o = vec4(c.rgb + s * (1.0 + uGloss * (c.rgb * 7.0 - 1.0)), c.a);
}`;
var FLOATS = 8;
var FULL_UV = [0, 0, 1, 1];
async function startGachaFx(canvas, data, opts) {
  const ctx = canvas.getContext("webgl2", { premultipliedAlpha: false, alpha: false, antialias: true });
  if (!ctx) throw new Error("\u9019\u500B\u700F\u89BD\u5668\u6C92\u6709 WebGL2\uFF08\u6216\u95DC\u9589\u4E86\u786C\u9AD4\u52A0\u901F\uFF09");
  const gl = ctx;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader \u7DE8\u8B6F\u5931\u6557");
    return s;
  };
  const program = (fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    for (const [i, name] of ["aPos", "aUV", "aCol"].entries()) gl.bindAttribLocation(p, i, name);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "shader \u9023\u7D50\u5931\u6557");
    return p;
  };
  const P_BG = program(FS_BG), P_PT = program(FS_PARTICLE), P_FLOW = program(FS_FLOW), P_FLOW1 = program(FS_FLOW1), P_GEN = program(FS_GENERAL), P_UIC = program(FS_UI_COMMON), P_SHINY = program(FS_SHINY);
  const U = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
  const uBg = U(P_BG, ["uView", "uTex"]);
  const uPt = U(P_PT, ["uView", "uTex", "uStr", "uStrA", "uRot", "uTint"]);
  const uFl = U(P_FLOW, [
    "uView",
    "uMain",
    "uDst",
    "uMask",
    "uTime",
    "uMainValue",
    "uDstVal",
    "uVRepeat",
    "uRepeatU",
    "uDstFlow",
    "uMainFlow",
    "uMainRot",
    "uMainTO",
    "uDstTO",
    "uMainST",
    "uDstST",
    "uMaskST",
    "uMaskTO",
    "uMaskRot",
    "uMaskSoft",
    "uMaskRev",
    "uMaskDst",
    "uDstAxis"
  ]);
  const FLOW1_TEX = ["uMain", "uColor", "uDst", "uDis", "uDisMask", "uMask1", "uMask2"];
  const uF1 = U(P_FLOW1, [
    "uView",
    ...FLOW1_TEX,
    "uTime",
    "uK",
    "uVClamp",
    "uChR",
    "uM1Soft",
    "uM1Rev",
    "uM2Soft",
    "uM2Rev",
    "uDisRev",
    "uDisC",
    "uDisSoft",
    "uMainValue",
    "uMainRot",
    "uColRot",
    "uM1Rot",
    "uMainFlow",
    "uDstFlow",
    "uDisFlow",
    "uAxis",
    "uDisAxis",
    "uMainTO",
    "uDstTO",
    "uColST",
    "uM1ST",
    "uM2ST",
    "uDisST",
    "uDisMaskST"
  ]);
  const GEN_TEX = ["uNoise", "uMain", "uEdge", "uMask1", "uSoft", "uMask2"];
  const uGen = U(P_GEN, [
    "uView",
    ...GEN_TEX,
    "uTime",
    "uMainRot",
    "uNoiseVal",
    "uNoiseU",
    "uEdgeOn",
    "uEdgeVal",
    "uEdgeRev",
    "uEdgeW",
    "uM1Rev",
    "uM1Rot",
    "uSoftRev",
    "uSoftOn",
    "uSoftVal",
    "uF4",
    "uM2Rev",
    "uM2Rot",
    "uCentre",
    "uMainSpeed",
    "uNoiseSpeed",
    "uRB",
    "uEdgeSpeed",
    "uM1Speed",
    "uSoftSpeed",
    "uM2Speed",
    "uMainST",
    "uNoiseST",
    "uEdgeST",
    "uM1ST",
    "uSoftST",
    "uM2ST",
    "uEdgeColor",
    "uMainColor"
  ]);
  const uSh = U(P_SHINY, ["uView", "uTex", "uShine", "uCorner", "uGloss"]);
  const UIC_TEX = ["uDist", "uMain", "uAlpha", "uAlpha3", "uGrad"];
  const uUic = U(P_UIC, [
    "uView",
    ...UIC_TEX,
    "uTime",
    "uPower",
    "uInt",
    "uAll",
    "uPA",
    "uDMain",
    "uDAlpha",
    "uMainSpeed",
    "uDistSpeed",
    "uDistK",
    "uAlphaSpeed",
    "uAlpha3Speed",
    "uGradSpeed",
    "uMainColor",
    "uMainST",
    "uDistST",
    "uAlphaST",
    "uAlpha3ST",
    "uGradST",
    "uAlphaSel"
  ]);
  const vbo = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  for (const [loc, size, off] of [[0, 2, 0], [1, 2, 8], [2, 4, 16]]) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, FLOATS * 4, off);
  }
  let verts = new Float32Array(FLOATS * 6 * 1024), vn = 0;
  function quad(x0, y0, x1, y1, x2, y2, x3, y3, c, uv = FULL_UV) {
    if (vn + FLOATS * 6 > verts.length) {
      const nv = new Float32Array(verts.length * 2);
      nv.set(verts);
      verts = nv;
    }
    const [u0, v0, u1, v1] = uv;
    const P = [[x0, y0, u0, v0], [x1, y1, u1, v0], [x2, y2, u1, v1], [x0, y0, u0, v0], [x2, y2, u1, v1], [x3, y3, u0, v1]];
    for (const q of P) {
      verts[vn++] = q[0];
      verts[vn++] = q[1];
      verts[vn++] = q[2];
      verts[vn++] = q[3];
      verts[vn++] = c[0];
      verts[vn++] = c[1];
      verts[vn++] = c[2];
      verts[vn++] = c[3];
    }
  }
  function flush() {
    if (!vn) return;
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, vn), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, vn / FLOATS);
    vn = 0;
  }
  const textures = [];
  async function loadTex(url, repeat) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(`\u8CBC\u5716\u8B80\u4E0D\u5230\uFF1A${url}`);
    }
    const t = gl.createTexture();
    textures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    return t;
  }
  function solidTex(rgba) {
    const t = gl.createTexture();
    textures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  }
  const T_BLACK = solidTex([0, 0, 0, 0]), T_WHITE = solidTex([255, 255, 255, 255]);
  const cache = /* @__PURE__ */ new Map();
  const fxTex = (name, repeat = false) => {
    const key = `${name}#${repeat ? "r" : "c"}`;
    if (!cache.has(key)) cache.set(key, loadTex(opts.texUrl(name), repeat));
    return cache.get(key);
  };
  const perlin = makePerlin(Math.random);
  const [W, H] = data.canvas, UNIT = data.unit;
  const sims = data.systems.map((s) => new ParticleSim(s, Math.random, perlin, { orbitalScale: opts.orbitalScale, honorSimSpeed: opts.honorSimSpeed }));
  const order = sims.map((s, i) => [s, i]).sort((a, b) => (a[0].sys.group ?? 0) - (b[0].sys.group ?? 0) || a[0].sys.order - b[0].sys.order || a[1] - b[1]).map((x) => x[0]);
  const f1Tex = (t) => t ? fxTex(t.tex, !!t.repeat) : Promise.resolve(T_WHITE);
  const commonFlowTex = async (p) => ({
    main: await fxTex(p.mainTex, p.vRepeat || !!p.mainRepeatU),
    dst: p.disturbTex ? await fxTex(p.disturbTex, true) : T_BLACK,
    mask: p.mask ? await fxTex(p.mask.tex, p.mask.repeat) : T_WHITE
  });
  const flow1Tex = (p) => Promise.all([p.main, p.colorTex, p.disturb?.tex, p.dissolve?.tex, p.dissolve?.mask, p.mask1?.tex, p.mask2?.tex].map(f1Tex));
  const [T_BG, drawList, flowTex] = await Promise.all([
    loadTex(opts.background, false),
    Promise.all(order.map(async (s) => {
      const base = await baseEntry(s);
      return s.sys.trail ? { ...base, trail: await fxTex(s.sys.trail.material.tex) } : base;
    })),
    Promise.all(data.flows.map(async (f) => isImage(f) ? { kind: "image", f, tex: await fxTex(f.tex) } : isFlow1(f) ? { kind: "flow1", f, tex: await flow1Tex(f) } : { kind: "common", f, ...await commonFlowTex(f) }))
  ]);
  async function baseEntry(s) {
    const M = s.sys.material;
    if (M.flow) return { sim: s, kind: "flow", flow: await commonFlowTex(M.flow) };
    if (M.flow1) return { sim: s, kind: "flow1", tex: await flow1Tex(M.flow1) };
    if (M.general) {
      const g = M.general;
      return { sim: s, kind: "general", tex: await Promise.all([g.noise?.tex, g.main, g.edge?.tex, g.mask1?.tex, g.soft?.tex, g.mask2?.tex].map(f1Tex)) };
    }
    if (M.uiCommon) {
      const c = M.uiCommon;
      return { sim: s, kind: "uiCommon", tex: await Promise.all([c.distort?.tex, c.main, c.alpha?.tex, c.alpha3?.tex, c.grad?.tex].map(f1Tex)) };
    }
    return { sim: s, kind: "plain", tex: await fxTex(M.tex) };
  }
  const flowParts = splitFlows(flowTex, (e) => e.f);
  function scissor(c) {
    if (!c) {
      gl.disable(gl.SCISSOR_TEST);
      return;
    }
    const kx = canvas.width / W, ky = canvas.height / H;
    const x0 = Math.floor((c[0] + W / 2) * kx), y0 = Math.floor((c[1] + H / 2) * ky);
    const x1 = Math.ceil((c[2] + W / 2) * kx), y1 = Math.ceil((c[3] + H / 2) * ky);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  }
  function drawParticles(e, view, time2) {
    const sim = e.sim, S = sim.sys, C = S.colorOverLife, Z = S.sizeOverLife, UV = S.uv;
    const tint = e.kind === "flow1" || e.kind === "general" ? S.material.tint : void 0;
    scissor(S.clip);
    if (S.render.mode !== 5) {
      if (e.kind === "uiCommon") {
        gl.useProgram(P_UIC);
        gl.uniform4f(uUic.uView, ...view);
        uiCommonUniformsSet(S.material.uiCommon, e.tex, time2);
      } else if (e.kind === "general") {
        gl.useProgram(P_GEN);
        gl.uniform4f(uGen.uView, ...view);
        generalUniformsSet(S.material.general, e.tex, time2);
      } else if (e.kind === "flow") {
        gl.useProgram(P_FLOW);
        gl.uniform4f(uFl.uView, ...view);
        flowUniforms(S.material.flow, e.flow, time2, 1);
      } else if (e.kind === "flow1") {
        gl.useProgram(P_FLOW1);
        gl.uniform4f(uF1.uView, ...view);
        flow1UniformsSet(S.material.flow1, e.tex, time2);
      } else {
        gl.useProgram(P_PT);
        gl.uniform4f(uPt.uView, ...view);
        gl.uniform1i(uPt.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.uniform1f(uPt.uStr, S.material.strength);
        gl.uniform1f(uPt.uStrA, S.material.strengthAlpha ? S.material.strength : 1);
        gl.uniform1f(uPt.uRot, S.material.texRotate);
        gl.uniform4fv(uPt.uTint, S.material.tint ?? WHITE2);
      }
      gl.blendFunc(gl.SRC_ALPHA, S.material.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
      const maxPx = (S.render.maxSize || 1) * H;
      for (const q of sim.parts) {
        const a = q.age / q.life;
        let c = q.col;
        if (C) {
          const g = evalMinMaxGradient(C, a, q.r[0]);
          c = [c[0] * g[0], c[1] * g[1], c[2] * g[2], c[3] * g[3]];
        }
        if (tint) c = [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], c[3] * tint[3]];
        let sx = q.size, sy = q.sizeY;
        if (Z) {
          const k = evalMinMax(Z.x, a, q.r[1]);
          sx *= k;
          sy *= Z.y ? evalMinMax(Z.y, a, q.r[1]) : k;
        }
        sx = Math.min(sx * UNIT, maxPx);
        sy = Math.min(sy * UNIT, maxPx);
        const cx = sim.origin[0] + q.pos[0] * UNIT, cy = sim.origin[1] + q.pos[1] * UNIT;
        const uv = UV && q.uvr ? uvRect(UV, uvFrame(UV, q.age, q.life, q.uvr)) : FULL_UV;
        if (S.render.mode === 1) {
          const vx = q.vel3[0], vy = q.vel3[1], sp = Math.hypot(vx, vy);
          const dx = sp ? vx / sp : 1, dy = sp ? vy / sp : 0;
          const raw = opts.streakSpeedBySize === false ? sx * S.render.lengthScale + sp * UNIT * S.render.velocityScale : sx * (S.render.lengthScale + sp * S.render.velocityScale);
          const len = Math.min(raw, maxPx * 2) * (opts.streakLength ?? 1);
          const w = sx / 2 * (opts.streakWidth ?? 1);
          const tx = cx - dx * len, ty = cy - dy * len, nx = -dy * w, ny = dx * w;
          quad(tx + nx, ty + ny, cx + nx, cy + ny, cx - nx, cy - ny, tx - nx, ty - ny, c, uv);
        } else {
          const co = Math.cos(q.rot), si = Math.sin(q.rot), hx = sx / 2, hy = sy / 2;
          const P = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => [cx + x * co - y * si, cy + x * si + y * co]);
          quad(P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1], c, uv);
        }
      }
      flush();
    }
    if (S.trail && e.trail) drawTrails(sim, e.trail, view);
    gl.activeTexture(gl.TEXTURE0);
  }
  function seg(a, b, c, d) {
    if (vn + FLOATS * 6 > verts.length) {
      const nv = new Float32Array(verts.length * 2);
      nv.set(verts);
      verts = nv;
    }
    for (const p of [a, b, c, a, c, d]) for (let k = 0; k < FLOATS; k++) verts[vn++] = p[k];
  }
  function drawTrails(sim, tex, view) {
    const S = sim.sys, T = S.trail, M = T.material, C = S.colorOverLife, Z = S.sizeOverLife, now = sim.t;
    gl.useProgram(P_PT);
    gl.uniform4f(uPt.uView, ...view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uPt.uTex, 0);
    gl.uniform1f(uPt.uStr, M.strength);
    gl.uniform1f(uPt.uStrA, M.strengthAlpha ? M.strength : 1);
    gl.uniform1f(uPt.uRot, M.texRotate);
    gl.uniform4fv(uPt.uTint, M.tint ?? WHITE2);
    gl.blendFunc(gl.SRC_ALPHA, M.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    const rev = !!opts.trailUReversed;
    for (const q of [...sim.parts, ...sim.orphans]) {
      const tr = q.trail;
      if (!tr || !tr.pts.length) continue;
      const a = Math.min(q.age / q.life, 1), dead2 = q.age >= q.life;
      let pc = q.col;
      if (C) {
        const g = evalMinMaxGradient(C, a, q.r[0]);
        pc = [pc[0] * g[0], pc[1] * g[1], pc[2] * g[2], pc[3] * g[3]];
      }
      const size = q.size * (Z ? evalMinMax(Z.x, a, q.r[1]) : 1);
      const lc = evalMinMaxGradient(T.colorOverLifetime, a, tr.r);
      const P = [];
      const O = sim.origin;
      if (!dead2) P.push([O[0] + q.pos[0] * UNIT, O[1] + q.pos[1] * UNIT, now]);
      for (const p of tr.pts) {
        const x = O[0] + p[0] * UNIT, y = O[1] + p[1] * UNIT, last2 = P[P.length - 1];
        if (!last2 || Math.hypot(x - last2[0], y - last2[1]) > 1e-3) P.push([x, y, p[3]]);
      }
      const n = P.length;
      if (n < 2) continue;
      const dist = [0];
      for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const total = dist[n - 1] || 1;
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const s = Math.min(1, Math.max(0, (now - P[i][2]) / tr.life));
        const w = (T.sizeAffectsWidth ? size : 1) * evalMinMax(T.widthOverTrail, s, tr.r) * UNIT / 2;
        const tc = evalMinMaxGradient(T.colorOverTrail, s, tr.r), base = T.inheritParticleColor ? pc : WHITE2;
        const col = [0, 1, 2, 3].map((k) => base[k] * tc[k] * lc[k]);
        let u = T.textureMode === 0 ? dist[i] / total : T.textureMode === 1 ? dist[i] / UNIT : T.textureMode === 2 ? i / (n - 1) : i;
        if (rev && (T.textureMode === 0 || T.textureMode === 2)) u = 1 - u;
        const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(n - 1, i + 1)];
        const dx = p0[0] - p1[0], dy = p0[1] - p1[1], dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl * w, ny = dx / dl * w;
        L.push([P[i][0] + nx, P[i][1] + ny, u, 1, ...col]);
        R.push([P[i][0] - nx, P[i][1] - ny, u, 0, ...col]);
      }
      for (let i = 0; i < n - 1; i++) seg(R[i], R[i + 1], L[i + 1], L[i]);
    }
    flush();
  }
  const QBUF = [0, 0, 0, 0, 0, 0], ABUF = [0], VBUF = [0, 0, 0, 0], EBUF = [0, 0, 0, 0, 0, 0];
  function track(arr, stride, len, time2, out) {
    const n = arr.length / stride - 1, u = time2 % len / len * n, k = Math.min(Math.floor(u), n - 1), w = u - k;
    for (let j = 0; j < stride; j++) out[j] = arr[k * stride + j] * (1 - w) + arr[(k + 1) * stride + j] * w;
    return out;
  }
  function flowQuad(f, time2) {
    const [x, y] = f.pos, hw = f.size[0] / 2, hh = f.size[1] / 2;
    const A = f.anim;
    const c = A?.alpha ? [f.color[0], f.color[1], f.color[2], track(A.alpha, 1, A.len, time2, ABUF)[0]] : f.color;
    if (A?.quad || f.quad) {
      const q = A?.quad ? track(A.quad, 6, A.len, time2, QBUF) : f.quad;
      quad(q[0], q[1], q[2], q[3], q[2] + q[4] - q[0], q[3] + q[5] - q[1], q[4], q[5], c);
    } else if (f.rot) {
      const co = Math.cos(f.rot), s = Math.sin(f.rot);
      const P = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => [x + dx * co - dy * s, y + dx * s + dy * co]);
      quad(P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1], c);
    } else quad(x - hw, y - hh, x + hw, y - hh, x + hw, y + hh, x - hw, y + hh, c);
    flush();
  }
  function drawFlow1(f, tex, time2) {
    scissor(f.clip);
    gl.blendFunc(gl.SRC_ALPHA, f.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    flow1UniformsSet(f, tex, time2);
    const A = f.anim;
    if (A?.mask1ST) gl.uniform4fv(uF1.uM1ST, track(A.mask1ST, 4, A.len, time2, VBUF));
    flowQuad(f, time2);
    gl.activeTexture(gl.TEXTURE0);
  }
  function generalUniformsSet(g, tex, time2) {
    GEN_TEX.forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex[i]);
      gl.uniform1i(uGen[name], i);
    });
    const N = g.noise, E = g.edge, M1 = g.mask1, M2 = g.mask2, SD = g.soft;
    const st = (x) => x ?? ST_ID, sp = (x) => x ?? [0, 0];
    gl.uniform1f(uGen.uTime, time2);
    gl.uniform4fv(uGen.uMainST, st(g.mainST));
    gl.uniform2fv(uGen.uMainSpeed, sp(g.mainSpeed));
    gl.uniform1f(uGen.uMainRot, g.mainRotate ?? 0);
    gl.uniform2fv(uGen.uRB, g.colorRB ?? [0, 0]);
    gl.uniform4fv(uGen.uMainColor, g.mainColor ?? WHITE2);
    gl.uniform1f(uGen.uCentre, g.centre);
    gl.uniform4fv(uGen.uNoiseST, st(N?.st));
    gl.uniform2fv(uGen.uNoiseSpeed, sp(N?.speed));
    gl.uniform1f(uGen.uNoiseVal, N?.value ?? 0);
    gl.uniform1f(uGen.uNoiseU, N?.uOnly ? 1 : 0);
    gl.uniform1f(uGen.uEdgeOn, E ? 1 : 0);
    gl.uniform4fv(uGen.uEdgeST, st(E?.st));
    gl.uniform2fv(uGen.uEdgeSpeed, sp(E?.speed));
    gl.uniform1f(uGen.uEdgeVal, E?.value ?? 0);
    gl.uniform1f(uGen.uEdgeW, E?.width ?? 0);
    gl.uniform1f(uGen.uEdgeRev, E?.revert ? 1 : 0);
    gl.uniform4fv(uGen.uEdgeColor, E?.color ?? WHITE2);
    gl.uniform4fv(uGen.uM1ST, st(M1?.st));
    gl.uniform2fv(uGen.uM1Speed, sp(M1?.speed));
    gl.uniform1f(uGen.uM1Rot, M1?.rotate ?? 0);
    gl.uniform1f(uGen.uM1Rev, M1?.revert ? 1 : 0);
    gl.uniform4fv(uGen.uM2ST, st(M2?.st));
    gl.uniform2fv(uGen.uM2Speed, sp(M2?.speed));
    gl.uniform1f(uGen.uM2Rot, M2?.rotate ?? 0);
    gl.uniform1f(uGen.uM2Rev, M2?.revert ? 1 : 0);
    gl.uniform4fv(uGen.uSoftST, st(SD?.st));
    gl.uniform2fv(uGen.uSoftSpeed, sp(SD?.speed));
    gl.uniform1f(uGen.uF4, SD?.float4 ?? 0.51);
    gl.uniform1f(uGen.uSoftOn, SD?.value != null ? 1 : 0);
    gl.uniform1f(uGen.uSoftVal, SD?.value ?? 0);
    gl.uniform1f(uGen.uSoftRev, SD?.revert ? 1 : 0);
  }
  function uiCommonUniformsSet(c, tex, time2) {
    UIC_TEX.forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex[i]);
      gl.uniform1i(uUic[name], i);
    });
    const D = c.distort, st = (x) => x ?? ST_ID, sp = (x) => x ?? [0, 0];
    gl.uniform1f(uUic.uTime, time2);
    gl.uniform4fv(uUic.uMainST, st(c.mainST));
    gl.uniform2fv(uUic.uMainSpeed, sp(c.mainSpeed));
    gl.uniform1f(uUic.uPower, c.power ?? 1);
    gl.uniform1f(uUic.uInt, c.intensity ?? 1);
    gl.uniform3fv(uUic.uMainColor, c.mainColor ?? [1, 1, 1]);
    gl.uniform4fv(uUic.uAlphaSel, c.alphaSel ?? [0, 0, 0, 1]);
    gl.uniform1f(uUic.uAll, c.allAlpha ?? 1);
    gl.uniform1f(uUic.uPA, c.particleAlpha ? 1 : 0);
    gl.uniform4fv(uUic.uDistST, st(D?.st));
    gl.uniform2fv(uUic.uDistSpeed, sp(D?.speed));
    gl.uniform2fv(uUic.uDistK, D?.k ?? [0, 0]);
    gl.uniform1f(uUic.uDMain, D?.main ? 1 : 0);
    gl.uniform1f(uUic.uDAlpha, D?.alpha ? 1 : 0);
    gl.uniform4fv(uUic.uAlphaST, st(c.alpha?.st));
    gl.uniform2fv(uUic.uAlphaSpeed, sp(c.alpha?.speed));
    gl.uniform4fv(uUic.uAlpha3ST, st(c.alpha3?.st));
    gl.uniform2fv(uUic.uAlpha3Speed, sp(c.alpha3?.speed));
    gl.uniform4fv(uUic.uGradST, st(c.grad?.st));
    gl.uniform2fv(uUic.uGradSpeed, sp(c.grad?.speed));
  }
  function flow1UniformsSet(f, tex, time2) {
    FLOW1_TEX.forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex[i]);
      gl.uniform1i(uF1[name], i);
    });
    const u = flow1Uniforms(f);
    gl.uniform1f(uF1.uTime, time2);
    gl.uniform1f(uF1.uK, u.k);
    gl.uniform1f(uF1.uVClamp, u.vClamp);
    gl.uniform1f(uF1.uChR, u.channelR);
    gl.uniform1f(uF1.uM1Soft, u.mask1Soft);
    gl.uniform1f(uF1.uM1Rev, u.mask1Rev);
    gl.uniform1f(uF1.uM2Soft, u.mask2Soft);
    gl.uniform1f(uF1.uM2Rev, u.mask2Rev);
    gl.uniform1f(uF1.uDisRev, u.dissolveRev);
    gl.uniform1f(uF1.uDisC, u.dissolveC);
    gl.uniform1f(uF1.uDisSoft, u.dissolveSoft);
    gl.uniform1f(uF1.uMainValue, u.mainValue);
    gl.uniform2fv(uF1.uMainRot, u.mainRot);
    gl.uniform2fv(uF1.uColRot, u.colorRot);
    gl.uniform2fv(uF1.uM1Rot, u.mask1Rot);
    gl.uniform2fv(uF1.uMainFlow, u.mainFlow);
    gl.uniform2fv(uF1.uDstFlow, u.disturbFlow);
    gl.uniform2fv(uF1.uDisFlow, u.dissolveFlow);
    gl.uniform2fv(uF1.uAxis, u.axis);
    gl.uniform2fv(uF1.uDisAxis, u.dissolveAxis);
    gl.uniform4fv(uF1.uMainTO, u.mainTO);
    gl.uniform4fv(uF1.uDstTO, u.disturbTO);
    gl.uniform4fv(uF1.uColST, u.colorST);
    gl.uniform4fv(uF1.uM1ST, u.mask1ST);
    gl.uniform4fv(uF1.uM2ST, u.mask2ST);
    gl.uniform4fv(uF1.uDisST, u.dissolveST);
    gl.uniform4fv(uF1.uDisMaskST, u.dissolveMaskST);
  }
  function drawFlow(f, t, time2) {
    scissor(f.clip);
    gl.blendFunc(gl.SRC_ALPHA, f.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    flowUniforms(f, t, time2, f.blend === "alpha" ? 1 : FLOW_GAIN);
    const A = f.anim;
    if (A?.disturbValue) gl.uniform1f(uFl.uDstVal, track(A.disturbValue, 1, A.len, time2, ABUF)[0] * FLOW_DISTURB_K);
    if (A?.maskTO) gl.uniform4fv(uFl.uMaskTO, track(A.maskTO, 4, A.len, time2, VBUF));
    flowQuad(f, time2);
    gl.activeTexture(gl.TEXTURE0);
  }
  function flowUniforms(f, t, time2, gain) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.main);
    gl.uniform1i(uFl.uMain, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.dst);
    gl.uniform1i(uFl.uDst, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t.mask);
    gl.uniform1i(uFl.uMask, 2);
    gl.uniform1f(uFl.uTime, time2);
    gl.uniform1f(uFl.uMainValue, f.mainValue * gain);
    gl.uniform1f(uFl.uDstVal, f.disturbValue * FLOW_DISTURB_K);
    gl.uniform1f(uFl.uVRepeat, f.vRepeat ? 1 : 0);
    gl.uniform2f(uFl.uDstFlow, f.disturbFlow[0], f.disturbFlow[1]);
    gl.uniform4fv(uFl.uMainTO, f.mainTO);
    gl.uniform4fv(uFl.uDstTO, f.disturbTO);
    const mr = f.mainRotate ?? 0, K = f.mask, kr = K?.rotate ?? 0;
    gl.uniform4fv(uFl.uMainST, f.mainST ?? ST_ID);
    gl.uniform4fv(uFl.uDstST, f.disturbST ?? ST_ID);
    gl.uniform2f(uFl.uDstAxis, f.disturbV ? 0 : 1, f.disturbV ? 1 : 0);
    gl.uniform2f(uFl.uMainRot, Math.cos(mr), Math.sin(mr));
    gl.uniform2f(uFl.uMainFlow, f.mainFlow?.[0] ?? 0, f.mainFlow?.[1] ?? 0);
    gl.uniform1f(uFl.uRepeatU, f.mainRepeatU ? 1 : 0);
    gl.uniform4fv(uFl.uMaskST, K?.st ?? ST_ID);
    gl.uniform4fv(uFl.uMaskTO, K?.to ?? ST_ID);
    gl.uniform2f(uFl.uMaskRot, Math.cos(kr), Math.sin(kr));
    gl.uniform1f(uFl.uMaskSoft, K?.softness ?? 0);
    gl.uniform1f(uFl.uMaskRev, K?.revert ? 1 : 0);
    gl.uniform1f(uFl.uMaskDst, K?.disturbed ? 1 : 0);
  }
  function drawImage(f, tex, time2) {
    scissor(f.clip);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uPt.uTex, 0);
    gl.uniform1f(uPt.uStr, f.strength);
    gl.uniform1f(uPt.uStrA, 1);
    gl.uniform1f(uPt.uRot, 0);
    gl.uniform4fv(uPt.uTint, f.tint ?? WHITE2);
    gl.blendFunc(gl.SRC_ALPHA, f.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    flowQuad(f, time2);
  }
  function drawShiny(f, tex, time2) {
    const S = f.shiny, A = f.anim;
    scissor(f.clip);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uSh.uTex, 0);
    const factor = A?.shiny ? track(A.shiny, 1, A.len, time2, ABUF)[0] : S.factor;
    gl.uniform4f(uSh.uShine, factor, S.width, S.softness, S.brightness);
    gl.uniform4fv(uSh.uCorner, S.corners);
    gl.uniform1f(uSh.uGloss, S.gloss);
    gl.blendFunc(gl.SRC_ALPHA, f.blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    flowQuad(f, time2);
  }
  function drawFlows(list, view, time2) {
    for (const e of list) {
      if (e.kind === "image" && e.f.shiny) {
        gl.useProgram(P_SHINY);
        gl.uniform4f(uSh.uView, ...view);
        drawShiny(e.f, e.tex, time2);
      } else if (e.kind === "image") {
        gl.useProgram(P_PT);
        gl.uniform4f(uPt.uView, ...view);
        drawImage(e.f, e.tex, time2);
      } else if (e.kind === "flow1") {
        gl.useProgram(P_FLOW1);
        gl.uniform4f(uF1.uView, ...view);
        drawFlow1(e.f, e.tex, time2);
      } else {
        gl.useProgram(P_FLOW);
        gl.uniform4f(uFl.uView, ...view);
        drawFlow(e.f, e, time2);
      }
    }
  }
  let raf = 0, time = 0, last = performance.now(), first = true, dead = false;
  function frame(now) {
    if (dead) return;
    const dt = Math.min((now - last) / 1e3, 1 / 20);
    last = now;
    time += dt;
    for (const s of sims) {
      const A = s.sys.active;
      if (A) {
        const p = time % A.len;
        s.setActive(A.on.some(([a, b]) => p >= a && p < b));
      }
      const mv = s.sys.move;
      if (mv) {
        const d = track(mv.d, 2, mv.len, time, VBUF);
        s.origin = [s.sys.pos[0] + d[0], s.sys.pos[1] + d[1]];
      }
      const em = s.sys.emitter;
      if (em) {
        const e = track(em.d, 6, em.len, time, EBUF), k = 1 / Math.hypot(e[2], e[3], e[4], e[5]);
        s.emitOff = [e[0] / UNIT, e[1] / UNIT, 0];
        s.emitRot = [e[2] * k, e[3] * k, e[4] * k, e[5] * k];
      }
      s.update(dt);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(vao);
    const view = [-W / 2, -H / 2, W, H];
    gl.disable(gl.BLEND);
    gl.useProgram(P_BG);
    gl.uniform4f(uBg.uView, ...view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, T_BG);
    gl.uniform1i(uBg.uTex, 0);
    quad(-W / 2, -H / 2, W / 2, -H / 2, W / 2, H / 2, -W / 2, H / 2, [1, 1, 1, 1]);
    flush();
    gl.enable(gl.BLEND);
    drawFlows(flowParts.under, view, time);
    let g = 0;
    for (const e of drawList) {
      for (const eg = e.sim.sys.group ?? 0; g < eg; ) drawFlows(flowParts.before[++g] ?? [], view, time);
      drawParticles(e, view, time);
    }
    while (g < flowParts.before.length - 1) drawFlows(flowParts.before[++g] ?? [], view, time);
    drawFlows(flowParts.over, view, time);
    gl.disable(gl.SCISSOR_TEST);
    if (first) {
      first = false;
      opts.onFirstFrame?.();
    }
    raf = requestAnimationFrame(frame);
  }
  const onLost = (e) => {
    e.preventDefault();
    dead = true;
    cancelAnimationFrame(raf);
    opts.onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  raf = requestAnimationFrame(frame);
  return {
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (gl.isContextLost()) return;
      for (const t of textures) gl.deleteTexture(t);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      for (const p of [P_BG, P_PT, P_FLOW, P_FLOW1, P_GEN, P_UIC, P_SHINY]) gl.deleteProgram(p);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
export {
  ORBITAL_DEG,
  ORBITAL_RAD,
  startGachaFx
};
