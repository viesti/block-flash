(ns physics
  (:require [constants :refer [PLAYER_SIZE]]))

(defn collides-with-spike
  [px py ps sx sy sw sh]
  ;; Spike is drawn from base at sy upward to sy - sh
  (let [margin (* sw 0.2)]
    (and (> (+ px ps) (+ sx margin))
         (< px (- (+ sx sw) margin))
         (> (+ py ps) (- sy sh))
         (< py sy))))

(defn collides-aabb
  [ax ay aw ah bx by bw bh]
  (and (> (+ ax aw) bx)
       (< ax (+ bx bw))
       (> (+ ay ah) by)
       (< ay (+ by bh))))

(defn resolve-sim
  "Resolve one simulated frame the way update() does, so the search agrees with
  the collisions the player will actually experience. Returns false on death."
  [p obstacles]
  (let [len (.-length obstacles)]
    (loop [i 0]
      (if (< i len)
        (let [ob (aget obstacles i)]
          (cond
            (= (.-type ob) "spike")
            (if (collides-with-spike (.-x p) (.-y p) PLAYER_SIZE (.-x ob) (.-y ob) (.-w ob) (.-h ob))
              false
              (recur (inc i)))

            (not (collides-aabb (.-x p) (.-y p) PLAYER_SIZE PLAYER_SIZE (.-x ob) (.-y ob) (.-w ob) (.-h ob)))
            (recur (inc i))

            :else
            (let [bottom (- (+ (.-y p) PLAYER_SIZE) (.-y ob))
                  top    (- (+ (.-y ob) (.-h ob)) (.-y p))
                  left   (- (+ (.-x p) PLAYER_SIZE) (.-x ob))
                  right  (- (+ (.-x ob) (.-w ob)) (.-x p))
                  least  (js/Math.min bottom top left right)]
              (cond
                (and (== least bottom) (>= (.-vy p) 0))
                (do
                  (set! (.-y p) (- (.-y ob) PLAYER_SIZE))
                  (set! (.-vy p) 0)
                  (set! (.-onGround p) true)
                  (recur (inc i)))

                (or (== least left) (== least right))
                (let [propped (.some obstacles
                                     (fn [other]
                                       (and (= (.-type other) "block")
                                            (not= other ob)
                                            (== (.-y other) (.-y ob))
                                            (> (+ (.-x p) PLAYER_SIZE) (.-x other))
                                            (< (.-x p) (+ (.-x other) (.-w other)))
                                            (<= (+ (.-y p) PLAYER_SIZE) (+ (.-y other) 4)))))]
                  (if (or propped (and (>= (.-vy p) 0) (<= bottom (/ PLAYER_SIZE 2))))
                    (do
                      (set! (.-y p) (- (.-y ob) PLAYER_SIZE))
                      (set! (.-vy p) 0)
                      (set! (.-onGround p) true)
                      (recur (inc i)))
                    false))

                :else false))))
        true))))
