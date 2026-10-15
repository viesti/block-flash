(ns storage)

(defn load-coin-total []
  (try
    (let [stored (js/parseInt (.getItem js/localStorage "gdash_coins") 10)]
      (if (js/isNaN stored) 0 stored))
    (catch :default _ 0)))

(defn save-coins [coin-total]
  (try
    (.setItem js/localStorage "gdash_coins" coin-total)
    (catch :default _ nil)))

(defn load-attempts [attempt-key]
  (try
    (let [stored (js/parseInt (.getItem js/localStorage attempt-key) 10)]
      (if (or (js/isNaN stored) (< stored 1)) 1 stored))
    (catch :default _ 1)))

(defn save-attempts [attempt-key attempt-count]
  (try
    (.setItem js/localStorage attempt-key attempt-count)
    (catch :default _ nil)))

(defn load-owned [free-item-ids all-item-ids]
  (let [stored (try
                 (js/JSON.parse (or (.getItem js/localStorage "gdash_owned") "[]"))
                 (catch :default _ #js []))
        ids (if (js/Array.isArray stored)
              (.filter stored (fn [id] (.includes (or all-item-ids #js []) id)))
              #js [])]
    (js/Array.from (js/Set. (concat (or free-item-ids []) ids)))))

(defn save-owned [owned]
  (try
    (.setItem js/localStorage "gdash_owned" (js/JSON.stringify owned))
    (catch :default _ nil)))

(defn load-equipped [is-valid-item]
  (let [fallback {:color "c_green" :shape "s_square"}
        stored (try
                 (js/JSON.parse (or (.getItem js/localStorage "gdash_equip") "null"))
                 (catch :default _ nil))]
    (if-not stored
      fallback
      (let [out (js/Object.assign #js {} fallback)]
        (when (and (fn? is-valid-item) (is-valid-item (.-color stored) "color"))
          (set! (.-color out) (.-color stored)))
        (when (and (fn? is-valid-item) (is-valid-item (.-shape stored) "shape"))
          (set! (.-shape out) (.-shape stored)))
        out))))

(defn save-equipped [equipped]
  (try
    (.setItem js/localStorage "gdash_equip" (js/JSON.stringify equipped))
    (catch :default _ nil)))

(defn load-levels []
  (try
    (or (js/JSON.parse (or (.getItem js/localStorage "gdash_levels") "[]")) #js [])
    (catch :default _ #js [])))

(defn save-levels [levels]
  (try
    (.setItem js/localStorage "gdash_levels" (js/JSON.stringify levels))
    (catch :default _ nil)))
