import * as THREE from "three";

const DAY_SECONDS = 86400;
const LUNAR_DAY = 29.5;
const SIDEREAL_MONTH = 27.3;
const SITE_LIMB_ANGLE = 84 * Math.PI / 180;
const MAX_DAY = 60;
const orbitView = document.getElementById("orbitView");
const terrainCanvas = document.getElementById("terrainCanvas");
if (!orbitView || !terrainCanvas) throw new Error("Mission dashboard views are missing.");

const terrain = terrainCanvas.getContext("2d");
if (!terrain) throw new Error("Canvas 2D rendering is unavailable.");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x050c15, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
orbitView.prepend(renderer.domElement);
const orbitScene = new THREE.Scene();
const orbitCamera = new THREE.PerspectiveCamera(38, 1, .1, 100);
orbitCamera.position.set(0, 3.6, 12.5);
orbitCamera.lookAt(0, .3, 0);

orbitScene.add(new THREE.AmbientLight(0x9aafc4, 1.15));
const orbitSun = new THREE.DirectionalLight(0xffffff, 2.3);
orbitSun.position.set(-4, 5, 7);
orbitScene.add(orbitSun);

const earthPosition = new THREE.Vector3(-4.05, 0, 0);
const moonPosition = new THREE.Vector3(4.05, 0, 0);
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(.68, 40, 32),
  new THREE.MeshStandardMaterial({ color: 0x1675aa, emissive: 0x061d32, roughness: .82 })
);
earth.position.copy(earthPosition);
orbitScene.add(earth);
const moonGroup = new THREE.Group();
moonGroup.position.copy(moonPosition);
orbitScene.add(moonGroup);
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(.39, 36, 28),
  new THREE.MeshStandardMaterial({ color: 0xa5a9a8, roughness: 1, metalness: 0 })
);
moonGroup.add(moon);

const transferCurve = new THREE.CubicBezierCurve3(
  new THREE.Vector3(-3.48, .3, 0),
  new THREE.Vector3(-1.6, 2.8, 0),
  new THREE.Vector3(1.7, 2.55, 0),
  new THREE.Vector3(3.68, -.04, 0)
);
const transferGeometry = new THREE.BufferGeometry().setFromPoints(transferCurve.getPoints(120));
transferGeometry.setDrawRange(0, 0);
orbitScene.add(new THREE.Line(transferGeometry, new THREE.LineBasicMaterial({ color: 0x59d9ff, transparent: true, opacity: .9 })));

const spacecraft = new THREE.Mesh(
  new THREE.OctahedronGeometry(.095, 0),
  new THREE.MeshBasicMaterial({ color: 0xcaf5ff })
);
orbitScene.add(spacecraft);

const roverMarker = new THREE.Mesh(
  new THREE.SphereGeometry(.045, 12, 10),
  new THREE.MeshBasicMaterial({ color: 0x72f5a5 })
);
moonGroup.add(roverMarker);
const linkGeometry = new THREE.BufferGeometry();
const linkMaterial = new THREE.LineDashedMaterial({ color: 0x72f5a5, dashSize: .12, gapSize: .08 });
const earthLink = new THREE.Line(linkGeometry, linkMaterial);
orbitScene.add(earthLink);

const starRandom = seededRandom(2026);
const starPositions = [];
for (let i = 0; i < 430; i++) {
  const radius = 15 + starRandom() * 15;
  const azimuth = starRandom() * Math.PI * 2;
  const z = starRandom() * 2 - 1;
  const horizontal = Math.sqrt(1 - z * z);
  starPositions.push(radius * horizontal * Math.cos(azimuth), radius * z, radius * horizontal * Math.sin(azimuth));
}
const stars = new THREE.BufferGeometry();
stars.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
orbitScene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x9db5c9, size: .045, transparent: true, opacity: .8 })));

function resizeOrbit() {
  const width = orbitView.clientWidth;
  const height = orbitView.clientHeight;
  if (!width || !height) return false;
  renderer.setSize(width, height, false);
  orbitCamera.aspect = width / height;
  orbitCamera.updateProjectionMatrix();
  return true;
}

const byId = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const routeSites = [
  { name: "Peak near Cabeus B", x: .542, y: .439 },
  { name: "Haworth", x: .353, y: .574 },
  { name: "Malapert Massif", x: .668, y: .486 },
  { name: "Mons Mouton Plateau", x: .444, y: .349 },
  { name: "Mons Mouton", x: .483, y: .475 },
  { name: "Nobile Rim 1", x: .595, y: .664 },
  { name: "Nobile Rim 2", x: .724, y: .574 },
  { name: "de Gerlache Rim 2", x: .269, y: .448 },
  { name: "Slater Plain", x: .518, y: .759 },
];
let missionDay = 0;
let battery = 88;
let playing = false;
let previousFrame = 0;
let lastTerrainDraw = 0;
function resizeCanvas(canvas, context) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return true;
}

function drawOrbit(day) {
  const transferProgress = clamp(day / 6, 0, 1);
  const visiblePoints = Math.max(2, Math.ceil(120 * transferProgress));
  transferGeometry.setDrawRange(0, visiblePoints);
  spacecraft.position.copy(transferCurve.getPoint(transferProgress));

  const libration = Math.sin((day / SIDEREAL_MONTH) * Math.PI * 2) * 8 * Math.PI / 180;
  const siteDirection = new THREE.Vector3(-Math.cos(SITE_LIMB_ANGLE), 0, Math.sin(SITE_LIMB_ANGLE));
  const worldSiteDirection = siteDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), libration);
  moonGroup.rotation.y = libration;
  roverMarker.position.copy(siteDirection).multiplyScalar(.415);
  const hasLineOfSight = worldSiteDirection.x < -.03;
  linkMaterial.color.set(hasLineOfSight ? 0x72f5a5 : 0xff6675);
  earthLink.geometry.setFromPoints([
    new THREE.Vector3(-3.37, 0, 0),
    moonPosition.clone().add(worldSiteDirection.multiplyScalar(.415)),
  ]);
  earthLink.computeLineDistances();
  renderer.render(orbitScene, orbitCamera);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const random = seededRandom(20240660);
const craters = Array.from({ length: 17 }, (_, i) => ({
  x: .08 + random() * .84,
  y: .12 + random() * .76,
  radius: .025 + random() * (i < 5 ? .105 : .065),
  depth: .018 + random() * .045,
  rim: .012 + random() * .023,
}));

function elevationAt(x, y) {
  let elevation = .012 * Math.sin(x * 29 + y * 17) + .008 * Math.cos(x * 47 - y * 13);
  for (const crater of craters) {
    const distance = Math.hypot((x - crater.x) * .92, y - crater.y);
    const radius = crater.radius;
    const bowl = Math.exp(-Math.pow(distance / (radius * .72), 2));
    const rim = Math.exp(-Math.pow((distance - radius * .9) / (radius * .16), 2));
    const ejecta = Math.exp(-Math.pow(distance / (radius * 1.8), 2));
    elevation += -crater.depth * bowl + crater.rim * rim + .004 * ejecta;
  }
  return elevation;
}

function drawTerrain(day) {
  const width = terrainCanvas.clientWidth;
  const height = terrainCanvas.clientHeight;
  if (!width || !height) return;
  terrain.clearRect(0, 0, width, height);
  const sky = terrain.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#07111c");
  sky.addColorStop(.49, "#0b1117");
  sky.addColorStop(.5, "#303237");
  sky.addColorStop(1, "#16191c");
  terrain.fillStyle = sky;
  terrain.fillRect(0, 0, width, height);

  for (let i = 0; i < 26; i++) {
    const x = (i * 83 + 17) % width;
    const y = (i * 47 + 13) % Math.max(1, height * .45);
    terrain.fillStyle = "rgba(186,211,228,.55)";
    terrain.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
  }

  const phase = (day / LUNAR_DAY) * Math.PI * 2 + .55;
  const lightFraction = Math.max(0, Math.sin(phase));
  const sunElevation = 80 * Math.sin(phase);
  const sunAzimuth = (day / LUNAR_DAY) * Math.PI * 2 + .72;
  const cols = 42;
  const rows = 27;
  const heights = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: cols + 1 }, (_, col) => elevationAt(col / cols, row / rows)));
  const vertices = heights.map((row, rowIndex) => row.map((elevation, colIndex) => ({
    x: width * (.055 + colIndex / cols * .89),
    y: height * (.2 + rowIndex / rows * .69) - elevation * height * 2.15,
    elevation,
  })));
  const sunX = Math.cos(sunAzimuth);
  const sunY = Math.sin(sunAzimuth);
  const sunHeight = Math.max(.03, Math.tan(Math.max(1, sunElevation) * Math.PI / 180));
  const step = Math.max(1, Math.round(Math.min(cols, rows) * .055));

  function isShadowed(col, row) {
    if (sunElevation < 0) return true;
    const base = heights[row][col];
    for (let distance = 1; distance <= 5; distance++) {
      const sampleCol = Math.round(col - sunX * step * distance);
      const sampleRow = Math.round(row - sunY * step * distance);
      if (sampleCol < 0 || sampleCol > cols || sampleRow < 0 || sampleRow > rows) break;
      const groundDistance = distance * step / cols;
      if (heights[sampleRow][sampleCol] - base > groundDistance * sunHeight) return true;
    }
    return false;
  }

  for (let row = rows - 1; row >= 0; row--) {
    for (let col = 0; col < cols; col++) {
      const v1 = vertices[row][col];
      const v2 = vertices[row][col + 1];
      const v3 = vertices[row + 1][col];
      const v4 = vertices[row + 1][col + 1];
      const elevation = (v1.elevation + v2.elevation + v3.elevation + v4.elevation) / 4;
      const shadow = isShadowed(col, row);
      const lit = lightFraction > 0 && !shadow;
      const base = clamp(Math.round(74 + elevation * 920), 39, 114);
      const shade = lit ? 1 : .47;
      const green = Math.round((base + 2) * shade);
      const red = Math.round((base + 9) * shade);
      const blue = Math.round((base + 14) * shade);
      terrain.fillStyle = `rgb(${red},${green},${blue})`;
      terrain.beginPath();
      terrain.moveTo(v1.x, v1.y);
      terrain.lineTo(v2.x, v2.y);
      terrain.lineTo(v4.x, v4.y);
      terrain.lineTo(v3.x, v3.y);
      terrain.closePath();
      terrain.fill();
      if (col % 3 === 0 && row % 3 === 0) {
        terrain.strokeStyle = `rgba(186,205,216,${lit ? .055 : .025})`;
        terrain.lineWidth = .55;
        terrain.stroke();
      }
    }
  }

  terrain.save();
  terrain.strokeStyle = "rgba(216,225,222,.2)";
  terrain.lineWidth = .7;
  for (const crater of craters) {
    const cx = width * (.055 + crater.x * .89);
    const cy = height * (.2 + crater.y * .69) - elevationAt(crater.x, crater.y) * height * 2.15;
    const rx = crater.radius * width * .89;
    const ry = crater.radius * height * .69;
    for (const scale of [.55, .77, 1.02]) {
      terrain.beginPath();
      terrain.ellipse(cx, cy, rx * scale, ry * scale, 0, 0, Math.PI * 2);
      terrain.stroke();
    }
  }
  terrain.restore();

  const startSite = routeSites[byId("routeStart").selectedIndex];
  const endSite = routeSites[byId("routeEnd").selectedIndex];
  const route = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    const curve = Math.sin(t * Math.PI) * .13;
    return {
      x: lerp(startSite.x, endSite.x, t) + curve * (endSite.y - startSite.y),
      y: lerp(startSite.y, endSite.y, t) - curve * (endSite.x - startSite.x),
    };
  });
  const project = point => ({
    x: width * (.055 + point.x * .89),
    y: height * (.2 + point.y * .69) - elevationAt(point.x, point.y) * height * 2.15,
  });
  const roverProgress = clamp((day - 7) / 53, 0, 1);
  const pathPosition = roverProgress * (route.length - 1);
  const pathIndex = Math.min(route.length - 2, Math.floor(pathPosition));
  const localProgress = pathPosition - pathIndex;
  const roverPoint = {
    x: lerp(route[pathIndex].x, route[pathIndex + 1].x, localProgress),
    y: lerp(route[pathIndex].y, route[pathIndex + 1].y, localProgress),
  };
  terrain.save();
  terrain.lineCap = "round";
  terrain.lineJoin = "round";
  const drawPath = points => {
    terrain.beginPath();
    points.forEach((point, index) => {
      const p = project(point);
      if (!index) terrain.moveTo(p.x, p.y); else terrain.lineTo(p.x, p.y);
    });
    terrain.stroke();
  };
  terrain.strokeStyle = "rgba(255,200,87,.2)";
  terrain.lineWidth = 6;
  drawPath(route);
  terrain.strokeStyle = "#ffc857";
  terrain.lineWidth = 1.5;
  terrain.setLineDash([5, 4]);
  drawPath(route);
  terrain.setLineDash([]);

  terrain.strokeStyle = "#fff0a8";
  terrain.lineWidth = 2;
  drawPath(route.slice(0, pathIndex + 1).concat(roverPoint));
  const rover = project(roverPoint);
  const next = project(route[Math.min(route.length - 1, pathIndex + 1)]);
  terrain.save();
  terrain.translate(rover.x, rover.y - 5);
  terrain.rotate(Math.atan2(next.y - rover.y, next.x - rover.x));
  terrain.shadowColor = "#ffc857";
  terrain.shadowBlur = 8;
  terrain.fillStyle = "#fff0a8";
  terrain.beginPath();
  terrain.moveTo(7, 0); terrain.lineTo(-5, -4); terrain.lineTo(-4, 4);
  terrain.closePath(); terrain.fill();
  terrain.restore();
  for (const [site, label] of [[startSite, "START"], [endSite, "DEST"]]) {
    const point = project(site);
    terrain.fillStyle = "#ffc857";
    terrain.beginPath(); terrain.arc(point.x, point.y, 3, 0, Math.PI * 2); terrain.fill();
    terrain.fillStyle = "#fff0a8";
    terrain.font = "700 8px ui-monospace, monospace";
    terrain.textAlign = point.x > width * .75 ? "right" : "left";
    terrain.fillText(`${label}: ${site.name}`, point.x + (point.x > width * .75 ? -6 : 6), point.y - 7);
  }
  terrain.restore();

  const sunXScreen = width * .83;
  const sunYScreen = height * .15;
  terrain.fillStyle = lightFraction > 0 ? "#fff0a8" : "#708195";
  terrain.beginPath(); terrain.arc(sunXScreen, sunYScreen, 7, 0, Math.PI * 2); terrain.fill();
  terrain.strokeStyle = lightFraction > 0 ? "rgba(255,240,168,.45)" : "rgba(160,178,198,.3)";
  terrain.lineWidth = 1;
  terrain.beginPath();
  terrain.moveTo(sunXScreen, sunYScreen);
  terrain.lineTo(sunXScreen + Math.cos(sunAzimuth) * 32, sunYScreen + Math.sin(sunAzimuth) * 32);
  terrain.stroke();

  const meanElevation = craters.reduce((sum, crater) => sum + elevationAt(crater.x, crater.y), 0) / craters.length;
  byId("terrainReadout").textContent = `ELEVATION ${Math.round(1850 + meanElevation * 7000)} m`;
  byId("sunReadout").textContent = `SUN ELEVATION ${sunElevation.toFixed(0)}°`;
}

function batteryAtDay(day) {
  const step = .25;
  let charge = 88;
  const solarEnabled = byId("solarChoice").value === "yes";
  for (let elapsed = 0; elapsed < day; elapsed += step) {
    const delta = Math.min(step, day - elapsed);
    const solar = solarEnabled ? Math.max(0, Math.sin(((elapsed + delta / 2) / LUNAR_DAY) * Math.PI * 2 + .55)) : 0;
    charge = clamp(charge + (solar * 8.5 - 2) * delta, 0, 100);
  }
  return charge;
}

function updateTelemetry(dayDelta = 0) {
  const solarAngle = (missionDay / LUNAR_DAY) * Math.PI * 2 + .55;
  const solarFraction = Math.max(0, Math.sin(solarAngle));
  const solarPower = Math.round(solarFraction * 100);
  const solarEnabled = byId("solarChoice").value === "yes";
  const libration = Math.sin((missionDay / SIDEREAL_MONTH) * Math.PI * 2) * 8 * Math.PI / 180;
  const earthElevation = Math.cos(SITE_LIMB_ANGLE + libration);
  const hasLineOfSight = earthElevation > .03;
  const comms = hasLineOfSight ? Math.round(88 + 10 * earthElevation) : 0;
  battery = clamp(battery + ((solarEnabled ? solarFraction * 8.5 : 0) - 2) * dayDelta, 0, 100);

  const totalSeconds = Math.floor(missionDay * DAY_SECONDS);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const missionNumber = Math.floor(missionDay);
  const localHours = ((missionDay / LUNAR_DAY) * 24) % 24;
  const localMinutes = Math.floor((localHours % 1) * 60);
  const batteryLabel = battery < 20 ? "LOW POWER RESERVE" : !solarEnabled ? "BATTERY ONLY · NO SOLAR" : solarFraction > .05 ? "SOLAR ARRAY " + (battery >= 99 ? "CHARGED" : "CHARGING") : "NIGHT SURVIVAL MODE";
  const roverProgress = clamp((missionDay - 7) / 53, 0, 1);
  const routeStart = routeSites[byId("routeStart").selectedIndex];
  const routeEnd = routeSites[byId("routeEnd").selectedIndex];

  byId("missionElapsed").textContent = `DAY ${String(missionNumber).padStart(3, "0")} · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  byId("solarPower").textContent = `${solarPower}%`;
  byId("solarBar").style.width = `${solarPower}%`;
  byId("solarCondition").textContent = !solarEnabled
    ? `NO SOLAR ARRAYS · LIGHT AVAILABLE ${solarPower}%`
    : solarPower > 0
      ? `DAYLIGHT · ${Math.max(0, 80 * Math.sin(solarAngle)).toFixed(0)}° SUN ELEVATION`
      : "LUNAR NIGHT · SHADOWED";
  byId("commsSignal").textContent = `${comms}%`;
  byId("commsBar").style.width = `${comms}%`;
  byId("commsCondition").textContent = hasLineOfSight ? "LINE OF SIGHT: CLEAR" : "LINE OF SIGHT: OCCULTED";
  byId("batteryLevel").textContent = `${Math.round(battery)}%`;
  byId("batteryBar").style.width = `${battery}%`;
  byId("batteryCondition").textContent = batteryLabel;
  byId("roverProgress").textContent = `${Math.round(roverProgress * 100)}%`;
  byId("roverProgressBar").style.width = `${roverProgress * 100}%`;
  byId("roverProgressCondition").textContent = missionDay < 7
    ? `TRAVERSE STARTS DAY 7 · ${routeStart.name} → ${routeEnd.name}`
    : `${routeStart.name} → ${routeEnd.name}`;
  byId("lunarLocalTime").textContent = `${String(Math.floor(localHours)).padStart(2, "0")}:${String(localMinutes).padStart(2, "0")} LST`;
  byId("losReadout").textContent = hasLineOfSight ? `LOS CLEAR · ${comms}% LINK` : "LOS OCCULTED";
  byId("missionPhase").textContent = missionDay === 0 ? "PRE-LAUNCH" :
    missionDay < 5 ? "EARTH–MOON TRANSIT" :
    missionDay < 7 ? "LUNAR ORBIT INSERTION" :
    missionDay < 10 ? "SURFACE CHECKOUT" :
    missionDay < 60 ? "ROVER TRAVERSE" : "MISSION COMPLETE";
  byId("missionTimeline").value = missionDay.toFixed(2);
  byId("scrubberDay").textContent = `DAY ${missionDay.toFixed(1)} / 60`;
  byId("missionPlay").innerHTML = playing ? "Ⅱ <span>PAUSE</span>" : "▶ <span>PLAY</span>";
  byId("missionPlay").setAttribute("aria-label", playing ? "Pause mission simulation" : "Play mission simulation");
  byId("routeStart").disabled = playing;
  byId("routeEnd").disabled = playing;
  byId("solarChoice").disabled = playing;
  drawOrbit(missionDay);
}

function render(timestamp = 0) {
  if (playing && previousFrame) {
    const elapsed = Math.min((timestamp - previousFrame) / 1000, .25);
    const dayDelta = elapsed * Number(byId("timeWarp").value) / DAY_SECONDS;
    missionDay = Math.min(MAX_DAY, missionDay + dayDelta);
    if (missionDay >= MAX_DAY) playing = false;
    updateTelemetry(dayDelta);
  }
  previousFrame = timestamp;
  if (timestamp - lastTerrainDraw > 160) {
    drawTerrain(missionDay);
    lastTerrainDraw = timestamp;
  }
  requestAnimationFrame(render);
}

function setMissionDay(day) {
  missionDay = clamp(Number(day), 0, MAX_DAY);
  battery = batteryAtDay(missionDay);
  playing = false;
  previousFrame = 0;
  updateTelemetry();
  drawTerrain(missionDay);
  lastTerrainDraw = performance.now();
}

for (const id of ["routeStart", "routeEnd"]) {
  byId(id).addEventListener("change", () => {
    const sameSite = byId("routeStart").selectedIndex === byId("routeEnd").selectedIndex;
    byId("routeNotice").textContent = sameSite
      ? "Choose two different lunar sites for the rover route."
      : `ROVER ROUTE: ${routeSites[byId("routeStart").selectedIndex].name} → ${routeSites[byId("routeEnd").selectedIndex].name}`;
    drawTerrain(missionDay);
    updateTelemetry();
  });
}
byId("solarChoice").addEventListener("change", () => {
  battery = batteryAtDay(missionDay);
  updateTelemetry();
  drawTerrain(missionDay);
});
byId("missionPlay").addEventListener("click", () => {
  if (!playing && byId("routeStart").selectedIndex === byId("routeEnd").selectedIndex) {
    byId("routeNotice").textContent = "Choose two different lunar sites before starting the rover traverse.";
    return;
  }
  byId("routeNotice").textContent = `ROVER ROUTE: ${routeSites[byId("routeStart").selectedIndex].name} → ${routeSites[byId("routeEnd").selectedIndex].name}`;
  if (missionDay >= MAX_DAY) setMissionDay(0);
  playing = !playing;
  previousFrame = 0;
  updateTelemetry();
});
byId("missionReset").addEventListener("click", () => {
  battery = 88;
  setMissionDay(0);
});
byId("missionTimeline").addEventListener("input", event => setMissionDay(event.target.value));
window.addEventListener("resize", () => {
  if (resizeOrbit()) drawOrbit(missionDay);
  if (resizeCanvas(terrainCanvas, terrain)) drawTerrain(missionDay);
});

const observer = new ResizeObserver(() => {
  if (resizeOrbit()) drawOrbit(missionDay);
  if (resizeCanvas(terrainCanvas, terrain)) drawTerrain(missionDay);
});
observer.observe(orbitView);
observer.observe(terrainCanvas);
updateTelemetry();
requestAnimationFrame(render);
