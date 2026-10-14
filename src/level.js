import {
  GROUND_Y,
  PLAYER_SIZE,
  GRAVITY,
  JUMP_VEL,
  GAME_SPEED,
  LEVEL_LENGTH,
  COIN_RADIUS,
  COIN_HOVER,
  COIN_LAND_INSET,
  COIN_TAKEOFF_INSET,
  SOLVE_DT,
  SOLVE_QUANT,
} from "./constants.js";
import { canvas } from "./canvas.js";
import { collidesAABB, resolveSim } from "./physics.js";
import { gameState } from "./state.js";

export function getLevelEnd(
  obs = gameState.obstacles,
  playingEditorLevel = gameState.playingEditorLevel,
  state = gameState.state
) {
  return playingEditorLevel || state === "editor"
    ? Math.max(LEVEL_LENGTH, ...(obs || []).map(o => o.x + o.w + 200))
    : LEVEL_LENGTH;
}

// URL sharing
export function serializeLevel(name, obstacles) {
  return name + "~" + obstacles.map(o => {
    let code;
    if (o.type === "spike") code = "s";
    else if (o.w === 72 && o.h === 72) code = "B";
    else if (o.w === 108 && o.h === 36) code = "w";
    else code = "b";
    return code + "-" + o.x + "-" + o.y;
  }).join("~");
}

export function deserializeLevel(str) {
  const codes = { s: ["spike", 36, 36], b: ["block", 36, 36], B: ["block", 72, 72], w: ["block", 108, 36] };
  const parts = str.split("~");
  const name = parts[0];
  const obstacles = parts.slice(1).map(s => {
    const f = s.split("-");
    if (f.length === 5) {
      const [t, x, y, w, h] = f;
      return { type: t === "s" ? "spike" : "block", x: +x, y: +y, w: +w, h: +h };
    }
    const [t, x, y] = f;
    const [type, w, h] = codes[t] || ["block", 36, 36];
    return { type, x: +x, y: +y, w, h };
  });
  return { name, obstacles };
}

export function getLevelURL(name, obstacles) {
  const base = window.location.origin + window.location.pathname;
  return base + "?level=" + encodeURIComponent(serializeLevel(name, obstacles));
}

export function buildLevel() {
  const obs = [];
  const unit = PLAYER_SIZE;
  // Hand-crafted level sections
  const patterns = [
    // single spike
    (x) => [{ type: "spike", x, y: GROUND_Y, w: unit, h: unit }],
    // double spike
    (x) => [
      { type: "spike", x, y: GROUND_Y, w: unit, h: unit },
      { type: "spike", x: x + unit, y: GROUND_Y, w: unit, h: unit },
    ],
    // block to jump on
    (x) => [{ type: "block", x, y: GROUND_Y - unit * 2, w: unit * 2, h: unit * 2 }],
    // spike after block
    (x) => [
      { type: "block", x, y: GROUND_Y - unit * 2, w: unit * 2, h: unit * 2 },
      { type: "spike", x: x + unit * 3, y: GROUND_Y, w: unit, h: unit },
    ],
    // triple spike
    (x) => [
      { type: "spike", x, y: GROUND_Y, w: unit, h: unit },
      { type: "spike", x: x + unit, y: GROUND_Y, w: unit, h: unit },
      { type: "spike", x: x + unit * 2, y: GROUND_Y, w: unit, h: unit },
    ],
    // elevated block + ground spike with ramp block to jump from
    (x) => [
      { type: "block", x, y: GROUND_Y - unit * 2, w: unit * 2, h: unit * 2 },
      { type: "block", x: x + unit * 4, y: GROUND_Y - unit * 3, w: unit * 3, h: unit },
      { type: "spike", x: x + unit * 5, y: GROUND_Y, w: unit, h: unit },
    ],
  ];

  let x = 600;
  while (x < LEVEL_LENGTH - 400) {
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    const items = pat(x);
    obs.push(...items);
    x += 200 + Math.random() * 250;
  }
  return obs;
}

export function obstacleTop(ob) {
  return ob.type === "spike" ? ob.y - ob.h : ob.y;
}

export function obstacleBottom(ob) {
  return ob.type === "spike" ? ob.y : ob.y + ob.h;
}

// Stretches of ground the player can run along, split by whatever rests on it.
export function groundRuns(obstacles) {
  const blockers = obstacles
    .filter(ob => obstacleBottom(ob) >= GROUND_Y - 1)
    .sort((a, b) => a.x - b.x);
  const runs = [];
  let from = 0;
  for (const ob of blockers) {
    if (ob.x > from) runs.push({ from, to: ob.x });
    if (ob.x + ob.w > from) from = ob.x + ob.w;
  }
  runs.push({ from, to: LEVEL_LENGTH });
  return runs;
}

// Surfaces the player can come to rest on.
export function standSurfaces(obstacles) {
  return [{ x: -Infinity, w: Infinity, top: GROUND_Y }].concat(
    obstacles.filter(ob => ob.type === "block").map(ob => ({ x: ob.x, w: ob.w, top: ob.y }))
  );
}

// Which candidates a surviving run can actually touch. Jumping or holding is the
// only choice the player has, so every standing position the level allows can be
// enumerated, and a candidate counts only if some path sweeps it before dying.
export function sweptCoins(obstacles, candidates) {
  const surfaces = standSurfaces(obstacles);
  const swept = new Set();
  const supported = (x, top) => surfaces.some(s =>
    Math.abs(s.top - top) < 0.001 && x + PLAYER_SIZE > s.x && x < s.x + s.w
  );

  // Advance from a standing position until the player stands again, or dies.
  function advance(fromX, top, jump) {
    const p = { x: fromX, y: top - PLAYER_SIZE, vy: jump ? JUMP_VEL : 0, onGround: !jump };
    for (let i = 0; i < 2000; i++) {
      const prevBottom = p.y + PLAYER_SIZE;
      p.x += GAME_SPEED * SOLVE_DT;
      if (p.onGround && !supported(p.x, p.y + PLAYER_SIZE)) p.onGround = false;
      if (!p.onGround) { p.vy += GRAVITY * SOLVE_DT; p.y += p.vy * SOLVE_DT; }
      if (!p.onGround && p.vy >= 0) {
        for (const s of surfaces) {
          if (p.x + PLAYER_SIZE <= s.x || p.x >= s.x + s.w) continue;
          if (prevBottom <= s.top + 0.001 && p.y + PLAYER_SIZE >= s.top) {
            p.y = s.top - PLAYER_SIZE; p.vy = 0; p.onGround = true; break;
          }
        }
      }
      if (!resolveSim(p, obstacles)) return null;
      if (p.y > canvas.height) return null;
      // Counted only on a solid overlap, so a coin the search merely grazes at
      // this step size is dropped rather than kept as a near miss.
      const grip = COIN_RADIUS - 4;
      for (const c of candidates) {
        if (p.x + PLAYER_SIZE > c.x - grip && p.x < c.x + grip &&
            p.y + PLAYER_SIZE > c.y - grip && p.y < c.y + grip) swept.add(c);
      }
      if (p.x > LEVEL_LENGTH) return null;
      if (p.onGround && (jump || p.x - fromX >= SOLVE_QUANT)) return { x: p.x, top: p.y + PLAYER_SIZE };
    }
    return null;
  }

  const seen = new Set(["100:" + GROUND_Y]);
  const pending = [{ x: 100, top: GROUND_Y }];
  while (pending.length) {
    const from = pending.pop();
    for (const jump of [false, true]) {
      const next = advance(from.x, from.top, jump);
      if (!next) continue;
      const key = Math.round(next.x / SOLVE_QUANT) + ":" + Math.round(next.top);
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(next);
    }
  }
  return swept;
}

// Coins are proposed over footing the player can stand on, kept off the ends of
// each stretch and away from spikes, then vetted by sweptCoins so only the ones
// a surviving run can actually touch survive.
export function placeCoins(obstacles) {
  const placed = [];

  function overSpike(x) {
    return obstacles.some(ob => ob.type === "spike" &&
      x + COIN_RADIUS > ob.x - PLAYER_SIZE && x - COIN_RADIUS < ob.x + ob.w + PLAYER_SIZE);
  }

  function standClear(x, surface) {
    return !obstacles.some(ob => collidesAABB(
      x - PLAYER_SIZE / 2, surface - PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE,
      ob.x, obstacleTop(ob), ob.w, obstacleBottom(ob) - obstacleTop(ob)
    ));
  }

  function add(x, surface) {
    if (overSpike(x) || !standClear(x, surface)) return;
    placed.push({
      x, y: surface - COIN_RADIUS - COIN_HOVER,
      taken: false,
      phase: Math.random() * Math.PI * 2,
    });
  }

  for (const ob of obstacles) {
    if (ob.type !== "block") continue;
    const cells = Math.max(1, Math.round(ob.w / PLAYER_SIZE));
    for (let i = 0; i < cells; i++) {
      if (Math.random() > 0.6) continue;
      const x = ob.x + PLAYER_SIZE * (i + 0.5);
      // The player needs full footing under the coin, not an overhanging edge.
      if (x - PLAYER_SIZE / 2 < ob.x || x + PLAYER_SIZE / 2 > ob.x + ob.w) continue;
      add(x, ob.y);
    }
  }

  for (const run of groundRuns(obstacles)) {
    if (Math.random() < 0.35) continue;
    const start = Math.max(run.from + COIN_LAND_INSET, 500) + COIN_RADIUS;
    const end = Math.min(run.to - COIN_TAKEOFF_INSET, LEVEL_LENGTH - 200) - COIN_RADIUS;
    const span = end - start;
    if (span < 0) continue;
    const count = Math.min(3, Math.floor(span / PLAYER_SIZE) + 1);
    const first = start + (span - (count - 1) * PLAYER_SIZE) / 2;
    for (let i = 0; i < count; i++) add(first + i * PLAYER_SIZE, GROUND_Y);
  }

  const swept = sweptCoins(obstacles, placed);
  return placed.filter(coin => swept.has(coin));
}
