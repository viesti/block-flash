const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 450;

// Constants
const GROUND_Y = 350;
const PLAYER_SIZE = 36;
const GRAVITY = 2800;
const JUMP_VEL = -750;
const GAME_SPEED = 400;
const LEVEL_LENGTH = 8000;

// Colors
const BG_COLORS = ["#1a0a2e", "#16213e", "#0f3460", "#533483"];
const PLAYER_COLOR = "#00ff88";
const GROUND_COLOR = "#1a1a2e";
const SPIKE_COLOR = "#ff2255";
const BLOCK_COLOR = "#4444ff";
const ACCENT = "#ff00ff";

// State
let state = "start"; // start | playing | dead | win | editor | levelSelect
let player, camera, obstacles, particles, score, deathTime;
let jumpPressed = false;
let lastTime = 0;

// Editor state
let editorTool = "spike"; // "spike" | "block" | "eraser"
let editorCamera = 0;
let editorObstacles = [];
let editorLevelName = null;
let savedLevels = loadLevels();
let playingEditorLevel = false;
let levelSelectCopyNext = false;

// URL sharing
function serializeLevel(name, obstacles) {
  return name + "~" + obstacles.map(o => {
    let code;
    if (o.type === "spike") code = "s";
    else if (o.w === 72 && o.h === 72) code = "B";
    else if (o.w === 108 && o.h === 36) code = "w";
    else code = "b";
    return code + "-" + o.x + "-" + o.y;
  }).join("~");
}

function deserializeLevel(str) {
  const codes = {s: ["spike",36,36], b: ["block",36,36], B: ["block",72,72], w: ["block",108,36]};
  const parts = str.split("~");
  const name = parts[0];
  const obstacles = parts.slice(1).map(s => {
    const f = s.split("-");
    if (f.length === 5) {
      const [t, x, y, w, h] = f;
      return {type: t === "s" ? "spike" : "block", x: +x, y: +y, w: +w, h: +h};
    }
    const [t, x, y] = f;
    const [type, w, h] = codes[t] || ["block",36,36];
    return {type, x: +x, y: +y, w, h};
  });
  return {name, obstacles};
}

function getLevelURL(name, obstacles) {
  const base = window.location.origin + window.location.pathname;
  return base + "?level=" + encodeURIComponent(serializeLevel(name, obstacles));
}

function checkURLLevel() {
  const params = new URLSearchParams(window.location.search);
  const levelData = params.get("level");
  if (!levelData) return false;
  try {
    const {name, obstacles} = deserializeLevel(decodeURIComponent(levelData));
    editorObstacles = obstacles;
    editorLevelName = name || "Shared Level";
    playingEditorLevel = true;
    reset(editorObstacles);
    state = "playing";
    return true;
  } catch { return false; }
}

function loadLevels() {
  try { return JSON.parse(localStorage.getItem("gdash_levels") || "[]"); }
  catch { return []; }
}

function saveLevelsToStorage() {
  localStorage.setItem("gdash_levels", JSON.stringify(savedLevels));
}

function snapToGrid(val) {
  return Math.floor(val / PLAYER_SIZE) * PLAYER_SIZE;
}

function saveLevel() {
  const name = prompt("Level name:", editorLevelName || "");
  if (!name) return;
  editorLevelName = name;
  const idx = savedLevels.findIndex(l => l.name === name);
  const data = { name, obstacles: editorObstacles.map(o => ({type:o.type, x:o.x, y:o.y, w:o.w, h:o.h})) };
  if (idx >= 0) savedLevels[idx] = data; else savedLevels.push(data);
  saveLevelsToStorage();
}

function startEditorLevel() {
  playingEditorLevel = true;
  player = { x: 100, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, rotation: 0 };
  camera = 0;
  obstacles = editorObstacles.map(o => ({...o}));
  particles = [];
  score = 0;
  state = "playing";
}

function editorClick(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const worldX = snapToGrid(mx + editorCamera);
  const worldY = snapToGrid(my);

  if (e.button === 2 || editorTool === "eraser") {
    // Delete obstacle at position
    const idx = editorObstacles.findIndex(o => {
      if (worldX < o.x || worldX >= o.x + o.w) return false;
      if (o.type === "spike") return worldY >= o.y - o.h && worldY < o.y;
      return worldY >= o.y && worldY < o.y + o.h; // block: y is top-left
    });
    if (idx >= 0) editorObstacles.splice(idx, 1);
    return;
  }

  // Check for existing obstacle at this position
  const exists = editorObstacles.some(o => o.x === worldX && o.y === (editorTool === "spike" ? GROUND_Y : worldY));
  if (exists) return;

  if (editorTool === "spike") {
    editorObstacles.push({ type: "spike", x: worldX, y: GROUND_Y, w: PLAYER_SIZE, h: PLAYER_SIZE });
  } else {
    const py = worldY < GROUND_Y ? worldY : GROUND_Y - PLAYER_SIZE;
    editorObstacles.push({ type: "block", x: worldX, y: py, w: PLAYER_SIZE, h: PLAYER_SIZE });
  }
}

function drawEditor() {
  const cx = editorCamera;

  // Ground
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, GROUND_Y, canvas.width, 2);

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
  for (const ob of editorObstacles) {
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

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = "16px monospace";
  ctx.textAlign = "left";
  ctx.fillText("EDITOR" + (editorLevelName ? " - " + editorLevelName : ""), 20, 30);
  ctx.fillText("Tool: " + editorTool.toUpperCase() + " [1=spike 2=block 3=eraser]", 20, 55);
  ctx.font = "13px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Click=place  RightClick=delete  S=save  E=play  Esc=back  ←→=scroll", 20, canvas.height - 15);
}

function drawLevelSelect() {
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 32px monospace";
  ctx.textAlign = "center";
  ctx.fillText("SELECT LEVEL", canvas.width / 2, 60);

  ctx.font = "18px monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText("0: Random Level", canvas.width / 2, 110);

  for (let i = 0; i < savedLevels.length; i++) {
    const y = 145 + i * 35;
    if (y > canvas.height - 40) break;
    ctx.fillStyle = "#fff";
    ctx.fillText((i + 1) + ": " + savedLevels[i].name + " (" + savedLevels[i].obstacles.length + " objects)", canvas.width / 2, y);
  }

  ctx.font = "14px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Press number to select  |  C+number = copy URL  |  Esc = back", canvas.width / 2, canvas.height - 20);
  ctx.textAlign = "left";
}

function buildLevel() {
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

function reset(customObstacles) {
  player = { x: 100, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, rotation: 0 };
  camera = 0;
  obstacles = customObstacles ? customObstacles.map(o => ({...o})) : buildLevel();
  particles = [];
  score = 0;
}

function spawnParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 600,
      vy: (Math.random() - 0.5) * 600,
      life: 1,
      color: [PLAYER_COLOR, ACCENT, "#ffff00", "#ff4444"][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 5,
    });
  }
}

// Input
function onJump() {
  if (state === "editor" || state === "levelSelect") return;
  if (state === "start") { state = "playing"; playingEditorLevel = false; reset(); return; }
  if (state === "dead" && performance.now() - deathTime > 500) {
    if (playingEditorLevel) { reset(editorObstacles); } else { reset(); }
    state = "playing"; return;
  }
  if (state === "win") {
    if (playingEditorLevel) { reset(editorObstacles); } else { reset(); }
    state = "playing"; return;
  }
  if (state === "playing" && player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (!jumpPressed) { jumpPressed = true; onJump(); }
  }
  if (e.code === "KeyE") {
    if (state === "start") {
      state = "editor"; editorObstacles = []; editorCamera = 0; editorLevelName = null; return;
    }
    if (state === "editor") { startEditorLevel(); return; }
    if ((state === "playing" || state === "dead" || state === "win") && playingEditorLevel) { state = "editor"; return; }
  }
  if (e.code === "KeyL" && state === "start") { state = "levelSelect"; return; }
  if (e.code === "Escape") {
    if (state === "editor" || state === "levelSelect") { state = "start"; return; }
  }
  if (state === "editor") {
    if (e.code === "Digit1") editorTool = "spike";
    if (e.code === "Digit2") editorTool = "block";
    if (e.code === "Digit3") editorTool = "eraser";
    if (e.code === "KeyS") saveLevel();
    if (e.code === "ArrowLeft" || e.code === "KeyA") editorCamera = Math.max(0, editorCamera - PLAYER_SIZE * 3);
    if (e.code === "ArrowRight" || e.code === "KeyD") editorCamera += PLAYER_SIZE * 3;
  }
  if (state === "levelSelect" && e.code === "KeyC") { levelSelectCopyNext = true; return; }
  if (state === "levelSelect") {
    const num = parseInt(e.key);
    if (levelSelectCopyNext && !isNaN(num) && num >= 1 && num <= savedLevels.length) {
      const lv = savedLevels[num - 1];
      navigator.clipboard.writeText(getLevelURL(lv.name, lv.obstacles));
      levelSelectCopyNext = false;
      return;
    }
    levelSelectCopyNext = false;
    if (num === 0) { state = "playing"; playingEditorLevel = false; reset(); return; }
    if (!isNaN(num) && num >= 1 && num <= savedLevels.length) {
      editorObstacles = savedLevels[num - 1].obstacles.map(o => ({...o}));
      editorLevelName = savedLevels[num - 1].name;
      playingEditorLevel = true;
      reset(editorObstacles);
      state = "playing";
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") jumpPressed = false;
});
canvas.addEventListener("mousedown", (e) => {
  if (state === "editor") { editorClick(e); return; }
  onJump();
});
canvas.addEventListener("contextmenu", (e) => { if (state === "editor") e.preventDefault(); });
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); onJump(); });

// Collision
function collidesWithSpike(px, py, ps, sx, sy, sw, sh) {
  // Spike is drawn from base at sy upward to sy - sh
  const margin = sw * 0.2;
  return px + ps > sx + margin && px < sx + sw - margin && py + ps > sy - sh && py < sy;
}

function collidesAABB(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax + aw > bx && ax < bx + bw && ay + ah > by && ay < by + bh;
}

// Update
function update(dt) {
  if (state !== "playing") {
    // Update particles even when dead
    particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.life -= dt * 1.5; });
    particles = particles.filter((p) => p.life > 0);
    return;
  }

  // Move player forward
  player.x += GAME_SPEED * dt;
  camera = player.x - 100;

  // Gravity
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;

  // Ground collision
  if (player.y + PLAYER_SIZE >= GROUND_Y) {
    player.y = GROUND_Y - PLAYER_SIZE;
    player.vy = 0;
    player.onGround = true;
  }

  // Rotation (visual spin when airborne)
  if (!player.onGround) {
    player.rotation += 6 * dt;
  } else {
    player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
  }

  // Block landing (stand on blocks)
  for (const ob of obstacles) {
    if (ob.type !== "block") continue;
    if (collidesAABB(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
      // Determine overlap direction
      const overlapBottom = (player.y + PLAYER_SIZE) - ob.y;
      const overlapTop = (ob.y + ob.h) - player.y;
      const overlapLeft = (player.x + PLAYER_SIZE) - ob.x;
      const overlapRight = (ob.x + ob.w) - player.x;
      const minOverlap = Math.min(overlapBottom, overlapTop, overlapLeft, overlapRight);

      if (minOverlap === overlapBottom && player.vy >= 0) {
        player.y = ob.y - PLAYER_SIZE;
        player.vy = 0;
        player.onGround = true;
      } else if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        // Check if player is supported by an adjacent block at the same height
        const supported = obstacles.some(other =>
          other.type === "block" && other !== ob &&
          other.y === ob.y &&
          player.x + PLAYER_SIZE > other.x && player.x < other.x + other.w &&
          player.y + PLAYER_SIZE <= other.y + 4
        );
        if (supported || (player.vy >= 0 && overlapBottom <= 8)) {
          player.y = ob.y - PLAYER_SIZE;
          player.vy = 0;
          player.onGround = true;
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
  for (const ob of obstacles) {
    if (ob.type !== "spike") continue;
    if (collidesWithSpike(player.x, player.y, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
      die();
      return;
    }
  }

  // Fall off screen
  if (player.y > canvas.height + 100) { die(); return; }

  // Level end
  const levelEnd = playingEditorLevel
    ? Math.max(LEVEL_LENGTH, ...obstacles.map(o => o.x + o.w + 200))
    : LEVEL_LENGTH;

  // Progress
  score = Math.min(100, Math.floor(((player.x - 100) / (levelEnd - 100)) * 100));

  // Win
  if (player.x >= levelEnd) {
    state = "win";
  }
}

function die() {
  spawnParticles(player.x - camera + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);
  state = "dead";
  deathTime = performance.now();
}

// Render
function draw() {
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
  const parallax = state === "playing" || state === "dead" || state === "win" ? camera * 0.3 : 0;
  for (let x = -parallax % gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (state === "start") { drawStartScreen(); return; }
  if (state === "editor") { drawEditor(); return; }
  if (state === "levelSelect") { drawLevelSelect(); return; }

  const cx = camera;

  // Ground
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, GROUND_Y, canvas.width, 2);

  // Obstacles
  for (const ob of obstacles) {
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

  // Player
  if (state === "playing") {
    ctx.save();
    const px = player.x - cx + PLAYER_SIZE / 2;
    const py = player.y + PLAYER_SIZE / 2;
    ctx.translate(px, py);
    ctx.rotate(player.rotation);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.shadowColor = PLAYER_COLOR;
    ctx.shadowBlur = 15;
    ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    ctx.shadowBlur = 0;
    // Inner detail
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(-PLAYER_SIZE / 4, -PLAYER_SIZE / 4, PLAYER_SIZE / 2, PLAYER_SIZE / 2);
    ctx.restore();
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Progress bar
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(20, 15, 200, 8);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(20, 15, score * 2, 8);
  ctx.fillStyle = "#fff";
  ctx.font = "14px monospace";
  ctx.fillText(score + "%", 230, 24);

  // Death screen
  if (state === "dead") {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = SPIKE_COLOR;
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillText("YOU CRASHED!", canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = "#fff";
    ctx.font = "16px monospace";
    ctx.fillText("Click or press Space to retry", canvas.width / 2, canvas.height / 2 + 20);
    if (playingEditorLevel) { ctx.fillText("E = back to editor", canvas.width / 2, canvas.height / 2 + 50); }
    ctx.textAlign = "left";
  }

  // Win screen
  if (state === "win") {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LEVEL COMPLETE!", canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = "#fff";
    ctx.font = "16px monospace";
    ctx.fillText("Click or press Space to play again", canvas.width / 2, canvas.height / 2 + 20);
    if (playingEditorLevel) { ctx.fillText("E = back to editor", canvas.width / 2, canvas.height / 2 + 50); }
    ctx.textAlign = "left";
  }
}

function drawStartScreen() {
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 48px monospace";
  ctx.textAlign = "center";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 20;
  ctx.fillText("GEOMETRY DASH", canvas.width / 2, canvas.height / 2 - 40);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#fff";
  ctx.font = "18px monospace";
  ctx.fillText("Click or press Space to start", canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = "14px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("E = Level Editor  |  L = Saved Levels", canvas.width / 2, canvas.height / 2 + 50);

  // Animated player icon
  const t = performance.now() / 1000;
  const by = Math.sin(t * 3) * 10;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2 + 80 + by);
  ctx.rotate(t * 2);
  ctx.fillStyle = PLAYER_COLOR;
  ctx.shadowColor = PLAYER_COLOR;
  ctx.shadowBlur = 15;
  ctx.fillRect(-18, -18, 36, 36);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.textAlign = "left";
}

// Game loop
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

if (!checkURLLevel()) { reset(); }
requestAnimationFrame((t) => { lastTime = t; loop(t); });
