"use strict";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const startOverlay = document.querySelector("#start-overlay");
const startButton = document.querySelector("#start-button");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const homeScoreElement = document.querySelector("#home-score");
const awayScoreElement = document.querySelector("#away-score");
const gameTimeElement = document.querySelector("#game-time");
const gameStateElement = document.querySelector("#game-state");
const gameMessageElement = document.querySelector("#game-message");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const HOME = 0;
const AWAY = 1;
const PLAYER_RADIUS = 13;
const BALL_RADIUS = 5;
const PLAYER_SPEED = 185;
const AI_SPEED = 145;
const GAME_LENGTH = 180;

const FIELD = {
  left: 72,
  right: 888,
  top: 36,
  bottom: 540,
  centerX: 480,
  centerY: 288,
  leftGoalLine: 191,
  rightGoalLine: 769,
  goalTop: 244,
  goalBottom: 332,
  creaseRadius: 48,
};

const COLORS = {
  home: "#12375f",
  homeLight: "#dbe8f2",
  away: "#a8323e",
  awayLight: "#f5c4c9",
  fieldDark: "#247049",
  fieldLight: "#2f8157",
  line: "#e9f4ee",
  ball: "#f4c95d",
  shadow: "rgba(0, 0, 0, 0.26)",
  navy: "#071a33",
  white: "#f8fafc",
};

const input = {
  held: new Set(),
  pressed: new Set(),
};

const game = {
  phase: "ready",
  score: [0, 0],
  timeRemaining: GAME_LENGTH,
  goalTimer: 0,
  restartTeam: HOME,
  controlledId: null,
  message: "Press Start Game to begin.",
};

const ball = {
  x: FIELD.leftGoalLine + 90,
  y: FIELD.centerY,
  vx: 0,
  vy: 0,
  ownerId: null,
  lastTouchTeam: HOME,
  kind: "held",
  catchDelay: 0,
  ignorePlayerId: null,
};

const players = [];
let lastFrameTime = performance.now();

const HOME_FORMATION = [
  [FIELD.leftGoalLine + 90, FIELD.centerY],
  [350, 150],
  [350, 426],
  [470, 220],
  [470, 356],
];

const AWAY_FORMATION = HOME_FORMATION.map(([x, y]) => [WIDTH - x, y]);

function createPlayers() {
  players.length = 0;

  [HOME, AWAY].forEach((team) => {
    const formation = team === HOME ? HOME_FORMATION : AWAY_FORMATION;

    formation.forEach(([x, y], role) => {
      players.push({
        id: `${team === HOME ? "H" : "A"}${role}`,
        team,
        role,
        x,
        y,
        vx: 0,
        vy: 0,
        dirX: team === HOME ? 1 : -1,
        dirY: 0,
        hasBall: false,
        pokeCooldown: 0,
        actionCooldown: 0,
        flashTimer: 0,
      });
    });
  });
}

function getPlayer(id) {
  return players.find((player) => player.id === id) || null;
}

function teamPlayers(team) {
  return players.filter((player) => player.team === team);
}

function opposingTeam(team) {
  return team === HOME ? AWAY : HOME;
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function nearestPlayer(team, x, y, excludedId = null) {
  return teamPlayers(team)
    .filter((player) => player.id !== excludedId)
    .sort(
      (first, second) =>
        Math.hypot(first.x - x, first.y - y) -
        Math.hypot(second.x - x, second.y - y),
    )[0];
}

function currentOwner() {
  return ball.ownerId ? getPlayer(ball.ownerId) : null;
}

function setMessage(message) {
  game.message = message;
  gameMessageElement.textContent = message;
}

function setControlledPlayer(player) {
  if (!player || player.team !== HOME) {
    return;
  }

  game.controlledId = player.id;
}

function resetPositions(possessionTeam) {
  players.forEach((player) => {
    const formation = player.team === HOME ? HOME_FORMATION : AWAY_FORMATION;
    const [x, y] = formation[player.role];
    player.x = x;
    player.y = y;
    player.vx = 0;
    player.vy = 0;
    player.dirX = player.team === HOME ? 1 : -1;
    player.dirY = 0;
    player.hasBall = false;
    player.pokeCooldown = 0;
    player.actionCooldown = 0;
    player.flashTimer = 0;
  });

  const owner = teamPlayers(possessionTeam)[0];
  takePossession(owner, false);

  if (possessionTeam === HOME) {
    setControlledPlayer(owner);
  } else {
    setControlledPlayer(nearestPlayer(HOME, owner.x, owner.y));
  }
}

function resetGame(startImmediately = false) {
  game.score = [0, 0];
  game.timeRemaining = GAME_LENGTH;
  game.goalTimer = 0;
  game.restartTeam = HOME;
  resetPositions(HOME);

  if (startImmediately) {
    game.phase = "playing";
    startOverlay.hidden = true;
    setMessage("Voyagers possession. Use the arrow keys to move.");
    canvas.focus();
  } else {
    game.phase = "ready";
    startOverlay.hidden = false;
    overlayTitle.textContent = "Take the Field";
    overlayCopy.textContent =
      "Control the highlighted Voyager, move the ball, and score before time expires.";
    startButton.textContent = "Start Game";
    setMessage("Press Start Game to begin.");
  }

  updateHud();
}

function startOrResumeGame() {
  if (game.phase === "paused") {
    game.phase = "playing";
    startOverlay.hidden = true;
    setMessage("Game resumed.");
    canvas.focus();
    updateHud();
    return;
  }

  resetGame(true);
}

function takePossession(player, announce = true) {
  players.forEach((candidate) => {
    candidate.hasBall = false;
  });

  player.hasBall = true;
  ball.ownerId = player.id;
  ball.lastTouchTeam = player.team;
  ball.kind = "held";
  ball.vx = 0;
  ball.vy = 0;
  ball.catchDelay = 0;
  ball.ignorePlayerId = null;

  if (player.team === HOME) {
    setControlledPlayer(player);
    if (announce) {
      setMessage("Voyagers possession.");
    }
  } else {
    setControlledPlayer(nearestPlayer(HOME, player.x, player.y));
    if (announce) {
      setMessage("Rivals possession. Close down the ball carrier.");
    }
  }
}

function releaseBall(player, vx, vy, kind) {
  player.hasBall = false;
  ball.ownerId = null;
  ball.x = player.x + player.dirX * 18;
  ball.y = player.y + player.dirY * 18;
  ball.vx = vx;
  ball.vy = vy;
  ball.kind = kind;
  ball.lastTouchTeam = player.team;
  ball.catchDelay = 0.12;
  ball.ignorePlayerId = player.id;
}

function choosePassTarget(player) {
  const teammates = teamPlayers(player.team).filter(
    (candidate) => candidate.id !== player.id,
  );
  let bestTarget = null;
  let bestScore = -Infinity;
  const attackDirection = player.team === HOME ? 1 : -1;

  teammates.forEach((candidate) => {
    const dx = candidate.x - player.x;
    const dy = candidate.y - player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const facingScore = (dx / distance) * player.dirX + (dy / distance) * player.dirY;
    const forwardProgress = dx * attackDirection;
    const score = facingScore * 170 + forwardProgress * 0.45 - distance * 0.12;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  });

  return bestTarget;
}

function passBall(player) {
  if (!player.hasBall || player.actionCooldown > 0) {
    return;
  }

  const target = choosePassTarget(player);
  if (!target) {
    return;
  }

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy) || 1;
  releaseBall(player, (dx / distance) * 440, (dy / distance) * 440, "pass");
  player.actionCooldown = 0.3;

  if (player.team === HOME) {
    setMessage(`Pass toward Voyager ${target.role + 1}.`);
  }
}

function shootBall(player) {
  if (!player.hasBall || player.actionCooldown > 0) {
    return;
  }

  const targetX =
    player.team === HOME ? FIELD.rightGoalLine + 16 : FIELD.leftGoalLine - 16;
  const aimedY = Math.max(
    FIELD.goalTop + 8,
    Math.min(FIELD.goalBottom - 8, player.y + player.dirY * 70),
  );
  const dx = targetX - player.x;
  const dy = aimedY - player.y;
  const distance = Math.hypot(dx, dy) || 1;
  releaseBall(player, (dx / distance) * 620, (dy / distance) * 620, "shot");
  player.actionCooldown = 0.55;

  if (player.team === HOME) {
    setMessage("Shot!");
  }
}

function pokeCheck(player, announce = true) {
  if (player.hasBall || player.pokeCooldown > 0) {
    return;
  }

  const owner = currentOwner();
  if (!owner || owner.team === player.team) {
    if (announce) {
      setMessage("Get close to the ball carrier to poke check.");
    }
    player.pokeCooldown = 0.25;
    return;
  }

  const dx = owner.x - player.x;
  const dy = owner.y - player.y;
  const distance = Math.hypot(dx, dy) || 1;
  const facingDot = (dx / distance) * player.dirX + (dy / distance) * player.dirY;

  if (distance > 54 || facingDot < -0.2) {
    if (announce) {
      setMessage("The ball carrier is out of poke-check range.");
    }
    player.pokeCooldown = 0.3;
    return;
  }

  player.pokeCooldown = 0.65;
  player.flashTimer = 0.16;

  if (Math.random() < 0.72) {
    owner.hasBall = false;
    ball.ownerId = null;
    ball.x = owner.x;
    ball.y = owner.y;
    ball.vx = (dx / distance) * 175;
    ball.vy = (dy / distance) * 175;
    ball.kind = "loose";
    ball.lastTouchTeam = player.team;
    ball.catchDelay = 0.18;
    ball.ignorePlayerId = owner.id;

    if (player.team === HOME) {
      setMessage("Clean poke check! Chase the loose ball.");
    }
  } else if (announce) {
    setMessage("Poke check missed.");
  }
}

function moveToward(player, targetX, targetY, speed, deltaTime) {
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 2) {
    player.vx = 0;
    player.vy = 0;
    return;
  }

  const scale = Math.min(1, distance / 30);
  player.vx = (dx / distance) * speed * scale;
  player.vy = (dy / distance) * speed * scale;
  player.dirX = dx / distance;
  player.dirY = dy / distance;
  player.x += player.vx * deltaTime;
  player.y += player.vy * deltaTime;
  constrainPlayer(player);
}

function constrainPlayer(player) {
  player.x = Math.max(
    FIELD.left + PLAYER_RADIUS,
    Math.min(FIELD.right - PLAYER_RADIUS, player.x),
  );
  player.y = Math.max(
    FIELD.top + PLAYER_RADIUS,
    Math.min(FIELD.bottom - PLAYER_RADIUS, player.y),
  );

  [
    [FIELD.leftGoalLine, FIELD.centerY],
    [FIELD.rightGoalLine, FIELD.centerY],
  ].forEach(([creaseX, creaseY]) => {
    const dx = player.x - creaseX;
    const dy = player.y - creaseY;
    const distance = Math.hypot(dx, dy) || 1;
    const minimumDistance = FIELD.creaseRadius + PLAYER_RADIUS;

    if (distance < minimumDistance) {
      player.x = creaseX + (dx / distance) * minimumDistance;
      player.y = creaseY + (dy / distance) * minimumDistance;
    }
  });
}

function updateControlledPlayer(deltaTime) {
  const player = getPlayer(game.controlledId);
  if (!player) {
    return;
  }

  let horizontal = 0;
  let vertical = 0;

  if (input.held.has("ArrowLeft")) horizontal -= 1;
  if (input.held.has("ArrowRight")) horizontal += 1;
  if (input.held.has("ArrowUp")) vertical -= 1;
  if (input.held.has("ArrowDown")) vertical += 1;

  if (horizontal || vertical) {
    const length = Math.hypot(horizontal, vertical);
    player.dirX = horizontal / length;
    player.dirY = vertical / length;
    player.vx = player.dirX * PLAYER_SPEED;
    player.vy = player.dirY * PLAYER_SPEED;
    player.x += player.vx * deltaTime;
    player.y += player.vy * deltaTime;
    constrainPlayer(player);
  } else {
    player.vx = 0;
    player.vy = 0;
  }

  if (input.pressed.has("KeyA")) {
    if (player.hasBall) {
      passBall(player);
    } else {
      pokeCheck(player);
    }
  }

  if (input.pressed.has("KeyS") && player.hasBall) {
    shootBall(player);
  }
}

function isClosestToLooseBall(player) {
  if (ball.ownerId) {
    return false;
  }

  return nearestPlayer(player.team, ball.x, ball.y)?.id === player.id;
}

function offensiveTarget(player) {
  const direction = player.team === HOME ? 1 : -1;
  const centerOffset = player.role === 0 ? 0 : player.role % 2 ? -115 : 115;
  const depth = player.role < 3 ? 135 : 245;
  const goalLine =
    player.team === HOME ? FIELD.rightGoalLine : FIELD.leftGoalLine;

  return {
    x: goalLine - direction * depth,
    y: FIELD.centerY + centerOffset,
  };
}

function defensiveTarget(player) {
  const opponent = teamPlayers(opposingTeam(player.team))[player.role];
  const ownGoalX =
    player.team === HOME ? FIELD.leftGoalLine : FIELD.rightGoalLine;
  const owner = currentOwner();
  const mark =
    owner && owner.team !== player.team && owner.id === opponent.id
      ? owner
      : opponent;
  const pressure = mark === owner ? 0.72 : 0.86;

  return {
    x: mark.x * pressure + ownGoalX * (1 - pressure),
    y: mark.y * pressure + FIELD.centerY * (1 - pressure),
  };
}

function updateAiPlayer(player, deltaTime) {
  if (player.id === game.controlledId) {
    return;
  }

  const owner = currentOwner();

  if (!owner && isClosestToLooseBall(player)) {
    moveToward(player, ball.x, ball.y, AI_SPEED * 1.2, deltaTime);
    return;
  }

  if (owner?.id === player.id) {
    const opponentGoalX =
      player.team === HOME ? FIELD.rightGoalLine : FIELD.leftGoalLine;
    moveToward(player, opponentGoalX, FIELD.centerY, AI_SPEED * 0.92, deltaTime);

    const goalDistance = Math.abs(opponentGoalX - player.x);
    const pressure = nearestPlayer(opposingTeam(player.team), player.x, player.y);

    if (
      goalDistance < 245 &&
      Math.abs(player.y - FIELD.centerY) < 145 &&
      Math.random() < deltaTime * 1.25
    ) {
      shootBall(player);
    } else if (
      pressure &&
      distanceBetween(player, pressure) < 70 &&
      Math.random() < deltaTime * 1.2
    ) {
      passBall(player);
    }
    return;
  }

  if (owner?.team === player.team) {
    const target = offensiveTarget(player);
    moveToward(player, target.x, target.y, AI_SPEED, deltaTime);
    return;
  }

  const target = defensiveTarget(player);
  moveToward(player, target.x, target.y, AI_SPEED, deltaTime);

  if (
    owner &&
    owner.team !== player.team &&
    distanceBetween(player, owner) < 48 &&
    Math.random() < deltaTime * 1.9
  ) {
    pokeCheck(player, false);
  }
}

function resolvePlayerCollisions() {
  for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < players.length;
      secondIndex += 1
    ) {
      const first = players[firstIndex];
      const second = players[secondIndex];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy) || 1;
      const minimumDistance = PLAYER_RADIUS * 2 + 2;

      if (distance < minimumDistance) {
        const overlap = (minimumDistance - distance) / 2;
        const normalX = dx / distance;
        const normalY = dy / distance;
        first.x -= normalX * overlap;
        first.y -= normalY * overlap;
        second.x += normalX * overlap;
        second.y += normalY * overlap;
        constrainPlayer(first);
        constrainPlayer(second);
      }
    }
  }
}

function checkGoal() {
  const insideGoal = ball.y > FIELD.goalTop && ball.y < FIELD.goalBottom;

  if (
    insideGoal &&
    ball.x >= FIELD.rightGoalLine &&
    ball.vx > 0 &&
    ball.lastTouchTeam === HOME
  ) {
    scoreGoal(HOME);
    return true;
  }

  if (
    insideGoal &&
    ball.x <= FIELD.leftGoalLine &&
    ball.vx < 0 &&
    ball.lastTouchTeam === AWAY
  ) {
    scoreGoal(AWAY);
    return true;
  }

  return false;
}

function scoreGoal(team) {
  game.score[team] += 1;
  game.phase = "goal";
  game.goalTimer = 1.8;
  game.restartTeam = opposingTeam(team);
  ball.vx = 0;
  ball.vy = 0;
  updateHud();
  setMessage(
    team === HOME
      ? "Voyagers goal! Rivals receive the ball for the clear."
      : "Rivals goal. Voyagers receive the ball for the clear.",
  );
}

function awardOutOfBoundsPossession() {
  const receivingTeam = opposingTeam(ball.lastTouchTeam);
  const recipient = nearestPlayer(
    receivingTeam,
    Math.max(FIELD.left, Math.min(FIELD.right, ball.x)),
    Math.max(FIELD.top, Math.min(FIELD.bottom, ball.y)),
  );

  takePossession(recipient, false);
  setMessage(
    receivingTeam === HOME
      ? "Out of bounds. Voyagers possession."
      : "Out of bounds. Rivals possession.",
  );
}

function updateBall(deltaTime) {
  const owner = currentOwner();

  if (owner) {
    ball.x = owner.x + owner.dirX * 18;
    ball.y = owner.y + owner.dirY * 18;
    return;
  }

  ball.x += ball.vx * deltaTime;
  ball.y += ball.vy * deltaTime;
  ball.catchDelay = Math.max(0, ball.catchDelay - deltaTime);

  const drag = Math.pow(ball.kind === "shot" ? 0.82 : 0.48, deltaTime);
  ball.vx *= drag;
  ball.vy *= drag;

  if (checkGoal()) {
    return;
  }

  if (
    ball.x < FIELD.left ||
    ball.x > FIELD.right ||
    ball.y < FIELD.top ||
    ball.y > FIELD.bottom
  ) {
    awardOutOfBoundsPossession();
    return;
  }

  const candidates = [...players].sort(
    (first, second) =>
      Math.hypot(first.x - ball.x, first.y - ball.y) -
      Math.hypot(second.x - ball.x, second.y - ball.y),
  );

  const receiver = candidates.find((player) => {
    if (ball.catchDelay > 0 && player.id === ball.ignorePlayerId) {
      return false;
    }

    return Math.hypot(player.x - ball.x, player.y - ball.y) < PLAYER_RADIUS + 7;
  });

  if (receiver) {
    takePossession(receiver);
  }
}

function updateTimers(deltaTime) {
  players.forEach((player) => {
    player.pokeCooldown = Math.max(0, player.pokeCooldown - deltaTime);
    player.actionCooldown = Math.max(0, player.actionCooldown - deltaTime);
    player.flashTimer = Math.max(0, player.flashTimer - deltaTime);
  });
}

function endGame() {
  game.phase = "gameover";
  startOverlay.hidden = false;
  overlayTitle.textContent =
    game.score[HOME] === game.score[AWAY]
      ? "Game Tied"
      : game.score[HOME] > game.score[AWAY]
        ? "Voyagers Win!"
        : "Rivals Win";
  overlayCopy.textContent = `Final score: Voyagers ${game.score[HOME]}, Rivals ${game.score[AWAY]}.`;
  startButton.textContent = "Play Again";
  setMessage("Game over. Select Play Again or press R for another game.");
  updateHud();
}

function update(deltaTime) {
  if (input.pressed.has("KeyR")) {
    resetGame(true);
    input.pressed.clear();
    return;
  }

  if (input.pressed.has("KeyP")) {
    if (game.phase === "playing") {
      game.phase = "paused";
      startOverlay.hidden = false;
      overlayTitle.textContent = "Paused";
      overlayCopy.textContent = "Take a break, then return to the field.";
      startButton.textContent = "Resume";
      setMessage("Game paused.");
      updateHud();
    } else if (game.phase === "paused") {
      startOrResumeGame();
    }
  }

  if (game.phase === "goal") {
    game.goalTimer -= deltaTime;
    if (game.goalTimer <= 0) {
      resetPositions(game.restartTeam);
      game.phase = "playing";
      updateHud();
    }
    input.pressed.clear();
    return;
  }

  if (game.phase !== "playing") {
    input.pressed.clear();
    return;
  }

  game.timeRemaining = Math.max(0, game.timeRemaining - deltaTime);
  if (game.timeRemaining <= 0) {
    endGame();
    input.pressed.clear();
    return;
  }

  updateTimers(deltaTime);
  updateControlledPlayer(deltaTime);
  players.forEach((player) => updateAiPlayer(player, deltaTime));
  resolvePlayerCollisions();
  updateBall(deltaTime);
  updateHud();
  input.pressed.clear();
}

function drawPixelText(text, x, y, color, size = 14, alignment = "center") {
  context.save();
  context.fillStyle = color;
  context.font = `bold ${size}px "Courier New", monospace`;
  context.textAlign = alignment;
  context.textBaseline = "middle";
  context.fillText(text, x, y);
  context.restore();
}

function drawField() {
  context.fillStyle = "#163b2b";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const stripeWidth = (FIELD.right - FIELD.left) / 12;
  for (let index = 0; index < 12; index += 1) {
    context.fillStyle =
      index % 2 === 0 ? COLORS.fieldDark : COLORS.fieldLight;
    context.fillRect(
      FIELD.left + index * stripeWidth,
      FIELD.top,
      stripeWidth + 1,
      FIELD.bottom - FIELD.top,
    );
  }

  context.strokeStyle = COLORS.line;
  context.lineWidth = 4;
  context.strokeRect(
    FIELD.left,
    FIELD.top,
    FIELD.right - FIELD.left,
    FIELD.bottom - FIELD.top,
  );

  context.beginPath();
  context.moveTo(FIELD.centerX, FIELD.top);
  context.lineTo(FIELD.centerX, FIELD.bottom);
  context.stroke();

  context.beginPath();
  context.arc(FIELD.centerX, FIELD.centerY, 62, 0, Math.PI * 2);
  context.stroke();

  [FIELD.leftGoalLine, FIELD.rightGoalLine].forEach((goalLine) => {
    context.beginPath();
    context.moveTo(goalLine, FIELD.top);
    context.lineTo(goalLine, FIELD.bottom);
    context.stroke();

    context.save();
    context.setLineDash([8, 7]);
    context.beginPath();
    context.arc(goalLine, FIELD.centerY, FIELD.creaseRadius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  });

  drawGoal(FIELD.leftGoalLine, -1);
  drawGoal(FIELD.rightGoalLine, 1);

  drawPixelText("8 YDS", (FIELD.left + FIELD.leftGoalLine) / 2, 54, COLORS.white, 11);
  drawPixelText(
    "8 YDS",
    (FIELD.right + FIELD.rightGoalLine) / 2,
    54,
    COLORS.white,
    11,
  );
}

function drawGoal(goalLine, direction) {
  const netDepth = 28 * direction;
  const top = FIELD.goalTop;
  const height = FIELD.goalBottom - FIELD.goalTop;

  context.save();
  context.strokeStyle = "#f4c95d";
  context.lineWidth = 5;
  context.strokeRect(
    direction < 0 ? goalLine + netDepth : goalLine,
    top,
    Math.abs(netDepth),
    height,
  );

  context.strokeStyle = "rgba(248, 250, 252, 0.55)";
  context.lineWidth = 1;
  for (let y = top + 11; y < top + height; y += 11) {
    context.beginPath();
    context.moveTo(goalLine, y);
    context.lineTo(goalLine + netDepth, y);
    context.stroke();
  }
  context.restore();
}

function drawStick(player) {
  const stickLength = 25;
  const startX = player.x + player.dirX * 5;
  const startY = player.y + player.dirY * 5;
  const endX = player.x + player.dirX * stickLength;
  const endY = player.y + player.dirY * stickLength;

  context.save();
  context.strokeStyle = "#d6dbe2";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.fillStyle = COLORS.white;
  context.fillRect(endX - 4, endY - 4, 8, 8);
  context.restore();
}

function drawPlayer(player) {
  const isControlled = player.id === game.controlledId;
  const primary = player.team === HOME ? COLORS.home : COLORS.away;
  const secondary =
    player.team === HOME ? COLORS.homeLight : COLORS.awayLight;

  context.save();
  context.translate(Math.round(player.x), Math.round(player.y));

  context.fillStyle = COLORS.shadow;
  context.fillRect(-12, 10, 24, 8);

  if (isControlled) {
    context.strokeStyle = COLORS.ball;
    context.lineWidth = 4;
    context.strokeRect(-18, -18, 36, 36);
    context.fillStyle = COLORS.ball;
    context.beginPath();
    context.moveTo(0, -29);
    context.lineTo(-8, -19);
    context.lineTo(8, -19);
    context.closePath();
    context.fill();
  }

  context.fillStyle = player.flashTimer > 0 ? COLORS.white : primary;
  context.fillRect(-11, -10, 22, 22);
  context.fillStyle = secondary;
  context.fillRect(-8, -7, 16, 7);
  context.fillStyle = "#e7b07a";
  context.fillRect(-7, -17, 14, 8);
  context.fillStyle = COLORS.navy;
  context.fillRect(-9, -19, 18, 4);
  context.fillStyle = "#172033";
  context.fillRect(-10, 12, 7, 6);
  context.fillRect(3, 12, 7, 6);

  context.restore();
  drawStick(player);

  if (player.hasBall) {
    context.fillStyle = COLORS.ball;
    context.fillRect(
      Math.round(player.x + player.dirX * 25 - BALL_RADIUS),
      Math.round(player.y + player.dirY * 25 - BALL_RADIUS),
      BALL_RADIUS * 2,
      BALL_RADIUS * 2,
    );
  }
}

function drawBall() {
  if (ball.ownerId) {
    return;
  }

  context.fillStyle = COLORS.shadow;
  context.fillRect(
    Math.round(ball.x - BALL_RADIUS + 3),
    Math.round(ball.y - BALL_RADIUS + 5),
    BALL_RADIUS * 2,
    BALL_RADIUS * 2,
  );
  context.fillStyle = COLORS.ball;
  context.fillRect(
    Math.round(ball.x - BALL_RADIUS),
    Math.round(ball.y - BALL_RADIUS),
    BALL_RADIUS * 2,
    BALL_RADIUS * 2,
  );
}

function draw() {
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, WIDTH, HEIGHT);
  drawField();
  players.forEach(drawPlayer);
  drawBall();

  if (game.phase === "paused") {
    context.fillStyle = "rgba(5, 7, 11, 0.55)";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    drawPixelText("PAUSED", WIDTH / 2, HEIGHT / 2, COLORS.white, 42);
  }
}

function updateHud() {
  homeScoreElement.textContent = game.score[HOME];
  awayScoreElement.textContent = game.score[AWAY];
  const totalSeconds = Math.ceil(game.timeRemaining);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  gameTimeElement.textContent = `${minutes}:${seconds}`;

  const labels = {
    ready: "Ready",
    playing: currentOwner()?.team === HOME ? "Voyagers Ball" : "Rivals Ball",
    paused: "Paused",
    goal: "Goal",
    gameover: "Final",
  };
  gameStateElement.textContent = labels[game.phase];
}

function gameLoop(frameTime) {
  const deltaTime = Math.min(0.034, (frameTime - lastFrameTime) / 1000);
  lastFrameTime = frameTime;
  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}

const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyS",
  "KeyP",
  "KeyR",
]);

window.addEventListener("keydown", (event) => {
  if (!GAME_KEYS.has(event.code)) {
    return;
  }

  event.preventDefault();
  input.held.add(event.code);

  if (!event.repeat) {
    input.pressed.add(event.code);
  }
});

window.addEventListener("keyup", (event) => {
  if (GAME_KEYS.has(event.code)) {
    event.preventDefault();
    input.held.delete(event.code);
  }
});

window.addEventListener("blur", () => {
  input.held.clear();
  input.pressed.clear();
});

startButton.addEventListener("click", startOrResumeGame);

createPlayers();
resetGame(false);
requestAnimationFrame(gameLoop);
