import {
  GROUND_Y,
  GROUND_COLOR,
  PLAYER_SIZE,
  SPIKE_COLOR,
  BLOCK_COLOR,
  PLAYER_COLOR,
  CITY_STRIP_W,
  EDITOR_SPIKE_BTN,
  EDITOR_BLOCK_BTN,
  EDITOR_ERASER_BTN,
  EDITOR_SCROLL_L_BTN,
  EDITOR_SCROLL_R_BTN,
  EDITOR_PLAY_BTN,
  EDITOR_SAVE_BTN,
  EDITOR_BACK_BTN,
} from "./constants.js";
import { canvas, ctx, drawButton, inRect } from "./canvas.js";
import { saveLevels } from "./storage.js";
import { drawAmbientSpecks, drawCityLayer, drawGoalPost } from "./effects.js";
import { getLevelEnd } from "./level.js";
import { gameState } from "./state.js";

export function snapToGrid(val) {
  return Math.floor(val / PLAYER_SIZE) * PLAYER_SIZE;
}

export function saveLevel() {
  const name = prompt("Level name:", gameState.editorLevelName || "");
  if (!name) return;
  gameState.editorLevelName = name;
  const idx = gameState.savedLevels.findIndex(l => l.name === name);
  const data = {
    name,
    obstacles: gameState.editorObstacles.map(o => ({ type: o.type, x: o.x, y: o.y, w: o.w, h: o.h })),
  };
  if (idx >= 0) gameState.savedLevels[idx] = data;
  else gameState.savedLevels.push(data);
  saveLevels(gameState.savedLevels);
}

export function startEditorLevel() {
  gameState.playingEditorLevel = true;
  gameState.player = { x: 100, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, rotation: 0 };
  gameState.camera = 0;
  gameState.obstacles = gameState.editorObstacles.map(o => ({ ...o }));
  gameState.coins = [];
  gameState.coinsCollected = 0;
  gameState.particles = [];
  gameState.score = 0;
  gameState.goalCrossed = false;
  gameState.winDelay = 0;
  gameState.goalFlash = 0;
  gameState.goalRipples = [];
  gameState.state = "playing";
}

export function editorPointer(p, isRightClick) {
  // If tap is on top toolbar (y <= 48):
  if (p.y <= 48) {
    if (inRect(p, EDITOR_SPIKE_BTN)) { gameState.editorTool = "spike"; return true; }
    if (inRect(p, EDITOR_BLOCK_BTN)) { gameState.editorTool = "block"; return true; }
    if (inRect(p, EDITOR_ERASER_BTN)) { gameState.editorTool = "eraser"; return true; }
    if (inRect(p, EDITOR_SCROLL_L_BTN)) {
      gameState.editorCamera = Math.max(0, gameState.editorCamera - PLAYER_SIZE * 3);
      return true;
    }
    if (inRect(p, EDITOR_SCROLL_R_BTN)) {
      gameState.editorCamera += PLAYER_SIZE * 3;
      return true;
    }
    if (inRect(p, EDITOR_PLAY_BTN)) { startEditorLevel(); return true; }
    if (inRect(p, EDITOR_SAVE_BTN)) {
      saveLevel();
      gameState.editorSavedFeedback = 1.5;
      return true;
    }
    if (inRect(p, EDITOR_BACK_BTN)) { gameState.state = "start"; return true; }
    return true; // Click inside toolbar consumed
  }

  // Otherwise, place or erase obstacle on grid
  const worldX = snapToGrid(p.x + gameState.editorCamera);
  const worldY = snapToGrid(p.y);

  if (isRightClick || gameState.editorTool === "eraser") {
    const idx = gameState.editorObstacles.findIndex(o => {
      if (worldX < o.x || worldX >= o.x + o.w) return false;
      if (o.type === "spike") return worldY >= o.y - o.h && worldY < o.y;
      return worldY >= o.y && worldY < o.y + o.h; // block: y is top-left
    });
    if (idx >= 0) gameState.editorObstacles.splice(idx, 1);
    return true;
  }

  // Check for existing obstacle at this position
  const exists = gameState.editorObstacles.some(
    o => o.x === worldX && o.y === (gameState.editorTool === "spike" ? GROUND_Y : worldY)
  );
  if (exists) return true;

  if (gameState.editorTool === "spike") {
    gameState.editorObstacles.push({ type: "spike", x: worldX, y: GROUND_Y, w: PLAYER_SIZE, h: PLAYER_SIZE });
  } else {
    const py = worldY < GROUND_Y ? worldY : GROUND_Y - PLAYER_SIZE;
    gameState.editorObstacles.push({ type: "block", x: worldX, y: py, w: PLAYER_SIZE, h: PLAYER_SIZE });
  }
  return true;
}

export function drawEditor() {
  const cx = gameState.editorCamera;

  // 2-layer city skyline in editor background
  drawAmbientSpecks();
  drawCityLayer(gameState.farCityBuildings, CITY_STRIP_W, 0.10, "#130b28", "rgba(255,255,255,0.025)", cx);
  drawCityLayer(gameState.nearCityBuildings, CITY_STRIP_W, 0.25, "#17173b", "rgba(255,255,255,0.045)", cx);

  // Ground with glowing pink line
  ctx.save();
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const editorStripeOffset = -((cx * 0.5) % 36);
  ctx.beginPath();
  for (let x = editorStripeOffset - 36; x < canvas.width + 50; x += 36) {
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

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = -(cx % PLAYER_SIZE); x < canvas.width; x += PLAYER_SIZE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_Y); ctx.stroke();
  }
  for (let y = 0; y < GROUND_Y; y += PLAYER_SIZE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Obstacles
  for (const ob of gameState.editorObstacles) {
    const sx = ob.x - cx;
    if (sx > canvas.width + 50 || sx + ob.w < -50) continue;
    if (ob.type === "spike") {
      ctx.fillStyle = SPIKE_COLOR;
      ctx.beginPath();
      ctx.moveTo(sx, ob.y); ctx.lineTo(sx + ob.w / 2, ob.y - ob.h); ctx.lineTo(sx + ob.w, ob.y);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = BLOCK_COLOR;
      ctx.fillRect(sx, ob.y, ob.w, ob.h);
      ctx.strokeStyle = "#6666ff"; ctx.lineWidth = 2;
      ctx.strokeRect(sx, ob.y, ob.w, ob.h);
    }
  }

  // Goal post
  const editorLevelEnd = getLevelEnd(gameState.editorObstacles, true, "editor");
  drawGoalPost(editorLevelEnd, gameState.editorCamera, false);

  // Toolbar
  ctx.fillStyle = "rgba(14, 10, 26, 0.9)";
  ctx.fillRect(0, 0, canvas.width, 48);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(canvas.width, 48); ctx.stroke();

  // Tool buttons
  drawButton(EDITOR_SPIKE_BTN, "▲ SPIKE", gameState.editorTool === "spike"
    ? { stroke: SPIKE_COLOR, fill: "rgba(255,34,85,0.28)", textColor: "#fff" }
    : { stroke: "rgba(255,255,255,0.2)", fill: "rgba(0,0,0,0.4)", textColor: "rgba(255,255,255,0.6)" });

  drawButton(EDITOR_BLOCK_BTN, "■ BLOCK", gameState.editorTool === "block"
    ? { stroke: "#6688ff", fill: "rgba(68,100,255,0.28)", textColor: "#fff" }
    : { stroke: "rgba(255,255,255,0.2)", fill: "rgba(0,0,0,0.4)", textColor: "rgba(255,255,255,0.6)" });

  drawButton(EDITOR_ERASER_BTN, "✖ ERASE", gameState.editorTool === "eraser"
    ? { stroke: "#ff00ff", fill: "rgba(255,0,255,0.28)", textColor: "#fff" }
    : { stroke: "rgba(255,255,255,0.2)", fill: "rgba(0,0,0,0.4)", textColor: "rgba(255,255,255,0.6)" });

  // Camera scroll buttons
  drawButton(EDITOR_SCROLL_L_BTN, "◀", { font: "bold 16px monospace" });
  drawButton(EDITOR_SCROLL_R_BTN, "▶", { font: "bold 16px monospace" });

  // Level info
  ctx.font = "13px monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText((gameState.editorLevelName || "New Level") + " (" + gameState.editorObstacles.length + " obj)", 364, 24);

  // Action buttons
  drawButton(EDITOR_PLAY_BTN, "▶ PLAY", { stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.15)", textColor: PLAYER_COLOR });
  drawButton(EDITOR_SAVE_BTN, gameState.editorSavedFeedback > 0 ? "SAVED!" : "💾 SAVE", { stroke: "#ffd700", fill: "rgba(255,215,0,0.15)", textColor: "#ffd700" });
  drawButton(EDITOR_BACK_BTN, "◀ BACK");

  // Bottom helper text
  ctx.font = "12px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Tap tools or 1/2/3  |  ◀ ▶ or A/D = scroll  |  Tap grid = place/erase  |  SAVE / PLAY / BACK", canvas.width / 2, canvas.height - 12);
  ctx.textAlign = "left";
}
