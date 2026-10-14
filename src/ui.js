import {
  ACCENT,
  PLAYER_COLOR,
  COIN_COLOR,
  LEVEL_BACK_BTN,
  LEVEL_RANDOM_BTN,
  START_PLAY_BTN,
  START_EDITOR_BTN,
  START_LEVELS_BTN,
  START_SHOP_BTN,
  levelRowBtn,
  levelCopyBtn,
} from "./constants.js";
import { canvas, ctx, drawButton, drawCube } from "./canvas.js";
import { equippedColor, equippedShape, shopHasAffordable } from "./shop.js";
import { gameState } from "./state.js";

// Leaves a run for the main menu. The next start press builds a fresh level.
export function goHome() {
  gameState.state = "start";
  gameState.playingEditorLevel = false;
}

export function drawSplash() {
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

export function drawStartScreen() {
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 46px monospace";
  ctx.textAlign = "center";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 20;
  ctx.fillText("BLOCK FLASH", canvas.width / 2, 85);
  ctx.shadowBlur = 0;

  // Big Play Button
  drawButton(START_PLAY_BTN, "▶ PLAY", {
    stroke: PLAYER_COLOR,
    fill: "rgba(0, 255, 136, 0.18)",
    pulse: true,
    font: "bold 18px monospace",
    textColor: PLAYER_COLOR,
  });

  // Animated player icon, wearing whatever is equipped
  const t = performance.now() / 1000;
  const by = Math.sin(t * 3) * 6;
  ctx.save();
  ctx.translate(canvas.width / 2, 225 + by);
  ctx.rotate(t * 2);
  drawCube(38, equippedColor(), equippedShape());
  ctx.restore();

  // Navigation button bar
  drawButton(START_EDITOR_BTN, "🛠 EDITOR", {
    stroke: "#ffaa00",
    fill: "rgba(255, 170, 0, 0.14)",
    textColor: "#ffaa00",
  });
  drawButton(START_LEVELS_BTN, "📋 LEVELS", {
    stroke: "#00d4ff",
    fill: "rgba(0, 212, 255, 0.14)",
    textColor: "#00d4ff",
  });
  const canBuy = shopHasAffordable();
  drawButton(START_SHOP_BTN, "🛒 SHOP", canBuy
    ? { stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.18)", pulse: true, textColor: PLAYER_COLOR }
    : { stroke: "#ff44aa", fill: "rgba(255,68,170,0.14)", textColor: "#ff44aa" });

  // Helper text
  ctx.font = "13px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("Space = Play  |  E = Editor  |  L = Levels  |  S = Shop", canvas.width / 2, 360);

  // Coins collected across every run so far
  const totalText = "x " + gameState.coinTotal + " collected";
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

export function drawLevelSelect() {
  drawButton(LEVEL_BACK_BTN, "◀ BACK");

  ctx.fillStyle = ACCENT;
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 15;
  ctx.fillText("SELECT LEVEL", canvas.width / 2, 42);
  ctx.shadowBlur = 0;

  // Random level
  drawButton(LEVEL_RANDOM_BTN, "▶ 0: Random Level (Standard)", {
    stroke: PLAYER_COLOR,
    fill: "rgba(0,255,136,0.12)",
    font: "bold 15px monospace",
    textColor: PLAYER_COLOR,
  });

  const maxShow = Math.min(gameState.savedLevels.length, 6);
  if (gameState.savedLevels.length === 0) {
    ctx.font = "15px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.fillText("No custom levels saved yet. Create one in the Editor!", canvas.width / 2, 170);
  } else {
    for (let i = 0; i < maxShow; i++) {
      const rowBtn = levelRowBtn(i);
      const copyBtn = levelCopyBtn(i);
      const isCopied = gameState.copiedLevelIndex === i;
      const label = (i + 1) + ": " + gameState.savedLevels[i].name + " (" + gameState.savedLevels[i].obstacles.length + " objects)";
      drawButton(rowBtn, label, { font: "14px monospace" });
      drawButton(copyBtn, isCopied ? "COPIED!" : "COPY", {
        stroke: isCopied ? PLAYER_COLOR : "rgba(0,212,255,0.5)",
        fill: isCopied ? "rgba(0,255,136,0.18)" : "rgba(0,212,255,0.1)",
        font: "bold 13px monospace",
        textColor: isCopied ? PLAYER_COLOR : "#00d4ff",
      });
    }
  }

  ctx.font = "13px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("Tap level to play  |  COPY = share link  |  Number keys / Esc also work", canvas.width / 2, 420);
  ctx.textAlign = "left";
}
