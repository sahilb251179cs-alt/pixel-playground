"use strict";

// NO VACANCY — a large, asset-free hotel horror prototype.
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const W = canvas.width, H = canvas.height, FOV = Math.PI / 2.65;
const overlay = document.querySelector("#overlay"), hud = document.querySelector("#hud");
const startButton = document.querySelector("#start"), restartButton = document.querySelector("#restart");
const endCard = document.querySelector("#end-card"), titleCard = document.querySelector("#title-card");
const player = { x: 1.5, y: 1.5, angle: 0, crouching: false };
const camera = { x: player.x, y: player.y, angle: player.angle };
const keysDown = new Set(), touch = { forward: 0, side: 0, look: 0 };
const map = buildMap();
const items = [
  { id: "key-a", kind: "key", x: 4.5, y: 4.5 }, { id: "key-b", kind: "key", x: 16.5, y: 10.5 },
  { id: "key-c", kind: "key", x: 34.5, y: 22.5 }, { id: "key-d", kind: "key", x: 10.5, y: 34.5 },
  { id: "key-e", kind: "key", x: 39.5, y: 39.5 },
  { id: "file-1", kind: "file", x: 10.5, y: 4.5, title: "GUEST REGISTER — ROOM 108", text: "A family checked in at 11:48 PM. The clerk remembers four people. The register has five names, and one is written in a different hand." },
  { id: "file-2", kind: "file", x: 22.5, y: 10.5, title: "NIGHT CLERK'S LOG", text: "The service lift opened on its own at 12:03. It arrived full of wet luggage. No guest claimed it. The lift has been disconnected since 1987." },
  { id: "file-3", kind: "file", x: 28.5, y: 28.5, title: "ROOM 312 — HOUSEKEEPING NOTE", text: "Do not use the room number as the door code. The code is the date the Grand Arcadia first opened: 0312. I heard someone answer from inside the walls." },
  { id: "file-4", kind: "file", x: 4.5, y: 34.5, title: "UNCLAIMED BAGGAGE TAG", text: "The hotel was evacuated before the midnight fire. The guest list was sealed by the owners. On the back: 'If the lobby clock strikes thirteen, do not take the lift.'" },
  { id: "battery-1", kind: "battery", x: 16.5, y: 22.5 }, { id: "battery-2", kind: "battery", x: 34.5, y: 10.5 },
  { id: "battery-3", kind: "battery", x: 4.5, y: 22.5 },
  { id: "breaker", kind: "breaker", x: 39.5, y: 33.5 }
];
const exit = { x: 41.5, y: 41.5 };
const monster = { x: 41.5, y: 1.5, angle: Math.PI, state: "patrol", path: [], repath: 0, search: 0, wander: null };
const depthBuffer = new Float32Array(W);
const game = { running: false, caught: false, battery: 100, light: true, keys: new Set(), files: new Set(), breaker: false,
  code: "0312", time: 0, noiseUntil: 0, noisePos: null, footTimer: 0, eventTimer: 12, flicker: 0, toastTimer: 0, prompt: "", nearItem: null, keypad: false, hudTimer: 0, last: 0 };
const $ = selector => document.querySelector(selector);
const held = (...names) => names.some(name => keysDown.has(name));

function buildMap() {
  const width = 43, height = 43, grid = Array.from({ length: height }, () => Array(width).fill("#"));
  const spines = [1, 7, 13, 19, 25, 31, 37, 41];
  for (const y of spines) for (let x = 1; x <= 41; x++) grid[y][x] = ".";
  for (const x of spines) for (let y = 1; y <= 41; y++) grid[y][x] = ".";
  // Forty-nine separate guest rooms open onto a looping corridor network.
  for (const top of [2, 8, 14, 20, 26, 32, 38]) for (const left of [2, 8, 14, 20, 26, 32, 38]) {
    const right = Math.min(left + 4, 40), bottom = Math.min(top + 4, 40);
    const cx = Math.floor((left + right) / 2), cy = Math.floor((top + bottom) / 2);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) grid[y][x] = (x === left || x === right || y === top || y === bottom) ? "#" : ".";
    // One doorway on each side; the rooms remain connected to the hotel halls.
    grid[top][cx] = "."; grid[bottom][cx] = "."; grid[cy][left] = "."; grid[cy][right] = ".";
    // Interior props make rooms distinct and provide cover from the creature.
    if (right - left >= 4 && bottom - top >= 4) grid[top + 2][left + 1] = ["C", "S", "T", "P"][(left + top) % 4];
  }
  // A broad central lobby with a reception desk, luggage carts and seating.
  for (let y = 17; y <= 25; y++) for (let x = 17; x <= 25; x++) grid[y][x] = ".";
  grid[20][19] = "C"; grid[21][20] = "S"; grid[20][24] = "T"; grid[23][23] = "P";
  return grid;
}

function isWall(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  return iy < 0 || iy >= map.length || ix < 0 || ix >= map[0].length || map[iy][ix] !== ".";
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function lineClear(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, steps = Math.ceil(Math.hypot(dx, dy) * 12);
  for (let i = 1; i < steps; i++) if (isWall(x1 + dx * i / steps, y1 + dy * i / steps)) return false;
  return true;
}
function showToast(message, duration = 2.4) {
  const element = $("#toast"); element.textContent = message; element.classList.add("show"); game.toastTimer = duration;
}
function updateHud() {
  $("#clue-status").textContent = `Records found ${game.files.size} / 4`;
  $("#keys").innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="key-token ${game.keys.size > i ? "found" : ""}">${game.keys.size > i ? "✦" : "·"}</span>`).join("");
  const bar = $("#battery-bar"); bar.style.width = `${game.battery}%`; bar.classList.toggle("low", game.battery < 25);
  $("#battery-text").textContent = `${Math.ceil(game.battery)}%`;
  $("#noise-text").textContent = game.time < game.noiseUntil ? (game.playerRunning ? "LOUD" : "SOUND HEARD") : "QUIET";
  $("#noise-indicator").classList.toggle("loud", game.time < game.noiseUntil);
  const objective = game.keys.size < 5 ? "Find five room keys" : game.files.size < 4 ? "Find the lobby exit — uncover the truth" : "Reach the lobby exit. Decide what leaves with you.";
  $("#objective").textContent = objective;
}
function startGame() {
  game.running = true; game.caught = false; game.battery = 100; game.light = true; game.keys.clear(); game.files.clear();
  game.breaker = false; game.time = 0; game.noiseUntil = 0; game.noisePos = null; game.footTimer = 0; game.eventTimer = 9 + Math.random() * 8;
  game.flicker = 0; game.keypad = false; game.last = performance.now(); player.x = 1.5; player.y = 1.5; player.angle = 0; player.crouching = false;
  monster.x = 41.5; monster.y = 1.5; monster.angle = Math.PI; monster.state = "patrol"; monster.path = []; monster.repath = 0; monster.search = 0; monster.wander = null;
  keysDown.clear(); titleCard.hidden = true; endCard.hidden = true; overlay.hidden = true; hud.hidden = false; updateHud(); canvas.focus();
  try { if (audioContext?.state === "suspended") audioContext.resume(); } catch { /* Audio is optional. */ }
}
function finish(kind) {
  game.running = false; document.exitPointerLock?.(); overlay.hidden = false; hud.hidden = true;
  const endings = {
    caught: ["SIGNAL LOST", "IT FOUND YOU", "The hotel goes quiet. At dawn, the lobby doors are still locked."],
    survivor: ["SURVIVOR ENDING", "YOU MADE IT OUT", "You escaped with the keys. Behind you, the Grand Arcadia swallowed its secrets."],
    truth: ["THE TRUTH ENDING", "THE GUEST LIST WAS REAL", "You carried every record into the rain. By sunrise, the story was everywhere."],
    hidden: ["HIDDEN ENDING", "THE LAST CHECK-IN", "You restored the lobby transmitter. A voice answered from inside Room 312."],
    trapped: ["THE LOBBY IS LOCKED", "FIVE ROOM KEYS REQUIRED", "Find every room key before trying the front doors."]
  };
  const ending = endings[kind]; $("#end-kicker").textContent = ending[0]; $("#end-title").textContent = ending[1]; $("#end-copy").textContent = ending[2];
  titleCard.hidden = true; endCard.hidden = false; restartButton.focus();
}
function setNoise(x = player.x, y = player.y, length = 2.2) { game.noisePos = { x, y }; game.noiseUntil = game.time + length; }

// Grid pathfinding lets the creature navigate the hotel without external AI services.
function findPath(sx, sy, tx, ty) {
  const start = [Math.floor(sx), Math.floor(sy)], goal = [Math.floor(tx), Math.floor(ty)];
  const queue = [start], seen = new Map([[`${start[0]},${start[1]}`, null]]); let found = false;
  for (let cursor = 0; cursor < queue.length && cursor < 3000; cursor++) {
    const [x, y] = queue[cursor]; if (x === goal[0] && y === goal[1]) { found = true; break; }
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || isWall(nx + .5, ny + .5)) continue;
      seen.set(k, [x, y]); queue.push([nx, ny]);
    }
  }
  if (!found) return [];
  let node = goal, result = [];
  while (node && !(node[0] === start[0] && node[1] === start[1])) { result.push({ x: node[0] + .5, y: node[1] + .5 }); node = seen.get(`${node[0]},${node[1]}`); }
  return result.reverse();
}
function moveMonster(dt) {
  const d = distance(player, monster), sightRange = player.crouching ? (game.light ? 3.2 : 1.8) : game.light ? 9 : 4.2;
  const canSee = d < sightRange && lineClear(player.x, player.y, monster.x, monster.y);
  const heard = game.time < game.noiseUntil && game.noisePos && distance(monster, game.noisePos) < (game.playerRunning ? 10 : player.crouching ? 1.1 : 5.5);
  if (canSee) { if (monster.state !== "chase") showToast("IT SAW THE LIGHT", 1.4); monster.state = "chase"; monster.search = 5; monster.wander = { x: player.x, y: player.y }; }
  else if (heard) { if (monster.state !== "chase") monster.state = "investigate"; monster.wander = { ...game.noisePos }; monster.search = 4; }
  else if (monster.state === "chase") { monster.state = "search"; monster.search = 5; monster.wander = { x: player.x, y: player.y }; }
  else if (monster.state === "investigate" && !monster.path.length && monster.wander && distance(monster, monster.wander) < .8) { monster.state = "search"; monster.search = 3; monster.repath = 0; }
  monster.repath -= dt;
  if (monster.state === "search") { monster.search -= dt; if (monster.search <= 0) { monster.state = "patrol"; monster.path = []; } }
  if (monster.state === "patrol" && (!monster.path.length || monster.repath <= 0)) {
    const patrolPoints = [{x:41.5,y:1.5},{x:37.5,y:10.5},{x:25.5,y:7.5},{x:19.5,y:19.5},{x:7.5,y:25.5},{x:31.5,y:31.5},{x:13.5,y:37.5}];
    const target = patrolPoints[Math.floor(Math.random() * patrolPoints.length)]; monster.path = findPath(monster.x, monster.y, target.x, target.y); monster.repath = 5 + Math.random() * 4;
  } else if (["chase", "investigate"].includes(monster.state) && monster.repath <= 0) {
    const target = monster.state === "chase" ? player : monster.wander;
    if (target) monster.path = findPath(monster.x, monster.y, target.x, target.y); monster.repath = monster.state === "chase" ? .45 : 1.1;
  }
  if (monster.path.length) {
    const target = monster.path[0], dx = target.x - monster.x, dy = target.y - monster.y, len = Math.hypot(dx, dy) || 1;
    const speed = monster.state === "chase" ? 1.65 : monster.state === "investigate" ? 1.05 : .74;
    const step = Math.min(len, speed * dt); monster.x += dx / len * step; monster.y += dy / len * step; monster.angle = Math.atan2(dy, dx);
    if (len < .12) monster.path.shift();
  }
  if (d < .48 && lineClear(player.x, player.y, monster.x, monster.y)) finish("caught");
}

function castRay(angle) {
  const rx = Math.cos(angle), ry = Math.sin(angle), mx = Math.floor(camera.x), my = Math.floor(camera.y);
  const ddx = Math.abs(1 / (rx || 1e-9)), ddy = Math.abs(1 / (ry || 1e-9));
  const stepx = rx < 0 ? -1 : 1, stepy = ry < 0 ? -1 : 1;
  let sx = (rx < 0 ? camera.x - mx : mx + 1 - camera.x) * ddx;
  let sy = (ry < 0 ? camera.y - my : my + 1 - camera.y) * ddy, x = mx, y = my, side = 0, count = 0;
  while (count++ < 100) {
    if (sx < sy) { sx += ddx; x += stepx; side = 0; } else { sy += ddy; y += stepy; side = 1; }
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length || map[y][x] !== ".") break;
  }
  let distance = side === 0 ? sx - ddx : sy - ddy;
  distance = Math.max(.06, distance * Math.cos(angle - camera.angle));
  return { distance, side, x, y, rx, ry, tile: map[y]?.[x] || "#" };
}
function wallColor(hit, rayAngle) {
  const d = hit.distance, side = hit.side ? .73 : 1, beam = Math.abs(angleDelta(rayAngle, camera.angle));
  const lit = game.light && game.battery > 0 && game.flicker <= 0 && beam < .62;
  let light = lit ? Math.max(.12, 1 - d * .085) : Math.max(.035, .18 - d * .012);
  const hash = (hit.x * 17 + hit.y * 31) % 7 === 0 ? .78 : 1;
  light *= side * hash;
  const palette = { "#": lit ? [117,77,63] : [34,28,30], C: lit ? [119,77,49] : [38,28,24], S: lit ? [78,88,76] : [24,33,29], T: lit ? [113,103,81] : [34,33,31], P: lit ? [111,79,66] : [33,28,29] }[hit.tile] || [92,72,58];
  const damp = 1 - Math.min(.62, d * .035), r = palette[0] * light * damp, g = palette[1] * light * damp, b = palette[2] * light * damp;
  return `rgb(${r|0},${g|0},${b|0})`;
}
function renderWorld() {
  camera.angle = player.angle;
  for (const follow of [1.15, .85, .55, .3, 0]) {
    const x = player.x - Math.cos(player.angle) * follow, y = player.y - Math.sin(player.angle) * follow;
    if (!isWall(x, y)) { camera.x = x; camera.y = y; break; }
  }
  const horizon = player.crouching ? H * .55 : H * .5;
  const ceiling = ctx.createLinearGradient(0, 0, 0, horizon); ceiling.addColorStop(0,"#09090b"); ceiling.addColorStop(1,"#33251f"); ctx.fillStyle = ceiling; ctx.fillRect(0,0,W,horizon);
  const floor = ctx.createLinearGradient(0, horizon, 0, H); floor.addColorStop(0,"#37312c"); floor.addColorStop(1,"#100e0e"); ctx.fillStyle = floor; ctx.fillRect(0,horizon,W,H-horizon);
  const stripe = 2;
  for (let x = 0; x < W; x += stripe) {
    const cameraX = 2 * x / W - 1, angle = camera.angle + Math.atan(cameraX * Math.tan(FOV / 2)), hit = castRay(angle), prop = hit.tile !== "#", propHeight = { C:.78, S:.57, T:.7, P:.86 }[hit.tile] || 1;
    const wallHeight = Math.min(H * 1.8, H * propHeight / hit.distance), top = prop ? horizon - wallHeight * (propHeight - .5) / propHeight : horizon - wallHeight / 2;
    ctx.fillStyle = wallColor(hit, angle); ctx.fillRect(x, Math.max(0, top), stripe + 1, Math.min(H - top, wallHeight));
    const seam = Math.abs(((hit.side ? camera.y + hit.distance * hit.ry : camera.x + hit.distance * hit.rx) % 1) - .5);
    if (hit.tile === "#" && seam > .475 && hit.distance < 10) { ctx.fillStyle = "#171515"; ctx.fillRect(x, Math.max(0, top), 1, wallHeight); }
    depthBuffer[x] = hit.distance; depthBuffer[x + 1] = hit.distance;
  }
  drawSprites(horizon);
  drawAvatar();
  const vignette = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.18,W/2,H/2,H*.78); vignette.addColorStop(0,"#0000"); vignette.addColorStop(.66,"#05060922"); vignette.addColorStop(1,"#020306de"); ctx.fillStyle = vignette; ctx.fillRect(0,0,W,H);
  if (!game.light || game.battery <= 0 || game.flicker > 0) { ctx.fillStyle = "#03040744"; ctx.fillRect(0,0,W,H); }
}
function drawSprites(horizon) {
  const list = items.filter(item => !item.taken).map(item => ({ ...item, sprite: true }));
  list.push({ id:"exit",kind:"exit",...exit,sprite:true },{ id:"monster",kind:"monster",x:monster.x,y:monster.y,sprite:true });
  const cos = Math.cos(camera.angle), sin = Math.sin(camera.angle), focal = W / (2 * Math.tan(FOV/2));
  list.map(item => { const dx=item.x-camera.x,dy=item.y-camera.y; return { ...item, depth:dx*cos+dy*sin, side:-dx*sin+dy*cos }; }).filter(item=>item.depth>.14).sort((a,b)=>b.depth-a.depth).forEach(item=>{
    const sx=W/2+item.side*focal/item.depth, size=Math.min(H*1.7,H/item.depth*.74), sy=horizon-size*.42, ix=Math.max(0,Math.min(W-1,Math.round(sx)));
    if(item.depth>depthBuffer[ix])return;
    const visible = game.light && game.battery>0 && Math.abs(Math.atan2(item.side,item.depth))<.72;
    const glow=visible?1:.24;
    if(item.kind==="monster"){
      const s=size*1.05, y=sy+size*.06; ctx.save(); ctx.translate(sx,y); ctx.globalAlpha=visible?.98:.58;
      ctx.fillStyle=monster.state==="chase"?"#24191a":"#211d1e";
      ctx.beginPath();ctx.ellipse(0,s*.42,s*.29,s*.47,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(0,s*.08,s*.19,s*.22,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#1a1718";ctx.lineWidth=Math.max(4,s*.12);ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-s*.18,s*.27);ctx.lineTo(-s*.38,s*.76);ctx.moveTo(s*.18,s*.27);ctx.lineTo(s*.4,s*.7);ctx.stroke();
      ctx.fillStyle=visible?"#df4d42":"#a8312d";ctx.shadowColor="#e7473a";ctx.shadowBlur=visible?16:5;ctx.beginPath();ctx.arc(-s*.075,s*.07,Math.max(1.5,s*.025),0,7);ctx.arc(s*.075,s*.07,Math.max(1.5,s*.025),0,7);ctx.fill();ctx.restore();
    }else if(item.kind==="key"){
      ctx.save();ctx.translate(sx,sy+size*.48);ctx.rotate(Math.sin(game.time*2+item.x)*.16);ctx.globalAlpha=glow;
      ctx.shadowColor="#e6c277";ctx.shadowBlur=visible?size*.2:2;ctx.fillStyle="#d8be80";ctx.beginPath();ctx.arc(0,0,size*.12,0,7);ctx.fill();ctx.fillRect(-size*.018,0,size*.11,size*.38);ctx.fillRect(size*.04,size*.25,size*.065,size*.08);ctx.restore();
    }else if(item.kind==="file"){
      ctx.save();ctx.translate(sx,sy+size*.5);ctx.globalAlpha=glow;ctx.rotate(.08);ctx.fillStyle=visible?"#c9bc9f":"#514c42";ctx.fillRect(-size*.14,-size*.2,size*.28,size*.4);ctx.fillStyle="#765447";ctx.fillRect(-size*.09,-size*.1,size*.18,size*.018);ctx.fillRect(-size*.09,-size*.04,size*.16,size*.016);ctx.fillRect(-size*.09,size*.02,size*.13,size*.016);ctx.restore();
    }else if(item.kind==="battery"){
      ctx.save();ctx.translate(sx,sy+size*.5);ctx.globalAlpha=glow;ctx.fillStyle=visible?"#9bae91":"#445047";ctx.fillRect(-size*.12,-size*.18,size*.24,size*.36);ctx.fillStyle="#d6d9c9";ctx.fillRect(-size*.045,-size*.12,size*.09,size*.24);ctx.fillRect(-size*.1,-size*.04,size*.2,size*.08);ctx.restore();
    }else if(item.kind==="breaker"){
      ctx.save();ctx.translate(sx,sy+size*.48);ctx.globalAlpha=glow;ctx.fillStyle=visible?"#526875":"#343d43";ctx.fillRect(-size*.2,-size*.22,size*.4,size*.45);ctx.fillStyle="#91b2b8";ctx.fillRect(-size*.035,-size*.12,size*.07,size*.22);ctx.fillStyle="#d66b52";ctx.fillRect(-size*.1,size*.06,size*.2,size*.04);ctx.restore();
    }else if(item.kind==="exit"){
      const h=size*1.5,w=h*.52;ctx.save();ctx.globalAlpha=glow;ctx.fillStyle=visible?"#2b493d":"#17241f";ctx.fillRect(sx-w/2,sy-h*.18,w,h);ctx.fillStyle=visible?"#85b08f":"#37493c";ctx.fillRect(sx-w*.42,sy-h*.12,w*.84,h*.9);ctx.fillStyle="#d6c38e";ctx.fillRect(sx-w*.32,sy+h*.38,w*.64,h*.025);ctx.fillStyle="#e3c67c";ctx.beginPath();ctx.arc(sx+w*.29,sy+h*.35,Math.max(1,size*.012),0,7);ctx.fill();ctx.restore();
    }
  });
}

function drawAvatar() {
  const bob = game.running ? Math.sin(game.time * (game.playerRunning ? 13 : 5)) * (game.playerRunning ? 4 : 1.5) : 0;
  const base = H + 25 + (player.crouching ? 26 : 0) + bob;
  ctx.save(); ctx.translate(W / 2 + Math.sin(game.time * 2) * (game.playerRunning ? 3 : 1), base);
  // Soft shadow and shoulders keep the player's back visible in the chase view.
  ctx.fillStyle = "#020203aa"; ctx.beginPath(); ctx.ellipse(0, -7, 85, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#17191d"; ctx.beginPath(); ctx.ellipse(0, -157, 23, 29, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#201b18"; ctx.beginPath(); ctx.arc(0, -166, 24, Math.PI, Math.PI * 2); ctx.lineTo(23, -151); ctx.lineTo(-23, -151); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#9c795f"; ctx.fillRect(-9, -137, 18, 20);
  ctx.fillStyle = "#282a2e"; ctx.beginPath(); ctx.moveTo(-16,-130);ctx.lineTo(-51,-118);ctx.lineTo(-72,-87);ctx.lineTo(-65,-35);ctx.lineTo(-49,-17);ctx.lineTo(49,-17);ctx.lineTo(65,-35);ctx.lineTo(72,-87);ctx.lineTo(51,-118);ctx.lineTo(16,-130);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#414044";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-15,-125);ctx.lineTo(-7,-109);ctx.lineTo(0,-114);ctx.lineTo(7,-109);ctx.lineTo(15,-125);ctx.stroke();
  ctx.strokeStyle="#52483c";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-38,-116);ctx.lineTo(-22,-63);ctx.lineTo(-15,-28);ctx.stroke();
  ctx.fillStyle="#34363a";ctx.fillRect(-59,-50,118,8);ctx.fillStyle="#9d805d";ctx.fillRect(-3,-51,7,10);
  ctx.strokeStyle="#25272a";ctx.lineWidth=17;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(50,-108);ctx.lineTo(67,-70);ctx.lineTo(84,-53);ctx.stroke();
  ctx.fillStyle="#98765e";ctx.fillRect(77,-60,18,17);ctx.save();ctx.translate(88,-59);ctx.rotate(-.43);ctx.fillStyle=game.light?"#bda578":"#625c4c";ctx.fillRect(-6,-23,12,39);ctx.fillStyle="#ddd0a6";ctx.fillRect(-5,-28,10,6);ctx.restore();
  ctx.fillStyle="#16171a";ctx.fillRect(-47,-17,39,34);ctx.fillRect(8,-17,39,34);ctx.restore();
}

function nearestItem() {
  let closest=null, best=1.45;
  for(const item of items){if(item.taken)continue; const d=distance(player,item), angle=Math.atan2(item.y-player.y,item.x-player.x);
    if(d<best&&Math.abs(angleDelta(angle,player.angle))<.9&&lineClear(player.x,player.y,item.x,item.y)){closest=item;best=d;}}
  if(distance(player,exit)<2.1 && Math.abs(angleDelta(Math.atan2(exit.y-player.y,exit.x-player.x),player.angle))<1.1) return {kind:"exit",...exit};
  return closest;
}
function interact() {
  if(!game.running)return;
  if(game.keypad){submitCode();return;}
  const item=nearestItem();
  if(!item){showToast("NOTHING WITHIN REACH",1.2);setNoise();return;}
  if(item.kind==="key"){
    item.taken=true;game.keys.add(item.id);setNoise();showToast(`ROOM KEY ${game.keys.size} / 5 — PICKED UP`);updateHud();
  }else if(item.kind==="file"){
    item.taken=true;game.files.add(item.id);$("#note-title").textContent=item.title;$("#note-body").textContent=item.text;$("#note-card").hidden=false;setNoise(player.x,player.y,1.3);updateHud();
    if(item.id==="file-3") showToast("CODE ADDED TO YOUR NOTES: 0312",2.5);
  }else if(item.kind==="battery"){
    item.taken=true;game.battery=Math.min(100,game.battery+38);showToast("BATTERY PACK +38%",1.8);updateHud();
  }else if(item.kind==="breaker"){
    if(!game.breaker){game.breaker=true;showToast("LOBBY RADIO TRANSMITTER ONLINE",2.5);setNoise(player.x,player.y,3);}
    else showToast("TRANSMITTER IS ALREADY RUNNING",1.5);
  }else if(item.kind==="exit"){
    if(game.keys.size<5){showToast(`FRONT DOORS LOCKED — ${5-game.keys.size} ROOM KEYS STILL NEEDED`,2.6);return;}
    if(!game.files.has("file-3")){showToast("KEYPAD NOTE: CHECK THE ROOM 312 HOUSEKEEPING NOTE",2.8);return;}
    openKeypad();
  }
}
function openKeypad(){
  game.keypad=true;const note=$("#note-card");note.hidden=false;$("#note-title").textContent="GRAND LOBBY — FRONT DOOR";
  $("#note-body").textContent="Five room keys accepted. Enter the four-digit code from the Room 312 housekeeping note.\n\nCODE: [ _ _ _ _ ]\nType the four digits, then press Enter. Press Escape to close.";canvas.focus();
}
function submitCode(value){
  if(!game.keypad)return;const code=value??"";game.keypad=false;$("#note-card").hidden=true;
  if(code===game.code){finish(game.files.size===4&&game.breaker?"hidden":game.files.size===4?"truth":"survivor");}
  else{showToast("ACCESS DENIED — WRONG CODE",2.2);setNoise(player.x,player.y,3);}
}
function toggleLight(){
  if(game.battery<=0){game.light=false;showToast("FLASHLIGHT BATTERY DEAD",1.5);return;}
  game.light=!game.light;showToast(game.light?"FLASHLIGHT ON":"FLASHLIGHT OFF",1.1);setNoise(player.x,player.y,.6);
}
function toggleCrouch(){player.crouching=!player.crouching;showToast(player.crouching?"CROUCHING — QUIETER, SLOWER":"STANDING",1.2);}
function movePlayer(dt){
  const forward=Number(held("w","arrowup"))-Number(held("s","arrowdown"))+touch.forward;
  const side=Number(held("d"))-Number(held("a"))+touch.side;
  const running=held("shift")||touch.run, speed=(player.crouching?1.12:running?2.65:1.85);
  const mag=Math.hypot(forward,side)||1, dx=(Math.cos(player.angle)*forward-Math.sin(player.angle)*side)/mag*speed*dt,dy=(Math.sin(player.angle)*forward+Math.cos(player.angle)*side)/mag*speed*dt;
  let moved=false;const r=.2;
  if(!isWall(player.x+dx+r*Math.sign(dx),player.y+r)&&!isWall(player.x+dx+r*Math.sign(dx),player.y-r)) {player.x+=dx;moved ||= Math.abs(dx)>.002;}
  if(!isWall(player.x+r,player.y+dy+r*Math.sign(dy))&&!isWall(player.x-r,player.y+dy+r*Math.sign(dy))) {player.y+=dy;moved ||= Math.abs(dy)>.002;}
  game.playerRunning=running&&moved&&!player.crouching;
  if(moved){game.footTimer-=dt;if(game.footTimer<=0){game.footTimer=game.playerRunning ? .32 : player.crouching ? .85 : .55;if(!player.crouching)setNoise(player.x,player.y,1.8);playFootstep();}}
  if(held("arrowleft"))player.angle-=dt*1.8;if(held("arrowright"))player.angle+=dt*1.8;
}
function update(dt){
  if(!game.running)return;game.time+=dt;game.flicker=Math.max(0,game.flicker-dt);game.toastTimer-=dt;if(game.toastTimer<=0)$("#toast").classList.remove("show");
  movePlayer(dt);moveMonster(dt);
  if(game.light&&game.battery>0){game.battery=Math.max(0,game.battery-dt*.19);if(game.battery===0){game.light=false;showToast("THE FLASHLIGHT DIES",2.4);}}
  game.eventTimer-=dt;if(game.eventTimer<=0){game.eventTimer=13+Math.random()*19;const event=Math.random();if(event<.42){game.flicker=.18+Math.random()*.34;showToast("THE CHANDELIERS FLICKER",1.2);}else if(event<.8){setNoise(monster.x+(Math.random()-.5)*2,monster.y+(Math.random()-.5)*2,1.4);showToast("A SERVICE LIFT CLUNKS SOMEWHERE BELOW",1.8);}else{showToast("SOMETHING SCRATCHES BEHIND THE WALLPAPER",1.8);}}
  const near=nearestItem();game.nearItem=near;const prompt=$("#prompt");
  if(game.keypad)prompt.textContent="TYPE CODE · ENTER CONFIRMS · ESC CLOSES";
  else if(near){const labels={key:"E — TAKE ROOM KEY",file:"E — READ HOTEL RECORD",battery:"E — TAKE BATTERY",breaker:game.breaker?"LOBBY TRANSMITTER ONLINE":"E — RESTORE LOBBY TRANSMITTER",exit:game.keys.size<5?`FRONT DOORS LOCKED · ${game.keys.size}/5 KEYS` : game.files.has("file-3")?"E — ENTER EXIT CODE":"FIND THE ROOM 312 NOTE"};prompt.textContent=labels[near.kind]||"E — INTERACT";}
  else prompt.textContent="";prompt.classList.toggle("show",!!prompt.textContent);
  game.hudTimer-=dt;if(game.hudTimer<=0){updateHud();game.hudTimer=.2;}
}
function draw(){renderWorld();}
function frame(now){if(!game.running){renderWorld();return;}const dt=Math.min(.04,(now-game.last)/1000||0);game.last=now;update(dt);draw();if(game.running)requestAnimationFrame(frame);}

// Optional audio is synthesized locally; the game has no downloaded asset requirement.
let audioContext=null;
function playFootstep(){
  try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==="suspended")audioContext.resume();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type="triangle";osc.frequency.setValueAtTime(72+Math.random()*28,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(34,audioContext.currentTime+.09);gain.gain.setValueAtTime(.035,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.11);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.12);
  }catch{/* Muted or unsupported devices can still play. */}
}

startButton.addEventListener("click",()=>{startGame();requestAnimationFrame(frame);});
restartButton.addEventListener("click",()=>{startGame();requestAnimationFrame(frame);});
$("#close-note").addEventListener("click",()=>{$("#note-card").hidden=true;if(game.keypad)game.keypad=false;});
canvas.addEventListener("click",()=>{if(game.running&&!game.keypad&&!document.pointerLockElement)canvas.requestPointerLock?.();});
document.addEventListener("pointerlockchange",()=>{canvas.classList.toggle("locked",document.pointerLockElement===canvas);});
document.addEventListener("mousemove",event=>{if(game.running&&document.pointerLockElement===canvas)player.angle+=event.movementX*.0025;});
let dragging=false,lastX=0;
canvas.addEventListener("pointerdown",event=>{if(event.pointerType==="mouse"||event.clientX>innerWidth*.44){dragging=true;lastX=event.clientX;canvas.setPointerCapture?.(event.pointerId);}});
canvas.addEventListener("pointermove",event=>{if(dragging&&event.pointerType!=="mouse"){player.angle+=(event.clientX-lastX)*.008;lastX=event.clientX;}});
canvas.addEventListener("pointerup",()=>dragging=false);canvas.addEventListener("pointercancel",()=>dragging=false);
document.addEventListener("keydown",event=>{
  if(game.keypad){if(event.key==="Escape"){game.keypad=false;$("#note-card").hidden=true;}else if(event.key==="Enter"){const match=$("#note-body").textContent.match(/CODE: \[\s*(\d{4})\s*\]/);submitCode(match?.[1]||prompt("Enter the four-digit code"));}else if(/^\d$/.test(event.key)){const body=$("#note-body");const match=body.textContent.match(/CODE: \[\s*(\d*)/);const current=match?.[1]||"";if(current.length<4)body.textContent=body.textContent.replace(/CODE: \[.*?\]/,`CODE: [ ${current}${event.key}${" _".repeat(3-current.length)} ]`);}event.preventDefault();return;}
  const key=event.key.toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift"," "].includes(key))event.preventDefault();keysDown.add(key);
  if(!game.running||event.repeat)return;if(key==="e")interact();if(key==="f")toggleLight();if(key==="c")toggleCrouch();if(key==="escape"&&document.pointerLockElement)document.exitPointerLock();
});
document.addEventListener("keyup",event=>keysDown.delete(event.key.toLowerCase()));window.addEventListener("blur",()=>keysDown.clear());
$("#touch-flash").addEventListener("pointerdown",event=>{event.preventDefault();toggleLight();});$("#touch-crouch").addEventListener("pointerdown",event=>{event.preventDefault();toggleCrouch();});$("#touch-use").addEventListener("pointerdown",event=>{event.preventDefault();interact();});
$("#touch-run").addEventListener("pointerdown",event=>{event.preventDefault();touch.run=true;event.currentTarget.classList.add("active");});$("#touch-run").addEventListener("pointerup",event=>{touch.run=false;event.currentTarget.classList.remove("active");});$("#touch-run").addEventListener("pointercancel",()=>{touch.run=false;});
const stick=$("#stick"),stickArea=$(".stick-area");let stickPointer=null;
stickArea.addEventListener("pointerdown",event=>{stickPointer=event.pointerId;stickArea.setPointerCapture(event.pointerId);updateStick(event);});
stickArea.addEventListener("pointermove",event=>{if(event.pointerId===stickPointer)updateStick(event);});
function updateStick(event){const rect=stickArea.getBoundingClientRect(),dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),len=Math.max(1,Math.hypot(dx,dy)),scale=Math.min(1,len/34);touch.side=dx/len*scale;touch.forward=-dy/len*scale;stick.querySelector("span").style.transform=`translate(${touch.side*25}px,${-touch.forward*25}px)`;}
function endStick(){stickPointer=null;touch.forward=0;touch.side=0;stick.querySelector("span").style.transform="";}
stickArea.addEventListener("pointerup",endStick);stickArea.addEventListener("pointercancel",endStick);
updateHud();renderWorld();
