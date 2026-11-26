// SAYAP NUSANTARA — keyboard and mouse input. Keys are read as actions
// (throttle, pitch, bank, drop, flaps, view, pause, mute, confirm) and
// clicks are reported in 1280x720 canvas coordinates so the renderer and
// the game agree on where every button is.

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_VIEW = 'view';
export const ACTION_FLAPS = 'flaps';
export const ACTION_DROP = 'drop';

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  p: ACTION_PAUSE,
  P: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  m: ACTION_MUTE,
  M: ACTION_MUTE,
  v: ACTION_VIEW,
  V: ACTION_VIEW,
  f: ACTION_FLAPS,
  F: ACTION_FLAPS,
};

export function createInput(canvas, toGameCoords) {
  const held = new Set();
  const keyQueue = [];
  const clickQueue = [];
  let mouse = { x: 0, y: 0 };

  function onKeyDown(e) {
    if (e.repeat) return;
    const action = KEY_ACTIONS[e.key];
    if (action) {
      keyQueue.push(action);
      if (action === ACTION_CONFIRM && e.key === ' ') e.preventDefault();
    }
    if (e.key === ' ') {
      keyQueue.push(ACTION_DROP);
      e.preventDefault();
    }
    held.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function onKeyUp(e) {
    held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const p = toGameCoords(nx, ny);
    clickQueue.push({ x: p.x, y: p.y });
  }
  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const p = toGameCoords(nx, ny);
    mouse = { x: p.x, y: p.y };
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);

  // Held-key state the flight model reads every step.
  function controls() {
    const shift = held.has('Shift');
    return {
      throttleUp: held.has('w') || shift,
      throttleDown: held.has('s'),
      pitchUp: held.has('ArrowUp') ? 1 : 0,
      pitchDown: held.has('ArrowDown') ? 1 : 0,
      bankLeft: (held.has('ArrowLeft') || held.has('a')) ? 1 : 0,
      bankRight: (held.has('ArrowRight') || held.has('d')) ? 1 : 0,
    };
  }

  return {
    controls,
    takeKeys() { return keyQueue.splice(0, keyQueue.length); },
    takeClicks() { return clickQueue.splice(0, clickQueue.length); },
    mouse() { return mouse; },
  };
}
