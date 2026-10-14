const socket = io();

const $ = id => document.getElementById(id);
const lobby = $("lobby"), room = $("room");
const nameInput = $("nameInput"), codeInput = $("codeInput");
const lobbyError = $("lobbyError");
const timerEl = $("timer"), phaseEl = $("phase"), progressBar = $("progressBar");

let myName = "";
let state = null;

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
  renderTimer(state.timer);
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
  socket.emit("create-room", {name: myName}, result => {
    if (!result.ok) return showError(result.error);
    enterRoom(result.state);
    addSystemMessage("Room created. Share the code with your friends.");
  });
};

$("joinBtn").onclick = () => {
  myName = nameInput.value.trim() || "Guest";
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
  socket.emit("timer-action", {action: state?.timer.running ? "pause" : "start"});
};
$("resetBtn").onclick = () => socket.emit("timer-action", {action: "reset"});
$("skipBtn").onclick = () => socket.emit("timer-action", {action: "skip"});

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
