const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");


let lastEchoCell = null;


const titleScreen = document.getElementById("title-screen");
const gameOverScreen = document.getElementById("game-over-screen");
const gameOverStatsEl = document.getElementById("game-over-stats");
const btnPlay = document.getElementById("btn-play");
const btnRetry = document.getElementById("btn-retry");
const btnMenu = document.getElementById("btn-menu");

const hudLevel = document.getElementById("hud-level");
const hudTime = document.getElementById("hud-time");
const cooldownFill = document.getElementById("cooldown-fill");

const touchControls = document.getElementById("touch-controls");
const joystickArea = document.getElementById("joystick-area");
const joystickBase = document.getElementById("joystick-base");
const joystickKnob = document.getElementById("joystick-knob");
const btnEcho = document.getElementById("btn-echo");

const COLORS = {
  bg: "#000000",
  wall: "#29b6f6",
  echo: "#00e5ff",
  player: "#ffffff",
  enemy: "#ff5252",
  exit: "#69f0ae",
};

const DEBUG_SHOW_WALLS = false;

const PLAYER_SPEED = 120;
const ENEMY_BASE_SPEED = 80;
const ECHO_MAX_RADIUS = 300;
const ECHO_SPEED = 400;
const ECHO_FADE_TIME = 0.8;



const ENEMY_HEARING_RADIUS = 200;

const STATE_MENU = "menu";
const STATE_PLAYING = "playing";
const STATE_GAME_OVER = "gameOver";

let gameState = STATE_MENU;
let lastTimestamp = 0;




const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  echoPressed: false,
  joystickVec: { x: 0, y: 0 },
};

class Maze {
  constructor(cols, rows, cellSize) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.cells = [];
    this.walls = [];
    this.startCell = null;
    this.exitCell = null;
    this.generate();
  }

  generate() {
    this.cells = [];
    for (let y = 0; y < this.rows; y++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        row.push({
          x,
          y,
          walls: { top: true, right: true, bottom: true, left: true },
          visited: false,
        });
      }
      this.cells.push(row);
    }

    const stack = [];
    const startX = 0;
    const startY = 0;
    let current = this.cells[startY][startX];
    current.visited = true;
    stack.push(current);

    while (stack.length > 0) {
      current = stack[stack.length - 1];
      const neighbors = this.getUnvisitedNeighbors(current);

      if (neighbors.length === 0) {
        stack.pop();
      } else {
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        this.removeWall(current, next);
        next.visited = true;
        stack.push(next);
      }
    }

    this.startCell = this.cells[0][0];
    this.exitCell = this.cells[this.rows - 1][this.cols - 1];
    this.buildWalls();
  }

  getUnvisitedNeighbors(cell) {
    const neighbors = [];
    const { x, y } = cell;
    if (y > 0 && !this.cells[y - 1][x].visited) neighbors.push(this.cells[y - 1][x]); // top
    if (x < this.cols - 1 && !this.cells[y][x + 1].visited) neighbors.push(this.cells[y][x + 1]); // right
    if (y < this.rows - 1 && !this.cells[y + 1][x].visited) neighbors.push(this.cells[y + 1][x]); // bottom
    if (x > 0 && !this.cells[y][x - 1].visited) neighbors.push(this.cells[y][x - 1]); // left
    return neighbors;
  }

  removeWall(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 1) {
      a.walls.right = false;
      b.walls.left = false;
    } else if (dx === -1) {
      a.walls.left = false;
      b.walls.right = false;
    } else if (dy === 1) {
      a.walls.bottom = false;
      b.walls.top = false;
    } else if (dy === -1) {
      a.walls.top = false;
      b.walls.bottom = false;
    }
  }

  buildWalls() {
    this.walls = [];
    const cs = this.cellSize;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = this.cells[y][x];
        const x0 = x * cs;
        const y0 = y * cs;
        const x1 = x0 + cs;
        const y1 = y0 + cs;

        if (cell.walls.top) {
          this.walls.push({ x1: x0, y1: y0, x2: x1, y2: y0 });
        }
        if (cell.walls.right) {
          this.walls.push({ x1: x1, y1: y0, x2: x1, y2: y1 });
        }
        if (cell.walls.bottom) {
          this.walls.push({ x1: x0, y1: y1, x2: x1, y2: y1 });
        }
        if (cell.walls.left) {
          this.walls.push({ x1: x0, y1: y0, x2: x0, y2: y1 });
        }
      }
    }
  }

  getWorldPosition(cell) {
    const cs = this.cellSize;
    return {
      x: cell.x * cs + cs / 2,
      y: cell.y * cs + cs / 2,
    };
  }

  cellAtWorld(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return null;
    return this.cells[cy][cx];
  }
}

class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.radius = 5;
    this.speed = PLAYER_SPEED;
    this.echoCooldown = 0;
    this.echoCooldownMax = 1.2;
  }

  resetAt(x, y, echoCooldown) {
    this.x = x;
    this.y = y;
    this.echoCooldownMax = echoCooldown;
    this.echoCooldown = 0;
  }
}

class Enemy {
  constructor(x, y, speed) {
    this.x = x;
    this.y = y;
    this.radius = 8;
    this.speed = speed;

    this.state = "patrol";
    this.targetX = x;
    this.targetY = y;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
  }
}

class EchoWave {
  constructor(x, y, maxRadius, speed, fadeTime) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = maxRadius;
    this.speed = speed;
    this.life = 0;
    this.maxLife = fadeTime;
    this.active = true;
  }


  update(dt) {
    if (!this.active) return;
    this.radius += this.speed * dt;
    this.life += dt;
    if (this.radius >= this.maxRadius || this.life >= this.maxLife) {
      this.active = false;
    }
  }

  get alpha() {
    return Math.max(0, 1 - this.life / this.maxLife);
  }
}

class LevelManager {
  constructor() {
    this.currentLevel = 1;
    this.elapsedTime = 0;
  }

  getConfig() {
    const level = this.currentLevel;
    const cols = 20 + Math.floor((level - 1) / 4) * 4;
    const rows = 20 + Math.floor((level - 1) / 4) * 4;
    let enemyCount = 1;
    if (level >= 3) enemyCount = 2;
    if (level >= 7) enemyCount = 3;
    if (level >= 15) enemyCount = 4;

    const enemySpeedFactor = 1 + Math.min(0.6, level * 0.03);
    let echoCooldown = 1.2;
    if (level >= 10) echoCooldown = 1.6;

    return {
      cols,
      rows,
      cellSize: 28,
      enemyCount,
      enemySpeedFactor,
      echoCooldown,
    };
  }

  resetTimer() {
    this.elapsedTime = 0;
  }

  update(dt) {
    this.elapsedTime += dt;
  }

  nextLevel() {
    this.currentLevel += 1;
    this.resetTimer();
  }

  reset() {
    this.currentLevel = 1;
    this.resetTimer();
  }
}

const levelManager = new LevelManager();
let maze = null;
let player = new Player();
let enemies = [];
let echoes = [];
let exitPos = { x: 0, y: 0, radius: 12 };
// Enemy system variables
let maxEnemies = 4;
let spawnInterval = 8;
let lastSpawnTime = 0;
let enemySpawnDistance = 200;
let enemyBaseSpeed = 60;
let enemyHearingRadius = 220;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function showTitle() {
  gameState = STATE_MENU;
  titleScreen.classList.add("visible");
  gameOverScreen.classList.remove("visible");
}

function startRun() {
  levelManager.reset();
  hudLevel.textContent = String(levelManager.currentLevel);
  hudTime.textContent = "0.0";
  titleScreen.classList.remove("visible");
  gameOverScreen.classList.remove("visible");
  startLevel();
}

function choosePatrolDirection(enemy) {

  const cell = maze.cellAtWorld(enemy.x, enemy.y);
  if (!cell) return;

  const dirs = [];

  if (!cell.walls.top) dirs.push({x:0,y:-1});
  if (!cell.walls.bottom) dirs.push({x:0,y:1});
  if (!cell.walls.left) dirs.push({x:-1,y:0});
  if (!cell.walls.right) dirs.push({x:1,y:0});

  if (dirs.length === 0) return;

  const d = dirs[Math.floor(Math.random()*dirs.length)];

  enemy.targetX = enemy.x + d.x * maze.cellSize;
  enemy.targetY = enemy.y + d.y * maze.cellSize;
}

function startLevel() {
  const cfg = levelManager.getConfig();
  maze = new Maze(cfg.cols, cfg.rows, cfg.cellSize);
  const startPos = maze.getWorldPosition(maze.startCell);
  const exitWorld = maze.getWorldPosition(maze.exitCell);
  player.resetAt(startPos.x, startPos.y, cfg.echoCooldown);
  exitPos.x = exitWorld.x;
  exitPos.y = exitWorld.y;
  exitPos.radius = 14;
  
  echoes = [];
  lastEchoCell = null;
  enemies = [];

  const enemySpeed = ENEMY_BASE_SPEED * cfg.enemySpeedFactor;
  for (let i = 0; i < cfg.enemyCount; i++) {
    const col = Math.floor((maze.cols / (cfg.enemyCount + 1)) * (i + 1));
    const cell = maze.cells[maze.rows - 1][Math.max(0, Math.min(maze.cols - 1, col))];
    const pos = maze.getWorldPosition(cell);
    const enemy = new Enemy(pos.x, pos.y, enemySpeed);
    choosePatrolDirection(enemy);
    enemies.push(enemy);
  }

  gameState = STATE_PLAYING;
}

function endRun(reason) {
  gameState = STATE_GAME_OVER;
  const level = levelManager.currentLevel;
  const time = levelManager.elapsedTime.toFixed(1);
  gameOverStatsEl.textContent = `${reason}. Reached level ${level} in ${time}s.`;
  gameOverScreen.classList.add("visible");
}

btnPlay.addEventListener("click", () => startRun());
btnRetry.addEventListener("click", () => startRun());
btnMenu.addEventListener("click", () => showTitle());

window.addEventListener("keydown", (e) => {
  const isMoveKey =
    e.code === "ArrowUp" ||
    e.code === "ArrowDown" ||
    e.code === "ArrowLeft" ||
    e.code === "ArrowRight" ||
    e.code === "KeyW" ||
    e.code === "KeyA" ||
    e.code === "KeyS" ||
    e.code === "KeyD";

  if (isMoveKey || e.code === "Space") {
    e.preventDefault();
  }

  if (e.code === "ArrowUp" || e.code === "KeyW") input.up = true;
  if (e.code === "ArrowDown" || e.code === "KeyS") input.down = true;
  if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") input.right = true;

  if (e.code === "Space") {
    if (e.target === btnEcho) {
      return;
    }
    queueEchoInput();
  }
});

window.addEventListener("keyup", (e) => {
  const isMoveKey =
    e.code === "ArrowUp" ||
    e.code === "ArrowDown" ||
    e.code === "ArrowLeft" ||
    e.code === "ArrowRight" ||
    e.code === "KeyW" ||
    e.code === "KeyA" ||
    e.code === "KeyS" ||
    e.code === "KeyD";

  if (isMoveKey) {
    e.preventDefault();
  }

  if (e.code === "ArrowUp" || e.code === "KeyW") input.up = false;
  if (e.code === "ArrowDown" || e.code === "KeyS") input.down = false;
  if (e.code === "ArrowLeft" || e.code === "KeyA") input.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") input.right = false;
});

const joystickState = {
  active: false,
  id: null,
  cx: 0,
  cy: 0,
};

function queueEchoInput() {
  input.echoPressed = true;
}

function updateJoystickFromTouch(clientX, clientY) {
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const maxDist = rect.width * 0.35;
  const dist = Math.min(Math.hypot(dx, dy), maxDist);
  const angle = Math.atan2(dy, dx);
  const nx = (dist / maxDist) * Math.cos(angle);
  const ny = (dist / maxDist) * Math.sin(angle);
  joystickKnob.style.transform = `translate3d(${nx * maxDist}px, ${ny * maxDist}px, 0)`;
  input.joystickVec.x = nx;
  input.joystickVec.y = ny;
}

joystickArea.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  joystickState.active = true;
  joystickState.id = t.identifier;
  updateJoystickFromTouch(t.clientX, t.clientY);
}, { passive: false });

joystickArea.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joystickState.id) {
      updateJoystickFromTouch(t.clientX, t.clientY);
    }
  }
}, { passive: false });

joystickArea.addEventListener("touchend", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joystickState.id) {
      joystickState.active = false;
      joystickState.id = null;
      joystickKnob.style.transform = "translate3d(0,0,0)";
      input.joystickVec.x = 0;
      input.joystickVec.y = 0;
    }
  }
}, { passive: false });

joystickArea.addEventListener("touchcancel", (e) => {
  e.preventDefault();
  joystickState.active = false;
  joystickState.id = null;
  joystickKnob.style.transform = "translate3d(0,0,0)";
  input.joystickVec.x = 0;
  input.joystickVec.y = 0;
}, { passive: false });

btnEcho.addEventListener("click", () => {
  queueEchoInput();
});

function emitEcho() {
  if (!maze) return;
  if (player.echoCooldown > 0) return;
  const echo = new EchoWave(player.x, player.y, ECHO_MAX_RADIUS, ECHO_SPEED, ECHO_FADE_TIME);
  echoes.push(echo);
  lastEchoCell = { x: echo.x, y: echo.y };
  player.echoCooldown = player.echoCooldownMax;
  for (const enemy of enemies) {
    const dx = enemy.x - echo.x;
    const dy = enemy.y - echo.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 250) {
      enemy.state = "investigate";
      enemy.targetX = echo.x;
      enemy.targetY = echo.y;
    }
  }
}

function updatePlayer(dt) {
  if (!maze) return;
  const prevX = player.x;
  const prevY = player.y;
  const joy = input.joystickVec;
  let mx = 0;
  let my = 0;
  if (joy.x !== 0 || joy.y !== 0) {
    mx = joy.x;
    my = joy.y;
  } else {
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
  }

  let len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }

  const speed = player.speed;
  const dx = mx * speed * dt;
  const dy = my * speed * dt;

  moveWithCollisions(player, dx, dy);

  if (isInsideSolidCell(player)) {
    player.x = prevX;
    player.y = prevY;
  }

  if (player.echoCooldown > 0) {
    player.echoCooldown = Math.max(0, player.echoCooldown - dt);
  }

  if (input.echoPressed) {
    emitEcho();
    input.echoPressed = false;
  }
}

function moveWithCollisions(entity, dx, dy) {
  if (!maze) {
    entity.x += dx;
    entity.y += dy;
    return;
  }

  const cs = maze.cellSize;
  const r = entity.radius;

  // Move on X axis with wall-aware clamping
  if (dx !== 0) {
    let newX = entity.x + dx;
    const dir = dx > 0 ? 1 : -1;
    const edgeX = newX + dir * r;
    const cx = Math.floor(entity.x / cs);
    const targetCol = Math.floor(edgeX / cs);

    if (targetCol !== cx) {
      const wallX = dir > 0 ? (cx + 1) * cs : cx * cs;
      const rowTop = Math.floor((entity.y - r) / cs);
      const rowBottom = Math.floor((entity.y + r) / cs);
      let blocked = false;
      for (let row = rowTop; row <= rowBottom; row++) {
        if (row < 0 || row >= maze.rows) continue;
        const cell = maze.cells[row][cx];
        const neighborCol = cx + dir;
        const neighbor =
          neighborCol >= 0 && neighborCol < maze.cols ? maze.cells[row][neighborCol] : null;
        if (dir > 0) {
          if (cell.walls.right || (neighbor && neighbor.walls.left)) {
            blocked = true;
            break;
          }
        } else {
          if (cell.walls.left || (neighbor && neighbor.walls.right)) {
            blocked = true;
            break;
          }
        }
      }
      const EPS = 0.01;
if (blocked) {
  newX = dir > 0 ? wallX - r - EPS : wallX + r + EPS;
}
    }

    const minX = r;
    const maxX = maze.cols * cs - r;
    entity.x = Math.max(minX, Math.min(maxX, newX));
  }

  // Move on Y axis with wall-aware clamping
  if (dy !== 0) {
    let newY = entity.y + dy;
    const dir = dy > 0 ? 1 : -1;
    const edgeY = newY + dir * r;
    const cy = Math.floor(entity.y / cs);
    const targetRow = Math.floor(edgeY / cs);

    if (targetRow !== cy) {
      const wallY = dir > 0 ? (cy + 1) * cs : cy * cs;
      const colLeft = Math.floor((entity.x - r) / cs);
      const colRight = Math.floor((entity.x + r) / cs);
      let blocked = false;
      for (let col = colLeft; col <= colRight; col++) {
        if (col < 0 || col >= maze.cols) continue;
        const cell = maze.cells[cy][col];
        const neighborRow = cy + dir;
        const neighbor =
          neighborRow >= 0 && neighborRow < maze.rows ? maze.cells[neighborRow][col] : null;
        if (dir > 0) {
          if (cell.walls.bottom || (neighbor && neighbor.walls.top)) {
            blocked = true;
            break;
          }
        } else {
          if (cell.walls.top || (neighbor && neighbor.walls.bottom)) {
            blocked = true;
            break;
          }
        }
      }
      const EPS = 0.01;
if (blocked) {
  newY = dir > 0 ? wallY - r - EPS : wallY + r + EPS;
}
    }

    const minY = r;
    const maxY = maze.rows * cs - r;
    entity.y = Math.max(minY, Math.min(maxY, newY));
  }
}

function isInsideSolidCell(entity) {
  const cell = maze.cellAtWorld(entity.x, entity.y);
  if (!cell) return false;
  const w = cell.walls;
  return w.top && w.bottom && w.left && w.right;
}

function resolveCollisions(entity) {
  // Retained only for compatibility; main collision is handled in moveWithCollisions.
}

function chooseNextCellTowardPlayer(enemy) {

  const cell = maze.cellAtWorld(enemy.x, enemy.y);
  const playerCell = maze.cellAtWorld(player.x, player.y);

  if (!cell || !playerCell) return;

  const options = [];

  if (!cell.walls.top) options.push(maze.cells[cell.y-1][cell.x]);
  if (!cell.walls.bottom) options.push(maze.cells[cell.y+1][cell.x]);
  if (!cell.walls.left) options.push(maze.cells[cell.y][cell.x-1]);
  if (!cell.walls.right) options.push(maze.cells[cell.y][cell.x+1]);

  let best = null;
  let bestDist = Infinity;

  for (const c of options) {
    const dx = c.x - playerCell.x;
    const dy = c.y - playerCell.y;
    const d = Math.abs(dx) + Math.abs(dy);

    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  if (best) {
    const pos = maze.getWorldPosition(best);
    enemy.targetX = pos.x;
    enemy.targetY = pos.y;
  }
}


function findPath(startCell, goalCell) {

  const open = [startCell];
  const cameFrom = new Map();

  const gScore = new Map();
  const fScore = new Map();

  const key = (c) => `${c.i},${c.j}`;

  gScore.set(key(startCell), 0);
  fScore.set(key(startCell), heuristic(startCell, goalCell));

  while (open.length > 0) {

    let current = open.reduce((a, b) =>
      (fScore.get(key(a)) ?? Infinity) < (fScore.get(key(b)) ?? Infinity) ? a : b
    );

    if (current === goalCell) {

      const path = [];
      let temp = current;

      while (cameFrom.has(key(temp))) {
        path.unshift(temp);
        temp = cameFrom.get(key(temp));
      }

      return path;
    }

    open.splice(open.indexOf(current), 1);

    const neighbors = [];

    if (!current.walls.top && current.j > 0)
      neighbors.push(maze.cells[current.j-1][current.i]);

    if (!current.walls.bottom && current.j < maze.rows-1)
      neighbors.push(maze.cells[current.j+1][current.i]);

    if (!current.walls.left && current.i > 0)
      neighbors.push(maze.cells[current.j][current.i-1]);

    if (!current.walls.right && current.i < maze.cols-1)
      neighbors.push(maze.cells[current.j][current.i+1]);

    for (const n of neighbors) {

      const tentative = (gScore.get(key(current)) ?? Infinity) + 1;

      if (tentative < (gScore.get(key(n)) ?? Infinity)) {

        cameFrom.set(key(n), current);
        gScore.set(key(n), tentative);

        const f = tentative + heuristic(n, goalCell);
        fScore.set(key(n), f);

        if (!open.includes(n)) open.push(n);

      }
    }
  }

  return [];
}
  function heuristic(a, b) {
    return Math.abs(a.i - b.i) + Math.abs(a.j - b.j);
  }




function getNeighbors(cell){

  const list = [];

  if (!cell.walls.top) list.push(maze.cells[cell.y-1][cell.x]);
  if (!cell.walls.bottom) list.push(maze.cells[cell.y+1][cell.x]);
  if (!cell.walls.left) list.push(maze.cells[cell.y][cell.x-1]);
  if (!cell.walls.right) list.push(maze.cells[cell.y][cell.x+1]);

  return list;
}

function getCellFromWorld(x, y) {
  const cs = maze.cellSize
  const cx = Math.floor(x / cs)
  const cy = Math.floor(y / cs)

  if (cx < 0 || cy < 0 || cx >= maze.cols || cy >= maze.rows) return null
  return maze.cells[cy][cx]
}

function updateEnemies(dt) {
  if (!maze) return;
  const engageRadius = ENEMY_HEARING_RADIUS;

  for (const enemy of enemies) {
    const toPlayerX = player.x - enemy.x;
    const toPlayerY = player.y - enemy.y;
    const playerDist = Math.hypot(toPlayerX, toPlayerY);

    if (playerDist <= engageRadius) {
      enemy.state = "chase";
      enemy.targetX = player.x;
      enemy.targetY = player.y;
    } else if (enemy.state === "chase") {
      enemy.state = "patrol";
      choosePatrolDirection(enemy);
    }

    if (enemy.state === "investigate" && lastEchoCell) {
      enemy.targetX = lastEchoCell.x;
      enemy.targetY = lastEchoCell.y;
    }

    let tx = enemy.targetX;
    let ty = enemy.targetY;
    const distToTarget = Math.hypot(tx - enemy.x, ty - enemy.y);

    if (enemy.state === "patrol" && distToTarget < 6) {
      choosePatrolDirection(enemy);
      tx = enemy.targetX;
      ty = enemy.targetY;
    }

    const dx = tx - enemy.x;
    const dy = ty - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) {
      const step = Math.min(enemy.speed * dt, d);
      moveWithCollisions(enemy, (dx / d) * step, (dy / d) * step);
    }

    if (enemy.state === "investigate" && Math.hypot(enemy.targetX - enemy.x, enemy.targetY - enemy.y) < 8) {
      enemy.state = "patrol";
      choosePatrolDirection(enemy);
    }

    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) <= player.radius + enemy.radius) {
      endRun("Caught by enemy");
      return;
    }
  }
}

function updateEchoes(dt) {
  for (const echo of echoes) {
    echo.update(dt);
  }
  echoes = echoes.filter((e) => e.active);
}

function checkExit() {
  const dx = player.x - exitPos.x;
  const dy = player.y - exitPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= exitPos.radius) {
    levelManager.nextLevel();
    hudLevel.textContent = String(levelManager.currentLevel);
    startLevel();
  }
}

function update(dt) {
  if (gameState !== STATE_PLAYING) return;
  levelManager.update(dt);
  hudTime.textContent = levelManager.elapsedTime.toFixed(1);
  updatePlayer(dt);
  updateEnemies(dt);
  updateEchoes(dt);
  checkExit();
}

function render() {





  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, rect.width, rect.height);

  if (!maze) return;

  const allEchoes = echoes.filter((e) => e.active);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const echo of allEchoes) {
    const alpha = echo.alpha;
    if (alpha <= 0) continue;
    const gradient = ctx.createRadialGradient(
      echo.x,
      echo.y,
      Math.max(0, echo.radius - 20),
      echo.x,
      echo.y,
      echo.radius
    );
    gradient.addColorStop(0, `rgba(0,229,255,${alpha * 0.05})`);
    gradient.addColorStop(0.7, `rgba(0,229,255,${alpha * 0.4})`);
    gradient.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(echo.x, echo.y, echo.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 2;
  for (const wall of maze.walls) {
    let visibleAlpha = 0;
    if (DEBUG_SHOW_WALLS) {
      visibleAlpha = 1;
    } else {
      for (const echo of allEchoes) {
        const mx = (wall.x1 + wall.x2) / 2;
        const my = (wall.y1 + wall.y2) / 2;
        const dx = mx - echo.x;
        const dy = my - echo.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= echo.radius) {
          visibleAlpha = Math.max(visibleAlpha, echo.alpha);
        }
      }
    }
    if (visibleAlpha > 0) {
      ctx.globalAlpha = visibleAlpha;
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
    }
  }
  ctx.restore();

  const isExitVisible =
    allEchoes.length === 0
      ? false
      : allEchoes.some((echo) => Math.hypot(exitPos.x - echo.x, exitPos.y - echo.y) <= echo.radius);
  if (isExitVisible) {
    ctx.save();
    const radius = exitPos.radius;
    const gradient = ctx.createRadialGradient(
      exitPos.x,
      exitPos.y,
      radius * 0.2,
      exitPos.x,
      exitPos.y,
      radius * 1.6
    );
    gradient.addColorStop(0, COLORS.exit);
    gradient.addColorStop(1, "rgba(105,240,174,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(exitPos.x, exitPos.y, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const isPlayerVisible =
    allEchoes.length === 0
      ? true
      : allEchoes.some((echo) => Math.hypot(player.x - echo.x, player.y - echo.y) <= echo.radius);

  if (isPlayerVisible) {
    ctx.save();
    ctx.fillStyle = COLORS.player;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const enemy of enemies) {
    const visible =
      allEchoes.length === 0
        ? false
        : allEchoes.some((echo) => Math.hypot(enemy.x - echo.x, enemy.y - echo.y) <= echo.radius);
    if (!visible) continue;
    ctx.save();
    ctx.fillStyle = COLORS.enemy;
    ctx.shadowColor = COLORS.enemy;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const cdRatio = 1 - player.echoCooldown / player.echoCooldownMax;
  cooldownFill.style.width = `${Math.max(0, Math.min(1, cdRatio)) * 100}%`;


  function drawEnemies(){

    for(const e of enemies){
  
      const x = e.i * cellSize + cellSize/2;
      const y = e.j * cellSize + cellSize/2;
  
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.arc(x,y,cellSize*0.3,0,Math.PI*2);
      ctx.fill();
    }
  
  }
}

function loop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  if (gameState === STATE_PLAYING) {
    update(dt);
  }
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
