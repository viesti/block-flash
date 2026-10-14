(ns test.test-suite
  (:require [clojure.test :refer [deftest is testing run-tests successful?]]
            ["./env.js"]
            ["../dist/main.js" :refer [check-url-level]]
            ["../dist/state.js" :refer [game-state]]
            ["../dist/gameplay.js" :refer [update draw reset]]
            ["../dist/input.js" :refer [on-jump handle-pointer-down]]
            ["../dist/shop.js" :refer [shop-select]]
            ["../dist/level.js" :refer [serialize-level deserialize-level place-coins build-level]]
            ["../dist/physics.js" :refer [collides-aabb collides-with-spike resolve-sim]]
            ["../dist/constants.js" :refer [PLAYER_SIZE GROUND_Y GRAVITY JUMP_VEL GAME_SPEED]]))

(deftest test-initial-state
  (testing "Initial state from ?win=1 URL parameter"
    (is (= "win" (.-state game-state)))))

(deftest test-win-screen
  (testing "Win screen draw and celebration update without errors"
    (draw)
    (update 0.016)
    (draw)
    (is true)))

(deftest test-jump-transition
  (testing "Jump transitions state from 'win' to 'playing'"
    (set! (.-winStartTime game-state) 0)
    (on-jump)
    (is (= "playing" (.-state game-state)))))

(deftest test-gameplay-simulation
  (testing "60 frames of gameplay moves player forward"
    (let [start-x (.-x (.-player game-state))]
      (dotimes [_ 60]
        (update 0.016)
        (draw))
      (is (> (.-x (.-player game-state)) start-x)))))

(deftest test-jump-mechanics
  (testing "Jump mechanics apply correct negative vertical velocity"
    (set! (.-onGround (.-player game-state)) true)
    (on-jump)
    (is (< (.-vy (.-player game-state)) 0))
    (is (= JUMP_VEL (.-vy (.-player game-state))))))

(deftest test-physics-aabb
  (testing "AABB collision detection"
    (testing "overlapping boxes collide"
      (is (collides-aabb 10 10 30 30 20 20 30 30)))
    (testing "boxes separated on X axis do not collide"
      (is (not (collides-aabb 10 10 30 30 50 10 30 30))))
    (testing "boxes separated on Y axis do not collide"
      (is (not (collides-aabb 10 10 30 30 10 50 30 30))))
    (testing "touching edges boundary does not register collision"
      (is (not (collides-aabb 10 10 30 30 40 10 30 30))))))

(deftest test-physics-spike
  (testing "Spike collision and forgiving margins"
    (testing "direct hit inside spike registers collision"
      (is (collides-with-spike 100 310 PLAYER_SIZE 100 336 36 36)))
    (testing "grazing outside horizontal 20% margin is safe"
      ;; margin is 36 * 0.2 = 7.2; sx+margin = 107.2; player px=70, ps=36 => px+ps=106 < 107.2
      (is (not (collides-with-spike 70 310 PLAYER_SIZE 100 336 36 36))))
    (testing "jumping cleanly over spike top is safe"
      ;; py+ps = 250+36 = 286 < sy-sh = 336-36 = 300
      (is (not (collides-with-spike 100 250 PLAYER_SIZE 100 336 36 36))))
    (testing "player below spike base does not collide"
      (is (not (collides-with-spike 100 340 PLAYER_SIZE 100 336 36 36))))))

(deftest test-physics-resolve-sim
  (testing "resolve-sim obstacle resolution"
    (testing "midair with no obstacles survives"
      (let [p (clj->js {:x 100 :y 200 :vy 100 :onGround false})
            obs #js []]
        (is (resolve-sim p obs))))

    (testing "spike collision returns false (death)"
      (let [p (clj->js {:x 100 :y 310 :vy 100 :onGround false})
            obs #js [(clj->js {:type "spike" :x 100 :y 336 :w 36 :h 36})]]
        (is (not (resolve-sim p obs)))))

    (testing "landing on top of block from above"
      (let [p (clj->js {:x 100 :y 260 :vy 150 :onGround false})
            block (clj->js {:type "block" :x 90 :y 280 :w 72 :h 72})
            survived (resolve-sim p #js [block])]
        (is survived)
        (is (= (- 280 PLAYER_SIZE) (.-y p)))
        (is (= 0 (.-vy p)))
        (is (true? (.-onGround p)))))

    (testing "hitting solitary block side head-on causes death"
      (let [p (clj->js {:x 60 :y 290 :vy 0 :onGround true})
            block (clj->js {:type "block" :x 90 :y 280 :w 72 :h 72})]
        (is (not (resolve-sim p #js [block])))))

    (testing "continuous propped terrain (side-by-side blocks) allows safe crossing"
      (let [p (clj->js {:x 160 :y (- 280 PLAYER_SIZE) :vy 0 :onGround true})
            b1 (clj->js {:type "block" :x 90 :y 280 :w 72 :h 72})
            b2 (clj->js {:type "block" :x 162 :y 280 :w 72 :h 72})]
        (is (resolve-sim p #js [b1 b2]))))

    (testing "forgiving top-edge landing props player onto block"
      (let [p (clj->js {:x 60 :y (- 280 (- PLAYER_SIZE 10)) :vy 50 :onGround false})
            block (clj->js {:type "block" :x 90 :y 280 :w 72 :h 72})]
        (is (resolve-sim p #js [block]))
        (is (= (- 280 PLAYER_SIZE) (.-y p)))))))

(deftest test-physics-gravity-and-ground
  (testing "Gravity acceleration and ground clamping"
    (reset)
    (set! (.-state game-state) "playing")
    (let [start-y (- GROUND_Y PLAYER_SIZE 100)]
      (set! (.-y (.-player game-state)) start-y)
      (set! (.-vy (.-player game-state)) 0)
      (set! (.-onGround (.-player game-state)) false)
      (set! (.-obstacles game-state) #js [])
      (update 0.016)
      (is (> (.-vy (.-player game-state)) 0))
      (is (> (.-y (.-player game-state)) start-y))
      (dotimes [_ 30]
        (update 0.016))
      (is (true? (.-onGround (.-player game-state))))
      (is (= (- GROUND_Y PLAYER_SIZE) (.-y (.-player game-state))))
      (is (= 0 (.-vy (.-player game-state)))))))

(deftest test-physics-jump-arc
  (testing "Full jump arc trajectory (ascent, apex, descent, touchdown)"
    (reset)
    (set! (.-state game-state) "playing")
    (set! (.-obstacles game-state) #js [])
    (set! (.-onGround (.-player game-state)) true)
    (on-jump)
    (is (= JUMP_VEL (.-vy (.-player game-state))))
    (is (false? (.-onGround (.-player game-state))))
    (let [ground-y (- GROUND_Y PLAYER_SIZE)
          min-y (atom ground-y)]
      (dotimes [_ 60]
        (update 0.016)
        (when (< (.-y (.-player game-state)) @min-y)
          (reset! min-y (.-y (.-player game-state)))))
      (is (< @min-y (- ground-y 90)))
      (is (true? (.-onGround (.-player game-state))))
      (is (= ground-y (.-y (.-player game-state)))))))

(deftest test-shop
  (testing "Shop catalog, purchasing, and equipping"
    (set! (.-state game-state) "shop")
    (draw)
    (set! (.-coinTotal game-state) 1000)
    (shop-select 1)
    (is (= "c_cyan" (.-color (.-equipped game-state))))
    (is (= 500 (.-coinTotal game-state)))))

(deftest test-editor
  (testing "Level editor obstacle placement"
    (set! (.-state game-state) "editor")
    (draw)
    (let [before-count (.-length (.-editorObstacles game-state))]
      (handle-pointer-down 400 200)
      (is (> (.-length (.-editorObstacles game-state)) before-count)))))

(deftest test-menu-screens
  (testing "Start and splash screens render without errors"
    (set! (.-state game-state) "start")
    (draw)
    (set! (.-state game-state) "splash")
    (draw)
    (is true)))

(deftest test-level-serialization
  (testing "Level serialization and deserialization roundtrip"
    (let [test-obs #js [{:type "spike" :x 200 :y 350 :w 36 :h 36}
                        {:type "block" :x 400 :y 250 :w 72 :h 72}]
          serialized (serialize-level "MyLevel" test-obs)
          deserialized (deserialize-level serialized)]
      (is (= "MyLevel~s-200-350~B-400-250" serialized))
      (is (= "MyLevel" (.-name deserialized)))
      (is (= 2 (.-length (.-obstacles deserialized)))))))

(deftest test-procedural-generation
  (testing "Procedural level generation and coin reachability solver"
    (let [generated (build-level)]
      (is (pos? (.-length generated)))
      (let [coins (place-coins generated)]
        (is (js/Array.isArray coins))))))

;; Run tests and exit with non-zero status on failures
(let [summary (run-tests)]
  (when-not (successful? summary)
    (js/process.exit 1)))
