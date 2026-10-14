import {
  GROUND_Y,
  PLAYER_SIZE,
  COIN_COLOR,
  ACCENT,
  CITY_STRIP_W,
} from "./constants.js";
import { canvas, ctx, drawCube } from "./canvas.js";
import { equippedColor, equippedShape } from "./shop.js";
import { gameState } from "./state.js";

export function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCityLayer(seed, totalWidth, minW, maxW, minH, maxH, isNear) {
  const r = rng(seed);
  const buildings = [];
  let x = 0;
  while (x < totalWidth) {
    const w = minW + r() * (maxW - minW);
    const h = minH + r() * (maxH - minH);
    const hasAntenna = !isNear && h > (minH + maxH) * 0.52 && r() < 0.45;
    const antennaH = hasAntenna ? 18 + r() * 42 : 0;
    const windows = [];
    if (isNear) {
      const cols = Math.max(2, Math.floor(w / 18));
      const rows = Math.max(2, Math.floor(h / 24));
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (r() < 0.38) {
            const winColor = r() < 0.55 ? "#00e5ff" : (r() < 0.85 ? "#ff00d4" : "#ffd633");
            windows.push({
              rx: (col + 0.5) / cols,
              ry: (row + 0.5) / rows,
              color: winColor,
              blinkPhase: r() * Math.PI * 2,
            });
          }
        }
      }
    }
    buildings.push({ x, w, h, hasAntenna, antennaH, windows });
    x += w + (isNear ? 12 + r() * 32 : 18 + r() * 48);
  }
  return buildings;
}

export function initSkyline() {
  gameState.farCityBuildings = generateCityLayer(5, CITY_STRIP_W, 65, 175, 140, 310, false);
  gameState.nearCityBuildings = generateCityLayer(9, CITY_STRIP_W, 45, 130, 60, 200, true);
}

export function drawCityLayer(buildings, stripW, parallaxSpeed, baseColor, edgeColor, cx) {
  if (!buildings || !buildings.length) {
    initSkyline();
    buildings = parallaxSpeed < 0.15 ? gameState.farCityBuildings : gameState.nearCityBuildings;
  }
  const shift = ((cx * parallaxSpeed) % stripW + stripW) % stripW;
  const time = performance.now() / 1000;
  ctx.save();
  for (let offset = -stripW; offset < canvas.width + stripW; offset += stripW) {
    for (const b of buildings) {
      const bx = offset + b.x - shift;
      if (bx + b.w < -20 || bx > canvas.width + 20) continue;
      const by = GROUND_Y - b.h;

      // Building silhouette
      ctx.fillStyle = baseColor;
      ctx.fillRect(bx, by, b.w, b.h);

      // Roof edge highlight
      ctx.fillStyle = edgeColor;
      ctx.fillRect(bx, by, b.w, 2);

      // Antenna
      if (b.hasAntenna) {
        const ax = bx + b.w / 2;
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, by);
        ctx.lineTo(ax, by - b.antennaH);
        ctx.stroke();
        const beacon = Math.sin(time * 3.5 + b.x);
        if (beacon > 0.1) {
          ctx.fillStyle = "#ff2255";
          ctx.shadowColor = "#ff2255";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(ax, by - b.antennaH, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Windows
      if (b.windows && b.windows.length) {
        for (const win of b.windows) {
          const wx = bx + win.rx * (b.w - 10) + 2;
          const wy = by + win.ry * (b.h - 16) + 6;
          const alpha = 0.22 + 0.16 * Math.sin(time * 2.2 + win.blinkPhase);
          ctx.fillStyle = win.color;
          ctx.globalAlpha = Math.max(0.08, alpha);
          ctx.fillRect(wx, wy, 5, 5);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
}

export function initAmbientSpecks() {
  gameState.ambientSpecks = [];
  const r = rng(77);
  for (let i = 0; i < 48; i++) {
    gameState.ambientSpecks.push({
      x: r() * canvas.width,
      y: r() * (GROUND_Y - 20),
      vx: -12 - r() * 22,
      vy: (r() - 0.5) * 14,
      size: 2 + r() * 2.5,
      color: r() < 0.5 ? "#ff00d4" : "#00f0ff",
      phase: r() * Math.PI * 2,
    });
  }
}

export function updateAmbientSpecks(dt) {
  if (!gameState.ambientSpecks || !gameState.ambientSpecks.length) initAmbientSpecks();
  for (const s of gameState.ambientSpecks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x < -10) s.x = canvas.width + 10;
    if (s.x > canvas.width + 10) s.x = -10;
    if (s.y < 10) s.y = GROUND_Y - 15;
    if (s.y > GROUND_Y - 10) s.y = 15;
  }
}

export function drawAmbientSpecks() {
  if (!gameState.ambientSpecks || !gameState.ambientSpecks.length) return;
  const time = performance.now() / 1000;
  ctx.save();
  for (const s of gameState.ambientSpecks) {
    const alpha = 0.25 + 0.25 * Math.sin(time * 2.5 + s.phase);
    ctx.fillStyle = s.color;
    ctx.globalAlpha = Math.max(0.08, alpha);
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 6;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.restore();
}

export function spawnJumpRing(x, y) {
  const sparks = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    sparks.push({
      angle: a,
      dist: 14 + Math.random() * 6,
      speed: 45 + Math.random() * 55,
      size: 3 + Math.random() * 2,
    });
  }
  gameState.jumpRings.push({
    x,
    y,
    r: 12,
    life: 0.45,
    maxLife: 0.45,
    color: "#ffd633",
    sparks,
  });
}

export function updateJumpRings(dt) {
  for (const r of gameState.jumpRings) {
    r.life -= dt;
    r.r += 95 * dt;
    for (const sp of r.sparks) {
      sp.dist += sp.speed * dt;
    }
  }
  gameState.jumpRings = gameState.jumpRings.filter(r => r.life > 0);
}

export function drawJumpRings(cx) {
  if (!gameState.jumpRings || !gameState.jumpRings.length) return;
  ctx.save();
  for (const r of gameState.jumpRings) {
    const progress = Math.max(0, r.life / r.maxLife);
    ctx.save();
    ctx.globalAlpha = progress * 0.85;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(r.x - cx, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = r.color;
    for (const sp of r.sparks) {
      const sx = r.x - cx + Math.cos(sp.angle) * sp.dist;
      const sy = r.y + Math.sin(sp.angle) * sp.dist;
      ctx.fillRect(sx - sp.size / 2, sy - sp.size / 2, sp.size, sp.size);
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawPlayerTrail(cx) {
  if (!gameState.playerTrail || !gameState.playerTrail.length) return;
  for (let i = gameState.playerTrail.length - 1; i >= 0; i--) {
    const t = gameState.playerTrail[i];
    const frac = 1 - (i + 1) / (gameState.playerTrail.length + 1);
    ctx.save();
    ctx.globalAlpha = 0.3 * frac;
    const px = t.x - cx + PLAYER_SIZE / 2;
    const py = t.y + PLAYER_SIZE / 2;
    ctx.translate(px, py);
    ctx.rotate(t.rotation);
    const sz = PLAYER_SIZE * (0.18 + 0.5 * frac);
    drawCube(sz, t.color, t.shape);
    ctx.restore();
  }
}

export function spawnParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    gameState.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 600,
      vy: (Math.random() - 0.5) * 600,
      life: 1,
      color: [equippedColor(), ACCENT, "#ffff00", "#ff4444"][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 5,
    });
  }
}

export function spawnCoinSparkle(x, y) {
  for (let i = 0; i < 10; i++) {
    gameState.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 260,
      vy: -Math.random() * 260,
      life: 1,
      color: [COIN_COLOR, "#fff8b0"][Math.floor(Math.random() * 2)],
      size: 2 + Math.random() * 3,
    });
  }
}

export function spawnGoalCelebration(gx, py) {
  // Shockwave rings expanding from the gate
  gameState.goalRipples.push({ x: gx, y: py, r: 8, life: 1 });
  gameState.goalRipples.push({ x: gx + 44, y: py, r: 4, life: 1 });

  // Confetti / fireworks particles
  const colors = ["#ffffff", equippedColor(), "#ffd700", "#ff00ff", "#00ffff", "#ffea00"];
  for (let i = 0; i < 55; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 450;
    gameState.particles.push({
      x: gx + Math.random() * 44,
      y: py + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 180,
      life: 1.2 + Math.random() * 0.6,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4,
    });
  }
}

// Goal post drawing at 100% position (Geometry Dash style finish line)
export function drawGoalPost(gx, cx, cleared) {
  const sx = gx - cx;
  if (sx < -100 || sx > canvas.width + 100) return;

  const t = performance.now() / 1000;
  const pulse = cleared ? 1.4 : 0.85 + 0.15 * Math.sin(t * 3.5);

  ctx.save();

  // 1. Cyan-green luminous glow aura (from top of screen to ground)
  const auraW = 48;
  const auraGrad = ctx.createLinearGradient(sx - auraW, 0, sx + auraW, 0);
  auraGrad.addColorStop(0, "rgba(0, 230, 140, 0)");
  auraGrad.addColorStop(0.2, `rgba(0, 230, 140, ${0.12 * pulse})`);
  auraGrad.addColorStop(0.4, `rgba(30, 245, 160, ${0.35 * pulse})`);
  auraGrad.addColorStop(0.5, `rgba(90, 255, 195, ${0.6 * pulse})`);
  auraGrad.addColorStop(0.6, `rgba(30, 245, 160, ${0.35 * pulse})`);
  auraGrad.addColorStop(0.8, `rgba(0, 230, 140, ${0.12 * pulse})`);
  auraGrad.addColorStop(1, "rgba(0, 230, 140, 0)");
  ctx.fillStyle = auraGrad;
  ctx.fillRect(sx - auraW, 0, auraW * 2, GROUND_Y);

  // Subtle horizontal beam grain / scanlines in aura
  ctx.fillStyle = `rgba(255, 255, 255, ${0.05 * pulse})`;
  for (let y = 10; y < GROUND_Y; y += 16) {
    ctx.fillRect(sx - auraW + 8, y, (auraW - 8) * 2, 1);
  }

  // 2. Neon Chevrons (>) stacked along the left side of the beam
  const apexX = sx - 6;
  const chW = 14;
  const chH = 9;
  const count = 9;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "miter";
  for (let i = 0; i < count; i++) {
    const cy = GROUND_Y - 22 - i * 36;
    if (cy < 15) continue;
    const wave = Math.sin(t * 5.5 - i * 0.6);
    const chAlpha = cleared ? 1 : 0.72 + 0.28 * wave;
    ctx.strokeStyle = `rgba(0, 255, 165, ${chAlpha})`;
    ctx.shadowColor = "#00ff9f";
    ctx.shadowBlur = cleared ? 16 : 8;
    ctx.beginPath();
    ctx.moveTo(apexX - chW, cy - chH);
    ctx.lineTo(apexX, cy);
    ctx.lineTo(apexX - chW, cy + chH);
    ctx.stroke();
  }

  // 3. Central bright white goal line (spans all the way from y=0 to GROUND_Y)
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = cleared ? "#aaffdd" : "#ffffff";
  ctx.shadowBlur = cleared ? 25 : 12 * pulse;
  ctx.fillRect(sx - 2, 0, 4, GROUND_Y);

  // Subtle cyan edge fringe along the white beam
  ctx.fillStyle = "rgba(120, 255, 220, 0.65)";
  ctx.shadowBlur = 0;
  ctx.fillRect(sx - 3, 0, 1, GROUND_Y);
  ctx.fillRect(sx + 2, 0, 1, GROUND_Y);

  // 4. Checkered finish block on the right (2 columns x 6 rows)
  const sqSize = 18;
  const cols = 2;
  const rows = 6;
  const blockX = sx + 4;
  const blockW = cols * sqSize; // 36px wide
  const blockH = rows * sqSize; // 108px high
  const blockY = GROUND_Y - blockH;

  for (let r = 0; r < rows; r++) {
    const y = GROUND_Y - (r + 1) * sqSize;
    for (let c = 0; c < cols; c++) {
      const x = blockX + c * sqSize;
      const isWhite = (r + c) % 2 === 0;
      ctx.fillStyle = isWhite ? "#f2f2f6" : "#14141e";
      ctx.fillRect(x, y, sqSize, sqSize);
    }
  }

  // Chromatic glitch fringes on checkered block
  ctx.fillStyle = "rgba(0, 240, 255, 0.75)";
  ctx.fillRect(blockX, blockY, 1.5, blockH);
  ctx.fillRect(blockX + blockW - 1.5, blockY, 1.5, blockH);
  ctx.fillStyle = "rgba(255, 35, 85, 0.85)";
  ctx.fillRect(blockX + sqSize - 0.75, blockY, 1.5, blockH);

  // Subtle outer edge stroke
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(blockX, blockY, blockW, blockH);

  // 5. Extra flare when cleared
  if (cleared) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(sx - 15, 0, 30, GROUND_Y);
  }

  ctx.restore();
}
