(ns audio
  (:require ["./state.js" :refer [game-state]]))

;; Music: one track for a level run, another for every menu screen
(def level-music (js/Audio. "High-Voltage_Club.mp3"))
(def menu-music (js/Audio. "Relaxing_Techno.mp3"))

(doseq [track [level-music menu-music]]
  (set! (.-loop track) true)
  (set! (.-volume track) 0.5))

(def current-track nil)

(defn play-track [track]
  (.catch (.play track) (fn [])))

(defn in-level
  "\"Inside a level\" covers the run itself plus the death and win screens, so the
  track keeps going across retries."
  []
  (let [s (.-state game-state)]
    (or (= s "playing") (= s "dead") (= s "win"))))

(defn sync-music []
  (let [wanted (if (in-level) level-music menu-music)]
    (when (not= wanted current-track)
      (when current-track
        (.pause current-track))
      (set! current-track wanted)
      (set! (.-currentTime wanted) 0)
      (play-track wanted))))

(defn resume-music
  "Autoplay is blocked until the page has seen a gesture, so the first input of
  the session starts whichever track is already selected."
  []
  (when (and current-track (.-paused current-track))
    (play-track current-track)))
