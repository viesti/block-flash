(ns canvas
  (:require [constants :refer [COIN_COLOR]]))

(def canvas (.getElementById js/document "game"))
(def canvas-el canvas)
(def ctx (.getContext canvas "2d"))

(set! (.-width canvas) 800)
(set! (.-height canvas) 450)

(defn canvas-pos
  "Maps a viewport point to canvas coordinates, undoing the letterboxed scaling."
  [client-x client-y]
  (let [rect (.getBoundingClientRect canvas)
        scale (js/Math.min (/ (.-width rect) (.-width canvas))
                           (/ (.-height rect) (.-height canvas)))
        offset-x (/ (- (.-width rect) (* (.-width canvas) scale)) 2)
        offset-y (/ (- (.-height rect) (* (.-height canvas) scale)) 2)]
    #js {:x (/ (- client-x (.-left rect) offset-x) scale)
         :y (/ (- client-y (.-top rect) offset-y) scale)}))

(defn in-rect [p r]
  (and (>= (.-x p) (.-x r))
       (<= (.-x p) (+ (.-x r) (.-w r)))
       (>= (.-y p) (.-y r))
       (<= (.-y p) (+ (.-y r) (.-h r)))))

(defn draw-button
  "Draws a rounded menu button with optional glow, pulse, and custom styling."
  [r label opts]
  (let [opts (or opts #js {})]
    (.save ctx)
    (set! (.-fillStyle ctx) (or (.-fill opts) "rgba(0,0,0,0.35)"))
    (.beginPath ctx)
    (if (.-roundRect ctx)
      (.roundRect ctx (.-x r) (.-y r) (.-w r) (.-h r) (or (.-radius opts) 8))
      (.rect ctx (.-x r) (.-y r) (.-w r) (.-h r)))
    (.fill ctx)

    (set! (.-globalAlpha ctx)
          (if (.-pulse opts)
            (+ 0.55 (* 0.45 (js/Math.sin (/ (.now js/performance) 220))))
            1))
    (set! (.-strokeStyle ctx) (or (.-stroke opts) "rgba(255,255,255,0.3)"))
    (set! (.-lineWidth ctx) (or (.-lineWidth opts) 2))
    (.stroke ctx)

    (set! (.-globalAlpha ctx) 1)
    (set! (.-fillStyle ctx) (or (.-textColor opts) "#fff"))
    (set! (.-font ctx) (or (.-font opts) "bold 15px monospace"))
    (set! (.-textAlign ctx) "center")
    (set! (.-textBaseline ctx) "middle")
    (.fillText ctx label (+ (.-x r) (/ (.-w r) 2)) (+ (.-y r) (/ (.-h r) 2)))
    (.restore ctx)))

(defn draw-cube
  "Draws a cube centred on the current transform origin. The caller owns any
  rotation, so the run's spin and the shop's static preview share one path."
  [size color shape]
  (let [h (/ size 2)]
    (set! (.-fillStyle ctx) color)
    (set! (.-shadowColor ctx) color)
    (set! (.-shadowBlur ctx) (* size 0.42))
    (cond
      (= shape "rounded")
      (do
        (.beginPath ctx)
        (.roundRect ctx (- h) (- h) size size (* size 0.3))
        (.fill ctx)
        (set! (.-shadowBlur ctx) 0)
        (set! (.-fillStyle ctx) "rgba(255,255,255,0.3)")
        (.beginPath ctx)
        (.roundRect ctx (- (/ size 4)) (- (/ size 4)) (/ size 2) (/ size 2) (* size 0.15))
        (.fill ctx))

      (= shape "diamond")
      (do
        (.rotate ctx (/ js/Math.PI 4))
        (let [d (* size 0.76)]
          (.fillRect ctx (- (/ d 2)) (- (/ d 2)) d d)
          (set! (.-shadowBlur ctx) 0)
          (set! (.-fillStyle ctx) "rgba(255,255,255,0.3)")
          (.fillRect ctx (- (/ d 4)) (- (/ d 4)) (/ d 2) (/ d 2))
          (.rotate ctx (- (/ js/Math.PI 4)))))

      (= shape "ring")
      (do
        (set! (.-strokeStyle ctx) color)
        (set! (.-lineWidth ctx) (* size 0.2))
        (.strokeRect ctx (+ (- h) (* size 0.1)) (+ (- h) (* size 0.1)) (* size 0.8) (* size 0.8))
        (.beginPath ctx)
        (.arc ctx 0 0 (* size 0.17) 0 (* js/Math.PI 2))
        (.fill ctx)
        (set! (.-shadowBlur ctx) 0))

      :else
      (do
        (.fillRect ctx (- h) (- h) size size)
        (set! (.-shadowBlur ctx) 0)
        (set! (.-fillStyle ctx) "rgba(255,255,255,0.3)")
        (.fillRect ctx (- (/ size 4)) (- (/ size 4)) (/ size 2) (/ size 2))))
    (set! (.-shadowBlur ctx) 0)))

(defn draw-coin-icon [x y r]
  (set! (.-fillStyle ctx) COIN_COLOR)
  (.beginPath ctx)
  (.arc ctx x y r 0 (* js/Math.PI 2))
  (.fill ctx)
  (set! (.-strokeStyle ctx) "#b8860b")
  (set! (.-lineWidth ctx) 2)
  (.stroke ctx))
