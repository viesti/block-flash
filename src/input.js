import {
  PLAYER_SIZE,
  START_PLAY_BTN,
  START_EDITOR_BTN,
  START_LEVELS_BTN,
  START_SHOP_BTN,
  LEVEL_BACK_BTN,
  LEVEL_RANDOM_BTN,
  SHOP_BACK_BTN,
  HOME_BTN,
  DEAD_RETRY_BTN_SOLO,
  DEAD_RETRY_BTN_PAIR,
  DEAD_EDITOR_BTN,
  WIN_REPLAY_BTN_SOLO,
  WIN_REPLAY_BTN_PAIR,
  WIN_EDITOR_BTN,
  levelRowBtn,
  levelCopyBtn,
} from "./constants.js";
import { canvas, canvasPos, inRect } from "./canvas.js";
import { gameState, getAttemptKey, nextAttempt } from "./state.js";
import { loadAttempts } from "./storage.js";
import { inLevel, resumeMusic } from "./audio.js";
import { SHOP_ITEMS, shopSelect, shopTileRect } from "./shop.js";
import { editorPointer, saveLevel, startEditorLevel } from "./editor.js";
import { goHome } from "./ui.js";
import { getLevelURL } from "./level.js";
import { reset, triggerPlayerJump } from "./gameplay.js";

export function onJump() {
  if (gameState.state === "editor" || gameState.state === "levelSelect" || gameState.state === "shop") return;
  if (gameState.state === "start") {
    gameState.state = "playing";
    gameState.playingEditorLevel = false;
    gameState.attemptCount = loadAttempts(getAttemptKey());
    reset();
    return;
  }
  if (gameState.state === "dead" && performance.now() - gameState.deathTime > 500) {
    nextAttempt();
    if (gameState.playingEditorLevel) { reset(gameState.editorObstacles); } else { reset(); }
    gameState.state = "playing";
    return;
  }
  if (gameState.state === "win" && performance.now() - gameState.winStartTime > 500) {
    nextAttempt();
    if (gameState.playingEditorLevel) { reset(gameState.editorObstacles); } else { reset(); }
    gameState.state = "playing";
    return;
  }
  if (gameState.state === "playing" && gameState.player.onGround) {
    triggerPlayerJump();
  }
}

// Handles a tap on the menu screens. Returns true once it has been consumed.
export function menuPointer(clientX, clientY) {
  const p = canvasPos(clientX, clientY);

  if (gameState.state === "start") {
    if (inRect(p, START_PLAY_BTN)) {
      gameState.state = "playing";
      gameState.playingEditorLevel = false;
      gameState.attemptCount = loadAttempts(getAttemptKey());
      reset();
      return true;
    }
    if (inRect(p, START_EDITOR_BTN)) {
      gameState.state = "editor";
      gameState.editorObstacles = [];
      gameState.editorCamera = 0;
      gameState.editorLevelName = null;
      return true;
    }
    if (inRect(p, START_LEVELS_BTN)) {
      gameState.state = "levelSelect";
      return true;
    }
    if (inRect(p, START_SHOP_BTN)) {
      gameState.state = "shop";
      return true;
    }
    return false;
  }

  if (gameState.state === "levelSelect") {
    if (inRect(p, LEVEL_BACK_BTN)) {
      gameState.state = "start";
      return true;
    }
    if (inRect(p, LEVEL_RANDOM_BTN)) {
      gameState.state = "playing";
      gameState.playingEditorLevel = false;
      gameState.attemptCount = loadAttempts(getAttemptKey());
      reset();
      return true;
    }
    const maxShow = Math.min(gameState.savedLevels.length, 6);
    for (let i = 0; i < maxShow; i++) {
      if (inRect(p, levelRowBtn(i))) {
        gameState.editorObstacles = gameState.savedLevels[i].obstacles.map(o => ({ ...o }));
        gameState.editorLevelName = gameState.savedLevels[i].name;
        gameState.playingEditorLevel = true;
        gameState.attemptCount = loadAttempts(getAttemptKey());
        reset(gameState.editorObstacles);
        gameState.state = "playing";
        return true;
      }
      if (inRect(p, levelCopyBtn(i))) {
        const url = getLevelURL(gameState.savedLevels[i].name, gameState.savedLevels[i].obstacles);
        navigator.clipboard.writeText(url).catch(() => {});
        gameState.copiedLevelIndex = i;
        setTimeout(() => { if (gameState.copiedLevelIndex === i) gameState.copiedLevelIndex = -1; }, 1500);
        return true;
      }
    }
    return true;
  }

  if (gameState.state === "shop") {
    if (inRect(p, SHOP_BACK_BTN)) { gameState.state = "start"; return true; }
    for (let i = 0; i < SHOP_ITEMS.length; i++) {
      if (inRect(p, shopTileRect(i))) { shopSelect(i); break; }
    }
    return true;
  }

  if (gameState.state === "dead") {
    if (inRect(p, HOME_BTN)) { goHome(); return true; }
    const retryBtn = gameState.playingEditorLevel ? DEAD_RETRY_BTN_PAIR : DEAD_RETRY_BTN_SOLO;
    if (inRect(p, retryBtn)) {
      if (performance.now() - gameState.deathTime > 300) {
        nextAttempt();
        if (gameState.playingEditorLevel) { reset(gameState.editorObstacles); } else { reset(); }
        gameState.state = "playing";
      }
      return true;
    }
    if (gameState.playingEditorLevel && inRect(p, DEAD_EDITOR_BTN)) {
      gameState.state = "editor";
      return true;
    }
    return false;
  }

  if (gameState.state === "win") {
    if (inRect(p, HOME_BTN)) { goHome(); return true; }
    const replayBtn = gameState.playingEditorLevel ? WIN_REPLAY_BTN_PAIR : WIN_REPLAY_BTN_SOLO;
    if (inRect(p, replayBtn)) {
      if (performance.now() - gameState.winStartTime > 300) {
        nextAttempt();
        if (gameState.playingEditorLevel) { reset(gameState.editorObstacles); } else { reset(); }
        gameState.state = "playing";
      }
      return true;
    }
    if (gameState.playingEditorLevel && inRect(p, WIN_EDITOR_BTN)) {
      gameState.state = "editor";
      return true;
    }
    return false;
  }

  if (inLevel()) {
    if (inRect(p, HOME_BTN)) { goHome(); return true; }
    return false;
  }

  return false;
}

export function handlePointerDown(clientX, clientY, isRightClick = false) {
  if (gameState.state === "splash") { gameState.state = "start"; return; }
  const p = canvasPos(clientX, clientY);
  if (gameState.state === "editor") {
    editorPointer(p, isRightClick);
    return;
  }
  if (menuPointer(clientX, clientY)) return;
  gameState.jumpPressed = true;
  onJump();
}

export function setupInput() {
  window.addEventListener("keydown", resumeMusic);
  window.addEventListener("pointerdown", resumeMusic);

  window.addEventListener("keydown", (e) => {
    if (gameState.state === "splash") { e.preventDefault(); gameState.state = "start"; return; }
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!gameState.jumpPressed) { gameState.jumpPressed = true; onJump(); }
    }
    if (e.code === "KeyE") {
      if (gameState.state === "start") {
        gameState.state = "editor";
        gameState.editorObstacles = [];
        gameState.editorCamera = 0;
        gameState.editorLevelName = null;
        return;
      }
      if (gameState.state === "editor") { startEditorLevel(); return; }
      if ((gameState.state === "playing" || gameState.state === "dead" || gameState.state === "win") && gameState.playingEditorLevel) {
        gameState.state = "editor";
        return;
      }
    }
    if (e.code === "KeyL" && gameState.state === "start") { gameState.state = "levelSelect"; return; }
    if (e.code === "KeyS" && gameState.state === "start") { gameState.state = "shop"; return; }
    if (e.code === "KeyH" && inLevel()) { goHome(); return; }
    if (e.code === "Escape") {
      if (gameState.state === "editor" || gameState.state === "levelSelect" || gameState.state === "shop") {
        gameState.state = "start";
        return;
      }
      if (inLevel()) { goHome(); return; }
    }
    if (gameState.state === "shop") {
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= SHOP_ITEMS.length) shopSelect(num - 1);
      return;
    }
    if (gameState.state === "editor") {
      if (e.code === "Digit1") gameState.editorTool = "spike";
      if (e.code === "Digit2") gameState.editorTool = "block";
      if (e.code === "Digit3") gameState.editorTool = "eraser";
      if (e.code === "KeyS") saveLevel();
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        gameState.editorCamera = Math.max(0, gameState.editorCamera - PLAYER_SIZE * 3);
      }
      if (e.code === "ArrowRight" || e.code === "KeyD") {
        gameState.editorCamera += PLAYER_SIZE * 3;
      }
    }
    if (gameState.state === "levelSelect" && e.code === "KeyC") {
      gameState.levelSelectCopyNext = true;
      return;
    }
    if (gameState.state === "levelSelect") {
      const num = parseInt(e.key);
      if (gameState.levelSelectCopyNext && !isNaN(num) && num >= 1 && num <= gameState.savedLevels.length) {
        const lv = gameState.savedLevels[num - 1];
        navigator.clipboard.writeText(getLevelURL(lv.name, lv.obstacles));
        gameState.levelSelectCopyNext = false;
        return;
      }
      gameState.levelSelectCopyNext = false;
      if (num === 0) {
        gameState.state = "playing";
        gameState.playingEditorLevel = false;
        gameState.attemptCount = loadAttempts(getAttemptKey());
        reset();
        return;
      }
      if (!isNaN(num) && num >= 1 && num <= gameState.savedLevels.length) {
        gameState.editorObstacles = gameState.savedLevels[num - 1].obstacles.map(o => ({ ...o }));
        gameState.editorLevelName = gameState.savedLevels[num - 1].name;
        gameState.playingEditorLevel = true;
        gameState.attemptCount = loadAttempts(getAttemptKey());
        reset(gameState.editorObstacles);
        gameState.state = "playing";
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") gameState.jumpPressed = false;
  });

  canvas.addEventListener("mousedown", (e) => {
    handlePointerDown(e.clientX, e.clientY, e.button === 2);
  });
  canvas.addEventListener("mouseup", () => { gameState.jumpPressed = false; });
  canvas.addEventListener("contextmenu", (e) => {
    if (gameState.state === "editor") e.preventDefault();
  });
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (t) handlePointerDown(t.clientX, t.clientY, false);
  });
  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    gameState.jumpPressed = false;
  });
}
