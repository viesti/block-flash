import {
  GROUND_Y,
  PLAYER_COLOR,
  WIN_EDITOR_BTN,
  WIN_REPLAY_BTN_PAIR,
  WIN_REPLAY_BTN_SOLO,
} from "./constants.js";
import { canvas, ctx, drawButton } from "./canvas.js";
import { gameState } from "./state.js";

// Win celebration system (Geometry Dash style victory screen)
export function initWinCelebration() {
  gameState.winTime = 0;
  gameState.winStartTime = performance.now();
  gameState.winRayAngle = 0;
  gameState.winConfetti = [];
  gameState.winFireworks = [];
  gameState.winNextFirework = 0.8;

  // Populate screen with confetti
  const confettiColors = ["#00f0ff", "#ff0099", "#ffe600", "#00ff66", "#ffffff", "#7038ff"];
  for (let i = 0; i < 90; i++) {
    gameState.winConfetti.push({
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

  // Initial fireworks (one at top-right, one on left)
  spawnFirework(680, 95);
  spawnFirework(170, 160);
}

export function spawnFirework(x, y) {
  const count = 30;
  const spokes = [];
  const palette = ["#00f0ff", "#2979ff", "#ff1493", "#ffffff", "#ffee00", "#00e5ff"];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const dashLen = 8 + Math.random() * 8;
    spokes.push({ angle, color, dashLen });
  }
  gameState.winFireworks.push({
    x,
    y,
    radius: 6,
    maxRadius: 52 + Math.random() * 20,
    spokes,
    life: 1.0,
    maxLife: 1.2 + Math.random() * 0.3,
  });
}

export function updateWinCelebration(dt) {
  gameState.winTime += dt;
  gameState.winRayAngle += dt * 0.14;

  for (const p of gameState.winConfetti) {
    p.x += (p.vx + Math.sin(gameState.winTime * 2 + p.phase) * 18) * dt;
    p.y += p.vy * dt;
    p.rot += p.vRot * dt;
    p.flip += p.vFlip * dt;
    if (p.y > canvas.height + 20) {
      p.y = -20;
      p.x = Math.random() * canvas.width;
    }
  }

  gameState.winNextFirework -= dt;
  if (gameState.winNextFirework <= 0) {
    spawnFirework(120 + Math.random() * 560, 50 + Math.random() * 150);
    gameState.winNextFirework = 0.9 + Math.random() * 0.8;
  }

  for (const fw of gameState.winFireworks) {
    fw.life -= dt;
  }
  gameState.winFireworks = gameState.winFireworks.filter(fw => fw.life > 0);
}

export function drawTitleLine(text, cx, y, fontSize, gradY1, gradY2) {
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

export function drawWinScreen() {
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
    const angle = gameState.winRayAngle + i * step;
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
  const pulse = 1 + 0.035 * Math.sin(gameState.winTime * 4);
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
  for (const fw of gameState.winFireworks) {
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
  for (const p of gameState.winConfetti) {
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

  // 8. Replay / continue buttons and prompt
  ctx.save();
  if (gameState.playingEditorLevel) {
    drawButton(WIN_EDITOR_BTN, "🛠 EDITOR", {
      stroke: "#ffaa00", fill: "rgba(255,170,0,0.16)", textColor: "#ffaa00",
    });
    drawButton(WIN_REPLAY_BTN_PAIR, "↻ PLAY AGAIN", {
      stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.18)", pulse: true, textColor: PLAYER_COLOR,
    });
  } else {
    drawButton(WIN_REPLAY_BTN_SOLO, "↻ PLAY AGAIN", {
      stroke: PLAYER_COLOR, fill: "rgba(0,255,136,0.18)", pulse: true, textColor: PLAYER_COLOR,
    });
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Tap button or press Space to play again" + (gameState.playingEditorLevel ? "  |  E = editor" : ""), cx, 440);
  ctx.restore();
}
