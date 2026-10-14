import {
  PLAYER_COLOR,
  ACCENT,
  COIN_COLOR,
  SHOP_COLS,
  SHOP_TILE_W,
  SHOP_TILE_H,
  SHOP_GAP,
  SHOP_X0,
  SHOP_Y0,
  SHOP_BACK_BTN,
} from "./constants.js";
import { canvas, ctx, drawButton, drawCube, drawCoinIcon } from "./canvas.js";
import { saveCoins, saveOwned, saveEquipped } from "./storage.js";
import { gameState } from "./state.js";

// Shop catalogue. The zero-price entries are owned from the start so the player
// can always switch back to the plain green cube.
export const SHOP_ITEMS = [
  { id: "c_green",   kind: "color", name: "GREEN",   price: 0,    value: PLAYER_COLOR },
  { id: "c_cyan",    kind: "color", name: "CYAN",    price: 500,  value: "#00d4ff" },
  { id: "c_pink",    kind: "color", name: "PINK",    price: 1000, value: "#ff2e88" },
  { id: "c_gold",    kind: "color", name: "GOLD",    price: 1500, value: "#ffc93c" },
  { id: "s_square",  kind: "shape", name: "CLASSIC", price: 0,    value: "square" },
  { id: "s_round",   kind: "shape", name: "ROUNDED", price: 2000, value: "rounded" },
  { id: "s_diamond", kind: "shape", name: "DIAMOND", price: 3000, value: "diamond" },
  { id: "s_ring",    kind: "shape", name: "RING",    price: 4000, value: "ring" },
];

export const FREE_ITEMS = SHOP_ITEMS.filter(it => it.price === 0).map(it => it.id);
export const ALL_ITEM_IDS = SHOP_ITEMS.map(it => it.id);

export function itemById(id) {
  return SHOP_ITEMS.find(it => it.id === id);
}

export function isValidItem(id, kind) {
  const item = itemById(id);
  return item && item.kind === kind;
}

export function equippedColor() {
  const item = itemById(gameState.equipped.color);
  return item ? item.value : PLAYER_COLOR;
}

export function equippedShape() {
  const item = itemById(gameState.equipped.shape);
  return item ? item.value : "square";
}

// True while some cube the player does not own is within reach of the purse.
export function shopHasAffordable() {
  return SHOP_ITEMS.some(it => !gameState.owned.includes(it.id) && gameState.coinTotal >= it.price);
}

export function shopSelect(i) {
  const item = SHOP_ITEMS[i];
  if (!item) return;
  if (!gameState.owned.includes(item.id)) {
    if (gameState.coinTotal < item.price) return;
    gameState.coinTotal -= item.price;
    saveCoins(gameState.coinTotal);
    gameState.owned.push(item.id);
    saveOwned(gameState.owned);
  }
  gameState.equipped[item.kind] = item.id;
  saveEquipped(gameState.equipped);
}

export function shopTileRect(i) {
  const col = i % SHOP_COLS;
  const row = Math.floor(i / SHOP_COLS);
  return {
    x: SHOP_X0 + col * (SHOP_TILE_W + SHOP_GAP),
    y: SHOP_Y0 + row * (SHOP_TILE_H + SHOP_GAP),
    w: SHOP_TILE_W,
    h: SHOP_TILE_H,
  };
}

export function drawShop() {
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
  ctx.fillText(String(gameState.coinTotal), canvas.width - 40, 46);
  drawCoinIcon(canvas.width - 40 - ctx.measureText(String(gameState.coinTotal)).width - 16, 40, 9);

  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const item = SHOP_ITEMS[i];
    const r = shopTileRect(i);
    const isOwned = gameState.owned.includes(item.id);
    const isEquipped = gameState.equipped[item.kind] === item.id;
    const canBuy = !isOwned && gameState.coinTotal >= item.price;

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
