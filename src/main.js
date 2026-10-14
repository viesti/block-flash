import { gameState, getAttemptKey } from "./state.js";
import { loadLevels, loadCoinTotal, loadOwned, loadEquipped, loadAttempts } from "./storage.js";
import { FREE_ITEMS, ALL_ITEM_IDS, isValidItem } from "./shop.js";
import { initSkyline, initAmbientSpecks } from "./effects.js";
import { deserializeLevel } from "./level.js";
import { initWinCelebration } from "./win.js";
import { syncMusic } from "./audio.js";
import { reset, update, draw } from "./gameplay.js";
import { setupInput } from "./input.js";

export function checkURLLevel() {
  const params = new URLSearchParams(window.location.search);
  const levelData = params.get("level");
  const urlAttempts = params.get("attempts");
  if (urlAttempts && !isNaN(parseInt(urlAttempts, 10))) {
    gameState.attemptCount = parseInt(urlAttempts, 10);
  }
  const urlCoins = params.get("coins");
  if (urlCoins && !isNaN(parseInt(urlCoins, 10))) {
    gameState.coinTotal = parseInt(urlCoins, 10);
  }
  const testWin = params.get("win") === "1" || params.get("testwin") === "1";
  if (levelData) {
    try {
      const { name, obstacles } = deserializeLevel(decodeURIComponent(levelData));
      gameState.editorObstacles = obstacles;
      gameState.editorLevelName = name || "Shared Level";
      gameState.playingEditorLevel = true;
      reset(gameState.editorObstacles);
      gameState.state = testWin ? "win" : "playing";
      if (testWin) initWinCelebration();
      return true;
    } catch { return false; }
  }
  if (testWin) {
    reset();
    gameState.state = "win";
    initWinCelebration();
    return true;
  }
  return false;
}

// Initialise storage state
gameState.savedLevels = loadLevels();
gameState.coinTotal = loadCoinTotal();
gameState.owned = loadOwned(FREE_ITEMS, ALL_ITEM_IDS);
gameState.equipped = loadEquipped(isValidItem);
gameState.attemptCount = loadAttempts(getAttemptKey());

// Visuals & input listeners
initSkyline();
initAmbientSpecks();
setupInput();

if (!checkURLLevel()) {
  reset();
}

function loop(time) {
  const dt = Math.min((time - gameState.lastTime) / 1000, 0.05);
  gameState.lastTime = time;
  syncMusic();
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame((t) => {
  gameState.lastTime = t;
  loop(t);
});
