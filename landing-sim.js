import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const mount = document.getElementById("landingScene");
if (!mount) throw new Error("Landing simulation view is missing.");

const byId = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (() => {
  let seed = 724196;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
})();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (error) {
  mount.textContent = "3D landing simulation unavailable: WebGL could not be initialized.";
  mount.setAttribute("role", "alert");
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x050a11, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050a11);
scene.fog = new THREE.Fog(0x050a11, 55, 145);
const camera = new THREE.PerspectiveCamera(42, 1, .1, 160);
camera.position.set(13, 30, 42);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 9, 0);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.minDistance = 9;
controls.maxDistance = 65;
controls.maxPolarAngle = Math.PI * .48;
controls.update();

scene.add(new THREE.HemisphereLight(0xb9d3e8, 0x39332d, 1.25));
const sun = new THREE.DirectionalLight(0xffedcf, 3.2);
sun.position.set(-16, 25, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.bias = -.00035;
scene.add(sun);
scene.add(sun.target);

const starsGeometry = new THREE.BufferGeometry();
const starPositions = [];
for (let i = 0; i < 450; i++) {
  const radius = 65 + rand() * 30;
  const angle = rand() * Math.PI * 2;
  const height = 8 + rand() * 46;
  starPositions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
}
starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({ color: 0xc3d7e8, size: .17, transparent: true, opacity: .8 })
));

const craters = Array.from({ length: 29 }, (_, index) => {
  let x = (rand() - .5) * 54;
  let z = (rand() - .5) * 54;
  if (Math.hypot(x, z) < 8) x += x < 0 ? -10 : 10;
  return {
    x,
    z,
    radius: index < 7 ? 2.8 + rand() * 3.2 : .5 + rand() * 2,
    depth: .25 + rand() * .68,
    rim: .18 + rand() * .34,
    peak: index < 4 ? .12 + rand() * .18 : 0,
  };
});

function groundHeight(x, z) {
  let height = .2 * Math.sin(x * .24 + z * .15) + .13 * Math.cos(z * .31 - x * .2) +
    .055 * Math.sin(x * 1.7 + z * 1.2) * Math.cos(z * 1.35 - x * .8);
  for (const crater of craters) {
    const distance = Math.hypot(x - crater.x, z - crater.z);
    height -= crater.depth * Math.exp(-Math.pow(distance / (crater.radius * .7), 2));
    height += crater.rim * Math.exp(-Math.pow((distance - crater.radius * .91) / (crater.radius * .13), 2));
    height += crater.peak * Math.exp(-Math.pow(distance / (crater.radius * .19), 2));
    height += .075 * Math.exp(-Math.pow((distance - crater.radius * 1.35) / (crater.radius * .52), 2));
  }
  return height;
}

const grid = 144;
const extent = 68;
const vertices = [];
const colors = [];
const indices = [];
const groundColor = new THREE.Color();
for (let row = 0; row <= grid; row++) {
  const z = (row / grid - .5) * extent;
  for (let col = 0; col <= grid; col++) {
    const x = (col / grid - .5) * extent;
    const y = groundHeight(x, z);
    vertices.push(x, y, z);
    const shade = clamp(.48 + y * .11 + .045 * Math.sin(x * .9 + z * .7), .34, .68);
    groundColor.setRGB(shade, shade * .99, shade * .96);
    colors.push(groundColor.r, groundColor.g, groundColor.b);
    if (row < grid && col < grid) {
      const current = row * (grid + 1) + col;
      indices.push(current, current + grid + 1, current + 1, current + 1, current + grid + 1, current + grid + 2);
    }
  }
}
const groundGeometry = new THREE.BufferGeometry();
groundGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
groundGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
groundGeometry.setIndex(indices);
groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(
  groundGeometry,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
);
ground.receiveShadow = true;
scene.add(ground);

for (const crater of craters) {
  const y = groundHeight(crater.x + crater.radius * .91, crater.z) + .025;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(crater.radius * .91, Math.max(.035, crater.rim * .18), 6, 48),
    new THREE.MeshStandardMaterial({ color: 0x8c8981, roughness: 1 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(crater.x, y, crater.z);
  rim.castShadow = true;
  rim.receiveShadow = true;
  scene.add(rim);
}

for (let i = 0; i < 115; i++) {
  const x = (rand() - .5) * 58;
  const z = (rand() - .5) * 58;
  if (Math.hypot(x, z) < 3.5) continue;
  const size = .12 + rand() * .38;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size, 0),
    new THREE.MeshStandardMaterial({ color: 0x77746f, roughness: 1 })
  );
  rock.position.set(x, groundHeight(x, z) + size * .5, z);
  rock.rotation.set(rand() * 2, rand() * 3, rand() * 2);
  rock.scale.y = .55 + rand() * .8;
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

const landingSite = new THREE.Group();
landingSite.position.y = groundHeight(0, 0) + .035;
scene.add(landingSite);
const landingPad = new THREE.Mesh(
  new THREE.CylinderGeometry(2.15, 2.15, .06, 64),
  new THREE.MeshStandardMaterial({ color: 0x354956, roughness: .8, metalness: .25 })
);
landingPad.position.y = .04;
landingPad.receiveShadow = true;
landingSite.add(landingPad);
const padRing = new THREE.Mesh(
  new THREE.TorusGeometry(2.15, .045, 8, 64),
  new THREE.MeshBasicMaterial({ color: 0x59d9ff })
);
padRing.rotation.x = Math.PI / 2;
padRing.position.y = .08;
landingSite.add(padRing);
for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(.09, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x72f5a5 })
  );
  beacon.position.set(x, .18, z);
  landingSite.add(beacon);
}

function material(color, metalness = .2) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness: .55 });
}

function cylinderBetween(parent, start, end, radius, color) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const difference = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * .72, radius, difference.length(), 8),
    material(color)
  );
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), difference.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

const lander = new THREE.Group();
scene.add(lander);
const body = new THREE.Mesh(
  new THREE.CylinderGeometry(.56, .78, .82, 6),
  material(0xd8e2e8, .38)
);
body.position.y = .48;
body.castShadow = true;
lander.add(body);
const cabin = new THREE.Mesh(
  new THREE.CylinderGeometry(.32, .48, .46, 6),
  material(0x8ea6b6, .48)
);
cabin.position.y = 1.12;
cabin.castShadow = true;
lander.add(cabin);
const cockpit = new THREE.Mesh(
  new THREE.SphereGeometry(.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * .55),
  new THREE.MeshStandardMaterial({ color: 0x55badd, metalness: .65, roughness: .2, emissive: 0x071723 })
);
cockpit.position.y = 1.31;
lander.add(cockpit);
const deck = new THREE.Mesh(new THREE.CylinderGeometry(.83, .67, .12, 8), material(0xc0ccd3, .45));
deck.position.y = .03;
lander.add(deck);

for (let i = 0; i < 4; i++) {
  const angle = Math.PI / 4 + i * Math.PI / 2;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const hip = [dx * .47, .12, dz * .47];
  const knee = [dx * .83, -.46, dz * .83];
  const foot = [dx * 1.2, -.92, dz * 1.2];
  cylinderBetween(lander, hip, knee, .065, 0xc9d2d7);
  cylinderBetween(lander, knee, foot, .045, 0xaab8c0);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(.2, .24, .08, 12), material(0x9caab1));
  pad.position.set(...foot);
  pad.castShadow = true;
  lander.add(pad);
}

for (let side = -1; side <= 1; side += 2) {
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.05, .09, .08), material(0xa6c0cd, .55));
  boom.position.set(side * 1.14, .26, 0);
  boom.castShadow = true;
  lander.add(boom);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, .055, .92),
    new THREE.MeshStandardMaterial({ color: 0x174d70, metalness: .58, roughness: .32, emissive: 0x061625 })
  );
  panel.position.set(side * 1.72, .24, 0);
  panel.castShadow = true;
  lander.add(panel);
  for (let line = -2; line <= 2; line++) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(.012, .008, .86), material(0x55a8ce, .7));
    cell.position.set(side * 1.72, .273, line * .17);
    lander.add(cell);
  }
}

const engine = new THREE.Mesh(
  new THREE.CylinderGeometry(.18, .27, .38, 12),
  material(0x7d8990, .6)
);
engine.position.y = -.48;
lander.add(engine);
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(.29, 1.65, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffaa49, transparent: true, opacity: .76, side: THREE.DoubleSide })
);
flame.rotation.x = Math.PI;
flame.position.y = -1.42;
flame.visible = false;
lander.add(flame);
const flameCore = new THREE.Mesh(
  new THREE.ConeGeometry(.14, 1.2, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xb9eeff, transparent: true, opacity: .9, side: THREE.DoubleSide })
);
flameCore.rotation.x = Math.PI;
flameCore.position.y = -1.34;
flameCore.visible = false;
lander.add(flameCore);

function altitudeToWorld(altitude) {
  return .95 + Math.log1p(altitude) / Math.log1p(100000) * 24;
}

function render() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(mount);
window.addEventListener("resize", resize);
resize();
render();

let running = false;
let currentAltitude = 100000;
let currentAngle = 0;
let currentX = 0;
let currentZ = 0;
let velocityX = 0;
let velocityZ = 0;
const heldControls = new Set();
const pilotButtons = [...document.querySelectorAll(".pilot-pad [data-control]")];
const controlKeys = new Map([
  ["arrowup", "forward"], ["w", "forward"],
  ["arrowdown", "back"], ["s", "back"],
  ["arrowleft", "left"], ["a", "left"],
  ["arrowright", "right"], ["d", "right"],
]);

function setLanderAltitude(altitude) {
  const padY = landingSite.position.y;
  lander.position.set(currentX, padY + altitudeToWorld(Math.max(0, altitude)), currentZ);
  lander.rotation.z = currentAngle;
}

function siteLatitude() {
  const coordinate = byId("location").textContent.match(/([\d.]+)°\s*([NS])/i);
  if (!coordinate) return -85;
  return Number(coordinate[1]) * (coordinate[2].toUpperCase() === "S" ? -1 : 1);
}

function updateEnvironmentTelemetry(elapsed) {
  const illumination = Number(byId("illum").textContent.match(/[\d.]+/)?.[0]);
  const baseSolar = Number.isFinite(illumination) ? illumination : 70;
  const latitude = siteLatitude();
  const slopeValue = Number(byId("slope").textContent.match(/[\d.]+/)?.[0]);
  const slope = Number.isFinite(slopeValue) ? slopeValue : 6;
  const solarCycle = elapsed / (29.5 * 86400) * Math.PI * 2;
  const solar = clamp(Math.round(baseSolar + Math.sin(solarCycle) * 12), 0, 100);
  sun.position.set(-Math.cos(solarCycle) * 28, 4 + solar / 100 * 5, Math.sin(solarCycle) * 28);
  sun.intensity = .35 + solar / 100 * 2.85;
  const earthElevation = 90 - Math.abs(latitude) + 6.7 * Math.sin(elapsed / (27.3 * 86400) * Math.PI * 2);
  const hasLineOfSight = earthElevation > Math.max(0, slope * .2);
  const comms = hasLineOfSight
    ? clamp(Math.round(earthElevation / 25 * 100 * (1 - slope / 70)), 0, 100)
    : 0;
  byId("tSolar").textContent = `${solar}%`;
  byId("tComms").textContent = `${comms}%`;
}

function updateLanderStatus(altitude, velocity, fuel, elapsed, slope) {
  byId("clock").textContent = `00:${elapsed.toFixed(1).padStart(4, "0")}`;
  byId("tAlt").textContent = `${Math.max(0, Math.round(altitude))} m`;
  byId("tVel").textContent = `${velocity.toFixed(1)} m/s`;
  byId("tFuel").textContent = `${Math.round(fuel)}%`;
  byId("tSlope").textContent = `${slope.toFixed(1)}°`;
  byId("tOffset").textContent = `${Math.hypot(currentX, currentZ).toFixed(1)} m`;
  updateEnvironmentTelemetry(elapsed);
}

function updateGuidanceControls() {
  const manual = byId("guidance").value === "Manual";
  byId("pilotHint").textContent = manual
    ? "MANUAL · WASD / ARROWS OR D-PAD TO STEER · THROTTLE CONTROLS DESCENT"
    : "ASSISTED LANDING ENABLED · SELECT MANUAL TO PILOT";
  byId("pilotControls").classList.toggle("manual-active", manual);
  byId("throttle").disabled = !manual;
  pilotButtons.forEach(button => { button.disabled = !manual; });
  if (!manual) clearControls();
}

function clearControls() {
  heldControls.clear();
  pilotButtons.forEach(button => button.classList.remove("active"));
}

function startDescent() {
  if (running) return;
  const altitude = Number(byId("alt").value);
  const initialVelocity = Number(byId("vel").value);
  const initialFuel = Number(byId("fuel").value);
  const angle = Number(byId("angle").value);
  if (!Number.isFinite(altitude) || altitude <= 0 || altitude > 100000 ||
      !Number.isFinite(initialVelocity) || initialVelocity >= 0 ||
      !Number.isFinite(initialFuel) || initialFuel < 0 || initialFuel > 100 ||
      !Number.isFinite(angle) || angle < 0 || angle > 45 ||
      !Number.isFinite(Number(byId("timeRate").value))) {
    byId("simresult").textContent = "Check configuration: altitude must be 1–100,000 m, vertical speed must be descending, fuel must be 0–100%, and approach angle must be 0–45°.";
    return;
  }

  running = true;
  currentAltitude = altitude;
  currentX = 0;
  currentZ = 0;
  velocityX = 0;
  velocityZ = 0;
  let velocity = initialVelocity;
  let fuel = initialFuel;
  let elapsed = 0;
  currentAngle = angle * Math.PI / 180;
  const slopeMatch = byId("slope").textContent.match(/[\d.]+/);
  const slope = slopeMatch ? Number(slopeMatch[0]) : 6;
  let previousTime = performance.now();
  clearControls();
  setLanderAltitude(currentAltitude);
  byId("status").textContent = "DESCENDING";
  byId("simresult").textContent = byId("guidance").value === "Manual"
    ? "Manual descent initiated. Adjust throttle and steer toward the illuminated landing pad."
    : "Assisted high-altitude descent initiated. The guidance computer is targeting the landing pad.";
  updateLanderStatus(currentAltitude, velocity, fuel, elapsed, slope);

  function step(now) {
    if (!running) return;
    const realSeconds = Math.min(Math.max(0, (now - previousTime) / 1000), .1);
    previousTime = now;
    let remainingSimSeconds = realSeconds * Number(byId("timeRate").value);
    let thrust = 0;
    let frameScale = 0;

    while (remainingSimSeconds > 0 && currentAltitude > 0) {
      const dt = Math.min(.2, remainingSimSeconds);
      remainingSimSeconds -= dt;
      elapsed += dt;
      frameScale += dt;
      const manual = byId("guidance").value === "Manual";
      if (manual) {
        thrust = Number(byId("throttle").value) / 100 * 8;
        const xInput = Number(heldControls.has("right")) - Number(heldControls.has("left"));
        const zInput = Number(heldControls.has("back")) - Number(heldControls.has("forward"));
        velocityX = clamp((velocityX + xInput * 1.2 * dt) * Math.exp(-.32 * dt), -4, 4);
        velocityZ = clamp((velocityZ + zInput * 1.2 * dt) * Math.exp(-.32 * dt), -4, 4);
        currentX = clamp(currentX + velocityX * dt, -16, 16);
        currentZ = clamp(currentZ + velocityZ * dt, -16, 16);
        currentAngle = lerpAngle(currentAngle, xInput * .15 + (Number(heldControls.has("forward")) - Number(heldControls.has("back"))) * .1, .2 * dt);
      } else {
        const desiredSpeed = Math.max(1.6, Math.min(55, Math.sqrt(2 * 4.5 * Math.max(currentAltitude, 0))));
        thrust = fuel > 0 ? clamp(1.62 + (Math.abs(velocity) - desiredSpeed) * 4, 0, 8) : 0;
        currentAngle = lerpAngle(currentAngle, 0, .1 * dt);
        velocityX *= Math.exp(-.7 * dt);
        velocityZ *= Math.exp(-.7 * dt);
        currentX = lerpAngle(currentX, 0, .35 * dt);
        currentZ = lerpAngle(currentZ, 0, .35 * dt);
      }
      if (fuel <= 0) thrust = 0;
      velocity += (thrust - 1.62) * dt;
      currentAltitude += velocity * dt;
      fuel = Math.max(0, fuel - thrust * .008 * dt);
    }

    currentAngle = lerpAngle(currentAngle, 0, clamp(.025 * frameScale, 0, 1));
    setLanderAltitude(Math.max(0, currentAltitude));
    flame.visible = thrust > 1.75;
    flameCore.visible = thrust > 1.75;
    const flameScale = .55 + Math.min(1, thrust / 8) * .75 + rand() * .12;
    flame.scale.setScalar(flameScale);
    flameCore.scale.setScalar(flameScale * .82);

    byId("status").textContent = "DESCENDING";
    updateLanderStatus(currentAltitude, velocity, fuel, elapsed, slope);
    if (currentAltitude <= 0) {
      running = false;
      flame.visible = false;
      flameCore.visible = false;
      const padOffset = Math.hypot(currentX, currentZ);
      const landed = Math.abs(velocity) <= 6 && slope <= 12 && fuel > 1 && padOffset <= 3.2;
      byId("status").textContent = landed ? "SUCCESS" : "FAILED";
      byId("simresult").textContent = landed
        ? `Soft landing achieved ${padOffset.toFixed(1)} m from the pad. Vertical speed ${velocity.toFixed(1)} m/s; slope ${slope.toFixed(1)}°; fuel ${Math.round(fuel)}%.`
        : `Landing outside limits. Offset ${padOffset.toFixed(1)} m; vertical speed ${velocity.toFixed(1)} m/s; slope ${slope.toFixed(1)}°; fuel ${Math.round(fuel)}%.`;
      return;
    }
    if (elapsed > 3600) {
      running = false;
      flame.visible = false;
      flameCore.visible = false;
      byId("status").textContent = "TIMEOUT";
      byId("simresult").textContent = "Descent timed out before touchdown. Increase the time rate or adjust the starting velocity, throttle, or fuel.";
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function lerpAngle(current, target, amount) {
  return current + (target - current) * amount;
}

function pressControl(control, pressed) {
  if (byId("guidance").value !== "Manual") return;
  if (pressed) heldControls.add(control);
  else heldControls.delete(control);
  pilotButtons.forEach(button => button.classList.toggle("active", heldControls.has(button.dataset.control)));
}

pilotButtons.forEach(button => {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pressControl(button.dataset.control, true);
  });
  button.addEventListener("pointerup", () => pressControl(button.dataset.control, false));
  button.addEventListener("pointercancel", () => pressControl(button.dataset.control, false));
  button.addEventListener("lostpointercapture", () => pressControl(button.dataset.control, false));
});

window.addEventListener("keydown", event => {
  if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
  const control = controlKeys.get(event.key.toLowerCase());
  if (!control || byId("guidance").value !== "Manual") return;
  event.preventDefault();
  pressControl(control, true);
});
window.addEventListener("keyup", event => {
  const control = controlKeys.get(event.key.toLowerCase());
  if (control) pressControl(control, false);
});
window.addEventListener("blur", clearControls);
byId("guidance").addEventListener("change", updateGuidanceControls);
byId("throttle").addEventListener("input", () => {
  byId("throttleValue").textContent = `${byId("throttle").value}%`;
});

byId("run").addEventListener("click", startDescent);
byId("startSim").addEventListener("click", () => {
  const altitude = Number(byId("alt").value);
  if (Number.isFinite(altitude) && altitude > 0) currentAltitude = altitude;
  currentX = 0;
  currentZ = 0;
  currentAngle = 0;
  setLanderAltitude(currentAltitude);
});
updateGuidanceControls();
updateEnvironmentTelemetry(0);
setLanderAltitude(currentAltitude);
