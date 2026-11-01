import {
  angularDelta,
  clamp,
  compassHeadingFromMessage,
  computeGyroState,
  normalizeDegrees,
} from "./gyro-model.js";

const state = {
  heading: 32,
  pitch: 12,
  roll: -18,
  spinRate: 18,
  stability: 84,
  inputMode: "manual",
  compassHasHeading: false,
  lastMotionTime: 0,
  lastHeading: null,
};

const byId = (id) => document.getElementById(id);
const controls = {
  heading: byId("heading-control"),
  pitch: byId("pitch-control"),
  roll: byId("roll-control"),
  spinRate: byId("spin-rate-control"),
  stability: byId("stability-control"),
};

const outputs = {
  heading: byId("heading-output"),
  pitch: byId("pitch-output"),
  roll: byId("roll-output"),
  spinRate: byId("spin-rate-output"),
  stability: byId("stability-output"),
};

const readouts = {
  heading: byId("gyro-heading"),
  pitch: byId("gyro-pitch"),
  roll: byId("gyro-roll"),
  spinRate: byId("gyro-spin-rate"),
  stability: byId("gyro-stability"),
  status: byId("gyro-motion-status"),
};

const toggleLive = byId("gyro-live-toggle");
const toggleCompass = byId("gyro-compass-toggle");
const resetButton = byId("gyro-reset");
const assembly = byId("gyro-assembly");
const compassChannel = "BroadcastChannel" in window
  ? new BroadcastChannel("civic-renewal-atlas-compass")
  : null;

function applySliderValues() {
  controls.heading.value = String(state.heading);
  controls.pitch.value = String(state.pitch);
  controls.roll.value = String(state.roll);
  controls.spinRate.value = String(state.spinRate);
  controls.stability.value = String(state.stability);
}

function renderOutputs() {
  outputs.heading.textContent = `${Math.round(state.heading)}°`;
  outputs.pitch.textContent = `${Math.round(state.pitch)}°`;
  outputs.roll.textContent = `${Math.round(state.roll)}°`;
  outputs.spinRate.textContent = `${Math.round(state.spinRate)}°/s`;
  outputs.stability.textContent = `${Math.round(state.stability)}%`;

  readouts.heading.textContent = `${Math.round(state.heading)}°`;
  readouts.pitch.textContent = `${Math.round(state.pitch)}°`;
  readouts.roll.textContent = `${Math.round(state.roll)}°`;
  readouts.spinRate.textContent = `${Math.round(state.spinRate)}°/s`;
  readouts.stability.textContent = `${Math.round(state.stability)}%`;
}

function renderAssembly() {
  const safeState = computeGyroState(state);
  state.heading = safeState.heading;
  state.pitch = safeState.pitch;
  state.roll = safeState.roll;
  state.spinRate = safeState.spinRate;
  state.stability = safeState.stability;

  assembly.style.transform = `rotate(${safeState.heading}deg) rotateX(${-safeState.pitch}deg) rotateY(${safeState.roll}deg)`;
  assembly.style.filter = safeState.safe ? "drop-shadow(0 18px 28px rgba(23, 107, 83, 0.2))" : "drop-shadow(0 18px 28px rgba(189, 75, 58, 0.2))";
  const sourceStatus = state.inputMode === "device"
    ? "Device orientation"
    : state.inputMode === "compass"
      ? state.compassHasHeading
        ? "Compass heading connected · pitch and roll remain manual"
        : "Waiting for compass heading · pitch and roll remain manual"
      : "Manual mode";
  readouts.status.textContent = `${sourceStatus} · ${safeState.safe ? "orientation stable" : "tilt exceeds safe band"}`;
}

function syncFromControls() {
  state.heading = Number(controls.heading.value);
  state.pitch = Number(controls.pitch.value);
  state.roll = Number(controls.roll.value);
  state.spinRate = Number(controls.spinRate.value);
  state.stability = Number(controls.stability.value);
  renderOutputs();
  renderAssembly();
}

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener("input", () => {
    state.inputMode = "manual";
    state.lastHeading = null;
    state.lastMotionTime = 0;
    toggleLive.textContent = "Use device orientation";
    window.removeEventListener("deviceorientation", handleDeviceOrientation);
    readouts.status.textContent = "Manual mode";
    switch (key) {
      case "heading":
        state.heading = Number(input.value);
        break;
      case "pitch":
        state.pitch = Number(input.value);
        break;
      case "roll":
        state.roll = Number(input.value);
        break;
      case "spinRate":
        state.spinRate = Number(input.value);
        break;
      case "stability":
        state.stability = Number(input.value);
        break;
      default:
        break;
    }
    renderOutputs();
    renderAssembly();
  });
});

function handleDeviceOrientation(event) {
  const alpha = typeof event.webkitCompassHeading === "number"
    ? event.webkitCompassHeading
    : Number.isFinite(event.alpha)
      ? 360 - Number(event.alpha)
      : state.heading;
  const beta = Number.isFinite(event.beta) ? clamp(Number(event.beta), -90, 90) : state.pitch;
  const gamma = Number.isFinite(event.gamma) ? clamp(Number(event.gamma), -180, 180) : state.roll;
  const now = performance.now();

  if (state.lastHeading !== null && state.lastMotionTime) {
    const delta = angularDelta(alpha, state.lastHeading);
    const dt = Math.max((now - state.lastMotionTime) / 1000, 0.016);
    state.spinRate = clamp((delta / dt) * 0.35, -720, 720);
  }

  state.heading = normalizeDegrees(alpha);
  state.pitch = beta;
  state.roll = gamma;
  state.lastHeading = state.heading;
  state.lastMotionTime = now;
  state.inputMode = "device";
  renderOutputs();
  renderAssembly();
}

function enableLiveMode() {
  if (!("DeviceOrientationEvent" in window)) {
    readouts.status.textContent = "This browser does not expose device orientation.";
    return;
  }

  state.inputMode = "device";
  state.lastHeading = null;
  state.lastMotionTime = 0;
  window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
  toggleLive.textContent = "Live tracking on";
  renderAssembly();
}

toggleLive.addEventListener("click", () => {
  if (state.inputMode === "device") {
    state.inputMode = "manual";
    state.lastHeading = null;
    state.lastMotionTime = 0;
    window.removeEventListener("deviceorientation", handleDeviceOrientation);
    toggleLive.textContent = "Use device orientation";
    renderAssembly();
    return;
  }

  enableLiveMode();
});

function applyCompassHeading(heading) {
  const now = performance.now();
  if (state.lastHeading !== null && state.lastMotionTime) {
    const delta = angularDelta(heading, state.lastHeading);
    const dt = Math.max((now - state.lastMotionTime) / 1000, 0.016);
    state.spinRate = clamp((delta / dt) * 0.35, -720, 720);
  }
  state.heading = heading;
  state.lastHeading = heading;
  state.lastMotionTime = now;
  renderOutputs();
  renderAssembly();
}

toggleCompass.addEventListener("click", () => {
  if (!compassChannel) {
    readouts.status.textContent = "Compass sharing is unavailable in this browser.";
    return;
  }
  state.inputMode = "compass";
  state.lastHeading = null;
  state.lastMotionTime = 0;
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  toggleLive.textContent = "Use device orientation";
  renderAssembly();
  compassChannel.postMessage({ type: "ready" });
});

compassChannel?.addEventListener("message", ({ data }) => {
  if (state.inputMode !== "compass") return;
  const heading = compassHeadingFromMessage(data);
  if (heading === null) return;
  state.compassHasHeading = true;
  applyCompassHeading(heading);
});

resetButton.addEventListener("click", () => {
  state.heading = 32;
  state.pitch = 12;
  state.roll = -18;
  state.spinRate = 18;
  state.stability = 84;
  state.lastHeading = null;
  state.lastMotionTime = 0;
  state.inputMode = "manual";
  window.removeEventListener("deviceorientation", handleDeviceOrientation);
  state.compassHasHeading = false;
  applySliderValues();
  renderOutputs();
  renderAssembly();
  toggleLive.textContent = "Use device orientation";
});

applySliderValues();
renderOutputs();
renderAssembly();
