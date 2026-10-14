(ns level
  (:require ["./constants.js" :refer [GROUND_Y PLAYER_SIZE GRAVITY JUMP_VEL
                                      GAME_SPEED LEVEL_LENGTH COIN_RADIUS COIN_HOVER
                                      COIN_LAND_INSET COIN_TAKEOFF_INSET SOLVE_DT SOLVE_QUANT]]
            ["./canvas.js" :refer [canvas]]
            ["./physics.js" :refer [collides-aabb resolve-sim]]
            ["./state.js" :refer [game-state]]))

(defn get-level-end
  ([] (get-level-end nil nil nil))
  ([obs] (get-level-end obs nil nil))
  ([obs playing-editor-level] (get-level-end obs playing-editor-level nil))
  ([obs playing-editor-level state]
   (let [obs (if (nil? obs) (.-obstacles game-state) obs)
         playing-editor-level (if (nil? playing-editor-level) (.-playingEditorLevel game-state) playing-editor-level)
         state (if (nil? state) (.-state game-state) state)]
     (if (or playing-editor-level (= state "editor"))
       (reduce js/Math.max LEVEL_LENGTH (.map (or obs #js []) (fn [o] (+ (.-x o) (.-w o) 200))))
       LEVEL_LENGTH))))

(defn serialize-level [name obstacles]
  (str name "~"
       (.join
        (.map obstacles
              (fn [o]
                (let [code (cond
                             (= (.-type o) "spike") "s"
                             (and (= (.-w o) 72) (= (.-h o) 72)) "B"
                             (and (= (.-w o) 108) (= (.-h o) 36)) "w"
                             :else "b")]
                  (str code "-" (.-x o) "-" (.-y o)))))
        "~")))

(defn deserialize-level [s]
  (let [codes #js {:s #js ["spike" 36 36]
                   :b #js ["block" 36 36]
                   :B #js ["block" 72 72]
                   :w #js ["block" 108 36]}
        parts (.split s "~")
        name (aget parts 0)
        obstacles (.map (.slice parts 1)
                        (fn [seg]
                          (let [f (.split seg "-")]
                            (if (= (.-length f) 5)
                              {:type (if (= (aget f 0) "s") "spike" "block")
                               :x (js/Number (aget f 1))
                               :y (js/Number (aget f 2))
                               :w (js/Number (aget f 3))
                               :h (js/Number (aget f 4))}
                              (let [t (aget f 0)
                                    x (js/Number (aget f 1))
                                    y (js/Number (aget f 2))
                                    entry (or (aget codes t) #js ["block" 36 36])]
                                {:type (aget entry 0)
                                 :x x
                                 :y y
                                 :w (aget entry 1)
                                 :h (aget entry 2)})))))]
    {:name name :obstacles obstacles}))

(defn get-level-url [name obstacles]
  (let [base (str (.-origin (.-location js/window)) (.-pathname (.-location js/window)))]
    (str base "?level=" (js/encodeURIComponent (serialize-level name obstacles)))))

(defn build-level []
  (let [obs #js []
        unit PLAYER_SIZE
        patterns [(fn [x] [{:type "spike" :x x :y GROUND_Y :w unit :h unit}])
                  (fn [x]
                    [{:type "spike" :x x :y GROUND_Y :w unit :h unit}
                     {:type "spike" :x (+ x unit) :y GROUND_Y :w unit :h unit}])
                  (fn [x]
                    [{:type "block" :x x :y (- GROUND_Y (* unit 2)) :w (* unit 2) :h (* unit 2)}])
                  (fn [x]
                    [{:type "block" :x x :y (- GROUND_Y (* unit 2)) :w (* unit 2) :h (* unit 2)}
                     {:type "spike" :x (+ x (* unit 3)) :y GROUND_Y :w unit :h unit}])
                  (fn [x]
                    [{:type "spike" :x x :y GROUND_Y :w unit :h unit}
                     {:type "spike" :x (+ x unit) :y GROUND_Y :w unit :h unit}
                     {:type "spike" :x (+ x (* unit 2)) :y GROUND_Y :w unit :h unit}])
                  (fn [x]
                    [{:type "block" :x x :y (- GROUND_Y (* unit 2)) :w (* unit 2) :h (* unit 2)}
                     {:type "block" :x (+ x (* unit 4)) :y (- GROUND_Y (* unit 3)) :w (* unit 3) :h unit}
                     {:type "spike" :x (+ x (* unit 5)) :y GROUND_Y :w unit :h unit}])]]
    (loop [x 600]
      (if (< x (- LEVEL_LENGTH 400))
        (let [idx (js/Math.floor (* (js/Math.random) (.-length patterns)))
              pat (aget patterns idx)
              items (pat x)]
          (doseq [item items]
            (.push obs item))
          (recur (+ x 200 (* (js/Math.random) 250))))
        obs))))

(defn obstacle-top [ob]
  (if (= (.-type ob) "spike")
    (- (.-y ob) (.-h ob))
    (.-y ob)))

(defn obstacle-bottom [ob]
  (if (= (.-type ob) "spike")
    (.-y ob)
    (+ (.-y ob) (.-h ob))))

(defn ground-runs
  "Stretches of ground the player can run along, split by whatever rests on it."
  [obstacles]
  (let [blockers (-> (.filter obstacles (fn [ob] (>= (obstacle-bottom ob) (- GROUND_Y 1))))
                     (.sort (fn [a b] (- (.-x a) (.-x b)))))
        runs #js []]
    (let [final-from
          (reduce (fn [from ob]
                    (when (> (.-x ob) from)
                      (.push runs {:from from :to (.-x ob)}))
                    (if (> (+ (.-x ob) (.-w ob)) from)
                      (+ (.-x ob) (.-w ob))
                      from))
                  0
                  blockers)]
      (.push runs {:from final-from :to LEVEL_LENGTH}))
    runs))

(defn stand-surfaces
  "Surfaces the player can come to rest on."
  [obstacles]
  (into [{:x (- js/Infinity) :w js/Infinity :top GROUND_Y}]
        (-> (.filter obstacles (fn [ob] (= (.-type ob) "block")))
            (.map (fn [ob] {:x (.-x ob) :w (.-w ob) :top (.-y ob)})))))

(defn swept-coins
  "Which candidates a surviving run can actually touch. Jumping or holding is the
  only choice the player has, so every standing position the level allows can be
  enumerated, and a candidate counts only if some path sweeps it before dying."
  [obstacles candidates]
  (let [surfaces (stand-surfaces obstacles)
        swept (js/Set.)
        supported (fn [x top]
                    (.some surfaces
                           (fn [s]
                             (and (< (js/Math.abs (- (.-top s) top)) 0.001)
                                  (> (+ x PLAYER_SIZE) (.-x s))
                                  (< x (+ (.-x s) (.-w s)))))))
        advance (fn [from-x top jump]
                  (let [p #js {:x from-x
                               :y (- top PLAYER_SIZE)
                               :vy (if jump JUMP_VEL 0)
                               :onGround (not jump)}
                        grip (- COIN_RADIUS 4)]
                    (loop [i 0]
                      (if (>= i 2000)
                        nil
                        (let [prev-bottom (+ (.-y p) PLAYER_SIZE)]
                          (set! (.-x p) (+ (.-x p) (* GAME_SPEED SOLVE_DT)))
                          (when (and (.-onGround p) (not (supported (.-x p) (+ (.-y p) PLAYER_SIZE))))
                            (set! (.-onGround p) false))
                          (when-not (.-onGround p)
                            (set! (.-vy p) (+ (.-vy p) (* GRAVITY SOLVE_DT)))
                            (set! (.-y p) (+ (.-y p) (* (.-vy p) SOLVE_DT))))
                          (when (and (not (.-onGround p)) (>= (.-vy p) 0))
                            (let [hit (.find surfaces
                                             (fn [s]
                                               (and (> (+ (.-x p) PLAYER_SIZE) (.-x s))
                                                    (< (.-x p) (+ (.-x s) (.-w s)))
                                                    (<= prev-bottom (+ (.-top s) 0.001))
                                                    (>= (+ (.-y p) PLAYER_SIZE) (.-top s)))))]
                              (when hit
                                (set! (.-y p) (- (.-top hit) PLAYER_SIZE))
                                (set! (.-vy p) 0)
                                (set! (.-onGround p) true))))
                          (if-not (resolve-sim p obstacles)
                            nil
                            (if (> (.-y p) (.-height canvas))
                              nil
                              (do
                                (doseq [c candidates]
                                  (when (and (> (+ (.-x p) PLAYER_SIZE) (- (.-x c) grip))
                                             (< (.-x p) (+ (.-x c) grip))
                                             (> (+ (.-y p) PLAYER_SIZE) (- (.-y c) grip))
                                             (< (.-y p) (+ (.-y c) grip)))
                                    (.add swept c)))
                                (if (> (.-x p) LEVEL_LENGTH)
                                  nil
                                  (if (and (.-onGround p) (or jump (>= (- (.-x p) from-x) SOLVE_QUANT)))
                                    {:x (.-x p) :top (+ (.-y p) PLAYER_SIZE)}
                                    (recur (inc i))))))))))))]
    (let [seen (js/Set. #js [(str "100:" GROUND_Y)])
          pending #js [{:x 100 :top GROUND_Y}]]
      (while (pos? (.-length pending))
        (let [from (.pop pending)]
          (doseq [jump [false true]]
            (let [next (advance (.-x from) (.-top from) jump)]
              (when next
                (let [key (str (js/Math.round (/ (.-x next) SOLVE_QUANT)) ":" (js/Math.round (.-top next)))]
                  (when-not (.has seen key)
                    (.add seen key)
                    (.push pending next))))))))
      swept)))

(defn place-coins
  "Coins are proposed over footing the player can stand on, kept off the ends of
  each stretch and away from spikes, then vetted by swept-coins so only the ones
  a surviving run can actually touch survive."
  [obstacles]
  (let [placed #js []
        over-spike (fn [x]
                    (.some obstacles
                           (fn [ob]
                             (and (= (.-type ob) "spike")
                                  (> (+ x COIN_RADIUS) (- (.-x ob) PLAYER_SIZE))
                                  (< (- x COIN_RADIUS) (+ (.-x ob) (.-w ob) PLAYER_SIZE))))))
        stand-clear (fn [x surface]
                     (not (.some obstacles
                                 (fn [ob]
                                   (collides-aabb (- x (/ PLAYER_SIZE 2))
                                                (- surface PLAYER_SIZE)
                                                PLAYER_SIZE
                                                PLAYER_SIZE
                                                (.-x ob)
                                                (obstacle-top ob)
                                                (.-w ob)
                                                (- (obstacle-bottom ob) (obstacle-top ob)))))))
        add-coin (fn [x surface]
                  (when (and (not (over-spike x)) (stand-clear x surface))
                    (.push placed {:x x
                                   :y (- surface COIN_RADIUS COIN_HOVER)
                                   :taken false
                                   :phase (* (js/Math.random) js/Math.PI 2)})))]
    (doseq [ob obstacles]
      (when (= (.-type ob) "block")
        (let [cells (js/Math.max 1 (js/Math.round (/ (.-w ob) PLAYER_SIZE)))]
          (dotimes [i cells]
            (when (<= (js/Math.random) 0.6)
              (let [x (+ (.-x ob) (* PLAYER_SIZE (+ i 0.5)))]
                (when-not (or (< (- x (/ PLAYER_SIZE 2)) (.-x ob))
                              (> (+ x (/ PLAYER_SIZE 2)) (+ (.-x ob) (.-w ob))))
                  (add-coin x (.-y ob)))))))))
    (doseq [run (ground-runs obstacles)]
      (when (>= (js/Math.random) 0.35)
        (let [start (+ (js/Math.max (+ (.-from run) COIN_LAND_INSET) 500) COIN_RADIUS)
              end (- (js/Math.min (- (.-to run) COIN_TAKEOFF_INSET) (- LEVEL_LENGTH 200)) COIN_RADIUS)
              span (- end start)]
          (when (>= span 0)
            (let [count (js/Math.min 3 (inc (js/Math.floor (/ span PLAYER_SIZE))))
                  first (+ start (/ (- span (* (dec count) PLAYER_SIZE)) 2))]
              (dotimes [i count]
                (add-coin (+ first (* i PLAYER_SIZE)) GROUND_Y)))))))
    (let [swept (swept-coins obstacles placed)]
      (.filter placed (fn [coin] (.has swept coin))))))
