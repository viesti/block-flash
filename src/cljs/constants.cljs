(ns constants)

;; Physics & Level constants
(def GROUND_Y 350)
(def PLAYER_SIZE 36)
(def GRAVITY 2800)
(def JUMP_VEL -750)
(def GAME_SPEED 400)
(def LEVEL_LENGTH 8000)
(def COIN_RADIUS 11)
(def COIN_HOVER 13)

;; Kept clear of the obstacle behind and the one ahead, so a coin lands where the
;; player runs rather than where it is mid-jump.
(def COIN_LAND_INSET (* PLAYER_SIZE 1.5))
(def COIN_TAKEOFF_INSET (* PLAYER_SIZE 2))

;; Granularity of the reachability search that vets coin positions.
(def SOLVE_DT (/ 1 120))
(def SOLVE_QUANT 12)

;; Colors
(def BG_COLORS ["#0f0722" "#1a1036" "#0f3460" "#533483"])
(def PLAYER_COLOR "#00ff88")
(def GROUND_COLOR "#0c071a")
(def SPIKE_COLOR "#ff2255")
(def BLOCK_COLOR "#4444ff")
(def ACCENT "#ff00ff")
(def COIN_COLOR "#ffd633")

;; Visual effects
(def CITY_STRIP_W 2400)
(def PLAYER_TRAIL_LENGTH 16)

;; Shop layout
(def SHOP_COLS 4)
(def SHOP_TILE_W 160)
(def SHOP_TILE_H 132)
(def SHOP_GAP 20)
(def SHOP_X0 (/ (- 800 (+ (* SHOP_COLS SHOP_TILE_W) (* (- SHOP_COLS 1) SHOP_GAP))) 2))
(def SHOP_Y0 92)
(def SHOP_BACK_BTN {:x 40 :y 400 :w 110 :h 34})
(def HOME_BTN {:x 690 :y 12 :w 96 :h 30})

;; Menu & UI buttons
(def START_PLAY_BTN {:x 320 :y 130 :w 160 :h 48})
(def START_EDITOR_BTN {:x 175 :y 295 :w 140 :h 40})
(def START_LEVELS_BTN {:x 330 :y 295 :w 140 :h 40})
(def START_SHOP_BTN {:x 485 :y 295 :w 140 :h 40})

(def LEVEL_BACK_BTN {:x 25 :y 16 :w 95 :h 32})
(def LEVEL_RANDOM_BTN {:x 160 :y 72 :w 480 :h 36})
(defn level-row-btn [i]
  {:x 160 :y (+ 118 (* i 42)) :w 385 :h 36})

(defn level-copy-btn [i]
  {:x 555 :y (+ 118 (* i 42)) :w 85 :h 36})

(def EDITOR_SPIKE_BTN {:x 10 :y 7 :w 76 :h 34})
(def EDITOR_BLOCK_BTN {:x 92 :y 7 :w 76 :h 34})
(def EDITOR_ERASER_BTN {:x 174 :y 7 :w 80 :h 34})
(def EDITOR_SCROLL_L_BTN {:x 264 :y 7 :w 42 :h 34})
(def EDITOR_SCROLL_R_BTN {:x 312 :y 7 :w 42 :h 34})
(def EDITOR_PLAY_BTN {:x 520 :y 7 :w 78 :h 34})
(def EDITOR_SAVE_BTN {:x 604 :y 7 :w 78 :h 34})
(def EDITOR_BACK_BTN {:x 688 :y 7 :w 86 :h 34})

(def DEAD_RETRY_BTN_SOLO {:x 325 :y 220 :w 150 :h 42})
(def DEAD_RETRY_BTN_PAIR {:x 245 :y 220 :w 145 :h 42})
(def DEAD_EDITOR_BTN {:x 410 :y 220 :w 145 :h 42})

(def WIN_REPLAY_BTN_SOLO {:x 325 :y 390 :w 150 :h 38})
(def WIN_REPLAY_BTN_PAIR {:x 410 :y 390 :w 145 :h 38})
(def WIN_EDITOR_BTN {:x 245 :y 390 :w 145 :h 38})
