(ns state
  (:require [constants :refer [GROUND_Y PLAYER_SIZE]]
            [storage :refer [save-attempts save-coins]]))

(def game-state
  {:state "splash"
   :player {:x 100 :y (- GROUND_Y PLAYER_SIZE) :vy 0 :onGround true :rotation 0}
   :camera 0
   :obstacles []
   :coins []
   :coinsCollected 0
   :particles []
   :score 0
   :deathTime 0
   :jumpPressed false
   :lastTime 0
   :goalCrossed false
   :winDelay 0
   :goalFlash 0
   :goalRipples []
   :winTime 0
   :winStartTime 0
   :winRayAngle 0
   :winConfetti []
   :winFireworks []
   :winNextFirework 0

   :farCityBuildings []
   :nearCityBuildings []
   :playerTrail []
   :jumpRings []
   :ambientSpecks []

   :editorTool "spike"
   :editorCamera 0
   :editorObstacles []
   :editorLevelName nil
   :editorSavedFeedback 0
   :savedLevels []
   :coinTotal 0
   :playingEditorLevel false
   :levelSelectCopyNext false
   :copiedLevelIndex -1

   :attemptCount 1
   :owned []
   :equipped {:color "c_green" :shape "s_square"}})

(defn get-attempt-key []
  (if (.-playingEditorLevel game-state)
    (str "gdash_attempts_" (or (.-editorLevelName game-state) "editor"))
    "gdash_attempts_main"))

(defn next-attempt []
  (set! (.-attemptCount game-state) (inc (.-attemptCount game-state)))
  (save-attempts (get-attempt-key) (.-attemptCount game-state)))

(defn bank-coin []
  (set! (.-coinTotal game-state) (inc (.-coinTotal game-state)))
  (save-coins (.-coinTotal game-state)))
