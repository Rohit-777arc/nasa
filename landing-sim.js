const mount = document.getElementById("landingScene");
const canvas = document.getElementById("landingCanvas");
if (!mount || !canvas) throw new Error("Landing simulation view is missing.");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas rendering is unavailable.");

const byId = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const SITES = [
  { name: "Peak near Cabeus B", x: .12, y: -.18, solar: 58, comms: 67, slope: 5.2 },
  { name: "Haworth", x: -.42, y: .12, solar: 72, comms: 75, slope: 6.1 },
  { name: "Malapert Massif", x: .48, y: -.03, solar: 82, comms: 88, slope: 4.8 },
  { name: "Mons Mouton Plateau", x: -.16, y: -.38, solar: 78, comms: 85, slope: 3.9 },
  { name: "Mons Mouton", x: -.05, y: -.1, solar: 84, comms: 80, slope: 7.3 },
  { name: "Nobile Rim 1", x: .27, y: .32, solar: 69, comms: 77, slope: 5.7 },
  { name: "Nobile Rim 2", x: .64, y: .12, solar: 75, comms: 72, slope: 6.4 },
  { name: "de Gerlache Rim 2", x: -.66, y: -.16, solar: 88, comms: 81, slope: 4.6 },
  { name: "Slater Plain", x: .05, y: .53, solar: 63, comms: 91, slope: 2.8 },
];

const destinationSelect = byId("destination");
if (destinationSelect.options.length !== SITES.length) {
  throw new Error("Destination list does not match the lunar site data.");
}

let seed = 724196;
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
}

const stars = Array.from({ length: 155 }, () => ({
  x: random(),
  y: random() * .67,
  radius: .4 + random() * 1.1,
  alpha: .2 + random() * .65,
}));
const craters = Array.from({ length: 34 }, (_, index) => ({
  x: .025 + random() * .95,
  radius: index < 7 ? .055 + random() * .06 : .012 + random() * .038,
  depth: .012 + random() * .048,
  rim: .007 + random() * .018,
}));

let width = 0;
let height = 0;
let currentSite = SITES[0];
let running = false;
let currentAltitude = 100000;
let descentStartAltitude = 100000;
let velocity = -55;
let fuel = 100;
let elapsed = 0;
let attitude = 0;
let horizontalOffset = 0;
let horizontalVelocity = 0;
let currentThrust = 0;
let lastFrame = 0;
const heldControls = new Set();
const pilotButtons = [...document.querySelectorAll(".pilot-pad [data-control]")];
const controlKeys = new Map([
  ["arrowup", "forward"], ["w", "forward"],
  ["arrowdown", "back"], ["s", "back"],
  ["arrowleft", "left"], ["a", "left"],
  ["arrowright", "right"], ["d", "right"],
]);

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  draw();
}

function surfaceElevation(x) {
  let elevation = .006 * Math.sin(x * 56) + .004 * Math.sin(x * 137 + .8);
  for (const crater of craters) {
    const distance = Math.abs(x - crater.x);
    elevation -= crater.depth * Math.exp(-Math.pow(distance / (crater.radius * .7), 2));
    elevation += crater.rim * Math.exp(-Math.pow((distance - crater.radius * .88) / (crater.radius * .15), 2));
  }
  return elevation;
}

function surfaceY(x) {
  return height * (.755 - surfaceElevation(x) * 1.8);
}

function siteMapX(site) {
  return clamp(.5 + site.x * .35, .05, .95);
}

function targetX() {
  return width * siteMapX(currentSite);
}

function altitudeToY(altitude) {
  const fraction = Math.log1p(Math.max(0, altitude)) / Math.log1p(Math.max(1, descentStartAltitude));
  return lerp(surfaceY(siteMapX(currentSite)) - 16, height * .15, fraction);
}

function bezierPoint(t, from, control, to) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function flightPath(progress, offset = 0) {
  const destination = { x: targetX(), y: surfaceY(siteMapX(currentSite)) };
  const start = { x: clamp(destination.x - width * .24, width * .08, width * .84), y: height * .15 };
  const control = { x: (start.x + destination.x) / 2, y: height * .22 };
  const point = bezierPoint(progress, start, control, destination);
  point.x += offset;
  return { start, control, destination, point };
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#03070d");
  sky.addColorStop(.58, "#0b1118");
  sky.addColorStop(1, "#171b20");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#c8d8e6";
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const moonGlow = ctx.createRadialGradient(width * .82, height * .18, 2, width * .82, height * .18, height * .23);
  moonGlow.addColorStop(0, "rgba(107,157,191,.16)");
  moonGlow.addColorStop(1, "rgba(107,157,191,0)");
  ctx.fillStyle = moonGlow;
  ctx.fillRect(width * .57, 0, width * .43, height * .5);

  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = "rgba(150,176,195,.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(width * .23, height * .17, width * .17, height * .075, -.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.font = "700 8px ui-monospace,monospace";
  ctx.fillStyle = "#7f96a9";
  ctx.fillText("LOW LUNAR ORBIT", width * .075, height * .075);
}

function drawTerrain() {
  const ground = ctx.createLinearGradient(0, height * .68, 0, height);
  ground.addColorStop(0, "#77756f");
  ground.addColorStop(.35, "#4e4e4b");
  ground.addColorStop(1, "#25282b");

  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 3) {
    ctx.lineTo(x, surfaceY(x / width));
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = ground;
  ctx.fill();

  const solarAngle = (elapsed / (29.5 * 86400)) * Math.PI * 2 + .7;
  const shadowDirection = Math.cos(solarAngle) >= 0 ? 1 : -1;
  for (const crater of craters) {
    const cx = crater.x * width;
    const cy = surfaceY(crater.x);
    const rx = crater.radius * width;
    const ry = Math.max(5, rx * .17);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, rx * 1.12, ry * 1.5, 0, 0, Math.PI);
    ctx.fillStyle = "rgba(9,12,16,.22)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,208,198,.56)";
    ctx.lineWidth = Math.max(.7, rx * .035);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + shadowDirection * rx * .12, cy + ry * .24, rx * .75, ry * .78, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = "rgba(14,17,20,.32)";
    ctx.fill();
  }

  for (let i = 0; i < 145; i++) {
    const x = (i * 193.7 + 37) % width;
    const y = surfaceY(x / width) + 2 + (i * 47 % 33);
    const size = .5 + i % 4 * .35;
    ctx.fillStyle = i % 3 ? "rgba(190,185,173,.34)" : "rgba(18,21,24,.4)";
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.8, size, -.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSiteMap() {
  const centerX = width - 63;
  const centerY = 76;
  const radius = 43;
  const globe = ctx.createRadialGradient(centerX - 13, centerY - 15, 2, centerX, centerY, radius);
  globe.addColorStop(0, "#bab9b4");
  globe.addColorStop(.68, "#777a7b");
  globe.addColorStop(1, "#343a42");
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = globe;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(31,35,39,.32)";
  [[-.35, -.25, 9], [.28, -.39, 13], [.08, .27, 16], [-.55, .4, 7]].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(centerX + x * radius, centerY + y * radius, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  ctx.strokeStyle = "rgba(226,236,240,.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  SITES.forEach((site, index) => {
    const x = centerX + site.x * radius * .72;
    const y = centerY + site.y * radius * .72;
    const selected = site === currentSite;
    ctx.beginPath();
    ctx.arc(x, y, selected ? 4.2 : 2.7, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#59d9ff" : "#ffd276";
    ctx.fill();
    ctx.font = "700 7px ui-monospace,monospace";
    ctx.fillStyle = selected ? "#fff" : "#252c30";
    ctx.fillText(String(index + 1), x + 4, y - 3);
  });
  ctx.font = "700 7px ui-monospace,monospace";
  ctx.fillStyle = "#b0c2d0";
  ctx.fillText("SOUTH POLE SITES", centerX - 41, centerY + radius + 12);
}

function drawLandingTarget(x) {
  const y = surfaceY(siteMapX(currentSite));
  ctx.save();
  ctx.strokeStyle = "rgba(89,217,255,.9)";
  ctx.fillStyle = "rgba(89,217,255,.14)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 28);
  ctx.lineTo(x, y - 5);
  ctx.stroke();
  ctx.fillStyle = "#b9f4ff";
  ctx.beginPath();
  ctx.arc(x, y - 31, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "700 8px ui-monospace,monospace";
  ctx.fillStyle = "#bceeff";
  ctx.fillText(currentSite.name.toUpperCase(), clamp(x - 48, 8, width - 130), y - 38);
  ctx.restore();
}

function drawSiteMarkers() {
  SITES.forEach((site, index) => {
    const mapX = siteMapX(site);
    const x = width * mapX;
    const y = surfaceY(mapX);
    const selected = site === currentSite;
    ctx.fillStyle = selected ? "#59d9ff" : "rgba(255,210,118,.72)";
    ctx.beginPath();
    ctx.arc(x, y - 5, selected ? 3.5 : 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.font = "700 7px ui-monospace,monospace";
      ctx.fillStyle = "#e3f7ff";
      ctx.fillText(String(index + 1), x + 5, y - 7);
    }
  });
}

function drawLander(x, y, angle, thrust) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (thrust > 1.75) {
    const flameLength = 12 + Math.min(1, thrust / 8) * 25 + random() * 5;
    const flame = ctx.createLinearGradient(0, 9, 0, 9 + flameLength);
    flame.addColorStop(0, "rgba(214,246,255,.95)");
    flame.addColorStop(.35, "rgba(89,217,255,.8)");
    flame.addColorStop(1, "rgba(255,166,63,0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-5, 9);
    ctx.lineTo(0, 9 + flameLength);
    ctx.lineTo(5, 9);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = "#d7e3e8";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-7, 2); ctx.lineTo(-14, 14); ctx.lineTo(-19, 15);
  ctx.moveTo(7, 2); ctx.lineTo(14, 14); ctx.lineTo(19, 15);
  ctx.stroke();
  ctx.fillStyle = "#9caeb8";
  ctx.fillRect(-21, 14, 6, 2);
  ctx.fillRect(15, 14, 6, 2);

  ctx.fillStyle = "#cdd8dd";
  ctx.beginPath();
  ctx.moveTo(-9, -6); ctx.lineTo(9, -6); ctx.lineTo(7, 7);
  ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#748b9a";
  ctx.fillRect(-6, -13, 12, 8);
  ctx.fillStyle = "#62c5e7";
  ctx.beginPath();
  ctx.arc(0, -9, 3.2, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#788a94";
  ctx.fillRect(-4, 7, 8, 4);

  ctx.fillStyle = "#1e5d7e";
  ctx.fillRect(-27, -2, 13, 3);
  ctx.fillRect(14, -2, 13, 3);
  ctx.strokeStyle = "#7ad5f2";
  ctx.lineWidth = .65;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-25 + (i + 2) * 2.2, -1.5);
    ctx.lineTo(-25 + (i + 2) * 2.2, .5);
    ctx.moveTo(16 + (i + 2) * 2.2, -1.5);
    ctx.lineTo(16 + (i + 2) * 2.2, .5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrajectory(progress, rocketX, rocketY, offset) {
  const path = flightPath(0);
  const end = path.destination;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(119,156,182,.68)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(path.start.x, path.start.y);
  ctx.quadraticCurveTo(path.control.x, path.control.y, end.x, end.y);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(89,217,255,.2)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(path.start.x, path.start.y);
  ctx.quadraticCurveTo(path.control.x, path.control.y, rocketX, rocketY);
  ctx.stroke();
  ctx.strokeStyle = "#59d9ff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(path.start.x, path.start.y);
  ctx.quadraticCurveTo(path.control.x, path.control.y, rocketX, rocketY);
  ctx.stroke();
  ctx.restore();

  const guideX = lerp(path.start.x, end.x, progress);
  if (Math.abs(offset) > 1) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "#ffc857";
    ctx.beginPath();
    ctx.moveTo(guideX, rocketY + 12);
    ctx.lineTo(rocketX, rocketY + 12);
    ctx.stroke();
    ctx.restore();
  }
}

function draw() {
  if (!width || !height) return;
  ctx.clearRect(0, 0, width, height);
  drawBackground();
  drawTerrain();

  const progress = running
    ? clamp(1 - currentAltitude / descentStartAltitude, 0, 1)
    : 0;
  const basePath = flightPath(progress);
  const x = basePath.point.x + horizontalOffset / 80000 * width;
  const y = altitudeToY(currentAltitude);
  drawTrajectory(progress, x, y, horizontalOffset);
  drawSiteMarkers();
  drawLandingTarget(targetX());
  drawLander(x, y, attitude, currentThrust);
  drawSiteMap();

  ctx.font = "700 8px ui-monospace,monospace";
  ctx.fillStyle = "#91a8ba";
  ctx.fillText(`TRAJECTORY ${Math.round(progress * 100)}%`, 12, height - 12);
  ctx.fillStyle = "#59d9ff";
  ctx.fillText("— ACTIVE FLIGHT PATH", 116, height - 12);
}

function updateEnvironmentTelemetry() {
  const solar = clamp(Math.round(currentSite.solar + 12 * Math.sin(elapsed / (29.5 * 86400) * Math.PI * 2)), 0, 100);
  const comms = clamp(Math.round(currentSite.comms + 9 * Math.sin(elapsed / (27.3 * 86400) * Math.PI * 2)), 0, 100);
  byId("tSolar").textContent = `${solar}%`;
  byId("tComms").textContent = `${comms}%`;
}

function formatClock(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = Math.floor(seconds % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function updateHud() {
  const progress = running ? clamp(1 - currentAltitude / descentStartAltitude, 0, 1) : 0;
  byId("clock").textContent = formatClock(elapsed);
  byId("tAlt").textContent = `${Math.max(0, Math.round(currentAltitude))} m`;
  byId("tVel").textContent = `${velocity.toFixed(1)} m/s`;
  byId("tFuel").textContent = `${Math.round(fuel)}%`;
  byId("tSlope").textContent = `${currentSite.slope.toFixed(1)}°`;
  byId("tOffset").textContent = `${Math.abs(horizontalOffset).toFixed(0)} m`;
  byId("simresult").textContent = running
    ? `${currentSite.name} · ${Math.round(progress * 100)}% descent · ${Number(byId("timeRate").value)}× time`
    : byId("simresult").textContent;
  updateEnvironmentTelemetry();
}

function setSite(index) {
  currentSite = SITES[index];
  destinationSelect.selectedIndex = index;
  if (!running) {
    const configuredAltitude = Number(byId("alt").value);
    currentAltitude = Number.isFinite(configuredAltitude) && configuredAltitude > 0
      ? configuredAltitude
      : 100000;
    descentStartAltitude = currentAltitude;
    elapsed = 0;
    const configuredVelocity = Number(byId("vel").value);
    const configuredFuel = Number(byId("fuel").value);
    velocity = Number.isFinite(configuredVelocity) ? configuredVelocity : -55;
    fuel = Number.isFinite(configuredFuel) ? configuredFuel : 100;
    horizontalOffset = 0;
    horizontalVelocity = 0;
  }
  byId("tSlope").textContent = `${currentSite.slope.toFixed(1)}°`;
  byId("destinationInfo").textContent =
    `TARGET ${currentSite.name.toUpperCase()} · ILLUSTRATIVE TERRAIN · SITE VALUES ARE SIMULATED`;
  updateEnvironmentTelemetry();
  draw();
}

function clearControls() {
  heldControls.clear();
  pilotButtons.forEach(button => button.classList.remove("active"));
}

function updateGuidanceControls() {
  const guidance = byId("guidance").value;
  const manual = guidance === "Manual";
  const easyPilot = guidance === "Easy Pilot";
  byId("pilotHint").textContent = easyPilot
    ? "EASY PILOT · AUTO-STABILIZED · ARROWS STEER / ADJUST THRUST · 1–9 SET THRUST"
    : manual
      ? "MANUAL · ARROWS STEER / ADJUST THRUST · 1–9 SET THRUST"
      : "ASSISTED LANDING ENABLED · SELECT EASY PILOT OR MANUAL TO STEER";
  byId("flightHint").innerHTML = easyPilot
    ? "EASY PILOT · AUTO-STABILIZED<br>ARROWS: STEER / THRUST · 1–9: THRUST LEVEL"
    : manual
      ? "MANUAL POWERED DESCENT<br>ARROWS: STEER / THRUST · 1–9: THRUST LEVEL"
      : "ORBITAL APPROACH → POWERED DESCENT<br>SELECT EASY PILOT OR MANUAL TO STEER";
  byId("pilotControls").classList.toggle("manual-active", manual || easyPilot);
  byId("throttle").disabled = !(manual || easyPilot);
  pilotButtons.forEach(button => {
    button.disabled = !(manual || easyPilot);
  });
  if (!manual && !easyPilot) clearControls();
}

function startDescent() {
  if (running) return;
  const altitude = Number(byId("alt").value);
  const initialVelocity = Number(byId("vel").value);
  const initialFuel = Number(byId("fuel").value);
  const angle = Number(byId("angle").value);
  const timeRate = Number(byId("timeRate").value);
  if (!Number.isFinite(altitude) || altitude <= 0 || altitude > 100000 ||
      !Number.isFinite(initialVelocity) || initialVelocity >= 0 ||
      !Number.isFinite(initialFuel) || initialFuel < 0 || initialFuel > 100 ||
      !Number.isFinite(angle) || angle < 0 || angle > 45 ||
      !Number.isFinite(timeRate) || timeRate < 1) {
    byId("simresult").textContent = "Check configuration: altitude must be 1–100,000 m, vertical speed must be descending, fuel must be 0–100%, angle 0–45°, and time rate at least 1×.";
    return;
  }

  running = true;
  currentAltitude = altitude;
  descentStartAltitude = altitude;
  velocity = initialVelocity;
  fuel = initialFuel;
  elapsed = 0;
  attitude = angle * Math.PI / 180;
  horizontalOffset = 0;
  horizontalVelocity = 0;
  currentThrust = 0;
  lastFrame = 0;
  clearControls();
  destinationSelect.disabled = true;
  byId("status").textContent = "ORBITAL APPROACH";
  byId("simresult").textContent = `Orbital insertion initiated for ${currentSite.name}.`;
  updateHud();
  requestAnimationFrame(step);
}

function step(timestamp) {
  if (!running) return;
  if (!lastFrame) lastFrame = timestamp;
  const realSeconds = Math.min(Math.max(0, (timestamp - lastFrame) / 1000), .1);
  lastFrame = timestamp;
  let remaining = realSeconds * Number(byId("timeRate").value);
  let frameSeconds = 0;

  while (remaining > 0 && currentAltitude > 0) {
    const dt = Math.min(.2, remaining);
    remaining -= dt;
    frameSeconds += dt;
    elapsed += dt;
    const guidance = byId("guidance").value;
    const manual = guidance === "Manual";
    const easyPilot = guidance === "Easy Pilot";
    const up = Number(heldControls.has("forward"));
    const down = Number(heldControls.has("back"));
    if (manual || easyPilot) {
      const throttleControl = byId("throttle");
      const realSeconds = dt / Math.max(1, Number(byId("timeRate").value));
      const throttlePercent = clamp(Number(throttleControl.value) + (up - down) * 12 * realSeconds, 0, 100);
      throttleControl.value = String(throttlePercent);
      byId("throttleValue").textContent = `${Math.round(throttlePercent)}%`;
    }
    if (manual) {
      const left = Number(heldControls.has("left"));
      const right = Number(heldControls.has("right"));
      const throttleControl = byId("throttle");
      currentThrust = Number(throttleControl.value) / 100 * 8;
      attitude = lerp(attitude, (right - left) * .28, Math.min(1, .9 * dt));
      horizontalVelocity = clamp(horizontalVelocity + Math.sin(attitude) * currentThrust * dt, -55, 55);
      horizontalVelocity *= Math.exp(-.08 * dt);
      horizontalOffset = clamp(horizontalOffset + horizontalVelocity * dt, -50000, 50000);
    } else if (easyPilot) {
      currentThrust = Number(byId("throttle").value) / 100 * 8;
      const steering = Number(heldControls.has("right")) - Number(heldControls.has("left"));
      const assistAttitude = clamp(
        steering * .16 - horizontalOffset * .000015 - horizontalVelocity * .025,
        -.16,
        .16,
      );
      attitude = lerp(attitude, assistAttitude, Math.min(1, 1.3 * dt));
      horizontalVelocity = clamp(horizontalVelocity + Math.sin(attitude) * currentThrust * dt, -18, 18);
      horizontalVelocity *= Math.exp(-.5 * dt);
      horizontalOffset = clamp(horizontalOffset + horizontalVelocity * dt, -50000, 50000);
    } else {
      const targetSpeed = Math.max(1.6, Math.min(55, Math.sqrt(2 * 4.5 * Math.max(currentAltitude, 0))));
      currentThrust = fuel > 0 ? clamp(1.62 + (Math.abs(velocity) - targetSpeed) * 4, 0, 8) : 0;
      attitude = lerp(attitude, 0, Math.min(1, .1 * dt));
      horizontalVelocity *= Math.exp(-.7 * dt);
      horizontalOffset = lerp(horizontalOffset, 0, Math.min(1, .35 * dt));
    }
    if (fuel <= 0) currentThrust = 0;
    velocity += (currentThrust * Math.cos(attitude) - 1.62) * dt;
    currentAltitude += velocity * dt;
    fuel = Math.max(0, fuel - currentThrust * .008 * dt);
  }

  updateHud();
  byId("status").textContent = currentAltitude > 50000
    ? "ORBITAL APPROACH"
    : currentAltitude > 5000
      ? "DEORBIT BURN"
      : currentAltitude > 250
        ? "POWERED DESCENT"
        : "FINAL APPROACH";

  if (currentAltitude <= 0) {
    running = false;
    destinationSelect.disabled = false;
    clearControls();
    const padOffset = Math.abs(horizontalOffset);
    const landed = Math.abs(velocity) <= 6 && currentSite.slope <= 12 && fuel > 1 && padOffset <= 250;
    byId("status").textContent = landed ? "TOUCHDOWN" : "LANDING FAILED";
    byId("simresult").textContent = landed
      ? `${currentSite.name}: soft landing ${padOffset.toFixed(0)} m from the target at ${velocity.toFixed(1)} m/s.`
      : `${currentSite.name}: touchdown outside limits · ${velocity.toFixed(1)} m/s · ${padOffset.toFixed(0)} m off target · ${Math.round(fuel)}% fuel.`;
    draw();
    return;
  }
  if (elapsed > 3600) {
    running = false;
    destinationSelect.disabled = false;
    clearControls();
    byId("status").textContent = "DESCENT TIMEOUT";
    byId("simresult").textContent = "Descent timed out before touchdown. Increase the time rate or adjust throttle and starting conditions.";
    return;
  }
  draw();
  requestAnimationFrame(step);
}

function setControl(control, pressed) {
  const guidance = byId("guidance").value;
  if (guidance !== "Manual" &&
      !(guidance === "Easy Pilot" && ["left", "right"].includes(control))) return;
  if (pressed) heldControls.add(control);
  else heldControls.delete(control);
  pilotButtons.forEach(button => button.classList.toggle("active", heldControls.has(button.dataset.control)));
}

pilotButtons.forEach(button => {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setControl(button.dataset.control, true);
  });
  button.addEventListener("pointerup", () => setControl(button.dataset.control, false));
  button.addEventListener("pointercancel", () => setControl(button.dataset.control, false));
  button.addEventListener("lostpointercapture", () => setControl(button.dataset.control, false));
});

window.addEventListener("keydown", event => {
  const guidance = byId("guidance").value;
  if (!running || (guidance !== "Manual" && guidance !== "Easy Pilot")) return;
  if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
  if (/^[1-9]$/.test(event.key)) {
    const throttlePercent = Number(event.key) / 9 * 100;
    byId("throttle").value = String(throttlePercent);
    byId("throttleValue").textContent = `${Math.round(throttlePercent)}%`;
    event.preventDefault();
    return;
  }
  const control = controlKeys.get(event.key.toLowerCase());
  if (!control) return;
  event.preventDefault();
  setControl(control, true);
});
window.addEventListener("keyup", event => {
  const control = controlKeys.get(event.key.toLowerCase());
  if (control) setControl(control, false);
});
window.addEventListener("blur", clearControls);

destinationSelect.addEventListener("change", () => setSite(destinationSelect.selectedIndex));
byId("guidance").addEventListener("change", updateGuidanceControls);
byId("throttle").addEventListener("input", () => {
  byId("throttleValue").textContent = `${byId("throttle").value}%`;
});
byId("run").addEventListener("click", startDescent);
byId("startSim").addEventListener("click", () => {
  const altitude = Number(byId("alt").value);
  if (Number.isFinite(altitude) && altitude > 0 && altitude <= 100000) currentAltitude = altitude;
  descentStartAltitude = currentAltitude;
  elapsed = 0;
  velocity = Number(byId("vel").value);
  fuel = Number(byId("fuel").value);
  updateHud();
  draw();
});

canvas.addEventListener("pointerdown", event => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const centerX = width - 63;
  const centerY = 76;
  let nearest = -1;
  let distance = 12;
  SITES.forEach((site, index) => {
    const markerX = centerX + site.x * 43 * .72;
    const markerY = centerY + site.y * 43 * .72;
    const candidate = Math.hypot(x - markerX, y - markerY);
    if (candidate < distance) {
      nearest = index;
      distance = candidate;
    }
  });
  if (nearest >= 0 && !running) setSite(nearest);
});

new ResizeObserver(resize).observe(mount);
window.addEventListener("resize", resize);
updateGuidanceControls();
setSite(0);
updateHud();
resize();
requestAnimationFrame(function drawFrame() {
  if (!running) draw();
  requestAnimationFrame(drawFrame);
});
