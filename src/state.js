import { GROUND_Y, PLAYER_SIZE } from "./constants.js";
import { saveAttempts, saveCoins } from "./storage.js";

export const gameState = {
  state: "splash", // splash | start | playing | dead | win | editor | levelSelect | shop
  player: { x: 100, y: GROUND_Y - PLAYER_SIZE, vy: 0, onGround: true, rotation: 0 },
  camera: 0,
  obstacles: [],
  coins: [],
  coinsCollected: 0,
  particles: [],
  score: 0,
  deathTime: 0,
  jumpPressed: false,
  lastTime: 0,
  goalCrossed: false,
  winDelay: 0,
  goalFlash: 0,
  goalRipples: [],
  winTime: 0,
  winStartTime: 0,
  winRayAngle: 0,
  winConfetti: [],
  winFireworks: [],
  winNextFirework: 0,

  farCityBuildings: [],
  nearCityBuildings: [],
  playerTrail: [],
  jumpRings: [],
  ambientSpecks: [],

  editorTool: "spike", // "spike" | "block" | "eraser"
  editorCamera: 0,
  editorObstacles: [],
  editorLevelName: null,
  editorSavedFeedback: 0,
  savedLevels: [],
  coinTotal: 0,
  playingEditorLevel: false,
  levelSelectCopyNext: false,
  copiedLevelIndex: -1,

  attemptCount: 1,
  owned: [],
  equipped: { color: "c_green", shape: "s_square" },
};

export function getAttemptKey() {
  return gameState.playingEditorLevel
    ? "gdash_attempts_" + (gameState.editorLevelName || "editor")
    : "gdash_attempts_main";
}

export function nextAttempt() {
  gameState.attemptCount++;
  saveAttempts(getAttemptKey(), gameState.attemptCount);
}

export function bankCoin() {
  gameState.coinTotal++;
  saveCoins(gameState.coinTotal);
}
