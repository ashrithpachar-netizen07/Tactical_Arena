import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const SIZE = 8, T = 70;
const INFO = { knight: { i: '🛡️', hp: 10, mv: 3, r: 1 }, archer: { i: '🏹', hp: 6, mv: 2, r: 3 }, mage: { i: '🔮', hp: 5, mv: 2, r: 2 } };
const TERRAIN = { rock: '🪨', lava: '🌋', heal: '💚' };
const CSS = `
body{background:radial-gradient(circle at 50% 0%,#2b1b5a,#0b0b1a 70%);min-height:100vh}
.tile{position:absolute;width:${T - 2}px;height:${T - 2}px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:26px;transition:box-shadow .2s}
.mv{box-shadow:inset 0 0 0 3px #4af,0 0 14px #4af8;cursor:pointer;animation:pulse 1.2s infinite}
.atk{box-shadow:inset 0 0 0 3px #f44,0 0 16px #f44a;cursor:pointer;animation:pulse .8s infinite}
.unit{position:absolute;width:${T - 2}px;height:${T - 2}px;display:flex;flex-direction:column;align-items:center;justify-content:center;
 font-size:32px;transition:transform .4s cubic-bezier(.3,1.4,.5,1);z-index:2;cursor:pointer;border-radius:50%;pointer-events:auto}
.unit.me{filter:drop-shadow(0 0 8px #4af)}.unit.foe{filter:drop-shadow(0 0 8px #f55)}
.unit.sel{animation:bob .8s infinite}.hit{animation:shake .35s}
.hpbar{width:46px;height:6px;background:#0008;border-radius:3px;overflow:hidden;margin-top:2px}
.hpbar>div{height:100%;transition:width .4s}
.float{position:absolute;z-index:5;font-weight:800;font-size:24px;pointer-events:none;animation:rise 1s forwards;text-shadow:0 2px 4px #000}
.btn{background:linear-gradient(135deg,#7b4bff,#e04bff);border:0;color:#fff;padding:10px 22px;border-radius:999px;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 4px 14px #a04bff77}
.btn:disabled{opacity:.35;cursor:default}
@keyframes pulse{50%{opacity:.65}}@keyframes bob{50%{margin-top:-6px}}
@keyframes shake{25%{margin-left:-6px}75%{margin-left:6px}}
@keyframes rise{from{transform:translateY(0);opacity:1}to{transform:translateY(-44px);opacity:0}}
`;

function moveTiles(g, u) {
  const blocked = new Set([...g.units.filter(o => o.hp > 0).map(o => `${o.x},${o.y}`), ...g.terrain.filter(t => t.type === 'rock').map(t => `${t.x},${t.y}`)]);
  const seen = new Set([`${u.x},${u.y}`]), out = [];
  let fr = [[u.x, u.y]];
  for (let s = 0; s < INFO[u.type].mv; s++) {
    const nx = [];
    for (const [x, y] of fr) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = y + dy, k = `${a},${b}`;
      if (a < 0 || b < 0 || a >= SIZE || b >= SIZE || seen.has(k) || blocked.has(k)) continue;
      seen.add(k); nx.push([a, b]); out.push(k);
    }
    fr = nx;
  }
  return out;
}

export default function App() {
  const socket = useMemo(() => io(SERVER), []);
  const [me, setMe] = useState(null), [game, setGame] = useState(null), [sel, setSel] = useState(null);
  const [msg, setMsg] = useState(''), [code, setCode] = useState(''), [name, setName] = useState(''), [board, setBoard] = useState([]), [secs, setSecs] = useState(60);
  const [floats, setFloats] = useState([]), [hit, setHit] = useState({});
  const prev = useRef({});
  useEffect(() => { fetch(SERVER + '/leaderboard').then(r => r.json()).then(setBoard).catch(() => {}); }, []);

  useEffect(() => {
    socket.on('state', s => {
      const fl = [], h = {};
      s.units.forEach(u => {
        const p = prev.current[u.id];
        if (p !== undefined && u.hp !== p) {
          const d = u.hp - p, id = Math.random();
          fl.push({ id, x: u.x, y: u.y, text: d > 0 ? `+${d}` : `${d}`, c: d > 0 ? '#4f8' : '#ff5' });
          if (d < 0) h[u.id] = true;
          setTimeout(() => setFloats(f => f.filter(q => q.id !== id)), 1000);
        }
        prev.current[u.id] = u.hp;
      });
      setFloats(f => [...f, ...fl]); setHit(h); setTimeout(() => setHit({}), 400);
      setGame(s); setSecs(Math.ceil(s.msLeft / 1000));
    });
    socket.on('opponent_left', () => setMsg('Opponent left.'));
    return () => socket.off();
  }, [socket]);
  useEffect(() => { const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);

  const act = a => socket.emit('action', a, r => setMsg(r?.error || ''));
  const wrap = c => <div style={{ color: '#eee', fontFamily: 'system-ui', padding: 30, textAlign: 'center' }}><style>{CSS}</style>{c}</div>;

  if (!me) return wrap(<>
    <h1 style={{ fontSize: 56, margin: '40px 0 4px', background: 'linear-gradient(90deg,#8af,#e4f)', WebkitBackgroundClip: 'text', color: 'transparent' }}>⚔️ TACTICS ARENA</h1>
    <p style={{ opacity: .7 }}>Outsmart your rival. Mind the lava.</p>
    <p><input placeholder="Your name" maxLength={16} value={name} onChange={e => setName(e.target.value)} style={{ padding: 10, borderRadius: 8, border: 0, textAlign: 'center' }} /></p>
    <button className="btn" onClick={() => socket.emit('create_room', name, setMe)}>Create Room</button>
    <p><input placeholder="CODE" maxLength={4} value={code} onChange={e => setCode(e.target.value)} style={{ padding: 10, borderRadius: 8, border: 0, width: 90, textAlign: 'center', textTransform: 'uppercase' }} />{' '}
      <button className="btn" onClick={() => socket.emit('join_room', code, name, r => r.error ? setMsg(r.error) : setMe(r))}>Join</button></p>
    <p style={{ color: 'salmon' }}>{msg}</p>
    {board.length > 0 && <div><h3>🏆 Leaderboard</h3>{board.map(p => <div key={p.name}>{p.name} — {p.wins || 0}W / {p.losses || 0}L</div>)}</div>}</>);
  if (!game) return wrap(<><h2>Room code</h2><div style={{ fontSize: 64, letterSpacing: 10, fontWeight: 800 }}>{me.code}</div><p>Waiting for opponent…</p></>);

  const vy = y => me.player === 0 ? y : SIZE - 1 - y;
  const alive = game.units.filter(u => u.hp > 0);
  const mine = game.turn === me.player && game.winner === null;
  const su = alive.find(u => u.id === sel && u.owner === me.player);
  const mv = new Set(su && mine && !su.moved && game.ap > 0 ? moveTiles(game, su) : []);
  const inRange = o => su && mine && !su.attacked && game.ap > 0 && o.owner !== me.player && Math.abs(o.x - su.x) + Math.abs(o.y - su.y) <= INFO[su.type].r;
  const pos = (x, y) => ({ left: x * T, top: vy(y) * T });

  const tileClick = (x, y) => mv.has(`${x},${y}`) && act({ type: 'move', unitId: su.id, x, y });
  const unitClick = u => u.owner === me.player ? setSel(u.id) : su && act({ type: 'attack', unitId: su.id, targetId: u.id });

  return wrap(<>
    <h2 style={{ margin: 4 }}>{game.winner !== null ? (game.winner === me.player ? '🏆 VICTORY!' : '💀 DEFEATED')
      : mine ? `🔥 YOUR TURN · ${game.ap} AP` : "⏳ Opponent's turn"}</h2>
    <div style={{ width: SIZE * T, height: 8, margin: '0 auto 10px', background: '#fff2', borderRadius: 4 }}>
      <div style={{ width: `${(secs / 60) * 100}%`, height: '100%', borderRadius: 4, background: secs < 10 ? '#f44' : '#7b4bff', transition: 'width 1s linear' }} /></div>
    <div style={{ position: 'relative', width: SIZE * T, height: SIZE * T, margin: '0 auto', padding: 10, borderRadius: 18, background: '#ffffff0d', boxSizing: 'content-box' }}>
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const x = i % SIZE, y = Math.floor(i / SIZE), tr = game.terrain.find(t => t.x === x && t.y === y);
        const o = alive.find(u => u.x === x && u.y === y);
        return <div key={i} className={`tile ${mv.has(`${x},${y}`) ? 'mv' : ''} ${o && inRange(o) ? 'atk' : ''}`}
          onClick={() => o && inRange(o) ? unitClick(o) : tileClick(x, y)}
          style={{ ...pos(x, y), margin: 10, background: tr?.type === 'lava' ? '#5a1a10' : tr?.type === 'heal' ? '#134a2b' : (x + y) % 2 ? '#2a2548' : '#352f5a' }}>{tr && TERRAIN[tr.type]}</div>;
      })}
      {alive.map(u => <div key={u.id} className={`unit ${u.owner === me.player ? 'me' : 'foe'} ${u.id === sel ? 'sel' : ''} ${hit[u.id] ? 'hit' : ''}`}
        onClick={() => unitClick(u)} style={{ left: 0, top: 0, margin: 10, transform: `translate(${u.x * T}px,${vy(u.y) * T}px)` }}>
        <span style={{ opacity: u.owner === me.player && (u.moved && u.attacked) ? .5 : 1 }}>{INFO[u.type].i}</span>
        <div className="hpbar"><div style={{ width: `${(u.hp / INFO[u.type].hp) * 100}%`, background: u.hp / INFO[u.type].hp > .5 ? '#4f8' : '#f84' }} /></div></div>)}
      {floats.map(f => <div key={f.id} className="float" style={{ ...pos(f.x, f.y), margin: 10, left: f.x * T + 20, color: f.c }}>{f.text}</div>)}
    </div>
    <p style={{ minHeight: 22, color: 'salmon' }}>{msg || (su ? `${su.type}: blue = move, red = attack` : 'Select one of your units')}</p>
    <button className="btn" disabled={!mine} onClick={() => { socket.emit('end_turn'); setSel(null); }}>End Turn</button>
    <p style={{ opacity: .6, fontSize: 13 }}>🪨 blocks · 🌋 −2 HP at turn start · 💚 +2 HP at turn start</p>
  </>);
}
