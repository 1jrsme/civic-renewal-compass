export const BEZEL_SYSTEMS = {
  degrees: "Degrees · 0–359",
  gradians: "Gradians · 0–399",
  radians: "Radians · 0–2π",
  mils: "NATO mils · 0–6399",
};

export const BEZEL_INTERVALS = [1, 5, 10, 15, 30, 45, 90];
export const BEARING_ARROW_COLORS = [
  "#c33d32",
  "#176b87",
  "#8b5a16",
  "#7047a3",
  "#267448",
  "#a43f76",
  "#4d5fb4",
  "#a34f22",
];

export function bearingArrowColor(index) {
  return BEARING_ARROW_COLORS[index % BEARING_ARROW_COLORS.length];
}

export const DEFAULT_BEZEL_DISPLAY = {
  zoom: 1.2,
  outer: {
    visible: true,
    systems: ["degrees"],
    interval: 30,
    color: "#315d4a",
    rotation: 0,
    radius: 44,
    labelRadius: 38,
    labelSize: 4.2,
    systemSpacing: 5,
  },
  inner: {
    visible: false,
    systems: [],
    interval: 30,
    color: "#45698b",
    rotation: 0,
    radius: 33,
    labelRadius: 28,
    labelSize: 4,
    systemSpacing: 4,
  },
};
export const DEFAULT_CELESTIAL_BEZEL = {
  visible: true,
  sun: true,
  moon: true,
  iss: true,
  interval: 30,
  view: "sphere",
};

export function normalizeBezelDisplay(value) {
  const zoom = value?.zoom;
  const normalizeRing = (ring, fallback) => {
    const visible = typeof ring?.visible === "boolean" ? ring.visible : fallback.visible;
    const systems = Array.isArray(ring?.systems)
      ? [...new Set(ring.systems.filter((system) => Object.hasOwn(BEZEL_SYSTEMS, system)))]
      : [...fallback.systems];
    const interval = BEZEL_INTERVALS.includes(ring?.interval) ? ring.interval : fallback.interval;
    const normalizeNumber = (key, minimum, maximum, precision = 0) => {
      const number = Number(ring?.[key]);
      if (!Number.isFinite(number)) return fallback[key];
      const factor = 10 ** precision;
      return Math.round(Math.max(minimum, Math.min(maximum, number)) * factor) / factor;
    };
    return {
      visible,
      systems: visible && systems.length === 0 ? ["degrees"] : systems,
      interval,
      color: /^#[\da-f]{6}$/i.test(ring?.color) ? ring.color.toLowerCase() : fallback.color,
      rotation: normalizeNumber("rotation", -180, 180, 1),
      radius: normalizeNumber("radius", 20, 47, 1),
      labelRadius: normalizeNumber("labelRadius", 15, 47, 1),
      labelSize: normalizeNumber("labelSize", 2, 8, 1),
      systemSpacing: normalizeNumber("systemSpacing", 1, 10, 1),
    };
  };
  return {
    outer: normalizeRing(value?.outer, DEFAULT_BEZEL_DISPLAY.outer),
    inner: normalizeRing(value?.inner, DEFAULT_BEZEL_DISPLAY.inner),
    zoom: Number.isFinite(zoom)
      ? Math.round(Math.max(0.8, Math.min(1.8, zoom)) * 100) / 100
      : DEFAULT_BEZEL_DISPLAY.zoom,
  };
}

export function normalizeCelestialBezel(value) {
  return {
    visible: typeof value?.visible === "boolean" ? value.visible : DEFAULT_CELESTIAL_BEZEL.visible,
    sun: typeof value?.sun === "boolean" ? value.sun : DEFAULT_CELESTIAL_BEZEL.sun,
    moon: typeof value?.moon === "boolean" ? value.moon : DEFAULT_CELESTIAL_BEZEL.moon,
    iss: typeof value?.iss === "boolean" ? value.iss : DEFAULT_CELESTIAL_BEZEL.iss,
    interval: BEZEL_INTERVALS.includes(value?.interval)
      ? value.interval
      : DEFAULT_CELESTIAL_BEZEL.interval,
    view: ["sphere", "sky-chart", "world-map", "perspective-map", "globe-map"].includes(value?.view)
      ? value.view
      : DEFAULT_CELESTIAL_BEZEL.view,
  };
}

function radiansLabel(angle) {
  const eighths = Math.round(angle / 45);
  if (Math.abs(eighths * 45 - angle) < 0.0001) {
    if (eighths === 0) return "0";
    let numerator = eighths;
    let denominator = 4;
    while (numerator % 2 === 0 && denominator % 2 === 0) {
      numerator /= 2;
      denominator /= 2;
    }
    if (denominator === 1) return numerator === 1 ? "π" : `${numerator}π`;
    return numerator === 1 ? `π/${denominator}` : `${numerator}π/${denominator}`;
  }
  return `${(angle * Math.PI / 180).toFixed(2)}r`;
}

export function buildBezelLabels(value) {
  const display = normalizeBezelDisplay(value);
  const labels = [];
  for (const ring of ["outer", "inner"]) {
    const settings = display[ring];
    if (!settings.visible || !settings.systems.length) continue;
    settings.systems.forEach((system, index) => {
      const radius = Math.max(12, settings.labelRadius - index * settings.systemSpacing);
      for (let angle = 0; angle < 360; angle += settings.interval) {
        let text;
        if (system === "degrees") text = String(angle).padStart(3, "0");
        else if (system === "gradians") {
          text = `${String(Math.round(angle * 400 / 360) % 400).padStart(3, "0")}g`;
        } else if (system === "mils") {
          text = String(Math.round(angle * 6400 / 360) % 6400).padStart(4, "0");
        } else text = radiansLabel(angle);
        labels.push({
          ring,
          system,
          angle,
          text,
          radius,
          size: settings.labelSize,
        });
      }
    });
  }
  return labels;
}

export function renderBezelOverlay(svg, value, rotation = 0) {
  const display = normalizeBezelDisplay(value);
  svg.closest(".compass-ring")?.style.setProperty("--compass-zoom", display.zoom);
  const key = JSON.stringify(display);
  if (svg.dataset.displayKey !== key) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const namespace = "http://www.w3.org/2000/svg";
    for (const ring of ["outer", "inner"]) {
      const settings = display[ring];
      if (!settings.visible) continue;
      const tickPath = [];
      const outerRadius = settings.radius;
      for (let degree = 0; degree < 360; degree += 1) {
        const radians = (degree + settings.rotation - 90) * Math.PI / 180;
        const innerRadius = degree % 10 === 0
          ? outerRadius - Math.min(4, outerRadius * 0.12)
          : degree % 5 === 0
            ? outerRadius - Math.min(3, outerRadius * 0.09)
            : outerRadius - Math.min(1.8, outerRadius * 0.055);
        const x1 = 50 + Math.cos(radians) * outerRadius;
        const y1 = 50 + Math.sin(radians) * outerRadius;
        const x2 = 50 + Math.cos(radians) * innerRadius;
        const y2 = 50 + Math.sin(radians) * innerRadius;
        tickPath.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
      }
      if (tickPath.length) {
        const ticks = document.createElementNS(namespace, "path");
        ticks.setAttribute("class", "bezel-ticks");
        ticks.setAttribute("data-ring", ring);
        ticks.setAttribute("d", tickPath.join(""));
        ticks.style.stroke = settings.color;
        svg.append(ticks);
      }
    }
    for (const label of buildBezelLabels(display)) {
      const radians = (label.angle + display[label.ring].rotation - 90) * Math.PI / 180;
      const text = document.createElementNS(namespace, "text");
      text.setAttribute("class", "bezel-number");
      text.setAttribute("data-ring", label.ring);
      text.setAttribute("data-system", label.system);
      text.style.fill = display[label.ring].color;
      text.style.fontSize = `${label.size}px`;
      text.setAttribute("x", (50 + Math.cos(radians) * label.radius).toFixed(2));
      text.setAttribute("y", (50 + Math.sin(radians) * label.radius).toFixed(2));
      text.textContent = label.text;
      svg.append(text);
    }
    svg.dataset.displayKey = key;
  }
  svg.style.transform = `rotate(${rotation}deg)`;
}

export function renderBearingArrows(svg, bearings, rotation = 0) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const namespace = "http://www.w3.org/2000/svg";
  for (const [index, bearing] of bearings.entries()) {
    if (!Number.isFinite(bearing.bearingDegrees)) continue;
    const angle = (bearing.bearingDegrees + rotation - 90) * Math.PI / 180;
    const tipX = 50 + Math.cos(angle) * 38;
    const tipY = 50 + Math.sin(angle) * 38;
    const baseX = 50 + Math.cos(angle) * 32;
    const baseY = 50 + Math.sin(angle) * 32;
    const wing = 2.5;
    const leftX = baseX + Math.cos(angle + Math.PI / 2) * wing;
    const leftY = baseY + Math.sin(angle + Math.PI / 2) * wing;
    const rightX = baseX + Math.cos(angle - Math.PI / 2) * wing;
    const rightY = baseY + Math.sin(angle - Math.PI / 2) * wing;
    const color = bearingArrowColor(index);
    const group = document.createElementNS(namespace, "g");
    group.setAttribute("class", "bearing-arrow");
    group.setAttribute("data-location-id", bearing.id);
    group.style.color = color;
    const title = document.createElementNS(namespace, "title");
    title.textContent = `${bearing.name}: ${Math.round(bearing.bearingDegrees)}°`;
    const shaft = document.createElementNS(namespace, "line");
    shaft.setAttribute("x1", "50");
    shaft.setAttribute("y1", "50");
    shaft.setAttribute("x2", baseX.toFixed(2));
    shaft.setAttribute("y2", baseY.toFixed(2));
    const head = document.createElementNS(namespace, "polygon");
    head.setAttribute("points", `${tipX.toFixed(2)},${tipY.toFixed(2)} ${leftX.toFixed(2)},${leftY.toFixed(2)} ${rightX.toFixed(2)},${rightY.toFixed(2)}`);
    const circle = document.createElementNS(namespace, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "1.5");
    group.append(title, shaft, head, circle);
    svg.append(group);
  }
}

export function projectCelestialDirection(azimuthDegrees, altitudeDegrees) {
  const azimuth = azimuthDegrees * Math.PI / 180;
  const altitude = Math.max(-90, Math.min(90, altitudeDegrees)) * Math.PI / 180;
  const tilt = 24 * Math.PI / 180;
  const horizontal = Math.cos(altitude);
  return {
    x: 80 + 42 * horizontal * Math.sin(azimuth),
    y: 62 - 42 * (
      Math.sin(altitude) * Math.cos(tilt) +
      horizontal * Math.cos(azimuth) * Math.sin(tilt)
    ),
  };
}

export function renderCelestialBezel(svg, sky, value, view = "sphere") {
  const display = normalizeCelestialBezel(value);
  const key = JSON.stringify([display, sky]);
  svg.hidden = !display.visible || !sky || view !== "sphere";
  if (svg.dataset.displayKey === key) return;
  svg.replaceChildren();
  svg.dataset.displayKey = key;
  if (svg.hidden) return;

  const namespace = "http://www.w3.org/2000/svg";
  const addElement = (name, attributes, parent = svg) => {
    const element = document.createElementNS(namespace, name);
    for (const [attribute, attributeValue] of Object.entries(attributes)) {
      element.setAttribute(attribute, String(attributeValue));
    }
    parent.append(element);
    return element;
  };
  const addPath = (points, className) => {
    const [first, ...rest] = points;
    if (!first) return;
    const commands = [`M${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
    for (const point of rest) commands.push(`L${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
    addElement("path", { class: className, d: commands.join("") });
  };

  addElement("circle", { class: "celestial-sphere", cx: 80, cy: 62, r: 42 });
  for (const altitude of [-60, -30, 0, 30, 60]) {
    const points = [];
    for (let azimuth = 0; azimuth <= 360; azimuth += 4) {
      points.push(projectCelestialDirection(azimuth, altitude));
    }
    addPath(points, altitude === 0 ? "celestial-grid celestial-horizon" : "celestial-grid");
    const label = addElement("text", {
      class: "celestial-altitude-label",
      x: 32,
      y: projectCelestialDirection(270, altitude).y + 2,
      "text-anchor": "end",
    });
    label.textContent = `${altitude > 0 ? "+" : ""}${altitude}°`;
  }
  for (let azimuth = 0; azimuth < 180; azimuth += 30) {
    const points = [];
    for (let altitude = -90; altitude <= 90; altitude += 3) {
      points.push(projectCelestialDirection(azimuth, altitude));
    }
    addPath(points, "celestial-grid celestial-meridian");
  }

  for (let azimuth = 0; azimuth < 360; azimuth += display.interval) {
    const angle = azimuth * Math.PI / 180;
    const label = addElement("text", {
      class: "celestial-azimuth-label",
      x: 80 + 51 * Math.sin(angle),
      y: 62 - 51 * Math.cos(angle),
    });
    label.textContent = String(azimuth).padStart(3, "0");
  }
  for (const body of ["sun", "moon", "iss"]) {
    if (!display[body]) continue;
    const position = sky[body];
    if (!position || !Number.isFinite(position.azimuthDegrees) ||
        !Number.isFinite(position.altitudeDegrees)) continue;
    const point = projectCelestialDirection(position.azimuthDegrees, position.altitudeDegrees);
    const marker = addElement("circle", {
      class: `celestial-marker celestial-marker-${body}`,
      cx: point.x,
      cy: point.y,
      r: body === "sun" ? 3.2 : body === "iss" ? 3 : 2.8,
      "data-body": body,
    });
    marker.setAttribute("aria-label", `${body}, azimuth ${position.azimuthDegrees.toFixed(1)} degrees, altitude ${position.altitudeDegrees.toFixed(1)} degrees`);
    addElement("text", {
      class: `celestial-marker-label celestial-marker-label-${body}`,
      x: point.x + 5,
      y: point.y - 4,
    }).textContent = body === "sun" ? "Sun" : body === "moon" ? "Moon" : "ISS";
  }
}

export function renderCelestialSkyChart(svg, sky, value) {
  const display = normalizeCelestialBezel(value);
  svg.hidden = !display.visible || !sky || display.view !== "sky-chart";
  const key = JSON.stringify([display, sky, "sky-chart"]);
  if (svg.dataset.displayKey === key) return;
  svg.replaceChildren();
  svg.dataset.displayKey = key;
  if (svg.hidden) return;

  const namespace = "http://www.w3.org/2000/svg";
  const addElement = (name, attributes, parent = svg) => {
    const element = document.createElementNS(namespace, name);
    for (const [attribute, attributeValue] of Object.entries(attributes)) {
      element.setAttribute(attribute, String(attributeValue));
    }
    parent.append(element);
    return element;
  };
  const x = (azimuth) => 20 + 120 * (((azimuth % 360) + 360) % 360) / 360;
  const y = (altitude) => 102 - 80 * (Math.max(-90, Math.min(90, altitude)) + 90) / 180;
  addElement("rect", { class: "celestial-chart-background", x: 20, y: 12, width: 120, height: 90, rx: 2 });
  for (const altitude of [-90, -60, -30, 0, 30, 60, 90]) {
    const lineY = y(altitude);
    addElement("line", {
      class: altitude === 0 ? "celestial-chart-grid celestial-horizon" : "celestial-chart-grid",
      x1: 20,
      x2: 140,
      y1: lineY,
      y2: lineY,
    });
    const label = addElement("text", { class: "celestial-chart-axis", x: 17, y: lineY + 1, "text-anchor": "end" });
    label.textContent = `${altitude}°`;
  }
  for (let azimuth = 0; azimuth <= 360; azimuth += 45) {
    const lineX = x(azimuth);
    addElement("line", { class: "celestial-chart-grid", x1: lineX, x2: lineX, y1: 12, y2: 102 });
    if (azimuth < 360 && azimuth % display.interval === 0) {
      const label = addElement("text", {
        class: "celestial-chart-axis",
        x: lineX,
        y: 110,
        "text-anchor": "middle",
      });
      label.textContent = `${String(azimuth).padStart(3, "0")}°`;
    }
  }
  for (const body of ["sun", "moon", "iss"]) {
    const position = sky[body];
    if (!display[body] || !position ||
        !Number.isFinite(position.azimuthDegrees) || !Number.isFinite(position.altitudeDegrees)) continue;
    const pointX = x(position.azimuthDegrees);
    const pointY = y(position.altitudeDegrees);
    addElement("circle", {
      class: `celestial-marker celestial-marker-${body}`,
      cx: pointX,
      cy: pointY,
      r: body === "sun" ? 3.2 : 2.8,
    });
    const label = addElement("text", {
      class: `celestial-marker-label celestial-marker-label-${body}`,
      x: pointX + 4,
      y: pointY - 3,
    });
    label.textContent = body === "sun" ? "Sun" : body === "moon" ? "Moon" : "ISS";
  }
}
