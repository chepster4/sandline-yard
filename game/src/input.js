// SANDLINE YARD — input. Pointer lock for the mouse, a key set for
// movement, and two queues the main loop drains every frame: look deltas and
// pressed keys. A press is recorded once per physical key-down (key repeats
// do not re-fire), and the mouse wheel feeds the same pressed queue as
// WheelUp / WheelDown so the weapon cycle reads it like any other key.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    pressed: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    aiming: false,
    locked: false,
  };

  function requestLock() {
    if (document.pointerLockElement !== canvas) {
      const promise = canvas.requestPointerLock();
      if (promise && promise.catch) promise.catch(() => {});
    }
  }

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.firing = false;
      state.aiming = false;
      state.pressed.clear();
    }
    if (onLockChange) onLockChange(state.locked);
  });

  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX || 0;
    state.lookY += event.movementY || 0;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    if (!event.repeat) {
      state.keys.add(event.code);
      state.pressed.add(event.code);
    }
  });
  document.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.pressed.clear();
    state.lookX = 0;
    state.lookY = 0;
    state.firing = false;
    state.aiming = false;
  });

  // The wheel cycles weapons: one notch is one press, and the queue is
  // drained by the same takePressed the keyboard uses.
  canvas.addEventListener('wheel', (event) => {
    if (!state.locked) return;
    state.pressed.add(event.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  }, { passive: true });

  // takeLook: the mouse movement since the last call, then zeroed.
  function takeLook() {
    const out = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return out;
  }

  // takePressed: the keys pressed since the last call, then cleared.
  function takePressed() {
    const out = new Set(state.pressed);
    state.pressed.clear();
    return out;
  }

  return { state, requestLock, takeLook, takePressed };
}
