(ns win
  (:require [constants :refer [GROUND_Y PLAYER_COLOR WIN_EDITOR_BTN
                               WIN_REPLAY_BTN_PAIR WIN_REPLAY_BTN_SOLO]]
            [canvas :refer [ctx draw-button]]
            [state :refer [game-state]]))

(declare spawn-firework)

(defn init-win-celebration
  "Win celebration system (Geometry Dash style victory screen)"
  []
  (set! (.-winTime game-state) 0)
  (set! (.-winStartTime game-state) (.now js/performance))
  (set! (.-winRayAngle game-state) 0)
  (set! (.-winConfetti game-state) #js [])
  (set! (.-winFireworks game-state) #js [])
  (set! (.-winNextFirework game-state) 0.8)

  ;; Populate screen with confetti
  (let [confettiColors #js ["#00f0ff" "#ff0099" "#ffe600" "#00ff66" "#ffffff" "#7038ff"]]
    (dotimes [_ 90]
      (.push (.-winConfetti game-state)
             {:x (* (js/Math.random) (.-width canvas/canvas))
              :y (- (* (js/Math.random) (+ (.-height canvas/canvas) 40)) 40)
              :w (+ 5 (* (js/Math.random) 4))
              :h (+ 8 (* (js/Math.random) 8))
              :vx (* (- (js/Math.random) 0.5) 45)
              :vy (+ 40 (* (js/Math.random) 95))
              :rot (* (js/Math.random) js/Math.PI 2)
              :vRot (* (- (js/Math.random) 0.5) 3)
              :flip (* (js/Math.random) js/Math.PI 2)
              :vFlip (+ 3 (* (js/Math.random) 4))
              :color (aget confettiColors (js/Math.floor (* (js/Math.random) (.-length confettiColors))))
              :phase (* (js/Math.random) js/Math.PI 2)})))

  ;; Initial fireworks (one at top-right, one on left)
  (spawn-firework 680 95)
  (spawn-firework 170 160))

(defn spawn-firework [x y]
  (let [count 30
        spokes #js []
        palette #js ["#00f0ff" "#2979ff" "#ff1493" "#ffffff" "#ffee00" "#00e5ff"]]
    (dotimes [i count]
      (let [angle (+ (* (/ i count) js/Math.PI 2) (* (- (js/Math.random) 0.5) 0.12))
            color (aget palette (js/Math.floor (* (js/Math.random) (.-length palette))))
            dashLen (+ 8 (* (js/Math.random) 8))]
        (.push spokes {:angle angle :color color :dashLen dashLen})))
    (.push (.-winFireworks game-state)
           {:x x
            :y y
            :radius 6
            :maxRadius (+ 52 (* (js/Math.random) 20))
            :spokes spokes
            :life 1.0
            :maxLife (+ 1.2 (* (js/Math.random) 0.3))})))

(defn update-win-celebration [dt]
  (set! (.-winTime game-state) (+ (.-winTime game-state) dt))
  (set! (.-winRayAngle game-state) (+ (.-winRayAngle game-state) (* dt 0.14)))

  (doseq [p (.-winConfetti game-state)]
    (set! (.-x p) (+ (.-x p) (* (+ (.-vx p) (* (js/Math.sin (+ (* (.-winTime game-state) 2) (.-phase p))) 18)) dt)))
    (set! (.-y p) (+ (.-y p) (* (.-vy p) dt)))
    (set! (.-rot p) (+ (.-rot p) (* (.-vRot p) dt)))
    (set! (.-flip p) (+ (.-flip p) (* (.-vFlip p) dt)))
    (when (> (.-y p) (+ (.-height canvas/canvas) 20))
      (set! (.-y p) -20)
      (set! (.-x p) (* (js/Math.random) (.-width canvas/canvas)))))

  (set! (.-winNextFirework game-state) (- (.-winNextFirework game-state) dt))
  (when (<= (.-winNextFirework game-state) 0)
    (spawn-firework (+ 120 (* (js/Math.random) 560)) (+ 50 (* (js/Math.random) 150)))
    (set! (.-winNextFirework game-state) (+ 0.9 (* (js/Math.random) 0.8))))

  (doseq [fw (.-winFireworks game-state)]
    (set! (.-life fw) (- (.-life fw) dt)))
  (set! (.-winFireworks game-state)
        (.filter (.-winFireworks game-state) (fn [fw] (pos? (.-life fw))))))

(defn draw-title-line [text cx y fontSize gradY1 gradY2]
  (.save ctx)
  (set! (.-font ctx) (str "900 " fontSize "px 'Arial Black', Impact, system-ui, sans-serif"))
  (set! (.-textAlign ctx) "center")
  (set! (.-textBaseline ctx) "middle")
  (set! (.-lineJoin ctx) "round")

  (let [grad (.createLinearGradient ctx 0 gradY1 0 gradY2)]
    (.addColorStop grad 0 "#fffb66")
    (.addColorStop grad 0.35 "#ffea00")
    (.addColorStop grad 0.72 "#ccff55")
    (.addColorStop grad 1 "#74ffb6")

    ;; Pass 1: Wide neon yellow bloom
    (set! (.-shadowColor ctx) "#ffea00")
    (set! (.-shadowBlur ctx) 38)
    (set! (.-fillStyle ctx) "#ffea00")
    (.fillText ctx text cx y)

    ;; Pass 2: Core bloom
    (set! (.-shadowColor ctx) "#ffc400")
    (set! (.-shadowBlur ctx) 18)
    (set! (.-fillStyle ctx) "#ffffff")
    (.fillText ctx text cx y)

    ;; Pass 3: Dark contrast outline
    (set! (.-shadowBlur ctx) 0)
    (set! (.-strokeStyle ctx) "rgba(10, 18, 28, 0.88)")
    (set! (.-lineWidth ctx) 7)
    (.strokeText ctx text cx y)

    ;; Pass 4: Gradient fill
    (set! (.-fillStyle ctx) grad)
    (.fillText ctx text cx y)

    ;; Pass 5: Crisp bright edge highlight
    (set! (.-strokeStyle ctx) "rgba(255, 255, 230, 0.92)")
    (set! (.-lineWidth ctx) 2.2)
    (.strokeText ctx text cx y))

  (.restore ctx))

(defn draw-win-screen []
  (let [cx (/ (.-width canvas/canvas) 2)]
    ;; 1. Atmosphere overlay
    (.save ctx)
    (set! (.-fillStyle ctx) "rgba(10, 8, 24, 0.58)")
    (.fillRect ctx 0 0 (.-width canvas/canvas) (.-height canvas/canvas))

    ;; 2. Neon magenta ground laser beam
    (set! (.-strokeStyle ctx) "#ff00d4")
    (set! (.-lineWidth ctx) 4)
    (set! (.-shadowColor ctx) "#ff00d4")
    (set! (.-shadowBlur ctx) 24)
    (.beginPath ctx)
    (.moveTo ctx 0 GROUND_Y)
    (.lineTo ctx (.-width canvas/canvas) GROUND_Y)
    (.stroke ctx)

    (set! (.-strokeStyle ctx) "#ffffff")
    (set! (.-lineWidth ctx) 1.5)
    (set! (.-shadowColor ctx) "#ffffff")
    (set! (.-shadowBlur ctx) 6)
    (.beginPath ctx)
    (.moveTo ctx 0 GROUND_Y)
    (.lineTo ctx (.-width canvas/canvas) GROUND_Y)
    (.stroke ctx)
    (.restore ctx)

    ;; 3. Sunburst / God Rays from the center diamond
    (let [rayCy 260]
      (.save ctx)
      (let [rayGrad (.createRadialGradient ctx cx rayCy 15 cx rayCy 650)]
        (.addColorStop rayGrad 0 "rgba(255, 255, 205, 0.22)")
        (.addColorStop rayGrad 0.35 "rgba(255, 255, 225, 0.13)")
        (.addColorStop rayGrad 0.7 "rgba(255, 255, 240, 0.05)")
        (.addColorStop rayGrad 1 "rgba(255, 255, 255, 0)")
        (set! (.-fillStyle ctx) rayGrad))

      (let [numRays 20
            step (/ (* js/Math.PI 2) numRays)
            rayWidth (* step 0.44)]
        (dotimes [i numRays]
          (let [angle (+ (.-winRayAngle game-state) (* i step))]
            (.beginPath ctx)
            (.moveTo ctx cx rayCy)
            (.arc ctx cx rayCy 650 (- angle (/ rayWidth 2)) (+ angle (/ rayWidth 2)))
            (.closePath ctx)
            (.fill ctx))))
      (.restore ctx)

      ;; 4. Central Glowing Cyan Diamond
      (.save ctx)
      (.translate ctx cx rayCy)
      (let [pulse (+ 1 (* 0.035 (js/Math.sin (* (.-winTime game-state) 4))))]
        (.scale ctx pulse pulse))
      (.rotate ctx (/ js/Math.PI 4))

      (set! (.-shadowColor ctx) "#00ffff")
      (set! (.-shadowBlur ctx) 32)

      (let [dSize 46
            dGrad (.createLinearGradient ctx (- (/ dSize 2)) (- (/ dSize 2)) (/ dSize 2) (/ dSize 2))]
        (.addColorStop dGrad 0 "#d8ffff")
        (.addColorStop dGrad 0.4 "#00f0ff")
        (.addColorStop dGrad 1 "#00bfa5")
        (set! (.-fillStyle ctx) dGrad)
        (.fillRect ctx (- (/ dSize 2)) (- (/ dSize 2)) dSize dSize)

        (set! (.-shadowBlur ctx) 0)
        (set! (.-strokeStyle ctx) "rgba(255, 255, 255, 0.95)")
        (set! (.-lineWidth ctx) 2.5)
        (.strokeRect ctx (- (/ dSize 2)) (- (/ dSize 2)) dSize dSize)

        (let [innerSize (* dSize 0.46)]
          (set! (.-fillStyle ctx) "rgba(255, 255, 255, 0.45)")
          (.fillRect ctx (- (/ innerSize 2)) (- (/ innerSize 2)) innerSize innerSize)))
      (.restore ctx))

    ;; 5. Fireworks
    (doseq [fw (.-winFireworks game-state)]
      (let [progress (- 1 (/ (.-life fw) (.-maxLife fw)))
            currentR (+ (.-radius fw) (* progress (- (.-maxRadius fw) (.-radius fw))))
            alpha (js/Math.max 0 (/ (.-life fw) (.-maxLife fw)))]
        (.save ctx)
        (set! (.-globalAlpha ctx) alpha)
        (doseq [s (.-spokes fw)]
          (let [r1 currentR
                r2 (+ currentR (* (.-dashLen s) (- 1 (* progress 0.4))))
                x1 (+ (.-x fw) (* (js/Math.cos (.-angle s)) r1))
                y1 (+ (.-y fw) (* (js/Math.sin (.-angle s)) r1))
                x2 (+ (.-x fw) (* (js/Math.cos (.-angle s)) r2))
                y2 (+ (.-y fw) (* (js/Math.sin (.-angle s)) r2))]
            (set! (.-strokeStyle ctx) (.-color s))
            (set! (.-lineWidth ctx) 2.2)
            (set! (.-lineCap ctx) "round")
            (set! (.-shadowColor ctx) (.-color s))
            (set! (.-shadowBlur ctx) 6)
            (.beginPath ctx)
            (.moveTo ctx x1 y1)
            (.lineTo ctx x2 y2)
            (.stroke ctx)))
        (.restore ctx)))

    ;; 6. Confetti
    (doseq [p (.-winConfetti game-state)]
      (.save ctx)
      (.translate ctx (.-x p) (.-y p))
      (.rotate ctx (.-rot p))
      (.scale ctx (js/Math.cos (.-flip p)) 1)
      (set! (.-fillStyle ctx) (.-color p))
      (.fillRect ctx (- (/ (.-w p) 2)) (- (/ (.-h p) 2)) (.-w p) (.-h p))
      (.restore ctx))

    ;; 7. Main Title "LEVEL COMPLETE!"
    (draw-title-line "LEVEL" cx 110 58 80 138)
    (draw-title-line "COMPLETE!" cx 176 58 146 204)

    ;; 8. Replay / continue buttons and prompt
    (.save ctx)
    (if (.-playingEditorLevel game-state)
      (do
        (draw-button WIN_EDITOR_BTN "🛠 EDITOR"
                    {:stroke "#ffaa00" :fill "rgba(255,170,0,0.16)" :textColor "#ffaa00"})
        (draw-button WIN_REPLAY_BTN_PAIR "↻ PLAY AGAIN"
                    {:stroke PLAYER_COLOR :fill "rgba(0,255,136,0.18)" :pulse true :textColor PLAYER_COLOR}))
      (draw-button WIN_REPLAY_BTN_SOLO "↻ PLAY AGAIN"
                  {:stroke PLAYER_COLOR :fill "rgba(0,255,136,0.18)" :pulse true :textColor PLAYER_COLOR}))

    (set! (.-fillStyle ctx) "rgba(255, 255, 255, 0.45)")
    (set! (.-font ctx) "12px monospace")
    (set! (.-textAlign ctx) "center")
    (.fillText ctx
               (str "Tap button or press Space to play again"
                    (if (.-playingEditorLevel game-state) "  |  E = editor" ""))
               cx 440)
    (.restore ctx)))
