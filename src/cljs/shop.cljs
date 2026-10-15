(ns shop
  (:require [constants :refer [PLAYER_COLOR ACCENT COIN_COLOR SHOP_COLS
                               SHOP_TILE_W SHOP_TILE_H SHOP_GAP SHOP_X0
                               SHOP_Y0 SHOP_BACK_BTN]]
            [canvas :refer [ctx draw-button draw-cube draw-coin-icon]]
            [storage :refer [save-coins save-owned save-equipped]]
            [state :refer [game-state]]))

;; Shop catalogue. The zero-price entries are owned from the start so the player
;; can always switch back to the plain green cube.
(def shop-items
  [{:id "c_green"   :kind "color" :name "GREEN"   :price 0    :value PLAYER_COLOR}
   {:id "c_cyan"    :kind "color" :name "CYAN"    :price 500  :value "#00d4ff"}
   {:id "c_pink"    :kind "color" :name "PINK"    :price 1000 :value "#ff2e88"}
   {:id "c_gold"    :kind "color" :name "GOLD"    :price 1500 :value "#ffc93c"}
   {:id "s_square"  :kind "shape" :name "CLASSIC" :price 0    :value "square"}
   {:id "s_round"   :kind "shape" :name "ROUNDED" :price 2000 :value "rounded"}
   {:id "s_diamond" :kind "shape" :name "DIAMOND" :price 3000 :value "diamond"}
   {:id "s_ring"    :kind "shape" :name "RING"    :price 4000 :value "ring"}])

(def free-items
  (-> (.filter shop-items (fn [it] (zero? (.-price it))))
      (.map (fn [it] (.-id it)))))

(def all-item-ids
  (.map shop-items (fn [it] (.-id it))))

(defn item-by-id [id]
  (.find shop-items (fn [it] (= (.-id it) id))))

(defn is-valid-item [id kind]
  (let [item (item-by-id id)]
    (boolean (and item (= (.-kind item) kind)))))

(defn equipped-color []
  (let [item (item-by-id (.-color (.-equipped game-state)))]
    (if item (.-value item) PLAYER_COLOR)))

(defn equipped-shape []
  (let [item (item-by-id (.-shape (.-equipped game-state)))]
    (if item (.-value item) "square")))

(defn shop-has-affordable
  "True while some cube the player does not own is within reach of the purse."
  []
  (.some shop-items
         (fn [it]
           (and (not (.includes (.-owned game-state) (.-id it)))
                (>= (.-coinTotal game-state) (.-price it))))))

(defn shop-select [i]
  (let [item (aget shop-items i)]
    (when item
      (if-not (.includes (.-owned game-state) (.-id item))
        (when (>= (.-coinTotal game-state) (.-price item))
          (set! (.-coinTotal game-state) (- (.-coinTotal game-state) (.-price item)))
          (save-coins (.-coinTotal game-state))
          (.push (.-owned game-state) (.-id item))
          (save-owned (.-owned game-state))
          (aset (.-equipped game-state) (.-kind item) (.-id item))
          (save-equipped (.-equipped game-state)))
        (do
          (aset (.-equipped game-state) (.-kind item) (.-id item))
          (save-equipped (.-equipped game-state)))))))

(defn shop-tile-rect [i]
  (let [col (mod i SHOP_COLS)
        row (js/Math.floor (/ i SHOP_COLS))]
    {:x (+ SHOP_X0 (* col (+ SHOP_TILE_W SHOP_GAP)))
     :y (+ SHOP_Y0 (* row (+ SHOP_TILE_H SHOP_GAP)))
     :w SHOP_TILE_W
     :h SHOP_TILE_H}))

(defn draw-shop []
  (let [pulse (+ 0.55 (* 0.45 (js/Math.sin (/ (.now js/performance) 220))))]
    (set! (.-textAlign ctx) "center")
    (set! (.-fillStyle ctx) ACCENT)
    (set! (.-font ctx) "bold 32px monospace")
    (set! (.-shadowColor ctx) ACCENT)
    (set! (.-shadowBlur ctx) 16)
    (.fillText ctx "SHOP" (/ (.-width canvas/canvas) 2) 52)
    (set! (.-shadowBlur ctx) 0)

    ;; Purse
    (set! (.-font ctx) "18px monospace")
    (set! (.-textAlign ctx) "right")
    (set! (.-fillStyle ctx) "#fff")
    (let [total-str (str (.-coinTotal game-state))]
      (.fillText ctx total-str (- (.-width canvas/canvas) 40) 46)
      (draw-coin-icon (- (.-width canvas/canvas) 40 (.-width (.measureText ctx total-str)) 16) 40 9))

    (dotimes [i (.-length shop-items)]
      (let [item (aget shop-items i)
            r (shop-tile-rect i)
            is-owned (.includes (.-owned game-state) (.-id item))
            is-equipped (= (aget (.-equipped game-state) (.-kind item)) (.-id item))
            can-buy (and (not is-owned) (>= (.-coinTotal game-state) (.-price item)))]
        (set! (.-fillStyle ctx)
              (cond
                is-equipped "rgba(255,0,255,0.10)"
                can-buy "rgba(0,255,136,0.10)"
                :else "rgba(0,0,0,0.28)"))
        (.beginPath ctx)
        (.roundRect ctx (.-x r) (.-y r) (.-w r) (.-h r) 10)
        (.fill ctx)

        (cond
          is-equipped
          (do
            (set! (.-strokeStyle ctx) ACCENT)
            (set! (.-lineWidth ctx) 3))
          can-buy
          (do
            (set! (.-globalAlpha ctx) pulse)
            (set! (.-strokeStyle ctx) PLAYER_COLOR)
            (set! (.-lineWidth ctx) 2))
          :else
          (do
            (set! (.-strokeStyle ctx) "rgba(255,255,255,0.14)")
            (set! (.-lineWidth ctx) 2)))
        (.stroke ctx)
        (set! (.-globalAlpha ctx) 1)

        ;; Index, so the tiles can also be picked from the keyboard
        (set! (.-textAlign ctx) "left")
        (set! (.-font ctx) "12px monospace")
        (set! (.-fillStyle ctx) "rgba(255,255,255,0.35)")
        (.fillText ctx (str (inc i)) (+ (.-x r) 10) (+ (.-y r) 20))

        ;; Owned cubes read as spent: dimmed unless they are the ones in play
        (set! (.-globalAlpha ctx) (if (and is-owned (not is-equipped)) 0.4 1))
        (let [color (if (= (.-kind item) "color") (.-value item) (equipped-color))
              shape (if (= (.-kind item) "shape") (.-value item) (equipped-shape))]
          (.save ctx)
          (.translate ctx (+ (.-x r) (/ (.-w r) 2)) (+ (.-y r) 48))
          (draw-cube 44 color shape)
          (.restore ctx))

        (set! (.-textAlign ctx) "center")
        (set! (.-font ctx) "bold 15px monospace")
        (set! (.-fillStyle ctx) "#fff")
        (.fillText ctx (.-name item) (+ (.-x r) (/ (.-w r) 2)) (+ (.-y r) 92))
        (set! (.-globalAlpha ctx) 1)

        (set! (.-font ctx) "13px monospace")
        (cond
          is-equipped
          (do
            (set! (.-fillStyle ctx) ACCENT)
            (.fillText ctx "EQUIPPED" (+ (.-x r) (/ (.-w r) 2)) (+ (.-y r) 114)))

          is-owned
          (do
            (set! (.-fillStyle ctx) "rgba(255,255,255,0.45)")
            (.fillText ctx "OWNED - TAP TO WEAR" (+ (.-x r) (/ (.-w r) 2)) (+ (.-y r) 114)))

          :else
          (let [price (str (.-price item))
                price-w (.-width (.measureText ctx price))]
            (set! (.-globalAlpha ctx) (if can-buy 1 0.45))
            (draw-coin-icon (+ (- (+ (.-x r) (/ (.-w r) 2)) (/ price-w 2)) -12) (+ (.-y r) 110) 7)
            (set! (.-fillStyle ctx) (if can-buy COIN_COLOR "rgba(255,255,255,0.5)"))
            (set! (.-textAlign ctx) "left")
            (.fillText ctx price (+ (- (+ (.-x r) (/ (.-w r) 2)) (/ price-w 2)) 2) (+ (.-y r) 114))
            (set! (.-globalAlpha ctx) 1)))))

    (draw-button SHOP_BACK_BTN "BACK")

    (set! (.-textAlign ctx) "center")
    (set! (.-font ctx) "14px monospace")
    (set! (.-fillStyle ctx) "rgba(255,255,255,0.5)")
    (.fillText ctx "Tap an item to buy or wear it  |  1-8 = select  |  Esc = back" (+ (/ (.-width canvas/canvas) 2) 50) 422)
    (set! (.-textAlign ctx) "left")))
