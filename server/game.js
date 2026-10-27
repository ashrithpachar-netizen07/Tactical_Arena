export const SIZE = 8, AP = 2, TURN_MS = 60000;
export const TYPES = {
  knight: { hp: 10, move: 3, range: 1, dmg: 4 },
  archer: { hp: 6, move: 2, range: 3, dmg: 3 },
  mage:   { hp: 5, move: 2, range: 2, dmg: 5 },
};
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function createGame() {
  const units = [];
  ['knight', 'archer', 'mage'].forEach((t, i) => {
    const x = 2 + i * 2;
    units.push({ id: `p0-${i}`, owner: 0, type: t, x, y: 0, hp: TYPES[t].hp, moved: false, attacked: false });
    units.push({ id: `p1-${i}`, owner: 1, type: t, x, y: SIZE - 1, hp: TYPES[t].hp, moved: false, attacked: false });
  });
  return { units, terrain: makeTerrain(), turn: 0, ap: AP, winner: null, log: [] };
}

// Mirrored random terrain so it's fair: rock blocks, lava hurts (-2), heal restores (+2) at turn start
function makeTerrain() {
  const used = new Set(), out = [];
  const place = (type, n) => {
    while (n > 0) {
      const x = Math.floor(Math.random() * SIZE), y = 2 + Math.floor(Math.random() * 2), k = `${x},${y}`;
      if (used.has(k)) continue;
      used.add(k); n--;
      out.push({ x, y, type }, { x, y: SIZE - 1 - y, type });
    }
  };
  place('rock', 3); place('lava', 1); place('heal', 1);
  return out;
}

// BFS: can unit reach (tx,ty) within `max` steps without crossing other units?
function reachable(g, u, tx, ty, max) {
  const seen = new Set([`${u.x},${u.y}`]);
  let frontier = [[u.x, u.y]];
  for (let step = 0; step < max; step++) {
    const next = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen.has(k)) continue;
        if (g.units.some(o => o.hp > 0 && o.x === nx && o.y === ny)) continue;
        if (g.terrain.some(t => t.type === 'rock' && t.x === nx && t.y === ny)) continue;
        if (nx === tx && ny === ty) return true;
        seen.add(k); next.push([nx, ny]);
      }
    }
    frontier = next;
  }
  return false;
}

export function applyAction(g, player, a) {
  if (g.winner !== null) return { error: 'Game over' };
  if (g.turn !== player) return { error: 'Not your turn' };
  if (g.ap < 1) return { error: 'No AP left' };
  const u = g.units.find(u => u.id === a.unitId && u.hp > 0);
  if (!u || u.owner !== player) return { error: 'Invalid unit' };

  if (a.type === 'move') {
    if (u.moved) return { error: 'Unit already moved' };
    if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) return { error: 'Bad target' };
    if (!reachable(g, u, a.x, a.y, TYPES[u.type].move)) return { error: 'Out of movement range' };
    g.log.push({ t: Date.now(), player, type: 'move', unitId: u.id, from: [u.x, u.y], to: [a.x, a.y] });
    u.x = a.x; u.y = a.y; u.moved = true; g.ap--;
  } else if (a.type === 'attack') {
    if (u.attacked) return { error: 'Unit already attacked' };
    const t = g.units.find(o => o.id === a.targetId && o.hp > 0);
    if (!t || t.owner === player) return { error: 'Invalid target' };
    if (dist(u, t) > TYPES[u.type].range) return { error: 'Target out of range' };
    t.hp -= TYPES[u.type].dmg; u.attacked = true; g.ap--;
    g.log.push({ t: Date.now(), player, type: 'attack', unitId: u.id, targetId: t.id, dmg: TYPES[u.type].dmg });
    if (!g.units.some(o => o.owner === t.owner && o.hp > 0)) g.winner = player;
  } else return { error: 'Unknown action' };
  return { ok: true };
}

export function endTurn(g) {
  g.turn = 1 - g.turn; g.ap = AP;
  g.units.forEach(u => { if (u.owner === g.turn) { u.moved = false; u.attacked = false; } });
  g.log.push({ t: Date.now(), type: 'end_turn', next: g.turn });
  for (const u of g.units.filter(u => u.owner === g.turn && u.hp > 0)) {
    const tr = g.terrain.find(t => t.x === u.x && t.y === u.y);
    if (tr?.type === 'lava') u.hp -= 2;
    if (tr?.type === 'heal') u.hp = Math.min(TYPES[u.type].hp, u.hp + 2);
  }
  if (!g.units.some(u => u.owner === g.turn && u.hp > 0)) g.winner = 1 - g.turn;
}
