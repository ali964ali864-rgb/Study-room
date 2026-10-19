const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

function makeRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function getRoom(code) {
  return rooms.get(String(code || "").toUpperCase());
}

function roomState(room) {
  return {
    code: room.code,
    type: room.type,
    users: [...room.users.values()].map(u => ({
      id: u.id,
      name: u.name,
      status: u.status || "studying",
      character: u.character || null
    })),
    timer: room.timer,
    tasks: room.tasks,
    sessionsCompleted: room.sessionsCompleted
  };
}
function broadcastState(code) {
  const room = getRoom(code);
  if (room) io.to(code).emit("room-state", roomState(room));
}

function stopTimer(room) {
  if (room.interval) clearInterval(room.interval);
  room.interval = null;
}

function startTimer(room) {
  stopTimer(room);
  room.timer.running = true;
  room.timer.endsAt = Date.now() + room.timer.remaining * 1000;

  room.interval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((room.timer.endsAt - Date.now()) / 1000));
    room.timer.remaining = remaining;

    if (remaining <= 0) {
      stopTimer(room);
      room.timer.running = false;
      room.timer.remaining = room.timer.phase === "study"
        ? room.timer.breakMinutes * 60
        : room.timer.studyMinutes * 60;
      const finishedPhase = room.timer.phase;
      if (finishedPhase === "study") {
        room.sessionsCompleted += 1;
        io.to(room.code).emit("session-completed", room.sessionsCompleted);
      }
      room.timer.phase = finishedPhase === "study" ? "break" : "study";
      io.to(room.code).emit("timer-finished", { phase: room.timer.phase });
    }

    io.to(room.code).emit("timer", room.timer);
  }, 1000);
}

function createRoom(code, type="normal") {
  return {
    code,
    type,
    users: new Map(),
    timer: {
      studyMinutes: 50,
      breakMinutes: 10,
      phase: "study",
      remaining: 50 * 60,
      running: false,
      endsAt: null
    },
    tasks: [],
    sessionsCompleted: 0,
    interval: null
  };
}

io.on("connection", socket => {
  socket.on("create-room", ({ name, type }, reply) => {
    const code = makeRoomCode();
    const room = createRoom(code,type);
    rooms.set(code, room);
    joinRoom(socket, room, name, reply);
  });

  socket.on("join-room", ({ code, name }, reply) => {
    const room = getRoom(code);
    if (!room) return reply?.({ ok: false, error: "Room not found." });
    joinRoom(socket, room, name, reply);
  });

  socket.on("send-message", ({ text }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room || !socket.data.name) return;
    const clean = String(text || "").trim().slice(0, 500);
    if (!clean) return;
    io.to(code).emit("message", {
      id: crypto.randomUUID(),
      name: socket.data.name,
      text: clean,
      time: Date.now()
    });
  });

  socket.on("timer-action", ({ action }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    if (action === "start") {
      if (!room.timer.running) startTimer(room);
    } else if (action === "pause") {
      if (room.timer.running) {
        room.timer.remaining = Math.max(0, Math.ceil((room.timer.endsAt - Date.now()) / 1000));
        stopTimer(room);
        room.timer.running = false;
        room.timer.endsAt = null;
      }
    } else if (action === "reset") {
      stopTimer(room);
      room.timer.running = false;
      room.timer.endsAt = null;
      room.timer.phase = "study";
      room.timer.remaining = room.timer.studyMinutes * 60;
    } else if (action === "skip") {
      stopTimer(room);
      room.timer.running = false;
      room.timer.endsAt = null;
      room.timer.phase = room.timer.phase === "study" ? "break" : "study";
      room.timer.remaining =
        (room.timer.phase === "study" ? room.timer.studyMinutes : room.timer.breakMinutes) * 60;
    }

    broadcastState(room.code);
    io.to(room.code).emit("timer", room.timer);
  });

  socket.on("set-settings", ({ studyMinutes, breakMinutes }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.timer.running) return;

    const study = Math.min(180, Math.max(1, Number(studyMinutes) || 50));
    const brk = Math.min(60, Math.max(1, Number(breakMinutes) || 10));

    room.timer.studyMinutes = study;
    room.timer.breakMinutes = brk;
    room.timer.phase = "study";
    room.timer.remaining = study * 60;
    broadcastState(room.code);
    io.to(room.code).emit("timer", room.timer);
  });



  socket.on("add-task", ({ text }, reply) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const clean = String(text || "").trim().slice(0, 120);
    if (!clean) return reply?.({ ok: false, error: "Task is empty." });
    if (room.tasks.length >= 20) return reply?.({ ok: false, error: "Room task limit reached." });
    room.tasks.push({ id: crypto.randomUUID(), text: clean, completed: false });
    broadcastState(room.code);
    reply?.({ ok: true });
  });

  socket.on("toggle-task", ({ id }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const task = room.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    broadcastState(room.code);
  });

  socket.on("delete-task", ({ id }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    room.tasks = room.tasks.filter(t => t.id !== id);
    broadcastState(room.code);
  });
socket.on("select-character", ({ character }, reply) => {
  const room = getRoom(socket.data.roomCode);
  if (!room || room.type !== "2d") {
    return reply?.({ ok: false, error: "Not a 2D room." });
  }

  const allowedCharacters = ["male1", "male2", "female1", "female2"];

  if (!allowedCharacters.includes(character)) {
    return reply?.({ ok: false, error: "Invalid character." });
  }

  const alreadyTaken = [...room.users.values()].some(
    user => user.id !== socket.id && user.character === character
  );

  if (alreadyTaken) {
    return reply?.({
      ok: false,
      error: "That character is already taken. Choose another one."
    });
  }

  const user = room.users.get(socket.id);
  if (!user) {
    return reply?.({ ok: false, error: "You are not in this room." });
  }

  user.character = character;
  broadcastState(room.code);

  reply?.({ ok: true, state: roomState(room) });
});
  socket.on("player-move", ({ x, y, direction, moving, sitting }) => {
  const room = getRoom(socket.data.roomCode);

  if (!room || room.type !== "2d") return;

  const user = room.users.get(socket.id);

  if (!user || !user.character) return;

  const nx = Number(x);
  const ny = Number(y);

  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    return;
  }

  user.position = {
    x: nx,
    y: ny
  };

  user.direction = Number(direction) || 0;
  user.moving = !!moving;
  user.sitting = !!sitting;

  socket.to(room.code).emit("player-move", {
    id: socket.id,
    position: user.position,
    direction: user.direction,
    moving: user.moving,
    sitting: user.sitting
  });
});
  socket.on("set-status", ({ status }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const allowed = ["studying", "break", "afk"];
    if (!allowed.includes(status)) return;
    const user = room.users.get(socket.id);
    if (!user) return;
    user.status = status;
    broadcastState(room.code);
  });

  socket.on("leave-room", () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    room.users.delete(socket.id);
    socket.leave(code);
    socket.data.roomCode = null;
    socket.data.name = null;
    broadcastState(code);
    if (room.users.size === 0) {
      stopTimer(room);
      rooms.delete(code);
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    room.users.delete(socket.id);
    broadcastState(code);
    if (room.users.size === 0) {
      stopTimer(room);
      rooms.delete(code);
    }
  });
});

function joinRoom(socket, room, name, reply) {
  if (room.type === "2d" && room.users.size >= 4) {
    return reply?.({
      ok: false,
      error: "This 2D room is full. Maximum 4 players."
    });
  }

  const cleanName = String(name || "Guest").trim().slice(0, 24) || "Guest";

  room.users.set(socket.id, {
    id: socket.id,
    name: cleanName,
    status: "studying",
    character: null
  });

  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.name = cleanName;

  reply?.({ ok: true, state: roomState(room) });
  broadcastState(room.code);
}
app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Study Room running at http://localhost:${PORT}`);
});
