const socket = io();

const $ = id => document.getElementById(id);
const lobby = $("lobby"), room = $("room");
const nameInput = $("nameInput"), codeInput = $("codeInput");
const lobbyError = $("lobbyError");
const timerEl = $("timer"), phaseEl = $("phase"), progressBar = $("progressBar");

let myName = "";
let state = null;
let audioContext = null;

function unlockAudio() {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  } catch (_) {}
}

function playSessionEndSound() {
  try {
    unlockAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    [0, 0.18, 0.36].forEach((offset, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  } catch (_) {}
}

async function requestNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (_) {}
  }
}

function sendSessionNotification(phase) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const isBreak = phase === "break";
  new Notification(isBreak ? "Study session finished" : "Break is over", {
    body: isBreak ? "Time for your break 🌿" : "Back to studying.",
    tag: "study-room-session"
  });
}

function showError(msg) { lobbyError.textContent = msg; }

function enterRoom(nextState) {
  state = nextState;
  lobby.classList.add("hidden");
  room.classList.remove("hidden");
  $("roomBadge").classList.remove("hidden");
  $("roomCode").textContent = state.code;
  $("roomCodeSmall").textContent = state.code;
  renderState();
}

function renderState() {
  if (!state) return;
  $("peopleCount").textContent = state.users.length;
  $("membersList").innerHTML = state.users.map(u => `
    <div class="member">
      <div class="avatar">${escapeHtml(u.name.slice(0,1).toUpperCase())}</div>
      <div class="member-name">${escapeHtml(u.name)}${u.name === myName ? " <small>(you)</small>" : ""}</div>
      <span class="online"></span>
    </div>
  `).join("");

  $("studyMinutes").value = state.timer.studyMinutes;
  $("breakMinutes").value = state.timer.breakMinutes;
  renderTask();
  renderTimer(state.timer);
}

function renderTask() {
  const task = state?.task || { text: "", completed: false };
  const display = $("taskDisplay");
  const input = $("taskInput");
  if (!task.text) {
    display.classList.add("hidden");
    input.value = "";
    return;
  }
  display.classList.remove("hidden");
  $("taskText").textContent = task.text;
  display.classList.toggle("completed", !!task.completed);
  input.value = task.text;
}

function renderTimer(t) {
  phaseEl.textContent = t.phase.toUpperCase();
  phaseEl.style.color = t.phase === "study" ? "var(--accent)" : "#82b7ff";
  timerEl.textContent = formatTime(t.remaining);

  const total = (t.phase === "study" ? t.studyMinutes : t.breakMinutes) * 60;
  const elapsed = Math.max(0, total - t.remaining);
  progressBar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;

  $("startBtn").textContent = t.running ? "Pause" : "Start";
}

function formatTime(s) {
  s = Math.max(0, Number(s) || 0);
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

$("createBtn").onclick = () => {
  myName = nameInput.value.trim() || "Guest";
  unlockAudio();
  requestNotifications();
  socket.emit("create-room", {name: myName}, result => {
    if (!result.ok) return showError(result.error);
    enterRoom(result.state);
    addSystemMessage("Room created. Share the code with your friends.");
  });
};

$("joinBtn").onclick = () => {
  myName = nameInput.value.trim() || "Guest";
  unlockAudio();
  requestNotifications();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return showError("Enter a room code.");
  socket.emit("join-room", {code, name: myName}, result => {
    if (!result.ok) return showError(result.error);
    enterRoom(result.state);
    addSystemMessage(`You joined room ${result.state.code}.`);
  });
};

codeInput.addEventListener("input", e => e.target.value = e.target.value.toUpperCase());

$("startBtn").onclick = () => {
  unlockAudio();
  requestNotifications();
  socket.emit("timer-action", {action: state?.timer.running ? "pause" : "start"});
};
$("resetBtn").onclick = () => socket.emit("timer-action", {action: "reset"});
$("skipBtn").onclick = () => {
  unlockAudio();
  socket.emit("timer-action", {action: "skip"});
};

$("saveTask").onclick = () => {
  socket.emit("set-task", { text: $("taskInput").value });
};

$("taskInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("saveTask").click();
  }
});

$("taskCheck").onclick = () => socket.emit("toggle-task");

$("leaveBtn").onclick = () => {
  if (!confirm("Leave this room?")) return;
  socket.emit("leave-room");
  state = null;
  room.classList.add("hidden");
  lobby.classList.remove("hidden");
  $("roomBadge").classList.add("hidden");
  $("messages").innerHTML = "";
  $("taskInput").value = "";
  showError("");
  toast("You left the room");
};

$("settingsBtn").onclick = () => $("settingsDialog").showModal();
$("saveSettings").onclick = e => {
  e.preventDefault();
  socket.emit("set-settings", {
    studyMinutes: $("studyMinutes").value,
    breakMinutes: $("breakMinutes").value
  });
  $("settingsDialog").close();
};

$("copyRoom").onclick = async () => {
  await navigator.clipboard.writeText(state.code);
  toast("Room code copied");
};

$("chatForm").onsubmit = e => {
  e.preventDefault();
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("send-message", {text});
  input.value = "";
};

socket.on("room-state", next => {
  state = next;
  if (!room.classList.contains("hidden")) renderState();
});

socket.on("timer", t => {
  if (!state) return;
  state.timer = t;
  renderTimer(t);
});

socket.on("message", msg => {
  const el = document.createElement("div");
  el.className = "msg" + (msg.name === myName ? " mine" : "");
  el.innerHTML = `<div class="meta">${escapeHtml(msg.name)}</div><div class="bubble">${escapeHtml(msg.text)}</div>`;
  $("messages").appendChild(el);
  $("messages").scrollTop = $("messages").scrollHeight;
});

socket.on("timer-finished", ({phase}) => {
  playSessionEndSound();
  sendSessionNotification(phase);
  toast(phase === "break" ? "Study session finished — break time 🌿" : "Break's over — back to work.");
});

function addSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<div class="meta">Study Room</div><div class="bubble">${escapeHtml(text)}</div>`;
  $("messages").appendChild(el);
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove("show"), 2200);
}
