(ns input
  (:require ["./constants.js" :refer [PLAYER_SIZE START_PLAY_BTN START_EDITOR_BTN
                                      START_LEVELS_BTN START_SHOP_BTN LEVEL_BACK_BTN
                                      LEVEL_RANDOM_BTN SHOP_BACK_BTN HOME_BTN
                                      DEAD_RETRY_BTN_SOLO DEAD_RETRY_BTN_PAIR
                                      DEAD_EDITOR_BTN WIN_REPLAY_BTN_SOLO
                                      WIN_REPLAY_BTN_PAIR WIN_EDITOR_BTN
                                      level-row-btn level-copy-btn]]
            ["./canvas.js" :refer [canvas canvas-pos in-rect]]
            ["./state.js" :refer [game-state get-attempt-key next-attempt]]
            ["./storage.js" :refer [load-attempts]]
            ["./audio.js" :refer [in-level resume-music]]
            ["./shop.js" :refer [shop-items shop-select shop-tile-rect]]
            ["./editor.js" :refer [editor-pointer save-level start-editor-level]]
            ["./ui.js" :refer [go-home]]
            ["./level.js" :refer [get-level-url]]
            ["./gameplay.js" :refer [reset trigger-player-jump]]))

(defn on-jump []
  (let [s (.-state game-state)]
    (when-not (or (= s "editor") (= s "levelSelect") (= s "shop"))
      (cond
        (= s "start")
        (do
          (set! (.-state game-state) "playing")
          (set! (.-playingEditorLevel game-state) false)
          (set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))
          (reset))

        (and (= s "dead") (> (- (.now js/performance) (.-deathTime game-state)) 500))
        (do
          (next-attempt)
          (if (.-playingEditorLevel game-state)
            (reset (.-editorObstacles game-state))
            (reset))
          (set! (.-state game-state) "playing"))

        (and (= s "win") (> (- (.now js/performance) (.-winStartTime game-state)) 500))
        (do
          (next-attempt)
          (if (.-playingEditorLevel game-state)
            (reset (.-editorObstacles game-state))
            (reset))
          (set! (.-state game-state) "playing"))

        (and (= s "playing") (.-onGround (.-player game-state)))
        (trigger-player-jump)))))

(defn menu-pointer
  "Handles a tap on the menu screens. Returns true once it has been consumed."
  [clientX clientY]
  (let [p (canvas-pos clientX clientY)]
    (cond
      (= (.-state game-state) "start")
      (cond
        (in-rect p START_PLAY_BTN)
        (do
          (set! (.-state game-state) "playing")
          (set! (.-playingEditorLevel game-state) false)
          (set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))
          (reset)
          true)

        (in-rect p START_EDITOR_BTN)
        (do
          (set! (.-state game-state) "editor")
          (set! (.-editorObstacles game-state) #js [])
          (set! (.-editorCamera game-state) 0)
          (set! (.-editorLevelName game-state) nil)
          true)

        (in-rect p START_LEVELS_BTN)
        (do
          (set! (.-state game-state) "levelSelect")
          true)

        (in-rect p START_SHOP_BTN)
        (do
          (set! (.-state game-state) "shop")
          true)

        :else false)

      (= (.-state game-state) "levelSelect")
      (cond
        (in-rect p LEVEL_BACK_BTN)
        (do
          (set! (.-state game-state) "start")
          true)

        (in-rect p LEVEL_RANDOM_BTN)
        (do
          (set! (.-state game-state) "playing")
          (set! (.-playingEditorLevel game-state) false)
          (set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))
          (reset)
          true)

        :else
        (let [maxShow (js/Math.min (.-length (.-savedLevels game-state)) 6)
              handled (atom false)]
          (dotimes [i maxShow]
            (when-not @handled
              (if (in-rect p (level-row-btn i))
                (let [lv (aget (.-savedLevels game-state) i)]
                  (set! (.-editorObstacles game-state)
                        (.map (.-obstacles lv) (fn [o] (js/Object.assign #js {} o))))
                  (set! (.-editorLevelName game-state) (.-name lv))
                  (set! (.-playingEditorLevel game-state) true)
                  (set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))
                  (reset (.-editorObstacles game-state))
                  (set! (.-state game-state) "playing")
                  (reset! handled true))
                (when (in-rect p (level-copy-btn i))
                  (let [lv (aget (.-savedLevels game-state) i)
                        url (get-level-url (.-name lv) (.-obstacles lv))]
                    (.catch (.writeText (.-clipboard js/navigator) url) (fn []))
                    (set! (.-copiedLevelIndex game-state) i)
                    (js/setTimeout
                     (fn []
                       (when (= (.-copiedLevelIndex game-state) i)
                         (set! (.-copiedLevelIndex game-state) -1)))
                     1500)
                    (reset! handled true))))))
          (if @handled true true)))

      (= (.-state game-state) "shop")
      (if (in-rect p SHOP_BACK_BTN)
        (do (set! (.-state game-state) "start") true)
        (do
          (dotimes [i (.-length shop-items)]
            (when (in-rect p (shop-tile-rect i))
              (shop-select i)))
          true))

      (= (.-state game-state) "dead")
      (if (in-rect p HOME_BTN)
        (do (go-home) true)
        (let [retryBtn (if (.-playingEditorLevel game-state) DEAD_RETRY_BTN_PAIR DEAD_RETRY_BTN_SOLO)]
          (if (in-rect p retryBtn)
            (do
              (when (> (- (.now js/performance) (.-deathTime game-state)) 300)
                (next-attempt)
                (if (.-playingEditorLevel game-state)
                  (reset (.-editorObstacles game-state))
                  (reset))
                (set! (.-state game-state) "playing"))
              true)
            (if (and (.-playingEditorLevel game-state) (in-rect p DEAD_EDITOR_BTN))
              (do
                (set! (.-state game-state) "editor")
                true)
              false))))

      (= (.-state game-state) "win")
      (if (in-rect p HOME_BTN)
        (do (go-home) true)
        (let [replayBtn (if (.-playingEditorLevel game-state) WIN_REPLAY_BTN_PAIR WIN_REPLAY_BTN_SOLO)]
          (if (in-rect p replayBtn)
            (do
              (when (> (- (.now js/performance) (.-winStartTime game-state)) 300)
                (next-attempt)
                (if (.-playingEditorLevel game-state)
                  (reset (.-editorObstacles game-state))
                  (reset))
                (set! (.-state game-state) "playing"))
              true)
            (if (and (.-playingEditorLevel game-state) (in-rect p WIN_EDITOR_BTN))
              (do
                (set! (.-state game-state) "editor")
                true)
              false))))

      (in-level)
      (if (in-rect p HOME_BTN)
        (do (go-home) true)
        false)

      :else false)))

(defn handle-pointer-down
  ([clientX clientY] (handle-pointer-down clientX clientY false))
  ([clientX clientY isRightClick]
   (if (= (.-state game-state) "splash")
     (set! (.-state game-state) "start")
     (let [p (canvas-pos clientX clientY)]
       (if (= (.-state game-state) "editor")
         (editor-pointer p isRightClick)
         (when-not (menu-pointer clientX clientY)
           (set! (.-jumpPressed game-state) true)
           (on-jump)))))))

(defn setup-input []
  (.addEventListener js/window "keydown" resume-music)
  (.addEventListener js/window "pointerdown" resume-music)

  (.addEventListener js/window "keydown"
                     (fn [e]
                       (if (= (.-state game-state) "splash")
                         (do
                           (.preventDefault e)
                           (set! (.-state game-state) "start"))
                         (do
                           (when (or (= (.-code e) "Space") (= (.-code e) "ArrowUp"))
                             (.preventDefault e)
                             (when-not (.-jumpPressed game-state)
                               (set! (.-jumpPressed game-state) true)
                               (on-jump)))
                           (when (= (.-code e) "KeyE")
                             (cond
                               (= (.-state game-state) "start")
                               (do
                                 (set! (.-state game-state) "editor")
                                 (set! (.-editorObstacles game-state) #js [])
                                 (set! (.-editorCamera game-state) 0)
                                 (set! (.-editorLevelName game-state) nil))
                               (= (.-state game-state) "editor")
                               (start-editor-level)
                               (and (or (= (.-state game-state) "playing")
                                        (= (.-state game-state) "dead")
                                        (= (.-state game-state) "win"))
                                    (.-playingEditorLevel game-state))
                               (set! (.-state game-state) "editor")))
                           (when (and (= (.-code e) "KeyL") (= (.-state game-state) "start"))
                             (set! (.-state game-state) "levelSelect"))
                           (when (and (= (.-code e) "KeyS") (= (.-state game-state) "start"))
                             (set! (.-state game-state) "shop"))
                           (when (and (= (.-code e) "KeyH") (in-level))
                             (go-home))
                           (when (= (.-code e) "Escape")
                             (if (or (= (.-state game-state) "editor")
                                     (= (.-state game-state) "levelSelect")
                                     (= (.-state game-state) "shop"))
                               (set! (.-state game-state) "start")
                               (when (in-level)
                                 (go-home))))
                           (when (= (.-state game-state) "shop")
                             (let [num (js/parseInt (.-key e))]
                               (when (and (not (js/isNaN num)) (>= num 1) (<= num (.-length shop-items)))
                                 (shop-select (dec num)))))
                           (when (= (.-state game-state) "editor")
                             (cond
                               (= (.-code e) "Digit1") (set! (.-editorTool game-state) "spike")
                               (= (.-code e) "Digit2") (set! (.-editorTool game-state) "block")
                               (= (.-code e) "Digit3") (set! (.-editorTool game-state) "eraser")
                               (= (.-code e) "KeyS") (save-level)
                               (or (= (.-code e) "ArrowLeft") (= (.-code e) "KeyA"))
                               (set! (.-editorCamera game-state)
                                     (js/Math.max 0 (- (.-editorCamera game-state) (* PLAYER_SIZE 3))))
                               (or (= (.-code e) "ArrowRight") (= (.-code e) "KeyD"))
                               (set! (.-editorCamera game-state)
                                     (+ (.-editorCamera game-state) (* PLAYER_SIZE 3)))))
                           (when (= (.-state game-state) "levelSelect")
                             (if (= (.-code e) "KeyC")
                               (set! (.-levelSelectCopyNext game-state) true)
                               (let [num (js/parseInt (.-key e))]
                                 (if (and (.-levelSelectCopyNext game-state)
                                          (not (js/isNaN num))
                                          (>= num 1)
                                          (<= num (.-length (.-savedLevels game-state))))
                                   (let [lv (aget (.-savedLevels game-state) (dec num))]
                                     (.writeText (.-clipboard js/navigator) (get-level-url (.-name lv) (.-obstacles lv)))
                                     (set! (.-levelSelectCopyNext game-state) false))
                                   (do
                                     (set! (.-levelSelectCopyNext game-state) false)
                                     (cond
                                       (zero? num)
                                       (do
                                         (set! (.-state game-state) "playing")
                                         (set! (.-playingEditorLevel game-state) false)
                                         (set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))
                                         (reset))
                                       (and (not (js/isNaN num)) (>= num 1) (<= num (.-length (.-savedLevels game-state))))
                                       (let [lv (aget (.-savedLevels game-state) (dec num))]
                                         (set! (.-editorObstacles game-state)
                                               (.map (.-obstacles lv) (fn [o] (js/Object.assign #js {} o))))
                                         (set! (.-editorLevelName game-state) (.-name lv))
                                         (set! (.-playingEditorLevel game-state) true)
                                         (set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))
                                         (reset (.-editorObstacles game-state))
                                         (set! (.-state game-state) "playing"))))))))))))

  (.addEventListener js/window "keyup"
                     (fn [e]
                       (when (or (= (.-code e) "Space") (= (.-code e) "ArrowUp"))
                         (set! (.-jumpPressed game-state) false))))

  (.addEventListener canvas "mousedown"
                     (fn [e]
                       (handle-pointer-down (.-clientX e) (.-clientY e) (= (.-button e) 2))))
  (.addEventListener canvas "mouseup"
                     (fn []
                       (set! (.-jumpPressed game-state) false)))
  (.addEventListener canvas "contextmenu"
                     (fn [e]
                       (when (= (.-state game-state) "editor")
                         (.preventDefault e))))
  (.addEventListener canvas "touchstart"
                     (fn [e]
                       (.preventDefault e)
                       (let [t (aget (.-changedTouches e) 0)]
                         (when t
                           (handle-pointer-down (.-clientX t) (.-clientY t) false)))))
  (.addEventListener canvas "touchend"
                     (fn [e]
                       (.preventDefault e)
                       (set! (.-jumpPressed game-state) false))))
