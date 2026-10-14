import { PLAYER_SIZE } from "./constants.js";

export function collidesWithSpike(px, py, ps, sx, sy, sw, sh) {
  // Spike is drawn from base at sy upward to sy - sh
  const margin = sw * 0.2;
  return px + ps > sx + margin && px < sx + sw - margin && py + ps > sy - sh && py < sy;
}

export function collidesAABB(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax + aw > bx && ax < bx + bw && ay + ah > by && ay < by + bh;
}

// Resolve one simulated frame the way update() does, so the search agrees with
// the collisions the player will actually experience. Returns false on death.
export function resolveSim(p, obstacles) {
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
