(ns main
  (:require [state :refer [game-state get-attempt-key]]
            [storage :refer [load-levels load-coin-total load-owned load-equipped load-attempts]]
            [shop :refer [free-items all-item-ids is-valid-item]]
            [effects :refer [init-skyline init-ambient-specks]]
            [level :refer [deserialize-level]]
            [win :refer [init-win-celebration]]
            [audio :refer [sync-music]]
            [gameplay :refer [reset update draw]]
            [input :refer [setup-input]]))

(defn check-url-level []
  (let [params (js/URLSearchParams. (.-search (.-location js/window)))
        levelData (.get params "level")
        urlAttempts (.get params "attempts")]
    (when (and urlAttempts (not (js/isNaN (js/parseInt urlAttempts 10))))
      (set! (.-attemptCount game-state) (js/parseInt urlAttempts 10)))
    (let [urlCoins (.get params "coins")]
      (when (and urlCoins (not (js/isNaN (js/parseInt urlCoins 10))))
        (set! (.-coinTotal game-state) (js/parseInt urlCoins 10))))
    (let [testWin (or (= (.get params "win") "1") (= (.get params "testwin") "1"))]
      (if levelData
        (try
          (let [res (deserialize-level (js/decodeURIComponent levelData))
                name (.-name res)
                obstacles (.-obstacles res)]
            (set! (.-editorObstacles game-state) obstacles)
            (set! (.-editorLevelName game-state) (or name "Shared Level"))
            (set! (.-playingEditorLevel game-state) true)
            (reset (.-editorObstacles game-state))
            (set! (.-state game-state) (if testWin "win" "playing"))
            (when testWin (init-win-celebration))
            true)
          (catch :default _ false))
        (if testWin
          (do
            (reset)
            (set! (.-state game-state) "win")
            (init-win-celebration)
            true)
          false)))))

;; Initialise storage state
(set! (.-savedLevels game-state) (load-levels))
(set! (.-coinTotal game-state) (load-coin-total))
(set! (.-owned game-state) (load-owned free-items all-item-ids))
(set! (.-equipped game-state) (load-equipped is-valid-item))
(set! (.-attemptCount game-state) (load-attempts (get-attempt-key)))

;; Visuals & input listeners
(init-skyline)
(init-ambient-specks)
(setup-input)

(when-not (check-url-level)
  (reset))

(defn game-loop [time]
  (let [dt (js/Math.min (/ (- time (.-lastTime game-state)) 1000) 0.05)]
    (set! (.-lastTime game-state) time)
    (sync-music)
    (update dt)
    (draw)
    (js/requestAnimationFrame game-loop)))

(js/requestAnimationFrame
 (fn [t]
   (set! (.-lastTime game-state) t)
   (game-loop t)))
