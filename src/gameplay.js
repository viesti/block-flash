import {
  GROUND_Y,
  PLAYER_SIZE,
  GRAVITY,
  JUMP_VEL,
  GAME_SPEED,
  COIN_RADIUS,
  PLAYER_COLOR,
  GROUND_COLOR,
  SPIKE_COLOR,
  BLOCK_COLOR,
  CITY_STRIP_W,
  PLAYER_TRAIL_LENGTH,
  BG_COLORS,
  COIN_COLOR,
  DEAD_RETRY_BTN_SOLO,
  DEAD_RETRY_BTN_PAIR,
  DEAD_EDITOR_BTN,
  HOME_BTN,
} from "./constants.js";
import { canvas, ctx, drawButton, drawCube } from "./canvas.js";
import { gameState, bankCoin } from "./state.js";
import { collidesWithSpike, collidesAABB } from "./physics.js";
import { buildLevel, placeCoins, getLevelEnd } from "./level.js";
import {
  updateAmbientSpecks,
  updateJumpRings,
  drawAmbientSpecks,
  drawCityLayer,
  drawGoalPost,
  drawJumpRings,
  drawPlayerTrail,
  spawnParticles,
  spawnCoinSparkle,
  spawnGoalCelebration,
  spawnJumpRing,
} from "./effects.js";
import { inLevel } from "./audio.js";
import { updateWinCelebration, initWinCelebration, drawWinScreen } from "./win.js";
import { equippedColor, equippedShape, drawShop } from "./shop.js";
import { drawEditor } from "./editor.js";
import { drawSplash, drawStartScreen, drawLevelSelect } from "./ui.js";

export function triggerPlayerJump() {
  gameState.player.vy = JUMP_VEL;
  gameState.player.onGround = false;
  spawnJumpRing(gameState.player.x + PLAYER_SIZE / 2, gameState.player.y + PLAYER_SIZE / 2);
}

export function die() {
  spawnParticles(gameState.player.x + PLAYER_SIZE / 2, gameState.player.y + PLAYER_SIZE / 2);
  gameState.state = "dead";
  gameState.deathTime = performance.now();
  gameState.playerTrail = [];
}

export function reset(customObstacles) {
  gameState.player = { x: 100, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, rotation: 0 };
  gameState.camera = 0;
  gameState.obstacles = customObstacles ? customObstacles.map(o => ({ ...o })) : buildLevel();
  gameState.coins = customObstacles ? [] : placeCoins(gameState.obstacles);
  gameState.coinsCollected = 0;
  gameState.particles = [];
  gameState.playerTrail = [];
  gameState.jumpRings = [];
  gameState.score = 0;
  gameState.goalCrossed = false;
  gameState.winDelay = 0;
  gameState.goalFlash = 0;
  gameState.goalRipples = [];
}

export function update(dt) {
  if (gameState.editorSavedFeedback > 0) {
    gameState.editorSavedFeedback = Math.max(0, gameState.editorSavedFeedback - dt);
  }
  gameState.particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 400 * dt;
    p.life -= dt * 1.5;
  });
  gameState.particles = gameState.particles.filter((p) => p.life > 0);

  updateAmbientSpecks(dt);
  updateJumpRings(dt);

  gameState.goalRipples.forEach(r => {
    r.r += 260 * dt;
    r.life -= dt * 1.8;
  });
  gameState.goalRipples = gameState.goalRipples.filter(r => r.life > 0);
  if (gameState.goalFlash > 0) gameState.goalFlash = Math.max(0, gameState.goalFlash - dt * 2.5);

  if (gameState.state === "win") {
    updateWinCelebration(dt);
    return;
  }

  if (gameState.state !== "playing") {
    gameState.playerTrail = [];
    return;
  }

  // Player motion trail (vana)
  gameState.playerTrail.unshift({
    x: gameState.player.x,
    y: gameState.player.y,
    rotation: gameState.player.rotation,
    color: equippedColor(),
    shape: equippedShape(),
  });
  if (gameState.playerTrail.length > PLAYER_TRAIL_LENGTH) {
    gameState.playerTrail.length = PLAYER_TRAIL_LENGTH;
  }

  // Move player forward
  gameState.player.x += GAME_SPEED * dt;
  gameState.camera = gameState.player.x - 100;

  // Gravity
  gameState.player.vy += GRAVITY * dt;
  gameState.player.y += gameState.player.vy * dt;

  // Ground collision
  if (gameState.player.y + PLAYER_SIZE >= GROUND_Y) {
    gameState.player.y = GROUND_Y - PLAYER_SIZE;
    gameState.player.vy = 0;
    gameState.player.onGround = true;
    if (gameState.jumpPressed) { triggerPlayerJump(); }
  }

  // Rotation (visual spin when airborne)
  if (!gameState.player.onGround) {
    gameState.player.rotation += 6 * dt;
  } else {
    gameState.player.rotation = Math.round(gameState.player.rotation / (Math.PI / 2)) * (Math.PI / 2);
  }

  // If goal was crossed, player glides smoothly through the goalpost into victory
  if (gameState.goalCrossed) {
    gameState.winDelay -= dt;
    if (gameState.winDelay <= 0) {
      gameState.state = "win";
      initWinCelebration();
    }
    return;
  }

  // Block landing (stand on blocks)
  for (const ob of gameState.obstacles) {
    if (ob.type !== "block") continue;
    if (collidesAABB(gameState.player.x, gameState.player.y, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
      // Determine overlap direction
      const overlapBottom = (gameState.player.y + PLAYER_SIZE) - ob.y;
      const overlapTop = (ob.y + ob.h) - gameState.player.y;
      const overlapLeft = (gameState.player.x + PLAYER_SIZE) - ob.x;
      const overlapRight = (ob.x + ob.w) - gameState.player.x;
      const minOverlap = Math.min(overlapBottom, overlapTop, overlapLeft, overlapRight);

      if (minOverlap === overlapBottom && gameState.player.vy >= 0) {
        gameState.player.y = ob.y - PLAYER_SIZE;
        gameState.player.vy = 0;
        gameState.player.onGround = true;
        if (gameState.jumpPressed) { triggerPlayerJump(); }
      } else if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        // Check if player is supported by an adjacent block at the same height
        const supported = gameState.obstacles.some(other =>
          other.type === "block" && other !== ob &&
          other.y === ob.y &&
          gameState.player.x + PLAYER_SIZE > other.x && gameState.player.x < other.x + other.w &&
          gameState.player.y + PLAYER_SIZE <= other.y + 4
        );
        if (supported || (gameState.player.vy >= 0 && overlapBottom <= PLAYER_SIZE / 2)) {
          gameState.player.y = ob.y - PLAYER_SIZE;
          gameState.player.vy = 0;
          gameState.player.onGround = true;
          if (gameState.jumpPressed) { triggerPlayerJump(); }
        } else {
          die();
          return;
        }
      } else {
        // Bottom hit = death
        die();
        return;
      }
    }
  }

  // Spike collision
  for (const ob of gameState.obstacles) {
    if (ob.type !== "spike") continue;
    if (collidesWithSpike(gameState.player.x, gameState.player.y, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
      die();
      return;
    }
  }

  // Coin pickup
  for (const coin of gameState.coins) {
    if (coin.taken) continue;
    if (!collidesAABB(
      gameState.player.x, gameState.player.y, PLAYER_SIZE, PLAYER_SIZE,
      coin.x - COIN_RADIUS, coin.y - COIN_RADIUS, COIN_RADIUS * 2, COIN_RADIUS * 2
    )) continue;
    coin.taken = true;
    gameState.coinsCollected++;
    bankCoin();
    spawnCoinSparkle(coin.x, coin.y);
  }

  // Fall off screen
  if (gameState.player.y > canvas.height + 100) { die(); return; }

  // Level end
  const levelEnd = getLevelEnd();

  // Progress
  gameState.score = Math.min(100, Math.floor(((gameState.player.x - 100) / (levelEnd - 100)) * 100));

  // Goal crossing: when player reaches the 100% goalpost
  if (gameState.player.x >= levelEnd) {
    gameState.goalCrossed = true;
    gameState.goalFlash = 1.0;
    gameState.winDelay = 0.45;
    spawnGoalCelebration(levelEnd, gameState.player.y + PLAYER_SIZE / 2);
  }
}

export function draw() {
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, BG_COLORS[0]);
  grad.addColorStop(1, BG_COLORS[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Background grid lines (parallax)
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const gridSize = 60;
  const parallax = inLevel() ? gameState.camera * 0.3 : 0;
  for (let x = -parallax % gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Floating ambient specks
  drawAmbientSpecks();

  if (gameState.state === "splash") { drawSplash(); return; }
  if (gameState.state === "start") { drawStartScreen(); return; }
  if (gameState.state === "editor") { drawEditor(); return; }
  if (gameState.state === "levelSelect") { drawLevelSelect(); return; }
  if (gameState.state === "shop") { drawShop(); return; }

  const cx = gameState.camera;

  // 2-layer city skyline in background
  drawCityLayer(gameState.farCityBuildings, CITY_STRIP_W, 0.10, "#130b28", "rgba(255,255,255,0.025)", cx);
  drawCityLayer(gameState.nearCityBuildings, CITY_STRIP_W, 0.25, "#17173b", "rgba(255,255,255,0.045)", cx);

  // Ground with glowing pink line & diagonal texture
  ctx.save();
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const stripeOffset = -((cx * 0.5) % 36);
  ctx.beginPath();
  for (let x = stripeOffset - 36; x < canvas.width + 50; x += 36) {
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x - 30, canvas.height);
  }
  ctx.stroke();
  ctx.strokeStyle = "#ff00d4";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#ff00d4";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();
  ctx.restore();

  // Obstacles
  for (const ob of gameState.obstacles) {
    const sx = ob.x - cx;
    if (sx > canvas.width + 50 || sx + ob.w < -50) continue;

    if (ob.type === "spike") {
      ctx.fillStyle = SPIKE_COLOR;
      ctx.beginPath();
      ctx.moveTo(sx, ob.y);
      ctx.lineTo(sx + ob.w / 2, ob.y - ob.h);
      ctx.lineTo(sx + ob.w, ob.y);
      ctx.closePath();
      ctx.fill();
      // Glow
      ctx.shadowColor = SPIKE_COLOR;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (ob.type === "block") {
      ctx.fillStyle = BLOCK_COLOR;
      ctx.fillRect(sx, ob.y, ob.w, ob.h);
      ctx.strokeStyle = "#6666ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, ob.y, ob.w, ob.h);
    }
  }

  // Coins
  const bobTime = performance.now() / 1000;
  for (const coin of gameState.coins) {
    if (coin.taken) continue;
    const sx = coin.x - cx;
    if (sx > canvas.width + 50 || sx < -50) continue;
    const sy = coin.y + Math.sin(bobTime * 3 + coin.phase) * 4;
    ctx.fillStyle = COIN_COLOR;
    ctx.shadowColor = COIN_COLOR;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sx, sy, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(sx - COIN_RADIUS * 0.25, sy - COIN_RADIUS * 0.3, COIN_RADIUS * 0.22, COIN_RADIUS * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Goal post (at 100% position)
  const levelEnd = getLevelEnd();
  drawGoalPost(levelEnd, cx, gameState.goalCrossed || gameState.state === "win");

  // Jump rings
  drawJumpRings(cx);

  // Player motion trail (vana)
  if (gameState.state === "playing" || gameState.state === "win") {
    drawPlayerTrail(cx);
  }

  // Player
  if (gameState.state === "playing" || gameState.state === "win") {
    ctx.save();
    const px = gameState.player.x - cx + PLAYER_SIZE / 2;
    const py = gameState.player.y + PLAYER_SIZE / 2;
    ctx.translate(px, py);
    ctx.rotate(gameState.player.rotation);
    drawCube(PLAYER_SIZE, equippedColor(), equippedShape());
    ctx.restore();
  }

  // Shockwave ripples
  for (const r of gameState.goalRipples) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, r.life);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3 * r.life;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(r.x - cx, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Particles
  for (const p of gameState.particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cx - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Goal screen flash
  if (gameState.goalFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${gameState.goalFlash * 0.35})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Progress bar
  if (gameState.state !== "win") {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(20, 15, 200, 8);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(20, 15, gameState.score * 2, 8);
    // Goal beam marker on progress bar (100% mark)
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#00ff9f";
    ctx.shadowBlur = 6;
    ctx.fillRect(219, 11, 3, 16);
    ctx.fillStyle = "#00ff9f";
    ctx.fillRect(216, 17, 2, 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = "14px monospace";
    ctx.fillText(gameState.score + "%", 230, 24);

    // Coin counter, omitted in levels that have no coins
    if (gameState.coins.length) {
      ctx.fillStyle = COIN_COLOR;
      ctx.beginPath();
      ctx.arc(300, 19, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillText("x " + gameState.coinsCollected, 314, 24);
    }
  }

  // Death screen
  if (gameState.state === "dead") {
    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = SPIKE_COLOR;
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = SPIKE_COLOR;
    ctx.shadowBlur = 15;
    ctx.fillText("YOU CRASHED!", canvas.width / 2, canvas.height / 2 - 45);
    ctx.shadowBlur = 0;

    if (gameState.playingEditorLevel) {
      drawButton(DEAD_RETRY_BTN_PAIR, "↻ RETRY", {
        stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.18)", pulse: true, textColor: PLAYER_COLOR,
      });
      drawButton(DEAD_EDITOR_BTN, "🛠 EDITOR", {
        stroke: "#ffaa00", fill: "rgba(255,170,0,0.16)", textColor: "#ffaa00",
      });
    } else {
      drawButton(DEAD_RETRY_BTN_SOLO, "↻ RETRY", {
        stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.18)", pulse: true, textColor: PLAYER_COLOR,
      });
    }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      "Tap button or press Space to retry" + (gameState.playingEditorLevel ? "  |  E = editor" : ""),
      canvas.width / 2,
      canvas.height / 2 + 55
    );
    ctx.textAlign = "left";
  }

  // Win screen
  if (gameState.state === "win") {
    drawWinScreen();
  }

  drawButton(HOME_BTN, "HOME");
}
