export function loadCoinTotal() {
  const stored = parseInt(localStorage.getItem("gdash_coins"), 10);
  return isNaN(stored) ? 0 : stored;
}

export function saveCoins(coinTotal) {
  try { localStorage.setItem("gdash_coins", coinTotal); } catch {}
}

export function loadAttempts(attemptKey) {
  const stored = parseInt(localStorage.getItem(attemptKey), 10);
  return isNaN(stored) || stored < 1 ? 1 : stored;
}

export function saveAttempts(attemptKey, attemptCount) {
  try { localStorage.setItem(attemptKey, attemptCount); } catch {}
}

export function loadOwned(freeItemIds = [], allItemIds = []) {
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem("gdash_owned") || "[]"); }
  catch { stored = []; }
  const ids = Array.isArray(stored) ? stored.filter(id => allItemIds.includes(id)) : [];
  return [...new Set([...freeItemIds, ...ids])];
}

export function saveOwned(owned) {
  try { localStorage.setItem("gdash_owned", JSON.stringify(owned)); } catch {}
}

export function loadEquipped(isValidItem) {
  const fallback = { color: "c_green", shape: "s_square" };
  let stored;
  try { stored = JSON.parse(localStorage.getItem("gdash_equip") || "null"); }
  catch { stored = null; }
  if (!stored) return fallback;
  const out = { ...fallback };
  for (const kind of ["color", "shape"]) {
    if (typeof isValidItem === "function" && isValidItem(stored[kind], kind)) {
      out[kind] = stored[kind];
    }
  }
  return out;
}

export function saveEquipped(equipped) {
  try { localStorage.setItem("gdash_equip", JSON.stringify(equipped)); } catch {}
}

export function loadLevels() {
  try { return JSON.parse(localStorage.getItem("gdash_levels") || "[]"); }
  catch { return []; }
}

export function saveLevels(levels) {
  try { localStorage.setItem("gdash_levels", JSON.stringify(levels)); } catch {}
}
