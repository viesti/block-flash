import { gameState } from "./state.js";

// Music: one track for a level run, another for every menu screen
export const levelMusic = new Audio("High-Voltage_Club.mp3");
export const menuMusic = new Audio("Relaxing_Techno.mp3");
for (const track of [levelMusic, menuMusic]) {
  track.loop = true;
  track.volume = 0.5;
}
export let currentTrack = null;

export function playTrack(track) {
  track.play().catch(() => {});
}

// "Inside a level" covers the run itself plus the death and win screens, so the
// track keeps going across retries.
export function inLevel() {
  return gameState.state === "playing" || gameState.state === "dead" || gameState.state === "win";
}

export function syncMusic() {
  const wanted = inLevel() ? levelMusic : menuMusic;
  if (wanted === currentTrack) return;
  if (currentTrack) currentTrack.pause();
  currentTrack = wanted;
  wanted.currentTime = 0;
  playTrack(wanted);
}

// Autoplay is blocked until the page has seen a gesture, so the first input of
// the session starts whichever track is already selected.
export function resumeMusic() {
  if (currentTrack && currentTrack.paused) playTrack(currentTrack);
}
