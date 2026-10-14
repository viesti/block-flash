(ns gameplay
  (:require ["./constants.js" :refer [GROUND_Y PLAYER_SIZE GRAVITY JUMP_VEL
                                      GAME_SPEED COIN_RADIUS PLAYER_COLOR GROUND_COLOR
                                      SPIKE_COLOR BLOCK_COLOR CITY_STRIP_W
                                      PLAYER_TRAIL_LENGTH BG_COLORS COIN_COLOR
                                      DEAD_RETRY_BTN_SOLO DEAD_RETRY_BTN_PAIR
                                      DEAD_EDITOR_BTN HOME_BTN]]
            ["./canvas.js" :refer [canvas ctx draw-button draw-cube]]
            ["./state.js" :refer [game-state bank-coin]]
            ["./physics.js" :refer [collides-with-spike collides-aabb]]
            ["./level.js" :refer [build-level place-coins get-level-end]]
            ["./effects.js" :refer [update-ambient-specks update-jump-rings draw-ambient-specks
                                    draw-city-layer draw-goal-post draw-jump-rings draw-player-trail
                                    spawn-particles spawn-coin-sparkle spawn-goal-celebration spawn-jump-ring]]
            ["./audio.js" :refer [in-level]]
            ["./win.js" :refer [update-win-celebration init-win-celebration draw-win-screen]]
            ["./shop.js" :refer [equipped-color equipped-shape draw-shop]]
            ["./editor.js" :refer [draw-editor]]
            ["./ui.js" :refer [draw-splash draw-start-screen draw-level-select]]))

(defn trigger-player-jump []
  (set! (.-vy (.-player game-state)) JUMP_VEL)
  (set! (.-onGround (.-player game-state)) false)
  (spawn-jump-ring (+ (.-x (.-player game-state)) (/ PLAYER_SIZE 2))
                 (+ (.-y (.-player game-state)) (/ PLAYER_SIZE 2))))

(defn die []
  (spawn-particles (+ (.-x (.-player game-state)) (/ PLAYER_SIZE 2))
                  (+ (.-y (.-player game-state)) (/ PLAYER_SIZE 2)))
  (set! (.-state game-state) "dead")
  (set! (.-deathTime game-state) (.now js/performance))
  (set! (.-playerTrail game-state) #js []))

(defn reset [customObstacles]
  (set! (.-player game-state)
        {:x 100 :y (- GROUND_Y PLAYER_SIZE) :vy 0 :onGround true :rotation 0})
  (set! (.-camera game-state) 0)
  (set! (.-obstacles game-state)
        (if customObstacles
          (.map customObstacles (fn [o] (js/Object.assign #js {} o)))
          (build-level)))
  (set! (.-coins game-state)
        (if customObstacles
          #js []
          (place-coins (.-obstacles game-state))))
  (set! (.-coinsCollected game-state) 0)
  (set! (.-particles game-state) #js [])
  (set! (.-playerTrail game-state) #js [])
  (set! (.-jumpRings game-state) #js [])
  (set! (.-score game-state) 0)
  (set! (.-goalCrossed game-state) false)
  (set! (.-winDelay game-state) 0)
  (set! (.-goalFlash game-state) 0)
  (set! (.-goalRipples game-state) #js []))

(defn update [dt]
  (when (pos? (.-editorSavedFeedback game-state))
    (set! (.-editorSavedFeedback game-state) (js/Math.max 0 (- (.-editorSavedFeedback game-state) dt))))

  (doseq [p (.-particles game-state)]
    (set! (.-x p) (+ (.-x p) (* (.-vx p) dt)))
    (set! (.-y p) (+ (.-y p) (* (.-vy p) dt)))
    (set! (.-vy p) (+ (.-vy p) (* 400 dt)))
    (set! (.-life p) (- (.-life p) (* dt 1.5))))
  (set! (.-particles game-state)
        (.filter (.-particles game-state) (fn [p] (pos? (.-life p)))))

  (update-ambient-specks dt)
  (update-jump-rings dt)

  (doseq [r (.-goalRipples game-state)]
    (set! (.-r r) (+ (.-r r) (* 260 dt)))
    (set! (.-life r) (- (.-life r) (* dt 1.8))))
  (set! (.-goalRipples game-state)
        (.filter (.-goalRipples game-state) (fn [r] (pos? (.-life r)))))

  (when (pos? (.-goalFlash game-state))
    (set! (.-goalFlash game-state) (js/Math.max 0 (- (.-goalFlash game-state) (* dt 2.5)))))

  (cond
    (= (.-state game-state) "win")
    (update-win-celebration dt)

    (not= (.-state game-state) "playing")
    (set! (.-playerTrail game-state) #js [])

    :else
    (do
      ;; Player motion trail (vana)
      (.unshift (.-playerTrail game-state)
                {:x (.-x (.-player game-state))
                 :y (.-y (.-player game-state))
                 :rotation (.-rotation (.-player game-state))
                 :color (equipped-color)
                 :shape (equipped-shape)})
      (when (> (.-length (.-playerTrail game-state)) PLAYER_TRAIL_LENGTH)
        (set! (.-length (.-playerTrail game-state)) PLAYER_TRAIL_LENGTH))

      ;; Move player forward
      (set! (.-x (.-player game-state)) (+ (.-x (.-player game-state)) (* GAME_SPEED dt)))
      (set! (.-camera game-state) (- (.-x (.-player game-state)) 100))

      ;; Gravity
      (set! (.-vy (.-player game-state)) (+ (.-vy (.-player game-state)) (* GRAVITY dt)))
      (set! (.-y (.-player game-state)) (+ (.-y (.-player game-state)) (* (.-vy (.-player game-state)) dt)))

      ;; Ground collision
      (when (>= (+ (.-y (.-player game-state)) PLAYER_SIZE) GROUND_Y)
        (set! (.-y (.-player game-state)) (- GROUND_Y PLAYER_SIZE))
        (set! (.-vy (.-player game-state)) 0)
        (set! (.-onGround (.-player game-state)) true)
        (when (.-jumpPressed game-state)
          (trigger-player-jump)))

      ;; Rotation (visual spin when airborne)
      (if-not (.-onGround (.-player game-state))
        (set! (.-rotation (.-player game-state)) (+ (.-rotation (.-player game-state)) (* 6 dt)))
        (set! (.-rotation (.-player game-state))
              (* (js/Math.round (/ (.-rotation (.-player game-state)) (/ js/Math.PI 2)))
                 (/ js/Math.PI 2))))

      ;; If goal was crossed, player glides smoothly through the goalpost into victory
      (if (.-goalCrossed game-state)
        (do
          (set! (.-winDelay game-state) (- (.-winDelay game-state) dt))
          (when (<= (.-winDelay game-state) 0)
            (set! (.-state game-state) "win")
            (init-win-celebration)))

        (do
          ;; Block landing (stand on blocks)
          (doseq [ob (.-obstacles game-state)]
            (when (and (= (.-state game-state) "playing") (= (.-type ob) "block"))
              (when (collides-aabb (.-x (.-player game-state)) (.-y (.-player game-state))
                                  PLAYER_SIZE PLAYER_SIZE
                                  (.-x ob) (.-y ob) (.-w ob) (.-h ob))
                (let [overlapBottom (- (+ (.-y (.-player game-state)) PLAYER_SIZE) (.-y ob))
                      overlapTop (- (+ (.-y ob) (.-h ob)) (.-y (.-player game-state)))
                      overlapLeft (- (+ (.-x (.-player game-state)) PLAYER_SIZE) (.-x ob))
                      overlapRight (- (+ (.-x ob) (.-w ob)) (.-x (.-player game-state)))
                      minOverlap (js/Math.min overlapBottom overlapTop overlapLeft overlapRight)]
                  (cond
                    (and (= minOverlap overlapBottom) (>= (.-vy (.-player game-state)) 0))
                    (do
                      (set! (.-y (.-player game-state)) (- (.-y ob) PLAYER_SIZE))
                      (set! (.-vy (.-player game-state)) 0)
                      (set! (.-onGround (.-player game-state)) true)
                      (when (.-jumpPressed game-state)
                        (trigger-player-jump)))

                    (or (= minOverlap overlapLeft) (= minOverlap overlapRight))
                    (let [supported (.some (.-obstacles game-state)
                                           (fn [other]
                                             (and (= (.-type other) "block")
                                                  (not= other ob)
                                                  (= (.-y other) (.-y ob))
                                                  (> (+ (.-x (.-player game-state)) PLAYER_SIZE) (.-x other))
                                                  (< (.-x (.-player game-state)) (+ (.-x other) (.-w other)))
                                                  (<= (+ (.-y (.-player game-state)) PLAYER_SIZE) (+ (.-y other) 4)))))]
                      (if (or supported (and (>= (.-vy (.-player game-state)) 0) (<= overlapBottom (/ PLAYER_SIZE 2))))
                        (do
                          (set! (.-y (.-player game-state)) (- (.-y ob) PLAYER_SIZE))
                          (set! (.-vy (.-player game-state)) 0)
                          (set! (.-onGround (.-player game-state)) true)
                          (when (.-jumpPressed game-state)
                            (trigger-player-jump)))
                        (die)))

                    :else
                    (die))))))

          ;; Spike collision
          (when (= (.-state game-state) "playing")
            (doseq [ob (.-obstacles game-state)]
              (when (and (= (.-state game-state) "playing") (= (.-type ob) "spike"))
                (when (collides-with-spike (.-x (.-player game-state)) (.-y (.-player game-state))
                                         PLAYER_SIZE
                                         (.-x ob) (.-y ob) (.-w ob) (.-h ob))
                  (die)))))

          ;; Coin pickup
          (when (= (.-state game-state) "playing")
            (doseq [coin (.-coins game-state)]
              (when-not (.-taken coin)
                (when (collides-aabb (.-x (.-player game-state)) (.-y (.-player game-state))
                                    PLAYER_SIZE PLAYER_SIZE
                                    (- (.-x coin) COIN_RADIUS) (- (.-y coin) COIN_RADIUS)
                                    (* COIN_RADIUS 2) (* COIN_RADIUS 2))
                  (set! (.-taken coin) true)
                  (set! (.-coinsCollected game-state) (inc (.-coinsCollected game-state)))
                  (bank-coin)
                  (spawn-coin-sparkle (.-x coin) (.-y coin))))))

          ;; Fall off screen
          (when (= (.-state game-state) "playing")
            (if (> (.-y (.-player game-state)) (+ (.-height canvas) 100))
              (die)
              (let [levelEnd (get-level-end)]
                (set! (.-score game-state)
                      (js/Math.min 100
                                   (js/Math.floor (* (/ (- (.-x (.-player game-state)) 100)
                                                        (- levelEnd 100))
                                                     100))))
                (when (>= (.-x (.-player game-state)) levelEnd)
                  (set! (.-goalCrossed game-state) true)
                  (set! (.-goalFlash game-state) 1.0)
                  (set! (.-winDelay game-state) 0.45)
                  (spawn-goal-celebration levelEnd (+ (.-y (.-player game-state)) (/ PLAYER_SIZE 2))))))))))))

(defn draw []
  ;; Background gradient
  (let [grad (.createLinearGradient ctx 0 0 0 (.-height canvas))]
    (.addColorStop grad 0 (aget BG_COLORS 0))
    (.addColorStop grad 1 (aget BG_COLORS 1))
    (set! (.-fillStyle ctx) grad)
    (.fillRect ctx 0 0 (.-width canvas) (.-height canvas)))

  ;; Background grid lines (parallax)
  (set! (.-strokeStyle ctx) "rgba(255,255,255,0.04)")
  (set! (.-lineWidth ctx) 1)
  (let [gridSize 60
        parallax (if (in-level) (* (.-camera game-state) 0.3) 0)]
    (loop [x (- (mod parallax gridSize))]
      (when (< x (.-width canvas))
        (.beginPath ctx) (.moveTo ctx x 0) (.lineTo ctx x (.-height canvas)) (.stroke ctx)
        (recur (+ x gridSize))))
    (loop [y 0]
      (when (< y (.-height canvas))
        (.beginPath ctx) (.moveTo ctx 0 y) (.lineTo ctx (.-width canvas) y) (.stroke ctx)
        (recur (+ y gridSize)))))

  ;; Floating ambient specks
  (draw-ambient-specks)

  (cond
    (= (.-state game-state) "splash") (do (draw-splash) nil)
    (= (.-state game-state) "start") (do (draw-start-screen) nil)
    (= (.-state game-state) "editor") (do (draw-editor) nil)
    (= (.-state game-state) "levelSelect") (do (draw-level-select) nil)
    (= (.-state game-state) "shop") (do (draw-shop) nil)
    :else
    (let [cx (.-camera game-state)]
      ;; 2-layer city skyline in background
      (draw-city-layer (.-farCityBuildings game-state) CITY_STRIP_W 0.10 "#130b28" "rgba(255,255,255,0.025)" cx)
      (draw-city-layer (.-nearCityBuildings game-state) CITY_STRIP_W 0.25 "#17173b" "rgba(255,255,255,0.045)" cx)

      ;; Ground with glowing pink line & diagonal texture
      (.save ctx)
      (set! (.-fillStyle ctx) GROUND_COLOR)
      (.fillRect ctx 0 GROUND_Y (.-width canvas) (- (.-height canvas) GROUND_Y))
      (set! (.-strokeStyle ctx) "rgba(255,255,255,0.04)")
      (set! (.-lineWidth ctx) 1)
      (let [stripeOffset (- (mod (* cx 0.5) 36))]
        (.beginPath ctx)
        (loop [x (- stripeOffset 36)]
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

      ;; Obstacles
      (doseq [ob (.-obstacles game-state)]
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
                (.fill ctx)
                (set! (.-shadowColor ctx) SPIKE_COLOR)
                (set! (.-shadowBlur ctx) 10)
                (.fill ctx)
                (set! (.-shadowBlur ctx) 0))
              (when (= (.-type ob) "block")
                (set! (.-fillStyle ctx) BLOCK_COLOR)
                (.fillRect ctx sx (.-y ob) (.-w ob) (.-h ob))
                (set! (.-strokeStyle ctx) "#6666ff")
                (set! (.-lineWidth ctx) 2)
                (.strokeRect ctx sx (.-y ob) (.-w ob) (.-h ob)))))))

      ;; Coins
      (let [bobTime (/ (.now js/performance) 1000)]
        (doseq [coin (.-coins game-state)]
          (when-not (.-taken coin)
            (let [sx (- (.-x coin) cx)]
              (when-not (or (> sx (+ (.-width canvas) 50)) (< sx -50))
                (let [sy (+ (.-y coin) (* (js/Math.sin (+ (* bobTime 3) (.-phase coin))) 4))]
                  (set! (.-fillStyle ctx) COIN_COLOR)
                  (set! (.-shadowColor ctx) COIN_COLOR)
                  (set! (.-shadowBlur ctx) 12)
                  (.beginPath ctx)
                  (.arc ctx sx sy COIN_RADIUS 0 (* js/Math.PI 2))
                  (.fill ctx)
                  (set! (.-shadowBlur ctx) 0)
                  (set! (.-strokeStyle ctx) "#b8860b")
                  (set! (.-lineWidth ctx) 2)
                  (.stroke ctx)
                  (set! (.-fillStyle ctx) "rgba(255,255,255,0.55)")
                  (.beginPath ctx)
                  (.ellipse ctx (- sx (* COIN_RADIUS 0.25)) (- sy (* COIN_RADIUS 0.3))
                            (* COIN_RADIUS 0.22) (* COIN_RADIUS 0.42) 0 0 (* js/Math.PI 2))
                  (.fill ctx)))))))

      ;; Goal post (at 100% position)
      (let [levelEnd (get-level-end)]
        (draw-goal-post levelEnd cx (or (.-goalCrossed game-state) (= (.-state game-state) "win"))))

      ;; Jump rings
      (draw-jump-rings cx)

      ;; Player motion trail (vana)
      (when (or (= (.-state game-state) "playing") (= (.-state game-state) "win"))
        (draw-player-trail cx))

      ;; Player
      (when (or (= (.-state game-state) "playing") (= (.-state game-state) "win"))
        (.save ctx)
        (let [px (+ (- (.-x (.-player game-state)) cx) (/ PLAYER_SIZE 2))
              py (+ (.-y (.-player game-state)) (/ PLAYER_SIZE 2))]
          (.translate ctx px py)
          (.rotate ctx (.-rotation (.-player game-state)))
          (draw-cube PLAYER_SIZE (equipped-color) (equipped-shape)))
        (.restore ctx))

      ;; Shockwave ripples
      (doseq [r (.-goalRipples game-state)]
        (.save ctx)
        (set! (.-globalAlpha ctx) (js/Math.max 0 (.-life r)))
        (set! (.-strokeStyle ctx) "#ffffff")
        (set! (.-lineWidth ctx) (* 3 (.-life r)))
        (set! (.-shadowColor ctx) "#ffffff")
        (set! (.-shadowBlur ctx) 15)
        (.beginPath ctx)
        (.arc ctx (- (.-x r) cx) (.-y r) (.-r r) 0 (* js/Math.PI 2))
        (.stroke ctx)
        (.restore ctx))

      ;; Particles
      (doseq [p (.-particles game-state)]
        (set! (.-globalAlpha ctx) (.-life p))
        (set! (.-fillStyle ctx) (.-color p))
        (.fillRect ctx (- (- (.-x p) cx) (/ (.-size p) 2)) (- (.-y p) (/ (.-size p) 2)) (.-size p) (.-size p)))
      (set! (.-globalAlpha ctx) 1)

      ;; Goal screen flash
      (when (pos? (.-goalFlash game-state))
        (set! (.-fillStyle ctx) (str "rgba(255, 255, 255, " (* (.-goalFlash game-state) 0.35) ")"))
        (.fillRect ctx 0 0 (.-width canvas) (.-height canvas)))

      ;; Progress bar
      (when (not= (.-state game-state) "win")
        (set! (.-fillStyle ctx) "rgba(255,255,255,0.2)")
        (.fillRect ctx 20 15 200 8)
        (set! (.-fillStyle ctx) PLAYER_COLOR)
        (.fillRect ctx 20 15 (* (.-score game-state) 2) 8)
        ;; Goal beam marker on progress bar (100% mark)
        (set! (.-fillStyle ctx) "#ffffff")
        (set! (.-shadowColor ctx) "#00ff9f")
        (set! (.-shadowBlur ctx) 6)
        (.fillRect ctx 219 11 3 16)
        (set! (.-fillStyle ctx) "#00ff9f")
        (.fillRect ctx 216 17 2 4)
        (set! (.-shadowBlur ctx) 0)
        (set! (.-fillStyle ctx) "#fff")
        (set! (.-font ctx) "14px monospace")
        (.fillText ctx (str (.-score game-state) "%") 230 24)

        ;; Coin counter, omitted in levels that have no coins
        (when (pos? (.-length (.-coins game-state)))
          (set! (.-fillStyle ctx) COIN_COLOR)
          (.beginPath ctx)
          (.arc ctx 300 19 8 0 (* js/Math.PI 2))
          (.fill ctx)
          (set! (.-strokeStyle ctx) "#b8860b")
          (set! (.-lineWidth ctx) 2)
          (.stroke ctx)
          (set! (.-fillStyle ctx) "#fff")
          (.fillText ctx (str "x " (.-coinsCollected game-state)) 314 24)))

      ;; Death screen
      (when (= (.-state game-state) "dead")
        (set! (.-fillStyle ctx) "rgba(0,0,0,0.58)")
        (.fillRect ctx 0 0 (.-width canvas) (.-height canvas))
        (set! (.-fillStyle ctx) SPIKE_COLOR)
        (set! (.-font ctx) "bold 36px monospace")
        (set! (.-textAlign ctx) "center")
        (set! (.-shadowColor ctx) SPIKE_COLOR)
        (set! (.-shadowBlur ctx) 15)
        (.fillText ctx "YOU CRASHED!" (/ (.-width canvas) 2) (- (/ (.-height canvas) 2) 45))
        (set! (.-shadowBlur ctx) 0)

        (if (.-playingEditorLevel game-state)
          (do
            (draw-button DEAD_RETRY_BTN_PAIR "↻ RETRY"
                        {:stroke PLAYER_COLOR :fill "rgba(0,255,136,0.18)" :pulse true :textColor PLAYER_COLOR})
            (draw-button DEAD_EDITOR_BTN "🛠 EDITOR"
                        {:stroke "#ffaa00" :fill "rgba(255,170,0,0.16)" :textColor "#ffaa00"}))
          (draw-button DEAD_RETRY_BTN_SOLO "↻ RETRY"
                      {:stroke PLAYER_COLOR :fill "rgba(0,255,136,0.18)" :pulse true :textColor PLAYER_COLOR}))

        (set! (.-fillStyle ctx) "rgba(255,255,255,0.55)")
        (set! (.-font ctx) "13px monospace")
        (set! (.-textAlign ctx) "center")
        (.fillText ctx
                   (str "Tap button or press Space to retry"
                        (if (.-playingEditorLevel game-state) "  |  E = editor" ""))
                   (/ (.-width canvas) 2)
                   (+ (/ (.-height canvas) 2) 55))
        (set! (.-textAlign ctx) "left"))

      ;; Win screen
      (when (= (.-state game-state) "win")
        (draw-win-screen))

      (draw-button HOME_BTN "HOME"))))
