export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeDegrees(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function normalizeSignedDegrees(value, range = 180) {
  const span = range * 2;
  const normalized = value % span;
  if (normalized > range) return normalized - span;
  if (normalized < -range) return normalized + span;
  return normalized;
}

export function computeGyroState({
  heading = 0,
  pitch = 0,
  roll = 0,
  spinRate = 0,
  stability = 100,
}) {
  const safeHeading = normalizeDegrees(heading);
  const safePitch = clamp(pitch, -90, 90);
  const safeRoll = clamp(roll, -180, 180);
  const safeSpinRate = clamp(spinRate, -720, 720);
  const safeStability = clamp(stability, 0, 100);

  return {
    heading: safeHeading,
    pitch: safePitch,
    roll: safeRoll,
    spinRate: safeSpinRate,
    stability: safeStability,
    safe: Math.abs(safePitch) < 60 && Math.abs(safeRoll) <= 120,
  };
}

export function formatSignedDegrees(value, suffix = "°") {
  return `${value.toFixed(1)}${suffix}`;
}

export function angularDelta(current, previous) {
  return normalizeSignedDegrees(current - previous, 180);
}

export function compassHeadingFromMessage(message) {
  if (
    (message?.type === "heading" || message?.type === "state") &&
    Number.isFinite(message.heading)
  ) {
    return normalizeDegrees(message.heading);
  }
  return null;
}
