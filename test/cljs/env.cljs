(ns test.env)

;; 1. Window & Navigator
(set! (.-window js/globalThis)
      #js {:location #js {:search "?win=1" :origin "http://localhost" :pathname "/"}
           :navigator #js {:clipboard #js {:writeText (fn [_] (js/Promise.resolve))}}
           :addEventListener (fn [_ _])
           :innerWidth 800
           :innerHeight 450})

;; 2. Document & 2D Canvas Mock
(set! (.-document js/globalThis)
      #js {:getElementById
           (fn [_]
             #js {:width 800
                  :height 450
                  :getBoundingClientRect (fn [] #js {:left 0 :top 0 :width 800 :height 450})
                  :getContext (fn [_]
                                #js {:save (fn [])
                                     :restore (fn [])
                                     :rect (fn [& _])
                                     :fillRect (fn [& _])
                                     :strokeRect (fn [& _])
                                     :fillText (fn [& _])
                                     :strokeText (fn [& _])
                                     :beginPath (fn [])
                                     :closePath (fn [])
                                     :moveTo (fn [& _])
                                     :lineTo (fn [& _])
                                     :arc (fn [& _])
                                     :arcTo (fn [& _])
                                     :ellipse (fn [& _])
                                     :stroke (fn [])
                                     :fill (fn [])
                                     :translate (fn [& _])
                                     :rotate (fn [& _])
                                     :scale (fn [& _])
                                     :roundRect (fn [& _])
                                     :createLinearGradient (fn [& _] #js {:addColorStop (fn [& _])})
                                     :createRadialGradient (fn [& _] #js {:addColorStop (fn [& _])})
                                     :measureText (fn [_] #js {:width 50})})
                  :addEventListener (fn [_ _])})})

;; 3. LocalStorage
(let [store (atom {})]
  (set! (.-localStorage js/globalThis)
        #js {:getItem (fn [k] (get @store k nil))
             :setItem (fn [k v] (swap! store assoc k (str v)))}))

;; 4. Audio
(defn MockAudio []
  (this-as this
    (set! (.-play this) (fn [] (js/Promise.resolve)))
    (set! (.-pause this) (fn []))
    (set! (.-loop this) false)
    (set! (.-volume this) 1.0)))

(set! (.-Audio js/globalThis) MockAudio)

;; 5. Performance & requestAnimationFrame
(set! (.-performance js/globalThis)
      #js {:now (fn [] (.now js/Date))})

(set! (.-requestAnimationFrame js/globalThis)
      (fn [_]))
