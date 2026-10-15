(ns effects
  (:require [constants :refer [GROUND_Y PLAYER_SIZE COIN_COLOR ACCENT CITY_STRIP_W]]
            [canvas :refer [ctx draw-cube]]
            [shop :refer [equipped-color equipped-shape]]
            [state :refer [game-state]]))

(defn rng [seed]
  (let [s (atom (bit-or seed 0))]
    (fn []
      (let [new-s (bit-or (+ @s 0x6d2b79f5) 0)
            _ (reset! s new-s)
            t1 (js/Math.imul (bit-xor new-s (unsigned-bit-shift-right new-s 15))
                             (bit-or 1 new-s))
            t2 (bit-xor (+ t1 (js/Math.imul (bit-xor t1 (unsigned-bit-shift-right t1 7))
                                           (bit-or 61 t1)))
                        t1)]
        (/ (unsigned-bit-shift-right (bit-xor t2 (unsigned-bit-shift-right t2 14)) 0)
           4294967296)))))

(defn generate-city-layer [seed totalWidth minW maxW minH maxH isNear]
  (let [r (rng seed)
        buildings #js []]
    (loop [x 0]
      (if (< x totalWidth)
        (let [w (+ minW (* (r) (- maxW minW)))
              h (+ minH (* (r) (- maxH minH)))
              hasAntenna (and (not isNear) (> h (* (+ minH maxH) 0.52)) (< (r) 0.45))
              antennaH (if hasAntenna (+ 18 (* (r) 42)) 0)
              windows #js []]
          (when isNear
            (let [cols (js/Math.max 2 (js/Math.floor (/ w 18)))
                  rows (js/Math.max 2 (js/Math.floor (/ h 24)))]
              (dotimes [row rows]
                (dotimes [col cols]
                  (when (< (r) 0.38)
                    (let [c-rand (r)
                          winColor (if (< c-rand 0.55)
                                     "#00e5ff"
                                     (if (< c-rand 0.85) "#ff00d4" "#ffd633"))]
                      (.push windows {:rx (/ (+ col 0.5) cols)
                                      :ry (/ (+ row 0.5) rows)
                                      :color winColor
                                      :blinkPhase (* (r) js/Math.PI 2)})))))))
          (.push buildings {:x x :w w :h h :hasAntenna hasAntenna :antennaH antennaH :windows windows})
          (recur (+ x w (if isNear (+ 12 (* (r) 32)) (+ 18 (* (r) 48))))))
        buildings))))

(defn init-skyline []
  (set! (.-farCityBuildings game-state) (generate-city-layer 5 CITY_STRIP_W 65 175 140 310 false))
  (set! (.-nearCityBuildings game-state) (generate-city-layer 9 CITY_STRIP_W 45 130 60 200 true)))

(defn draw-city-layer [buildings stripW parallaxSpeed baseColor edgeColor cx]
  (let [buildings (if (or (nil? buildings) (zero? (.-length buildings)))
                    (do
                      (init-skyline)
                      (if (< parallaxSpeed 0.15)
                        (.-farCityBuildings game-state)
                        (.-nearCityBuildings game-state)))
                    buildings)
        shift (mod (+ (mod (* cx parallaxSpeed) stripW) stripW) stripW)
        time (/ (.now js/performance) 1000)]
    (.save ctx)
    (loop [offset (- stripW)]
      (when (< offset (+ (.-width canvas/canvas) stripW))
        (doseq [b buildings]
          (let [bx (- (+ offset (.-x b)) shift)]
            (when-not (or (< (+ bx (.-w b)) -20) (> bx (+ (.-width canvas/canvas) 20)))
              (let [by (- GROUND_Y (.-h b))]
                ;; Building silhouette
                (set! (.-fillStyle ctx) baseColor)
                (.fillRect ctx bx by (.-w b) (.-h b))

                ;; Roof edge highlight
                (set! (.-fillStyle ctx) edgeColor)
                (.fillRect ctx bx by (.-w b) 2)

                ;; Antenna
                (when (.-hasAntenna b)
                  (let [ax (+ bx (/ (.-w b) 2))]
                    (set! (.-strokeStyle ctx) edgeColor)
                    (set! (.-lineWidth ctx) 1.5)
                    (.beginPath ctx)
                    (.moveTo ctx ax by)
                    (.lineTo ctx ax (- by (.-antennaH b)))
                    (.stroke ctx)
                    (let [beacon (js/Math.sin (+ (* time 3.5) (.-x b)))]
                      (when (> beacon 0.1)
                        (set! (.-fillStyle ctx) "#ff2255")
                        (set! (.-shadowColor ctx) "#ff2255")
                        (set! (.-shadowBlur ctx) 8)
                        (.beginPath ctx)
                        (.arc ctx ax (- by (.-antennaH b)) 2 0 (* js/Math.PI 2))
                        (.fill ctx)
                        (set! (.-shadowBlur ctx) 0)))))

                ;; Windows
                (when (and (.-windows b) (pos? (.-length (.-windows b))))
                  (doseq [win (.-windows b)]
                    (let [wx (+ bx (* (.-rx win) (- (.-w b) 10)) 2)
                          wy (+ by (* (.-ry win) (- (.-h b) 16)) 6)
                          alpha (+ 0.22 (* 0.16 (js/Math.sin (+ (* time 2.2) (.-blinkPhase win)))))]
                      (set! (.-fillStyle ctx) (.-color win))
                      (set! (.-globalAlpha ctx) (js/Math.max 0.08 alpha))
                      (.fillRect ctx wx wy 5 5)))
                  (set! (.-globalAlpha ctx) 1))))))
        (recur (+ offset stripW))))
    (.restore ctx)))

(defn init-ambient-specks []
  (set! (.-ambientSpecks game-state) #js [])
  (let [r (rng 77)]
    (dotimes [_ 48]
      (.push (.-ambientSpecks game-state)
             {:x (* (r) (.-width canvas/canvas))
              :y (* (r) (- GROUND_Y 20))
              :vx (- -12 (* (r) 22))
              :vy (* (- (r) 0.5) 14)
              :size (+ 2 (* (r) 2.5))
              :color (if (< (r) 0.5) "#ff00d4" "#00f0ff")
              :phase (* (r) js/Math.PI 2)}))))

(defn update-ambient-specks [dt]
  (when (or (nil? (.-ambientSpecks game-state)) (zero? (.-length (.-ambientSpecks game-state))))
    (init-ambient-specks))
  (doseq [s (.-ambientSpecks game-state)]
    (set! (.-x s) (+ (.-x s) (* (.-vx s) dt)))
    (set! (.-y s) (+ (.-y s) (* (.-vy s) dt)))
    (when (< (.-x s) -10)
      (set! (.-x s) (+ (.-width canvas/canvas) 10)))
    (when (> (.-x s) (+ (.-width canvas/canvas) 10))
      (set! (.-x s) -10))
    (when (< (.-y s) 10)
      (set! (.-y s) (- GROUND_Y 15)))
    (when (> (.-y s) (- GROUND_Y 10))
      (set! (.-y s) 15))))

(defn draw-ambient-specks []
  (when (and (.-ambientSpecks game-state) (pos? (.-length (.-ambientSpecks game-state))))
    (let [time (/ (.now js/performance) 1000)]
      (.save ctx)
      (doseq [s (.-ambientSpecks game-state)]
        (let [alpha (+ 0.25 (* 0.25 (js/Math.sin (+ (* time 2.5) (.-phase s)))))]
          (set! (.-fillStyle ctx) (.-color s))
          (set! (.-globalAlpha ctx) (js/Math.max 0.08 alpha))
          (set! (.-shadowColor ctx) (.-color s))
          (set! (.-shadowBlur ctx) 6)
          (.fillRect ctx (.-x s) (.-y s) (.-size s) (.-size s))))
      (.restore ctx))))

(defn spawn-jump-ring [x y]
  (let [sparks #js []
        count 8]
    (dotimes [i count]
      (let [a (+ (* (/ i count) js/Math.PI 2) (* (- (js/Math.random) 0.5) 0.35))]
        (.push sparks {:angle a
                       :dist (+ 14 (* (js/Math.random) 6))
                       :speed (+ 45 (* (js/Math.random) 55))
                       :size (+ 3 (* (js/Math.random) 2))})))
    (.push (.-jumpRings game-state)
           {:x x
            :y y
            :r 12
            :life 0.45
            :maxLife 0.45
            :color "#ffd633"
            :sparks sparks})))

(defn update-jump-rings [dt]
  (doseq [r (.-jumpRings game-state)]
    (set! (.-life r) (- (.-life r) dt))
    (set! (.-r r) (+ (.-r r) (* 95 dt)))
    (doseq [sp (.-sparks r)]
      (set! (.-dist sp) (+ (.-dist sp) (* (.-speed sp) dt)))))
  (set! (.-jumpRings game-state)
        (.filter (.-jumpRings game-state) (fn [r] (pos? (.-life r))))))

(defn draw-jump-rings [cx]
  (when (and (.-jumpRings game-state) (pos? (.-length (.-jumpRings game-state))))
    (.save ctx)
    (doseq [r (.-jumpRings game-state)]
      (let [progress (js/Math.max 0 (/ (.-life r) (.-maxLife r)))]
        (.save ctx)
        (set! (.-globalAlpha ctx) (* progress 0.85))
        (set! (.-strokeStyle ctx) (.-color r))
        (set! (.-lineWidth ctx) 2.5)
        (set! (.-shadowColor ctx) (.-color r))
        (set! (.-shadowBlur ctx) 10)
        (.beginPath ctx)
        (.arc ctx (- (.-x r) cx) (.-y r) (.-r r) 0 (* js/Math.PI 2))
        (.stroke ctx)

        (set! (.-fillStyle ctx) (.-color r))
        (doseq [sp (.-sparks r)]
          (let [sx (+ (- (.-x r) cx) (* (js/Math.cos (.-angle sp)) (.-dist sp)))
                sy (+ (.-y r) (* (js/Math.sin (.-angle sp)) (.-dist sp)))]
            (.fillRect ctx (- sx (/ (.-size sp) 2)) (- sy (/ (.-size sp) 2)) (.-size sp) (.-size sp))))
        (.restore ctx)))
    (.restore ctx)))

(defn draw-player-trail [cx]
  (when (and (.-playerTrail game-state) (pos? (.-length (.-playerTrail game-state))))
    (let [trail (.-playerTrail game-state)
          len (.-length trail)]
      (loop [i (dec len)]
        (when (>= i 0)
          (let [t (aget trail i)
                frac (- 1 (/ (inc i) (inc len)))]
            (.save ctx)
            (set! (.-globalAlpha ctx) (* 0.3 frac))
            (let [px (+ (- (.-x t) cx) (/ PLAYER_SIZE 2))
                  py (+ (.-y t) (/ PLAYER_SIZE 2))]
              (.translate ctx px py)
              (.rotate ctx (.-rotation t))
              (let [sz (* PLAYER_SIZE (+ 0.18 (* 0.5 frac)))]
                (draw-cube sz (.-color t) (.-shape t))))
            (.restore ctx))
          (recur (dec i)))))))

(defn spawn-particles [x y]
  (dotimes [_ 30]
    (let [colors #js [(equipped-color) ACCENT "#ffff00" "#ff4444"]]
      (.push (.-particles game-state)
             {:x x
              :y y
              :vx (* (- (js/Math.random) 0.5) 600)
              :vy (* (- (js/Math.random) 0.5) 600)
              :life 1
              :color (aget colors (js/Math.floor (* (js/Math.random) 4)))
              :size (+ 3 (* (js/Math.random) 5))}))))

(defn spawn-coin-sparkle [x y]
  (dotimes [_ 10]
    (let [colors #js [COIN_COLOR "#fff8b0"]]
      (.push (.-particles game-state)
             {:x x
              :y y
              :vx (* (- (js/Math.random) 0.5) 260)
              :vy (- (* (js/Math.random) 260))
              :life 1
              :color (aget colors (js/Math.floor (* (js/Math.random) 2)))
              :size (+ 2 (* (js/Math.random) 3))}))))

(defn spawn-goal-celebration [gx py]
  (.push (.-goalRipples game-state) {:x gx :y py :r 8 :life 1})
  (.push (.-goalRipples game-state) {:x (+ gx 44) :y py :r 4 :life 1})
  (let [colors #js ["#ffffff" (equipped-color) "#ffd700" "#ff00ff" "#00ffff" "#ffea00"]]
    (dotimes [_ 55]
      (let [angle (* (js/Math.random) js/Math.PI 2)
            speed (+ 120 (* (js/Math.random) 450))]
        (.push (.-particles game-state)
               {:x (+ gx (* (js/Math.random) 44))
                :y (+ py (* (- (js/Math.random) 0.5) 20))
                :vx (* (js/Math.cos angle) speed)
                :vy (- (* (js/Math.sin angle) speed) 180)
                :life (+ 1.2 (* (js/Math.random) 0.6))
                :color (aget colors (js/Math.floor (* (js/Math.random) (.-length colors))))
                :size (+ 3 (* (js/Math.random) 4))})))))

(defn draw-goal-post [gx cx cleared]
  (let [sx (- gx cx)]
    (when-not (or (< sx -100) (> sx (+ (.-width canvas/canvas) 100)))
      (let [t (/ (.now js/performance) 1000)
            pulse (if cleared 1.4 (+ 0.85 (* 0.15 (js/Math.sin (* t 3.5)))))]
        (.save ctx)

        ;; 1. Cyan-green luminous glow aura (from top of screen to ground)
        (let [auraW 48
              auraGrad (.createLinearGradient ctx (- sx auraW) 0 (+ sx auraW) 0)]
          (.addColorStop auraGrad 0 "rgba(0, 230, 140, 0)")
          (.addColorStop auraGrad 0.2 (str "rgba(0, 230, 140, " (* 0.12 pulse) ")"))
          (.addColorStop auraGrad 0.4 (str "rgba(30, 245, 160, " (* 0.35 pulse) ")"))
          (.addColorStop auraGrad 0.5 (str "rgba(90, 255, 195, " (* 0.6 pulse) ")"))
          (.addColorStop auraGrad 0.6 (str "rgba(30, 245, 160, " (* 0.35 pulse) ")"))
          (.addColorStop auraGrad 0.8 (str "rgba(0, 230, 140, " (* 0.12 pulse) ")"))
          (.addColorStop auraGrad 1 "rgba(0, 230, 140, 0)")
          (set! (.-fillStyle ctx) auraGrad)
          (.fillRect ctx (- sx auraW) 0 (* auraW 2) GROUND_Y))

        ;; Subtle horizontal beam grain / scanlines in aura
        (set! (.-fillStyle ctx) (str "rgba(255, 255, 255, " (* 0.05 pulse) ")"))
        (loop [y 10]
          (when (< y GROUND_Y)
            (.fillRect ctx (+ (- sx 48) 8) y (* (- 48 8) 2) 1)
            (recur (+ y 16))))

        ;; 2. Neon Chevrons (>) stacked along the left side of the beam
        (let [apexX (- sx 6)
              chW 14
              chH 9
              count 9]
          (set! (.-lineWidth ctx) 3)
          (set! (.-lineCap ctx) "round")
          (set! (.-lineJoin ctx) "miter")
          (dotimes [i count]
            (let [cy (- GROUND_Y 22 (* i 36))]
              (when (>= cy 15)
                (let [wave (js/Math.sin (- (* t 5.5) (* i 0.6)))
                      chAlpha (if cleared 1 (+ 0.72 (* 0.28 wave)))]
                  (set! (.-strokeStyle ctx) (str "rgba(0, 255, 165, " chAlpha ")"))
                  (set! (.-shadowColor ctx) "#00ff9f")
                  (set! (.-shadowBlur ctx) (if cleared 16 8))
                  (.beginPath ctx)
                  (.moveTo ctx (- apexX chW) (- cy chH))
                  (.lineTo ctx apexX cy)
                  (.lineTo ctx (- apexX chW) (+ cy chH))
                  (.stroke ctx))))))

        ;; 3. Central bright white goal line (spans all the way from y=0 to GROUND_Y)
        (set! (.-fillStyle ctx) "#ffffff")
        (set! (.-shadowColor ctx) (if cleared "#aaffdd" "#ffffff"))
        (set! (.-shadowBlur ctx) (if cleared 25 (* 12 pulse)))
        (.fillRect ctx (- sx 2) 0 4 GROUND_Y)

        ;; Subtle cyan edge fringe along the white beam
        (set! (.-fillStyle ctx) "rgba(120, 255, 220, 0.65)")
        (set! (.-shadowBlur ctx) 0)
        (.fillRect ctx (- sx 3) 0 1 GROUND_Y)
        (.fillRect ctx (+ sx 2) 0 1 GROUND_Y)

        ;; 4. Checkered finish block on the right (2 columns x 6 rows)
        (let [sqSize 18
              cols 2
              rows 6
              blockX (+ sx 4)
              blockW (* cols sqSize)
              blockH (* rows sqSize)
              blockY (- GROUND_Y blockH)]
          (dotimes [r rows]
            (let [y (- GROUND_Y (* (inc r) sqSize))]
              (dotimes [c cols]
                (let [x (+ blockX (* c sqSize))
                      isWhite (even? (+ r c))]
                  (set! (.-fillStyle ctx) (if isWhite "#f2f2f6" "#14141e"))
                  (.fillRect ctx x y sqSize sqSize)))))

          ;; Chromatic glitch fringes on checkered block
          (set! (.-fillStyle ctx) "rgba(0, 240, 255, 0.75)")
          (.fillRect ctx blockX blockY 1.5 blockH)
          (.fillRect ctx (- (+ blockX blockW) 1.5) blockY 1.5 blockH)
          (set! (.-fillStyle ctx) "rgba(255, 35, 85, 0.85)")
          (.fillRect ctx (- (+ blockX sqSize) 0.75) blockY 1.5 blockH)

          ;; Subtle outer edge stroke
          (set! (.-strokeStyle ctx) "rgba(255, 255, 255, 0.25)")
          (set! (.-lineWidth ctx) 1)
          (.strokeRect ctx blockX blockY blockW blockH))

        ;; 5. Extra flare when cleared
        (when cleared
          (set! (.-fillStyle ctx) "rgba(255, 255, 255, 0.28)")
          (.fillRect ctx (- sx 15) 0 30 GROUND_Y))

        (.restore ctx)))))
