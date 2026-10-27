import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { MongoClient } from 'mongodb';
import { createGame, applyAction, endTurn, TURN_MS } from './game.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map(); // code -> { players:[socketId,socketId], game, timer, endsAt }

app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
let replays = null, players = null;
if (process.env.MONGO_URI) {
  new MongoClient(process.env.MONGO_URI).connect()
    .then(c => { replays = c.db('arena').collection('replays'); players = c.db('arena').collection('players'); console.log('Mongo connected'); })
    .catch(e => console.error('Mongo failed, replays disabled:', e.message));
}

app.get('/', (req, res) => res.send('Arena server running'));
app.get('/leaderboard', async (req, res) => res.json(players ? await players.find().sort({ wins: -1 }).limit(10).toArray() : []));
app.get('/replays/:code', async (req, res) => res.json(replays ? await replays.find({ code: req.params.code.toUpperCase() }).toArray() : []));

const code = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function broadcast(room, roomCode) {
  const state = { ...room.game, msLeft: Math.max(0, room.endsAt - Date.now()) };
  delete state.log;
  io.to(roomCode).emit('state', state);
}

function startTimer(room, roomCode) {
  clearTimeout(room.timer);
  room.endsAt = Date.now() + TURN_MS;
  room.timer = setTimeout(() => { // server-authoritative auto end-turn
    if (room.game.winner !== null) return;
    endTurn(room.game); startTimer(room, roomCode); broadcast(room, roomCode);
  }, TURN_MS);
}

function finishIfOver(room, roomCode) {
  if (room.game.winner === null) return;
  clearTimeout(room.timer);
  const w = room.game.winner, loser = 1 - w;
  players?.updateOne({ name: room.names[w] }, { $inc: { wins: 1 } }, { upsert: true }).catch(() => {});
  players?.updateOne({ name: room.names[loser] }, { $inc: { losses: 1 } }, { upsert: true }).catch(() => {});
  replays?.insertOne({ code: roomCode, winner: room.game.winner, log: room.game.log, at: new Date() }).catch(() => {});
}

io.on('connection', socket => {
  socket.on('create_room', (name, cb) => {
    const c = code();
    rooms.set(c, { names: [String(name || 'Player 1').slice(0, 16), 'Player 2'], players: [socket.id, null], game: createGame(), timer: null, endsAt: 0 });
    socket.join(c); socket.data = { room: c, player: 0 };
    cb({ code: c, player: 0 });
  });

  socket.on('join_room', (c, name, cb) => {
    const room = rooms.get(c?.toUpperCase());
    if (!room || room.players[1]) return cb({ error: 'Room not found or full' });
    c = c.toUpperCase(); room.players[1] = socket.id; room.names[1] = String(name || 'Player 2').slice(0, 16);
    socket.join(c); socket.data = { room: c, player: 1 };
    cb({ code: c, player: 1 });
    startTimer(room, c); broadcast(room, c);
  });

  socket.on('action', (a, cb) => {
    const room = rooms.get(socket.data?.room);
    if (!room || !room.players[1]) return cb?.({ error: 'Game not started' });
    const res = applyAction(room.game, socket.data.player, a);
    cb?.(res);
    if (res.ok) { broadcast(room, socket.data.room); finishIfOver(room, socket.data.room); }
  });

  socket.on('end_turn', () => {
    const room = rooms.get(socket.data?.room);
    if (!room || room.game.turn !== socket.data.player || room.game.winner !== null) return;
    endTurn(room.game); startTimer(room, socket.data.room); broadcast(room, socket.data.room);
  });

  socket.on('disconnect', () => {
    const c = socket.data?.room; if (!c) return;
    io.to(c).emit('opponent_left');
    clearTimeout(rooms.get(c)?.timer); rooms.delete(c);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server on :' + PORT));
