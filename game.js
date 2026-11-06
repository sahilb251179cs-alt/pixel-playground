// THEME: Replace these colors and nouns after the theme roulette.
const THEME = {
  background: "#0b1426", grid: "#1b2a43", player: "#70edcf",
  collectible: "#ffdc76", hazard: "#ff778e", collectiblePlural: "sparks"
};

// RULES: Speeds are in Canvas pixels per second.
const RULES = {
  playerSpeed: 270, hazardSpeed: 115, speedPerLevel: 22,
  maxHazardSpeed: 235, pointsPerLevel: 5, maxHazards: 8
};

const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d");
const { width, height } = canvas;
const overlay = document.querySelector("#overlay");
const action = document.querySelector("#action");
const scoreLabel = document.querySelector("#score");
const levelLabel = document.querySelector("#level");
const bestLabel = document.querySelector("#best");
const panelDetail = document.querySelector("#panel-detail");
const panelTitle = document.querySelector("#panel-title");
const status = document.querySelector("#status");
const controls = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"];
const keys = new Set();
const touches = new Map();
const storageKey = "pixel-playground-best";

let state = "ready";
let player, collectible, hazards, score, level;
let best = 0;
let lastTime;

try {
  best = Number(localStorage.getItem(storageKey)) || 0;
} catch {
  // The best score still works for this page if storage is disabled.
}

function resetRound() {
  player = { x: width / 2, y: height / 2, size: 26 };
  hazards = [];
  collectible = undefined;
  score = 0;
  level = 1;
  addHazard();
  addHazard();
  placeCollectible();
  updateHud();
}

function updateHud() {
  scoreLabel.textContent = score;
  levelLabel.textContent = level;
  bestLabel.textContent = best;
}

function startRound() {
  clearInput();
  resetRound();
  state = "playing";
  lastTime = undefined;
  overlay.hidden = true;
  canvas.focus();
}

function endRound() {
  state = "over";
  clearInput();
  status.textContent = "RUN COMPLETE";
  panelTitle.textContent = "Drone collision!";
  panelDetail.textContent = `Score ${score} · Level ${level} · Best ${best}`;
  action.textContent = "Play again";
  overlay.hidden = false;
  action.focus();
}

// All positions describe the center of an object.
function overlaps(a, b, gap = 0) {
  const reach = (a.size + b.size) / 2 + gap;
  return Math.abs(a.x - b.x) < reach && Math.abs(a.y - b.y) < reach;
}

function openSpot(size, blockers, gap) {
  // Scan a grid so placement always finishes, even when the arena gets busy.
  const spots = [];
  for (let y = 24; y <= height - 24; y += 28) {
    for (let x = 24; x <= width - 24; x += 28) {
      const spot = { x, y, size };
      if (blockers.every(blocker => !overlaps(spot, blocker, gap))) spots.push(spot);
    }
  }
  return spots[Math.floor(Math.random() * spots.length)];
}

function addHazard() {
  const blockers = collectible ? [player, collectible, ...hazards] : [player, ...hazards];
  const spot = openSpot(28, blockers, 50) ?? openSpot(28, blockers, 0);
  if (!spot) return;
  const angle = Math.random() * Math.PI * 2;
  hazards.push({ ...spot, dx: Math.cos(angle), dy: Math.sin(angle) });
}

function placeCollectible() {
  const blockers = [player, ...hazards];
  collectible = openSpot(22, blockers, 20) ?? openSpot(22, blockers);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function movePlayer(dt) {
  const held = key => keys.has(key) || [...touches.values()].includes(key);
  const dx = Number(held("arrowright") || held("d")) - Number(held("arrowleft") || held("a"));
  const dy = Number(held("arrowdown") || held("s")) - Number(held("arrowup") || held("w"));
  // Normalize so moving diagonally is just as fast.
  const distance = RULES.playerSpeed * dt / (Math.hypot(dx, dy) || 1);
  const edge = player.size / 2;
  player.x = clamp(player.x + dx * distance, edge, width - edge);
  player.y = clamp(player.y + dy * distance, edge, height - edge);
}

function moveHazards(dt) {
  const speed = Math.min(RULES.maxHazardSpeed, RULES.hazardSpeed + (level - 1) * RULES.speedPerLevel);
  for (const hazard of hazards) {
    const edge = hazard.size / 2;
    hazard.x += hazard.dx * speed * dt;
    hazard.y += hazard.dy * speed * dt;
    if (hazard.x < edge || hazard.x > width - edge) hazard.dx *= -1;
    if (hazard.y < edge || hazard.y > height - edge) hazard.dy *= -1;
    hazard.x = clamp(hazard.x, edge, width - edge);
    hazard.y = clamp(hazard.y, edge, height - edge);
  }
}

function update(dt) {
  movePlayer(dt);
  moveHazards(dt);
  if (hazards.some(hazard => overlaps(player, hazard))) {
    endRound();
    return;
  }
  if (collectible && overlaps(player, collectible)) {
    score += 1;
    player.size += 1;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(storageKey, best);
      } catch {
        // Keep the in-memory score.
      }
    }
    if (score % RULES.pointsPerLevel === 0) {
      level += 1;
      if (hazards.length < RULES.maxHazards) addHazard();
    }
    placeCollectible();
    updateHud();
  }
}

function drawSquare(object, color) {
  ctx.fillStyle = color;
  const half = object.size / 2;
  ctx.fillRect(object.x - half, object.y - half, object.size, object.size);
}

function draw() {
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = THEME.grid;
  for (let x = 0; x < width; x += 24) ctx.fillRect(x, 0, 1, height);
  for (let y = 0; y < height; y += 24) ctx.fillRect(0, y, width, 1);

  if (collectible) {
    ctx.save();
    ctx.translate(collectible.x, collectible.y);
    ctx.rotate(Math.PI / 4);
    drawSquare({ x: 0, y: 0, size: collectible.size / Math.SQRT2 }, THEME.collectible);
    ctx.restore();
  }
  for (const hazard of hazards) {
    drawSquare(hazard, THEME.hazard);
    ctx.fillStyle = THEME.background;
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×", hazard.x, hazard.y + 1);
  }
  drawSquare(player, THEME.player);
  ctx.fillStyle = THEME.background;
  ctx.fillRect(player.x - 7, player.y - 4, 4, 5);
  ctx.fillRect(player.x + 3, player.y - 4, 4, 5);
}

function frame(time) {
  // Cap the step after interruptions to avoid jumping across the arena.
  const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;
  if (state === "playing" && !document.hidden) update(dt);
  draw();
  requestAnimationFrame(frame);
}

function clearInput() {
  keys.clear();
  touches.clear();
}

action.addEventListener("click", startRound);
window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (state !== "playing" || !controls.includes(key) ||
      event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  keys.add(key);
});
window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", clearInput);
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", event => {
    if (state !== "playing") return;
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, button.dataset.key);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, event => touches.delete(event.pointerId));
  }
}

panelDetail.textContent = `Grab ${RULES.pointsPerLevel} ${THEME.collectiblePlural} to reach the next level.`;
resetRound();
requestAnimationFrame(frame);
