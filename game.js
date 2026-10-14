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
const COIN_RADIUS = 11;
const COIN_HOVER = 13;
// Kept clear of the obstacle behind and the one ahead, so a coin lands where the
// player runs rather than where it is mid-jump.
const COIN_LAND_INSET = PLAYER_SIZE * 1.5;
const COIN_TAKEOFF_INSET = PLAYER_SIZE * 2;
// Granularity of the reachability search that vets coin positions.
const SOLVE_DT = 1 / 120;
const SOLVE_QUANT = 12;

// Colors
const BG_COLORS = ["#1a0a2e", "#16213e", "#0f3460", "#533483"];
const PLAYER_COLOR = "#00ff88";
const GROUND_COLOR = "#1a1a2e";
const SPIKE_COLOR = "#ff2255";
const BLOCK_COLOR = "#4444ff";
const ACCENT = "#ff00ff";
const COIN_COLOR = "#ffd633";

// State
let state = "splash"; // splash | start | playing | dead | win | editor | levelSelect | shop
let player, camera, obstacles, coins, coinsCollected, particles, score, deathTime;
let jumpPressed = false;
let lastTime = 0;
let goalCrossed = false;
let winDelay = 0;
let goalFlash = 0;
let goalRipples = [];
let winTime = 0;
let winStartTime = 0;
let winRayAngle = 0;
let winConfetti = [];
let winFireworks = [];
let winNextFirework = 0;

function getLevelEnd(obs = obstacles) {
  return playingEditorLevel || state === "editor"
    ? Math.max(LEVEL_LENGTH, ...(obs || []).map(o => o.x + o.w + 200))
    : LEVEL_LENGTH;
}

// Music: one track for a level run, another for every menu screen
const levelMusic = new Audio("High-Voltage_Club.mp3");
const menuMusic = new Audio("Relaxing_Techno.mp3");
for (const track of [levelMusic, menuMusic]) {
  track.loop = true;
  track.volume = 0.5;
}
let currentTrack = null;

function playTrack(track) {
  track.play().catch(() => {});
}

// "Inside a level" covers the run itself plus the death and win screens, so the
// track keeps going across retries.
function inLevel() {
  return state === "playing" || state === "dead" || state === "win";
}

function syncMusic() {
  const wanted = inLevel() ? levelMusic : menuMusic;
  if (wanted === currentTrack) return;
  if (currentTrack) currentTrack.pause();
  currentTrack = wanted;
  wanted.currentTime = 0;
  playTrack(wanted);
}

// Autoplay is blocked until the page has seen a gesture, so the first input of
// the session starts whichever track is already selected.
function resumeMusic() {
  if (currentTrack && currentTrack.paused) playTrack(currentTrack);
}

// Editor state
let editorTool = "spike"; // "spike" | "block" | "eraser"
let editorCamera = 0;
let editorObstacles = [];
let editorLevelName = null;
let savedLevels = loadLevels();
let coinTotal = loadCoinTotal();
let playingEditorLevel = false;
let levelSelectCopyNext = false;

// Attempt tracking (per-level attempt count saved in localStorage)
function getAttemptKey() {
  return playingEditorLevel
    ? "gdash_attempts_" + (editorLevelName || "editor")
    : "gdash_attempts_main";
}

function loadAttempts() {
  const stored = parseInt(localStorage.getItem(getAttemptKey()), 10);
  return isNaN(stored) || stored < 1 ? 1 : stored;
}

function saveAttempts() {
  try { localStorage.setItem(getAttemptKey(), attemptCount); } catch {}
}

let attemptCount = loadAttempts();

function nextAttempt() {
  attemptCount++;
  saveAttempts();
}

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
  const urlAttempts = params.get("attempts");
  if (urlAttempts && !isNaN(parseInt(urlAttempts, 10))) {
    attemptCount = parseInt(urlAttempts, 10);
  }
  const urlCoins = params.get("coins");
  if (urlCoins && !isNaN(parseInt(urlCoins, 10))) {
    coinTotal = parseInt(urlCoins, 10);
  }
  const testWin = params.get("win") === "1" || params.get("testwin") === "1";
  if (levelData) {
    try {
      const {name, obstacles} = deserializeLevel(decodeURIComponent(levelData));
      editorObstacles = obstacles;
      editorLevelName = name || "Shared Level";
      playingEditorLevel = true;
      reset(editorObstacles);
      state = testWin ? "win" : "playing";
      if (testWin) initWinCelebration();
      return true;
    } catch { return false; }
  }
  if (testWin) {
    reset();
    state = "win";
    initWinCelebration();
    return true;
  }
  return false;
}

function loadCoinTotal() {
  const stored = parseInt(localStorage.getItem("gdash_coins"), 10);
  return isNaN(stored) ? 0 : stored;
}

function saveCoins() {
  localStorage.setItem("gdash_coins", coinTotal);
}

function bankCoin() {
  coinTotal++;
  saveCoins();
}

// Shop catalogue. The zero-price entries are owned from the start so the player
// can always switch back to the plain green cube.
const SHOP_ITEMS = [
  {id: "c_green",   kind: "color", name: "GREEN",   price: 0,  value: PLAYER_COLOR},
  {id: "c_cyan",    kind: "color", name: "CYAN",    price: 500,  value: "#00d4ff"},
  {id: "c_pink",    kind: "color", name: "PINK",    price: 1000, value: "#ff2e88"},
  {id: "c_gold",    kind: "color", name: "GOLD",    price: 1500, value: "#ffc93c"},
  {id: "s_square",  kind: "shape", name: "CLASSIC", price: 0,  value: "square"},
  {id: "s_round",   kind: "shape", name: "ROUNDED", price: 2000, value: "rounded"},
  {id: "s_diamond", kind: "shape", name: "DIAMOND", price: 3000, value: "diamond"},
  {id: "s_ring",    kind: "shape", name: "RING",    price: 4000, value: "ring"},
];
const FREE_ITEMS = SHOP_ITEMS.filter(it => it.price === 0).map(it => it.id);

function itemById(id) {
  return SHOP_ITEMS.find(it => it.id === id);
}

function loadOwned() {
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem("gdash_owned") || "[]"); }
  catch { stored = []; }
  const ids = Array.isArray(stored) ? stored.filter(id => itemById(id)) : [];
  return [...new Set([...FREE_ITEMS, ...ids])];
}

function saveOwned() {
  localStorage.setItem("gdash_owned", JSON.stringify(owned));
}

function loadEquipped() {
  const fallback = {color: "c_green", shape: "s_square"};
  let stored;
  try { stored = JSON.parse(localStorage.getItem("gdash_equip") || "null"); }
  catch { stored = null; }
  if (!stored) return fallback;
  const out = {...fallback};
  for (const kind of ["color", "shape"]) {
    const item = itemById(stored[kind]);
    if (item && item.kind === kind) out[kind] = item.id;
  }
  return out;
}

function saveEquipped() {
  localStorage.setItem("gdash_equip", JSON.stringify(equipped));
}

function equippedColor() {
  return itemById(equipped.color).value;
}

function equippedShape() {
  return itemById(equipped.shape).value;
}

// True while some cube the player does not own is within reach of the purse.
function shopHasAffordable() {
  return SHOP_ITEMS.some(it => !owned.includes(it.id) && coinTotal >= it.price);
}

let owned = loadOwned();
let equipped = loadEquipped();

function shopSelect(i) {
  const item = SHOP_ITEMS[i];
  if (!item) return;
  if (!owned.includes(item.id)) {
    if (coinTotal < item.price) return;
    coinTotal -= item.price;
    saveCoins();
    owned.push(item.id);
    saveOwned();
  }
  equipped[item.kind] = item.id;
  saveEquipped();
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
  coins = [];
  coinsCollected = 0;
  particles = [];
  score = 0;
  goalCrossed = false;
  winDelay = 0;
  goalFlash = 0;
  goalRipples = [];
  state = "playing";
}

// Maps a viewport point to canvas coordinates, undoing the letterboxed scaling.
function canvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const offsetX = (rect.width - canvas.width * scale) / 2;
  const offsetY = (rect.height - canvas.height * scale) / 2;
  return {x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale};
}

function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function editorClick(e) {
  const {x: mx, y: my} = canvasPos(e.clientX, e.clientY);
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

// Draws a cube centred on the current transform origin. The caller owns any
// rotation, so the run's spin and the shop's static preview share one path.
function drawCube(size, color, shape) {
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.42;
  if (shape === "rounded") {
    ctx.beginPath();
    ctx.roundRect(-h, -h, size, size, size * 0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(-size / 4, -size / 4, size / 2, size / 2, size * 0.15);
    ctx.fill();
  } else if (shape === "diamond") {
    ctx.rotate(Math.PI / 4);
    const d = size * 0.76;
    ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(-d / 4, -d / 4, d / 2, d / 2);
    ctx.rotate(-Math.PI / 4);
  } else if (shape === "ring") {
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.2;
    ctx.strokeRect(-h + size * 0.1, -h + size * 0.1, size * 0.8, size * 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillRect(-h, -h, size, size);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(-size / 4, -size / 4, size / 2, size / 2);
  }
  ctx.shadowBlur = 0;
}

// Shop layout
const SHOP_COLS = 4;
const SHOP_TILE_W = 160;
const SHOP_TILE_H = 132;
const SHOP_GAP = 20;
const SHOP_X0 = (800 - (SHOP_COLS * SHOP_TILE_W + (SHOP_COLS - 1) * SHOP_GAP)) / 2;
const SHOP_Y0 = 92;
const SHOP_BACK_BTN = {x: 40, y: 400, w: 110, h: 34};
const START_SHOP_BTN = {x: 640, y: 18, w: 140, h: 36};
// Sits clear of the progress bar and coin counter, which hug the top left.
const HOME_BTN = {x: 690, y: 12, w: 96, h: 30};

// Draws a rounded menu button. A truthy `pulse` makes the outline breathe.
function drawButton(r, label, opts = {}) {
  ctx.fillStyle = opts.fill || "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.globalAlpha = opts.pulse ? 0.55 + 0.45 * Math.sin(performance.now() / 220) : 1;
  ctx.strokeStyle = opts.stroke || "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 5);
  ctx.textAlign = "left";
}

// Leaves a run for the main menu. The next start press builds a fresh level.
function goHome() {
  state = "start";
  playingEditorLevel = false;
}

function shopTileRect(i) {
  const col = i % SHOP_COLS;
  const row = Math.floor(i / SHOP_COLS);
  return {
    x: SHOP_X0 + col * (SHOP_TILE_W + SHOP_GAP),
    y: SHOP_Y0 + row * (SHOP_TILE_H + SHOP_GAP),
    w: SHOP_TILE_W,
    h: SHOP_TILE_H,
  };
}

function drawCoinIcon(x, y, r) {
  ctx.fillStyle = COIN_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawShop() {
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);

  ctx.textAlign = "center";
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 32px monospace";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 16;
  ctx.fillText("SHOP", canvas.width / 2, 52);
  ctx.shadowBlur = 0;

  // Purse
  ctx.font = "18px monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "#fff";
  ctx.fillText(String(coinTotal), canvas.width - 40, 46);
  drawCoinIcon(canvas.width - 40 - ctx.measureText(String(coinTotal)).width - 16, 40, 9);

  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const item = SHOP_ITEMS[i];
    const r = shopTileRect(i);
    const isOwned = owned.includes(item.id);
    const isEquipped = equipped[item.kind] === item.id;
    const canBuy = !isOwned && coinTotal >= item.price;

    ctx.fillStyle = isEquipped ? "rgba(255,0,255,0.10)"
      : canBuy ? "rgba(0,255,136,0.10)"
      : "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();

    if (isEquipped) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3;
    } else if (canBuy) {
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = PLAYER_COLOR;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Index, so the tiles can also be picked from the keyboard
    ctx.textAlign = "left";
    ctx.font = "12px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(String(i + 1), r.x + 10, r.y + 20);

    // Owned cubes read as spent: dimmed unless they are the ones in play
    ctx.globalAlpha = isOwned && !isEquipped ? 0.4 : 1;
    const color = item.kind === "color" ? item.value : equippedColor();
    const shape = item.kind === "shape" ? item.value : equippedShape();
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + 48);
    drawCube(44, color, shape);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText(item.name, r.x + r.w / 2, r.y + 92);
    ctx.globalAlpha = 1;

    ctx.font = "13px monospace";
    if (isEquipped) {
      ctx.fillStyle = ACCENT;
      ctx.fillText("EQUIPPED", r.x + r.w / 2, r.y + 114);
    } else if (isOwned) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText("OWNED - TAP TO WEAR", r.x + r.w / 2, r.y + 114);
    } else {
      const price = String(item.price);
      const priceW = ctx.measureText(price).width;
      ctx.globalAlpha = canBuy ? 1 : 0.45;
      drawCoinIcon(r.x + r.w / 2 - priceW / 2 - 12, r.y + 110, 7);
      ctx.fillStyle = canBuy ? COIN_COLOR : "rgba(255,255,255,0.5)";
      ctx.textAlign = "left";
      ctx.fillText(price, r.x + r.w / 2 - priceW / 2 + 2, r.y + 114);
      ctx.globalAlpha = 1;
    }
  }

  drawButton(SHOP_BACK_BTN, "BACK");

  ctx.textAlign = "center";
  ctx.font = "14px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Tap an item to buy or wear it  |  1-8 = select  |  Esc = back", canvas.width / 2 + 50, 422);
  ctx.textAlign = "left";
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

  // Goal post
  const editorLevelEnd = getLevelEnd(editorObstacles);
  drawGoalPost(editorLevelEnd, editorCamera, false);

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

function obstacleTop(ob) {
  return ob.type === "spike" ? ob.y - ob.h : ob.y;
}

function obstacleBottom(ob) {
  return ob.type === "spike" ? ob.y : ob.y + ob.h;
}

// Stretches of ground the player can run along, split by whatever rests on it.
function groundRuns(obstacles) {
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
function standSurfaces(obstacles) {
  return [{ x: -Infinity, w: Infinity, top: GROUND_Y }].concat(
    obstacles.filter(ob => ob.type === "block").map(ob => ({ x: ob.x, w: ob.w, top: ob.y })));
}

// Resolve one simulated frame the way update() does, so the search agrees with
// the collisions the player will actually experience. Returns false on death.
function resolveSim(p, obstacles) {
  for (const ob of obstacles) {
    if (ob.type === "spike") {
      if (collidesWithSpike(p.x, p.y, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) return false;
      continue;
    }
    if (!collidesAABB(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) continue;
    const bottom = (p.y + PLAYER_SIZE) - ob.y;
    const top = (ob.y + ob.h) - p.y;
    const left = (p.x + PLAYER_SIZE) - ob.x;
    const right = (ob.x + ob.w) - p.x;
    const least = Math.min(bottom, top, left, right);
    if (least === bottom && p.vy >= 0) { p.y = ob.y - PLAYER_SIZE; p.vy = 0; p.onGround = true; continue; }
    if (least === left || least === right) {
      const propped = obstacles.some(other =>
        other.type === "block" && other !== ob && other.y === ob.y &&
        p.x + PLAYER_SIZE > other.x && p.x < other.x + other.w &&
        p.y + PLAYER_SIZE <= other.y + 4);
      if (propped || (p.vy >= 0 && bottom <= PLAYER_SIZE / 2)) {
        p.y = ob.y - PLAYER_SIZE; p.vy = 0; p.onGround = true; continue;
      }
    }
    return false;
  }
  return true;
}

// Which candidates a surviving run can actually touch. Jumping or holding is the
// only choice the player has, so every standing position the level allows can be
// enumerated, and a candidate counts only if some path sweeps it before dying.
function sweptCoins(obstacles, candidates) {
  const surfaces = standSurfaces(obstacles);
  const swept = new Set();
  const supported = (x, top) => surfaces.some(s =>
    Math.abs(s.top - top) < 0.001 && x + PLAYER_SIZE > s.x && x < s.x + s.w);

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
function placeCoins(obstacles) {
  const placed = [];

  function overSpike(x) {
    return obstacles.some(ob => ob.type === "spike" &&
      x + COIN_RADIUS > ob.x - PLAYER_SIZE && x - COIN_RADIUS < ob.x + ob.w + PLAYER_SIZE);
  }

  function standClear(x, surface) {
    return !obstacles.some(ob => collidesAABB(
      x - PLAYER_SIZE / 2, surface - PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE,
      ob.x, obstacleTop(ob), ob.w, obstacleBottom(ob) - obstacleTop(ob)));
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

function reset(customObstacles) {
  player = { x: 100, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, rotation: 0 };
  camera = 0;
  obstacles = customObstacles ? customObstacles.map(o => ({...o})) : buildLevel();
  coins = customObstacles ? [] : placeCoins(obstacles);
  coinsCollected = 0;
  particles = [];
  score = 0;
  goalCrossed = false;
  winDelay = 0;
  goalFlash = 0;
  goalRipples = [];
}

function spawnParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 600,
      vy: (Math.random() - 0.5) * 600,
      life: 1,
      color: [equippedColor(), ACCENT, "#ffff00", "#ff4444"][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 5,
    });
  }
}

function spawnCoinSparkle(x, y) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 260,
      vy: -Math.random() * 260,
      life: 1,
      color: [COIN_COLOR, "#fff8b0"][Math.floor(Math.random() * 2)],
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnGoalCelebration(gx, py) {
  // Shockwave rings expanding from the gate
  goalRipples.push({ x: gx, y: py, r: 8, life: 1 });
  goalRipples.push({ x: gx + 44, y: py, r: 4, life: 1 });

  // Confetti / fireworks particles
  const colors = ["#ffffff", equippedColor(), "#ffd700", "#ff00ff", "#00ffff", "#ffea00"];
  for (let i = 0; i < 55; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 450;
    particles.push({
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

// Win celebration system (Geometry Dash style victory screen)
function initWinCelebration() {
  winTime = 0;
  winStartTime = performance.now();
  winRayAngle = 0;
  winConfetti = [];
  winFireworks = [];
  winNextFirework = 0.8;

  // Populate screen with confetti
  const confettiColors = ["#00f0ff", "#ff0099", "#ffe600", "#00ff66", "#ffffff", "#7038ff"];
  for (let i = 0; i < 90; i++) {
    winConfetti.push({
      x: Math.random() * canvas.width,
      y: Math.random() * (canvas.height + 40) - 40,
      w: 5 + Math.random() * 4,
      h: 8 + Math.random() * 8,
      vx: (Math.random() - 0.5) * 45,
      vy: 40 + Math.random() * 95,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 3,
      flip: Math.random() * Math.PI * 2,
      vFlip: 3 + Math.random() * 4,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Initial fireworks (one at top-right exactly like image, one on left)
  spawnFirework(680, 95);
  spawnFirework(170, 160);
}

function spawnFirework(x, y) {
  const count = 30;
  const spokes = [];
  const palette = ["#00f0ff", "#2979ff", "#ff1493", "#ffffff", "#ffee00", "#00e5ff"];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const dashLen = 8 + Math.random() * 8;
    spokes.push({ angle, color, dashLen });
  }
  winFireworks.push({
    x, y,
    radius: 6,
    maxRadius: 52 + Math.random() * 20,
    spokes,
    life: 1.0,
    maxLife: 1.2 + Math.random() * 0.3,
  });
}

function updateWinCelebration(dt) {
  winTime += dt;
  winRayAngle += dt * 0.14;

  for (const p of winConfetti) {
    p.x += (p.vx + Math.sin(winTime * 2 + p.phase) * 18) * dt;
    p.y += p.vy * dt;
    p.rot += p.vRot * dt;
    p.flip += p.vFlip * dt;
    if (p.y > canvas.height + 20) {
      p.y = -20;
      p.x = Math.random() * canvas.width;
    }
  }

  winNextFirework -= dt;
  if (winNextFirework <= 0) {
    spawnFirework(120 + Math.random() * 560, 50 + Math.random() * 150);
    winNextFirework = 0.9 + Math.random() * 0.8;
  }

  for (const fw of winFireworks) {
    fw.life -= dt;
  }
  winFireworks = winFireworks.filter(fw => fw.life > 0);
}

function drawTitleLine(text, cx, y, fontSize, gradY1, gradY2) {
  ctx.save();
  ctx.font = `900 ${fontSize}px 'Arial Black', Impact, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const grad = ctx.createLinearGradient(0, gradY1, 0, gradY2);
  grad.addColorStop(0, "#fffb66");
  grad.addColorStop(0.35, "#ffea00");
  grad.addColorStop(0.72, "#ccff55");
  grad.addColorStop(1, "#74ffb6");

  // Pass 1: Wide neon yellow bloom
  ctx.shadowColor = "#ffea00";
  ctx.shadowBlur = 38;
  ctx.fillStyle = "#ffea00";
  ctx.fillText(text, cx, y);

  // Pass 2: Core bloom
  ctx.shadowColor = "#ffc400";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, cx, y);

  // Pass 3: Dark contrast outline
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(10, 18, 28, 0.88)";
  ctx.lineWidth = 7;
  ctx.strokeText(text, cx, y);

  // Pass 4: Gradient fill
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, y);

  // Pass 5: Crisp bright edge highlight
  ctx.strokeStyle = "rgba(255, 255, 230, 0.92)";
  ctx.lineWidth = 2.2;
  ctx.strokeText(text, cx, y);

  ctx.restore();
}

function drawDetailedCoin(x, y, r) {
  ctx.save();
  ctx.shadowColor = "#ffd700";
  ctx.shadowBlur = 8;
  const cGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  cGrad.addColorStop(0, "#fff176");
  cGrad.addColorStop(0.5, "#ffd700");
  cGrad.addColorStop(1, "#ff9800");
  ctx.fillStyle = cGrad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.22, r * 0.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWinScreen() {
  const cx = canvas.width / 2;

  // 1. Atmosphere overlay
  ctx.save();
  ctx.fillStyle = "rgba(10, 8, 24, 0.58)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Neon magenta ground laser beam
  ctx.strokeStyle = "#ff00d4";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#ff00d4";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();
  ctx.restore();

  // 3. Sunburst / God Rays from the center diamond
  const rayCy = 260;
  ctx.save();
  const rayGrad = ctx.createRadialGradient(cx, rayCy, 15, cx, rayCy, 650);
  rayGrad.addColorStop(0, "rgba(255, 255, 205, 0.22)");
  rayGrad.addColorStop(0.35, "rgba(255, 255, 225, 0.13)");
  rayGrad.addColorStop(0.7, "rgba(255, 255, 240, 0.05)");
  rayGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = rayGrad;

  const numRays = 20;
  const step = (Math.PI * 2) / numRays;
  const rayWidth = step * 0.44;
  for (let i = 0; i < numRays; i++) {
    const angle = winRayAngle + i * step;
    ctx.beginPath();
    ctx.moveTo(cx, rayCy);
    ctx.arc(cx, rayCy, 650, angle - rayWidth / 2, angle + rayWidth / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 4. Central Glowing Cyan Diamond
  ctx.save();
  ctx.translate(cx, rayCy);
  const pulse = 1 + 0.035 * Math.sin(winTime * 4);
  ctx.scale(pulse, pulse);
  ctx.rotate(Math.PI / 4);

  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 32;

  const dSize = 46;
  const dGrad = ctx.createLinearGradient(-dSize / 2, -dSize / 2, dSize / 2, dSize / 2);
  dGrad.addColorStop(0, "#d8ffff");
  dGrad.addColorStop(0.4, "#00f0ff");
  dGrad.addColorStop(1, "#00bfa5");
  ctx.fillStyle = dGrad;
  ctx.fillRect(-dSize / 2, -dSize / 2, dSize, dSize);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-dSize / 2, -dSize / 2, dSize, dSize);

  const innerSize = dSize * 0.46;
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.fillRect(-innerSize / 2, -innerSize / 2, innerSize, innerSize);
  ctx.restore();

  // 5. Fireworks
  for (const fw of winFireworks) {
    const progress = 1 - (fw.life / fw.maxLife);
    const currentR = fw.radius + progress * (fw.maxRadius - fw.radius);
    const alpha = Math.max(0, fw.life / fw.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const s of fw.spokes) {
      const r1 = currentR;
      const r2 = currentR + s.dashLen * (1 - progress * 0.4);
      const x1 = fw.x + Math.cos(s.angle) * r1;
      const y1 = fw.y + Math.sin(s.angle) * r1;
      const x2 = fw.x + Math.cos(s.angle) * r2;
      const y2 = fw.y + Math.sin(s.angle) * r2;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Confetti
  for (const p of winConfetti) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(Math.cos(p.flip), 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  // 7. Main Title "LEVEL COMPLETE!"
  drawTitleLine("LEVEL", cx, 110, 58, 80, 138);
  drawTitleLine("COMPLETE!", cx, 176, 58, 146, 204);

  // 8. Stats Pill Bar
  const pillW = 430;
  const pillH = 44;
  const pillX = cx - pillW / 2;
  const pillY = 224 - pillH / 2;
  const pillR = pillH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0, 220, 255, 0.35)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(10, 14, 28, 0.88)";
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
  } else {
    ctx.moveTo(pillX + pillR, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, pillR);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, pillR);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, pillR);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, pillR);
    ctx.closePath();
  }
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(120, 175, 255, 0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const textY = 224;
  const leftAnchor = pillX + pillW * 0.17;
  const midAnchor = pillX + pillW * 0.48;
  const rightAnchor = pillX + pillW * 0.81;

  // Left: 100%
  ctx.font = "900 18px 'Arial Black', Impact, monospace, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#00ffb4";
  ctx.shadowColor = "#00ffb4";
  ctx.shadowBlur = 9;
  ctx.fillText("100%", leftAnchor, textY);

  // Mid: Coin + text
  ctx.shadowBlur = 0;
  const coinR = 8.5;
  const coinText = "x  " + coinTotal;
  ctx.font = "900 18px 'Arial Black', Impact, monospace, sans-serif";
  const coinTextW = ctx.measureText(coinText).width;
  const totalCoinW = coinR * 2 + 8 + coinTextW;
  const coinStartX = midAnchor - totalCoinW / 2;
  drawDetailedCoin(coinStartX + coinR, textY, coinR);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffea00";
  ctx.shadowColor = "#ffea00";
  ctx.shadowBlur = 9;
  ctx.fillText(coinText, coinStartX + coinR * 2 + 8, textY);

  // Right: ATTEMPT N
  const attemptText = "ATTEMPT " + attemptCount;
  ctx.font = "900 17px 'Arial Black', Impact, monospace, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 7;
  ctx.fillText(attemptText, rightAnchor, textY);

  ctx.restore();

  // 9. Replay / continue prompt
  ctx.save();
  const promptPulse = 0.65 + 0.35 * Math.sin(winTime * 3);
  ctx.fillStyle = `rgba(255, 255, 255, ${promptPulse})`;
  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Click or press Space to play again", cx, 420);
  if (playingEditorLevel) {
    ctx.fillText("E = back to editor", cx, 438);
  }
  ctx.restore();
}

// Input
function onJump() {
  if (state === "editor" || state === "levelSelect" || state === "shop") return;
  if (state === "start") {
    state = "playing"; playingEditorLevel = false; attemptCount = loadAttempts(); reset(); return;
  }
  if (state === "dead" && performance.now() - deathTime > 500) {
    nextAttempt();
    if (playingEditorLevel) { reset(editorObstacles); } else { reset(); }
    state = "playing"; return;
  }
  if (state === "win" && performance.now() - winStartTime > 500) {
    nextAttempt();
    if (playingEditorLevel) { reset(editorObstacles); } else { reset(); }
    state = "playing"; return;
  }
  if (state === "playing" && player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
  }
}

window.addEventListener("keydown", (e) => {
  if (state === "splash") { e.preventDefault(); state = "start"; return; }
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
  if (e.code === "KeyS" && state === "start") { state = "shop"; return; }
  if (e.code === "KeyH" && inLevel()) { goHome(); return; }
  if (e.code === "Escape") {
    if (state === "editor" || state === "levelSelect" || state === "shop") { state = "start"; return; }
    if (inLevel()) { goHome(); return; }
  }
  if (state === "shop") {
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && num <= SHOP_ITEMS.length) shopSelect(num - 1);
    return;
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
    if (num === 0) {
      state = "playing"; playingEditorLevel = false;
      attemptCount = loadAttempts();
      reset(); return;
    }
    if (!isNaN(num) && num >= 1 && num <= savedLevels.length) {
      editorObstacles = savedLevels[num - 1].obstacles.map(o => ({...o}));
      editorLevelName = savedLevels[num - 1].name;
      playingEditorLevel = true;
      attemptCount = loadAttempts();
      reset(editorObstacles);
      state = "playing";
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") jumpPressed = false;
});
// Handles a tap on the menu screens. Returns true once it has been consumed.
function menuPointer(clientX, clientY) {
  if (state === "start") {
    if (inRect(canvasPos(clientX, clientY), START_SHOP_BTN)) { state = "shop"; return true; }
    return false;
  }
  if (inLevel()) {
    if (inRect(canvasPos(clientX, clientY), HOME_BTN)) { goHome(); return true; }
    return false;
  }
  if (state === "shop") {
    const p = canvasPos(clientX, clientY);
    if (inRect(p, SHOP_BACK_BTN)) { state = "start"; return true; }
    for (let i = 0; i < SHOP_ITEMS.length; i++) {
      if (inRect(p, shopTileRect(i))) { shopSelect(i); break; }
    }
    return true;
  }
  return false;
}

window.addEventListener("keydown", resumeMusic);
window.addEventListener("pointerdown", resumeMusic);

canvas.addEventListener("mousedown", (e) => {
  if (state === "splash") { state = "start"; return; }
  if (state === "editor") { editorClick(e); return; }
  if (menuPointer(e.clientX, e.clientY)) return;
  jumpPressed = true;
  onJump();
});
canvas.addEventListener("mouseup", () => { jumpPressed = false; });
canvas.addEventListener("contextmenu", (e) => { if (state === "editor") e.preventDefault(); });
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (state === "splash") { state = "start"; return; }
  const t = e.changedTouches[0];
  if (t && menuPointer(t.clientX, t.clientY)) return;
  jumpPressed = true;
  onJump();
});
canvas.addEventListener("touchend", (e) => { e.preventDefault(); jumpPressed = false; });

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
  particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.life -= dt * 1.5; });
  particles = particles.filter((p) => p.life > 0);

  goalRipples.forEach(r => { r.r += 260 * dt; r.life -= dt * 1.8; });
  goalRipples = goalRipples.filter(r => r.life > 0);
  if (goalFlash > 0) goalFlash = Math.max(0, goalFlash - dt * 2.5);

  if (state === "win") {
    updateWinCelebration(dt);
    return;
  }

  if (state !== "playing") return;

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
    if (jumpPressed) { player.vy = JUMP_VEL; player.onGround = false; }
  }

  // Rotation (visual spin when airborne)
  if (!player.onGround) {
    player.rotation += 6 * dt;
  } else {
    player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
  }

  // If goal was crossed, player glides smoothly through the goalpost into victory
  if (goalCrossed) {
    winDelay -= dt;
    if (winDelay <= 0) {
      state = "win";
      initWinCelebration();
    }
    return;
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
        if (jumpPressed) { player.vy = JUMP_VEL; player.onGround = false; }
      } else if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        // Check if player is supported by an adjacent block at the same height
        const supported = obstacles.some(other =>
          other.type === "block" && other !== ob &&
          other.y === ob.y &&
          player.x + PLAYER_SIZE > other.x && player.x < other.x + other.w &&
          player.y + PLAYER_SIZE <= other.y + 4
        );
        if (supported || (player.vy >= 0 && overlapBottom <= PLAYER_SIZE / 2)) {
          player.y = ob.y - PLAYER_SIZE;
          player.vy = 0;
          player.onGround = true;
          if (jumpPressed) { player.vy = JUMP_VEL; player.onGround = false; }
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

  // Coin pickup
  for (const coin of coins) {
    if (coin.taken) continue;
    if (!collidesAABB(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE,
                      coin.x - COIN_RADIUS, coin.y - COIN_RADIUS, COIN_RADIUS * 2, COIN_RADIUS * 2)) continue;
    coin.taken = true;
    coinsCollected++;
    bankCoin();
    spawnCoinSparkle(coin.x, coin.y);
  }

  // Fall off screen
  if (player.y > canvas.height + 100) { die(); return; }

  // Level end
  const levelEnd = getLevelEnd();

  // Progress
  score = Math.min(100, Math.floor(((player.x - 100) / (levelEnd - 100)) * 100));

  // Goal crossing: when player reaches the 100% goalpost
  if (player.x >= levelEnd) {
    goalCrossed = true;
    goalFlash = 1.0;
    winDelay = 0.45;
    spawnGoalCelebration(levelEnd, player.y + PLAYER_SIZE / 2);
  }
}

function die() {
  spawnParticles(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);
  state = "dead";
  deathTime = performance.now();
}

// Goal post drawing at 100% position (Geometry Dash style finish line)
function drawGoalPost(gx, cx, cleared) {
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
    // r = 0 is bottom row, r = 5 is top row
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
  const parallax = inLevel() ? camera * 0.3 : 0;
  for (let x = -parallax % gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (state === "splash") { drawSplash(); return; }
  if (state === "start") { drawStartScreen(); return; }
  if (state === "editor") { drawEditor(); return; }
  if (state === "levelSelect") { drawLevelSelect(); return; }
  if (state === "shop") { drawShop(); return; }

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

  // Coins
  const bobTime = performance.now() / 1000;
  for (const coin of coins) {
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
  drawGoalPost(levelEnd, cx, goalCrossed || state === "win");

  // Player
  if (state === "playing" || state === "win") {
    ctx.save();
    const px = player.x - cx + PLAYER_SIZE / 2;
    const py = player.y + PLAYER_SIZE / 2;
    ctx.translate(px, py);
    ctx.rotate(player.rotation);
    drawCube(PLAYER_SIZE, equippedColor(), equippedShape());
    ctx.restore();
  }

  // Shockwave ripples
  for (const r of goalRipples) {
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
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - cx - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Goal screen flash
  if (goalFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${goalFlash * 0.35})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Progress bar
  if (state !== "win") {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(20, 15, 200, 8);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(20, 15, score * 2, 8);
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
    ctx.fillText(score + "%", 230, 24);

    // Coin counter, omitted in levels that have no coins
    if (coins.length) {
      ctx.fillStyle = COIN_COLOR;
      ctx.beginPath();
      ctx.arc(300, 19, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillText("x " + coinsCollected, 314, 24);
    }
  }

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
    drawWinScreen();
  }

  drawButton(HOME_BTN, "HOME");
}

function drawSplash() {
  ctx.textAlign = "center";
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 64px monospace";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 30;
  ctx.fillText("BLOCK FLASH", canvas.width / 2, canvas.height / 2 - 10);
  ctx.shadowBlur = 0;

  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 400);
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  ctx.font = "20px monospace";
  ctx.fillText("press a button to play", canvas.width / 2, canvas.height / 2 + 40);
}

function drawStartScreen() {
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 48px monospace";
  ctx.textAlign = "center";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 20;
  ctx.fillText("BLOCK FLASH", canvas.width / 2, canvas.height / 2 - 40);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#fff";
  ctx.font = "18px monospace";
  ctx.fillText("Click or press Space to start", canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = "14px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("E = Level Editor  |  L = Saved Levels  |  S = Shop", canvas.width / 2, canvas.height / 2 + 50);

  // Shop button
  const canBuy = shopHasAffordable();
  drawButton(START_SHOP_BTN, "SHOP", canBuy
    ? {stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.12)", pulse: true}
    : {});
  ctx.textAlign = "center";

  // Animated player icon, wearing whatever is equipped
  const t = performance.now() / 1000;
  const by = Math.sin(t * 3) * 10;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2 + 80 + by);
  ctx.rotate(t * 2);
  drawCube(36, equippedColor(), equippedShape());
  ctx.restore();

  // Coins collected across every run so far
  const totalText = "x " + coinTotal + " collected";
  ctx.font = "16px monospace";
  const textWidth = ctx.measureText(totalText).width;
  const coinX = canvas.width / 2 - textWidth / 2 - 14;
  const rowY = canvas.height - 30;
  ctx.fillStyle = COIN_COLOR;
  ctx.beginPath();
  ctx.arc(coinX, rowY - 5, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(totalText, coinX + 14, rowY);
}

// Game loop
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  syncMusic();
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

if (!checkURLLevel()) { reset(); }
requestAnimationFrame((t) => { lastTime = t; loop(t); });
