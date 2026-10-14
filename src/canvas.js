import { COIN_COLOR } from "./constants.js";

export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 450;

// Maps a viewport point to canvas coordinates, undoing the letterboxed scaling.
export function canvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const offsetX = (rect.width - canvas.width * scale) / 2;
  const offsetY = (rect.height - canvas.height * scale) / 2;
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale,
  };
}

export function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Draws a rounded menu button with optional glow, pulse, and custom styling
export function drawButton(r, label, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.fill || "rgba(0,0,0,0.35)";
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(r.x, r.y, r.w, r.h, opts.radius || 8);
  } else {
    ctx.rect(r.x, r.y, r.w, r.h);
  }
  ctx.fill();

  ctx.globalAlpha = opts.pulse ? 0.55 + 0.45 * Math.sin(performance.now() / 220) : 1;
  ctx.strokeStyle = opts.stroke || "rgba(255,255,255,0.3)";
  ctx.lineWidth = opts.lineWidth || 2;
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = opts.textColor || "#fff";
  ctx.font = opts.font || "bold 15px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
}

// Draws a cube centred on the current transform origin. The caller owns any
// rotation, so the run's spin and the shop's static preview share one path.
export function drawCube(size, color, shape) {
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

export function drawCoinIcon(x, y, r) {
  ctx.fillStyle = COIN_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 2;
  ctx.stroke();
}
