// Physics & Level constants
export const GROUND_Y = 350;
export const PLAYER_SIZE = 36;
export const GRAVITY = 2800;
export const JUMP_VEL = -750;
export const GAME_SPEED = 400;
export const LEVEL_LENGTH = 8000;
export const COIN_RADIUS = 11;
export const COIN_HOVER = 13;

// Kept clear of the obstacle behind and the one ahead, so a coin lands where the
// player runs rather than where it is mid-jump.
export const COIN_LAND_INSET = PLAYER_SIZE * 1.5;
export const COIN_TAKEOFF_INSET = PLAYER_SIZE * 2;

// Granularity of the reachability search that vets coin positions.
export const SOLVE_DT = 1 / 120;
export const SOLVE_QUANT = 12;

// Colors
export const BG_COLORS = ["#0f0722", "#1a1036", "#0f3460", "#533483"];
export const PLAYER_COLOR = "#00ff88";
export const GROUND_COLOR = "#0c071a";
export const SPIKE_COLOR = "#ff2255";
export const BLOCK_COLOR = "#4444ff";
export const ACCENT = "#ff00ff";
export const COIN_COLOR = "#ffd633";

// Visual effects
export const CITY_STRIP_W = 2400;
export const PLAYER_TRAIL_LENGTH = 16;

// Shop layout
export const SHOP_COLS = 4;
export const SHOP_TILE_W = 160;
export const SHOP_TILE_H = 132;
export const SHOP_GAP = 20;
export const SHOP_X0 = (800 - (SHOP_COLS * SHOP_TILE_W + (SHOP_COLS - 1) * SHOP_GAP)) / 2;
export const SHOP_Y0 = 92;
export const SHOP_BACK_BTN = { x: 40, y: 400, w: 110, h: 34 };
export const HOME_BTN = { x: 690, y: 12, w: 96, h: 30 };

// Menu & UI buttons
export const START_PLAY_BTN = { x: 320, y: 130, w: 160, h: 48 };
export const START_EDITOR_BTN = { x: 175, y: 295, w: 140, h: 40 };
export const START_LEVELS_BTN = { x: 330, y: 295, w: 140, h: 40 };
export const START_SHOP_BTN = { x: 485, y: 295, w: 140, h: 40 };

export const LEVEL_BACK_BTN = { x: 25, y: 16, w: 95, h: 32 };
export const LEVEL_RANDOM_BTN = { x: 160, y: 72, w: 480, h: 36 };
export function levelRowBtn(i) { return { x: 160, y: 118 + i * 42, w: 385, h: 36 }; }
export function levelCopyBtn(i) { return { x: 555, y: 118 + i * 42, w: 85, h: 36 }; }

export const EDITOR_SPIKE_BTN = { x: 10, y: 7, w: 76, h: 34 };
export const EDITOR_BLOCK_BTN = { x: 92, y: 7, w: 76, h: 34 };
export const EDITOR_ERASER_BTN = { x: 174, y: 7, w: 80, h: 34 };
export const EDITOR_SCROLL_L_BTN = { x: 264, y: 7, w: 42, h: 34 };
export const EDITOR_SCROLL_R_BTN = { x: 312, y: 7, w: 42, h: 34 };
export const EDITOR_PLAY_BTN = { x: 520, y: 7, w: 78, h: 34 };
export const EDITOR_SAVE_BTN = { x: 604, y: 7, w: 78, h: 34 };
export const EDITOR_BACK_BTN = { x: 688, y: 7, w: 86, h: 34 };

export const DEAD_RETRY_BTN_SOLO = { x: 325, y: 220, w: 150, h: 42 };
export const DEAD_RETRY_BTN_PAIR = { x: 245, y: 220, w: 145, h: 42 };
export const DEAD_EDITOR_BTN = { x: 410, y: 220, w: 145, h: 42 };

export const WIN_REPLAY_BTN_SOLO = { x: 325, y: 390, w: 150, h: 38 };
export const WIN_REPLAY_BTN_PAIR = { x: 410, y: 390, w: 145, h: 38 };
export const WIN_EDITOR_BTN = { x: 245, y: 390, w: 145, h: 38 };
