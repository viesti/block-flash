(ns editor
  (:require ["./constants.js" :refer [GROUND_Y GROUND_COLOR PLAYER_SIZE SPIKE_COLOR
                                      BLOCK_COLOR PLAYER_COLOR CITY_STRIP_W
                                      EDITOR_SPIKE_BTN EDITOR_BLOCK_BTN EDITOR_ERASER_BTN
                                      EDITOR_SCROLL_L_BTN EDITOR_SCROLL_R_BTN
                                      EDITOR_PLAY_BTN EDITOR_SAVE_BTN EDITOR_BACK_BTN]]
            ["./canvas.js" :refer [canvas ctx draw-button in-rect]]
            ["./storage.js" :refer [save-levels]]
            ["./effects.js" :refer [draw-ambient-specks draw-city-layer draw-goal-post]]
            ["./level.js" :refer [get-level-end]]
            ["./state.js" :refer [game-state]]))

(defn snap-to-grid [val]
  (* (js/Math.floor (/ val PLAYER_SIZE)) PLAYER_SIZE))

(defn save-level []
  (let [name (js/prompt "Level name:" (or (.-editorLevelName game-state) ""))]
    (when name
      (set! (.-editorLevelName game-state) name)
      (let [idx (.findIndex (.-savedLevels game-state) (fn [l] (= (.-name l) name)))
            data {:name name
                  :obstacles (.map (.-editorObstacles game-state)
                                   (fn [o] {:type (.-type o) :x (.-x o) :y (.-y o) :w (.-w o) :h (.-h o)}))}]
        (if (>= idx 0)
          (aset (.-savedLevels game-state) idx data)
          (.push (.-savedLevels game-state) data))
        (save-levels (.-savedLevels game-state))))))

(defn start-editor-level []
  (set! (.-playingEditorLevel game-state) true)
  (set! (.-player game-state)
        {:x 100 :y (- GROUND_Y PLAYER_SIZE) :vy 0 :onGround true :rotation 0})
  (set! (.-camera game-state) 0)
  (set! (.-obstacles game-state)
        (.map (.-editorObstacles game-state) (fn [o] (js/Object.assign #js {} o))))
  (set! (.-coins game-state) #js [])
  (set! (.-coinsCollected game-state) 0)
  (set! (.-particles game-state) #js [])
  (set! (.-score game-state) 0)
  (set! (.-goalCrossed game-state) false)
  (set! (.-winDelay game-state) 0)
  (set! (.-goalFlash game-state) 0)
  (set! (.-goalRipples game-state) #js [])
  (set! (.-state game-state) "playing"))

(defn editor-pointer [p isRightClick]
  (if (<= (.-y p) 48)
    (cond
      (in-rect p EDITOR_SPIKE_BTN) (do (set! (.-editorTool game-state) "spike") true)
      (in-rect p EDITOR_BLOCK_BTN) (do (set! (.-editorTool game-state) "block") true)
      (in-rect p EDITOR_ERASER_BTN) (do (set! (.-editorTool game-state) "eraser") true)
      (in-rect p EDITOR_SCROLL_L_BTN)
      (do
        (set! (.-editorCamera game-state) (js/Math.max 0 (- (.-editorCamera game-state) (* PLAYER_SIZE 3))))
        true)
      (in-rect p EDITOR_SCROLL_R_BTN)
      (do
        (set! (.-editorCamera game-state) (+ (.-editorCamera game-state) (* PLAYER_SIZE 3)))
        true)
      (in-rect p EDITOR_PLAY_BTN) (do (start-editor-level) true)
      (in-rect p EDITOR_SAVE_BTN)
      (do
        (save-level)
        (set! (.-editorSavedFeedback game-state) 1.5)
        true)
      (in-rect p EDITOR_BACK_BTN) (do (set! (.-state game-state) "start") true)
      :else true)

    (let [worldX (snap-to-grid (+ (.-x p) (.-editorCamera game-state)))
          worldY (snap-to-grid (.-y p))]
      (if (or isRightClick (= (.-editorTool game-state) "eraser"))
        (let [idx (.findIndex (.-editorObstacles game-state)
                              (fn [o]
                                (if (or (< worldX (.-x o)) (>= worldX (+ (.-x o) (.-w o))))
                                  false
                                  (if (= (.-type o) "spike")
                                    (and (>= worldY (- (.-y o) (.-h o))) (< worldY (.-y o)))
                                    (and (>= worldY (.-y o)) (< worldY (+ (.-y o) (.-h o))))))))]
          (when (>= idx 0)
            (.splice (.-editorObstacles game-state) idx 1))
          true)

        (let [exists (.some (.-editorObstacles game-state)
                            (fn [o]
                              (and (= (.-x o) worldX)
                                   (= (.-y o) (if (= (.-editorTool game-state) "spike") GROUND_Y worldY)))))]
          (if exists
            true
            (do
              (if (= (.-editorTool game-state) "spike")
                (.push (.-editorObstacles game-state)
                       {:type "spike" :x worldX :y GROUND_Y :w PLAYER_SIZE :h PLAYER_SIZE})
                (let [py (if (< worldY GROUND_Y) worldY (- GROUND_Y PLAYER_SIZE))]
                  (.push (.-editorObstacles game-state)
                         {:type "block" :x worldX :y py :w PLAYER_SIZE :h PLAYER_SIZE})))
              true)))))))

(defn draw-editor []
  (let [cx (.-editorCamera game-state)]
    ;; 2-layer city skyline in editor background
    (draw-ambient-specks)
    (draw-city-layer (.-farCityBuildings game-state) CITY_STRIP_W 0.10 "#130b28" "rgba(255,255,255,0.025)" cx)
    (draw-city-layer (.-nearCityBuildings game-state) CITY_STRIP_W 0.25 "#17173b" "rgba(255,255,255,0.045)" cx)

    ;; Ground with glowing pink line
    (.save ctx)
    (set! (.-fillStyle ctx) GROUND_COLOR)
    (.fillRect ctx 0 GROUND_Y (.-width canvas) (- (.-height canvas) GROUND_Y))
    (set! (.-strokeStyle ctx) "rgba(255,255,255,0.04)")
    (set! (.-lineWidth ctx) 1)
    (let [editorStripeOffset (- (mod (* cx 0.5) 36))]
      (.beginPath ctx)
      (loop [x (- editorStripeOffset 36)]
        (when (< x (+ (.-width canvas) 50))
          (.moveTo ctx x GROUND_Y)
          (.lineTo ctx (- x 30) (.-height canvas))
          (recur (+ x 36))))
      (.stroke ctx))
    (set! (.-strokeStyle ctx) "#ff00d4")
    (set! (.-lineWidth ctx) 2.5)
    (set! (.-shadowColor ctx) "#ff00d4")
    (set! (.-shadowBlur ctx) 12)
    (.beginPath ctx)
    (.moveTo ctx 0 GROUND_Y)
    (.lineTo ctx (.-width canvas) GROUND_Y)
    (.stroke ctx)
    (.restore ctx)

    ;; Grid
    (set! (.-strokeStyle ctx) "rgba(255,255,255,0.08)")
    (set! (.-lineWidth ctx) 1)
    (loop [x (- (mod cx PLAYER_SIZE))]
      (when (< x (.-width canvas))
        (.beginPath ctx) (.moveTo ctx x 0) (.lineTo ctx x GROUND_Y) (.stroke ctx)
        (recur (+ x PLAYER_SIZE))))
    (loop [y 0]
      (when (< y GROUND_Y)
        (.beginPath ctx) (.moveTo ctx 0 y) (.lineTo ctx (.-width canvas) y) (.stroke ctx)
        (recur (+ y PLAYER_SIZE))))

    ;; Obstacles
    (doseq [ob (.-editorObstacles game-state)]
      (let [sx (- (.-x ob) cx)]
        (when-not (or (> sx (+ (.-width canvas) 50)) (< (+ sx (.-w ob)) -50))
          (if (= (.-type ob) "spike")
            (do
              (set! (.-fillStyle ctx) SPIKE_COLOR)
              (.beginPath ctx)
              (.moveTo ctx sx (.-y ob))
              (.lineTo ctx (+ sx (/ (.-w ob) 2)) (- (.-y ob) (.-h ob)))
              (.lineTo ctx (+ sx (.-w ob)) (.-y ob))
              (.closePath ctx)
              (.fill ctx))
            (do
              (set! (.-fillStyle ctx) BLOCK_COLOR)
              (.fillRect ctx sx (.-y ob) (.-w ob) (.-h ob))
              (set! (.-strokeStyle ctx) "#6666ff")
              (set! (.-lineWidth ctx) 2)
              (.strokeRect ctx sx (.-y ob) (.-w ob) (.-h ob)))))))

    ;; Goal post
    (let [editorLevelEnd (get-level-end (.-editorObstacles game-state) true "editor")]
      (draw-goal-post editorLevelEnd (.-editorCamera game-state) false))

    ;; Toolbar
    (set! (.-fillStyle ctx) "rgba(14, 10, 26, 0.9)")
    (.fillRect ctx 0 0 (.-width canvas) 48)
    (set! (.-strokeStyle ctx) "rgba(255, 255, 255, 0.15)")
    (set! (.-lineWidth ctx) 1)
    (.beginPath ctx) (.moveTo ctx 0 48) (.lineTo ctx (.-width canvas) 48) (.stroke ctx)

    ;; Tool buttons
    (draw-button EDITOR_SPIKE_BTN "▲ SPIKE"
                (if (= (.-editorTool game-state) "spike")
                  {:stroke SPIKE_COLOR :fill "rgba(255,34,85,0.28)" :textColor "#fff"}
                  {:stroke "rgba(255,255,255,0.2)" :fill "rgba(0,0,0,0.4)" :textColor "rgba(255,255,255,0.6)"}))
    (draw-button EDITOR_BLOCK_BTN "■ BLOCK"
                (if (= (.-editorTool game-state) "block")
                  {:stroke "#6688ff" :fill "rgba(68,100,255,0.28)" :textColor "#fff"}
                  {:stroke "rgba(255,255,255,0.2)" :fill "rgba(0,0,0,0.4)" :textColor "rgba(255,255,255,0.6)"}))
    (draw-button EDITOR_ERASER_BTN "✖ ERASE"
                (if (= (.-editorTool game-state) "eraser")
                  {:stroke "#ff00ff" :fill "rgba(255,0,255,0.28)" :textColor "#fff"}
                  {:stroke "rgba(255,255,255,0.2)" :fill "rgba(0,0,0,0.4)" :textColor "rgba(255,255,255,0.6)"}))

    ;; Camera scroll buttons
    (draw-button EDITOR_SCROLL_L_BTN "◀" {:font "bold 16px monospace"})
    (draw-button EDITOR_SCROLL_R_BTN "▶" {:font "bold 16px monospace"})

    ;; Level info
    (set! (.-font ctx) "13px monospace")
    (set! (.-fillStyle ctx) "#fff")
    (set! (.-textAlign ctx) "left")
    (set! (.-textBaseline ctx) "middle")
    (.fillText ctx (str (or (.-editorLevelName game-state) "New Level") " (" (.-length (.-editorObstacles game-state)) " obj)") 364 24)

    ;; Action buttons
    (draw-button EDITOR_PLAY_BTN "▶ PLAY" {:stroke PLAYER_COLOR :fill "rgba(0,255,136,0.15)" :textColor PLAYER_COLOR})
    (draw-button EDITOR_SAVE_BTN (if (pos? (.-editorSavedFeedback game-state)) "SAVED!" "💾 SAVE")
                {:stroke "#ffd700" :fill "rgba(255,215,0,0.15)" :textColor "#ffd700"})
    (draw-button EDITOR_BACK_BTN "◀ BACK")

    ;; Bottom helper text
    (set! (.-font ctx) "12px monospace")
    (set! (.-fillStyle ctx) "rgba(255,255,255,0.45)")
    (set! (.-textAlign ctx) "center")
    (set! (.-textBaseline ctx) "alphabetic")
    (.fillText ctx "Tap tools or 1/2/3  |  ◀ ▶ or A/D = scroll  |  Tap grid = place/erase  |  SAVE / PLAY / BACK" (/ (.-width canvas) 2) (- (.-height canvas) 12))
    (set! (.-textAlign ctx) "left")))
