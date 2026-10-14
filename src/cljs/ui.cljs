(ns ui
  (:require ["./constants.js" :refer [ACCENT PLAYER_COLOR COIN_COLOR
                                      LEVEL_BACK_BTN LEVEL_RANDOM_BTN
                                      START_PLAY_BTN START_EDITOR_BTN
                                      START_LEVELS_BTN START_SHOP_BTN
                                      level-row-btn level-copy-btn]]
            ["./canvas.js" :refer [canvas ctx draw-button draw-cube]]
            ["./shop.js" :refer [equipped-color equipped-shape shop-has-affordable]]
            ["./state.js" :refer [game-state]]))

(defn go-home
  "Leaves a run for the main menu. The next start press builds a fresh level."
  []
  (set! (.-state game-state) "start")
  (set! (.-playingEditorLevel game-state) false))

(defn draw-splash []
  (set! (.-textAlign ctx) "center")
  (set! (.-fillStyle ctx) ACCENT)
  (set! (.-font ctx) "bold 64px monospace")
  (set! (.-shadowColor ctx) ACCENT)
  (set! (.-shadowBlur ctx) 30)
  (.fillText ctx "BLOCK FLASH" (/ (.-width canvas) 2) (- (/ (.-height canvas) 2) 10))
  (set! (.-shadowBlur ctx) 0)

  (let [pulse (+ 0.55 (* 0.45 (js/Math.sin (/ (.now js/performance) 400))))]
    (set! (.-fillStyle ctx) (str "rgba(255,255,255," pulse ")"))
    (set! (.-font ctx) "20px monospace")
    (.fillText ctx "press a button to play" (/ (.-width canvas) 2) (+ (/ (.-height canvas) 2) 40))))

(defn draw-start-screen []
  (set! (.-fillStyle ctx) ACCENT)
  (set! (.-font ctx) "bold 46px monospace")
  (set! (.-textAlign ctx) "center")
  (set! (.-shadowColor ctx) ACCENT)
  (set! (.-shadowBlur ctx) 20)
  (.fillText ctx "BLOCK FLASH" (/ (.-width canvas) 2) 85)
  (set! (.-shadowBlur ctx) 0)

  ;; Big Play Button
  (draw-button START_PLAY_BTN "▶ PLAY"
              {:stroke PLAYER_COLOR
               :fill "rgba(0, 255, 136, 0.18)"
               :pulse true
               :font "bold 18px monospace"
               :textColor PLAYER_COLOR})

  ;; Animated player icon, wearing whatever is equipped
  (let [t (/ (.now js/performance) 1000)
        by (* (js/Math.sin (* t 3)) 6)]
    (.save ctx)
    (.translate ctx (/ (.-width canvas) 2) (+ 225 by))
    (.rotate ctx (* t 2))
    (draw-cube 38 (equipped-color) (equipped-shape))
    (.restore ctx))

  ;; Navigation button bar
  (draw-button START_EDITOR_BTN "🛠 EDITOR"
              {:stroke "#ffaa00"
               :fill "rgba(255, 170, 0, 0.14)"
               :textColor "#ffaa00"})
  (draw-button START_LEVELS_BTN "📋 LEVELS"
              {:stroke "#00d4ff"
               :fill "rgba(0, 212, 255, 0.14)"
               :textColor "#00d4ff"})
  (let [canBuy (shop-has-affordable)]
    (draw-button START_SHOP_BTN "🛒 SHOP"
                (if canBuy
                  {:stroke PLAYER_COLOR :fill "rgba(0,255,136,0.18)" :pulse true :textColor PLAYER_COLOR}
                  {:stroke "#ff44aa" :fill "rgba(255,68,170,0.14)" :textColor "#ff44aa"})))

  ;; Helper text
  (set! (.-font ctx) "13px monospace")
  (set! (.-fillStyle ctx) "rgba(255,255,255,0.45)")
  (set! (.-textAlign ctx) "center")
  (.fillText ctx "Space = Play  |  E = Editor  |  L = Levels  |  S = Shop" (/ (.-width canvas) 2) 360)

  ;; Coins collected across every run so far
  (let [totalText (str "x " (.-coinTotal game-state) " collected")]
    (set! (.-font ctx) "16px monospace")
    (let [textWidth (.-width (.measureText ctx totalText))
          coinX (- (/ (.-width canvas) 2) (/ textWidth 2) 14)
          rowY (- (.-height canvas) 30)]
      (set! (.-fillStyle ctx) COIN_COLOR)
      (.beginPath ctx)
      (.arc ctx coinX (- rowY 5) 9 0 (* js/Math.PI 2))
      (.fill ctx)
      (set! (.-strokeStyle ctx) "#b8860b")
      (set! (.-lineWidth ctx) 2)
      (.stroke ctx)
      (set! (.-fillStyle ctx) "#fff")
      (set! (.-textAlign ctx) "left")
      (.fillText ctx totalText (+ coinX 14) rowY))))

(defn draw-level-select []
  (draw-button LEVEL_BACK_BTN "◀ BACK")

  (set! (.-fillStyle ctx) ACCENT)
  (set! (.-font ctx) "bold 28px monospace")
  (set! (.-textAlign ctx) "center")
  (set! (.-textBaseline ctx) "alphabetic")
  (set! (.-shadowColor ctx) ACCENT)
  (set! (.-shadowBlur ctx) 15)
  (.fillText ctx "SELECT LEVEL" (/ (.-width canvas) 2) 42)
  (set! (.-shadowBlur ctx) 0)

  ;; Random level
  (draw-button LEVEL_RANDOM_BTN "▶ 0: Random Level (Standard)"
              {:stroke PLAYER_COLOR
               :fill "rgba(0,255,136,0.12)"
               :font "bold 15px monospace"
               :textColor PLAYER_COLOR})

  (let [savedCount (.-length (.-savedLevels game-state))
        maxShow (js/Math.min savedCount 6)]
    (if (zero? savedCount)
      (do
        (set! (.-font ctx) "15px monospace")
        (set! (.-fillStyle ctx) "rgba(255,255,255,0.55)")
        (set! (.-textAlign ctx) "center")
        (.fillText ctx "No custom levels saved yet. Create one in the Editor!" (/ (.-width canvas) 2) 170))
      (dotimes [i maxShow]
        (let [rowBtn (level-row-btn i)
              copyBtn (level-copy-btn i)
              isCopied (= (.-copiedLevelIndex game-state) i)
              level (aget (.-savedLevels game-state) i)
              label (str (inc i) ": " (.-name level) " (" (.-length (.-obstacles level)) " objects)")]
          (draw-button rowBtn label {:font "14px monospace"})
          (draw-button copyBtn (if isCopied "COPIED!" "COPY")
                      {:stroke (if isCopied PLAYER_COLOR "rgba(0,212,255,0.5)")
                       :fill (if isCopied "rgba(0,255,136,0.18)" "rgba(0,212,255,0.1)")
                       :font "bold 13px monospace"
                       :textColor (if isCopied PLAYER_COLOR "#00d4ff")})))))

  (set! (.-font ctx) "13px monospace")
  (set! (.-fillStyle ctx) "rgba(255,255,255,0.45)")
  (set! (.-textAlign ctx) "center")
  (.fillText ctx "Tap level to play  |  COPY = share link  |  Number keys / Esc also work" (/ (.-width canvas) 2) 420)
  (set! (.-textAlign ctx) "left"))
