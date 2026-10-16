const socket = io();  

const $ = id => document.getElementById(id);
const lobby = $("lobby"), room = $("room");
const room2d = $("room2d");
const nameInput = $("nameInput"), codeInput = $("codeInput");
const lobbyError = $("lobbyError");
const timerEl = $("timer"), phaseEl = $("phase"), progressBar = $("progressBar");

let myName = "";
let state = null;
socket.on("connect", () => {
  if (!state || !state.code || !myName) return;

  socket.emit(
    "join-room",
    {
      code: state.code,
      name: myName
    },
    result => {
      if (!result?.ok) {
        console.warn("Room reconnect failed:", result?.error);
        return;
      }

      state = result.state;
      renderState();
      toast("Connection restored");
    }
  );
});

socket.on("disconnect", () => {
  if (state) {
    toast("Connection lost — reconnecting...");
  }
});

socket.on("connect_error", error => {
  console.warn("Socket connection error:", error.message);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state && !socket.connected) {
    socket.connect();
  }
});
let audioContext = null;
let selectedEmoji = "";

let chatSoundEnabled = localStorage.getItem("study-room-chat-sound") !== "false";

function unlockAudio() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  } catch (_) {}
}

function playSessionEndSound() {
  try {
    unlockAudio();
    if (!audioContext) return;

    const now = audioContext.currentTime;

    [0, 0.16, 0.32].forEach((offset, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = "sine";
      osc.frequency.value = [660, 784, 988][i];

      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.18,
        now + offset + 0.025
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + offset + 0.18
      );

      osc.connect(gain).connect(audioContext.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch (_) {}
}


/* =========================================================
   CHAT NOTIFICATION SOUND
   ========================================================= */

function playChatSound() {
  if (!chatSoundEnabled) return;

  try {
    unlockAudio();

    if (!audioContext) return;

    const now = audioContext.currentTime;

    const notes = [
      { frequency: 660, start: 0, duration: 0.10 },
      { frequency: 880, start: 0.09, duration: 0.13 }
    ];

    notes.forEach(note => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(
        note.frequency,
        now + note.start
      );

      gain.gain.setValueAtTime(
        0.0001,
        now + note.start
      );

      gain.gain.exponentialRampToValueAtTime(
        0.09,
        now + note.start + 0.015
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.duration
      );

      osc.connect(gain).connect(audioContext.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    });

  } catch (_) {}
}


/* =========================================================
   CHAT SOUND BUTTON
   ========================================================= */

function createChatSoundButton() {
  const chatHead = document.querySelector(".chat-head");

  if (!chatHead || document.getElementById("chatSoundToggle")) {
    return;
  }

  const button = document.createElement("button");

  button.id = "chatSoundToggle";
  button.type = "button";
  button.className = "icon-btn";
  button.title = chatSoundEnabled
    ? "Mute message sounds"
    : "Enable message sounds";

  button.textContent = chatSoundEnabled ? "🔊" : "🔇";

  button.style.marginLeft = "auto";
  button.style.flexShrink = "0";

  button.onclick = () => {
    chatSoundEnabled = !chatSoundEnabled;

    localStorage.setItem(
      "study-room-chat-sound",
      chatSoundEnabled ? "true" : "false"
    );

    button.textContent = chatSoundEnabled ? "🔊" : "🔇";

    button.title = chatSoundEnabled
      ? "Mute message sounds"
      : "Enable message sounds";

    if (chatSoundEnabled) {
      unlockAudio();
      playChatSound();
    }
  };

  chatHead.style.display = "flex";
  chatHead.style.justifyContent = "space-between";
  chatHead.style.alignItems = "center";

  chatHead.appendChild(button);
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function requestNotifications() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (_) {}
  }
}

function sendSessionNotification(phase) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const isBreak = phase === "break";

  new Notification(
    isBreak
      ? "Study session finished"
      : "Break is over",
    {
      body: isBreak
        ? "Time for your break 🌿"
        : "Back to studying.",
      tag: "study-room-session"
    }
  );
}


/* =========================================================
   GENERAL UI
   ========================================================= */

function showError(msg) {
  lobbyError.textContent = msg;
}

function enterRoom(nextState) {
  state = nextState;

  document.body.dataset.roomType =
    state.type || "normal";

  lobby.classList.add("hidden");

  if (state.type === "2d") {
    room.classList.add("hidden");
    room2d.classList.add("hidden");
    $("characterSelect").classList.remove("hidden");
  } else {
    $("characterSelect").classList.add("hidden");
    room2d.classList.add("hidden");
    room.classList.remove("hidden");
    
  }

  $("roomBadge").classList.remove("hidden");

  $("roomCode").textContent = state.code;
  $("roomCodeSmall").textContent = state.code;

  createChatSoundButton();

  renderState();

  requestNotifications();
}

/* =========================================================
   2D CHARACTER SELECTION
   ========================================================= */

let selectedCharacter = "male1";

document
  .querySelectorAll(".character-option")
  .forEach(option => {

    option.addEventListener("click", () => {

      selectedCharacter =
        option.dataset.character;

      document
        .querySelectorAll(".character-option")
        .forEach(btn =>
          btn.classList.toggle(
            "active",
            btn === option
          )
        );

    });

  });

$("enter2dRoomBtn").onclick = () => {

  $("characterSelect").classList.add("hidden");
  room.classList.add("hidden");
  room2d.classList.remove("hidden");

  $("roomCode2d").textContent =
    state.code;

  console.log(
    "Selected character:",
    selectedCharacter
  );
};

$("backFromCharacterBtn").onclick = () => {

  socket.emit("leave-room");

  state = null;

  $("characterSelect").classList.add("hidden");
  room.classList.add("hidden");
  lobby.classList.remove("hidden");

  $("roomBadge").classList.add("hidden");
};

function renderState() {
  if (!state) return;

  const users = Array.isArray(state.users)
    ? state.users
    : [];

  $("peopleCount").textContent = users.length;

  $("studyingCount").textContent =
    users.filter(u => u.status === "studying").length;

  $("membersList").innerHTML = users.map(u => `
    <div class="member">
      <div class="avatar">
        ${escapeHtml(
          u.name.slice(0, 1).toUpperCase()
        )}
      </div>

      <div class="member-info">

        <div class="member-name">
          ${escapeHtml(u.name)}
          ${u.name === myName
            ? " <small>(you)</small>"
            : ""}
        </div>

        <div class="member-status">
          ${statusIcon(u.status)}
          ${statusLabel(u.status)}
        </div>

      </div>

      <span class="online"></span>

    </div>
  `).join("");

  $("studyMinutes").value =
    state.timer.studyMinutes;

  $("breakMinutes").value =
    state.timer.breakMinutes;

  renderTasks();
  renderSessionCount();
  renderTimer(state.timer);
  setStatusUI();
}

function statusIcon(status) {
  return ({
    studying: "📚",
    break: "☕",
    afk: "💤"
  }[status] || "📚");
}

function statusLabel(status) {
  return ({
    studying: "Studying",
    break: "On break",
    afk: "AFK"
  }[status] || "Studying");
}


/* =========================================================
   TASKS
   ========================================================= */

function renderTasks() {
  const tasks = state?.tasks || [];
  const list = $("taskList");

  list.innerHTML = tasks.length
    ? tasks.map(task => `
      <div
        class="task-item ${task.completed ? "completed" : ""}"
        data-task-id="${escapeHtml(task.id)}"
      >

        <button
          class="task-check ${task.completed ? "checked" : ""}"
          aria-label="${
            task.completed
              ? "Mark task incomplete"
              : "Complete task"
          }"
        >
          ${task.completed ? "✓" : ""}
        </button>

        <span class="task-text">
          ${escapeHtml(task.text)}
        </span>

        <button
          class="task-delete"
          aria-label="Delete task"
          title="Delete task"
        >
          ×
        </button>

      </div>
    `).join("")
    : `<div class="empty-tasks">
        No tasks yet. Add the first one 👇
       </div>`;

  list.querySelectorAll(".task-item")
    .forEach(item => {

      const id = item.dataset.taskId;

      item.querySelector(".task-check").onclick =
        () => socket.emit("toggle-task", { id });

      item.querySelector(".task-delete").onclick =
        () => socket.emit("delete-task", { id });

    });
}

function renderSessionCount() {
  $("sessionCount").textContent =
    state?.sessionsCompleted || 0;
}

function setStatusUI() {
  const current =
    (state?.users || [])
      .find(
        u =>
          u.id === socket.id ||
          u.name === myName
      );

  const status =
    current?.status || "studying";

  document.querySelectorAll(".status-btn")
    .forEach(btn =>
      btn.classList.toggle(
        "active",
        btn.dataset.status === status
      )
    );
}


/* =========================================================
   TIMER
   ========================================================= */

function renderTimer(t) {
  phaseEl.textContent =
    t.phase === "study"
      ? "FOCUS SESSION"
      : "BREAK";

  phaseEl.className =
    `phase ${t.phase}`;

  timerEl.textContent =
    formatTime(t.remaining);

  const total =
    (t.phase === "study"
      ? t.studyMinutes
      : t.breakMinutes) * 60;

  const elapsed =
    Math.max(
      0,
      total - t.remaining
    );

  progressBar.style.width =
    `${Math.min(
      100,
      (elapsed / total) * 100
    )}%`;

  $("startBtn").textContent =
    t.running
      ? "Pause"
      : "Start";
}

function formatTime(s) {
  s = Math.max(
    0,
    Number(s) || 0
  );

  return `${String(
    Math.floor(s / 60)
  ).padStart(2, "0")}:${String(
    s % 60
  ).padStart(2, "0")}`;
}


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

function addSystemMessage(text) {
  const el =
    document.createElement("div");

  el.className =
    "msg system-msg";

  el.innerHTML =
    `<div class="bubble">
      ${escapeHtml(text)}
     </div>`;

  $("messages").appendChild(el);

  $("messages").scrollTop =
    $("messages").scrollHeight;
}

function toast(text) {
  const t = $("toast");

  t.textContent = text;

  t.classList.add("show");

  clearTimeout(window.__toast);

  window.__toast =
    setTimeout(
      () => t.classList.remove("show"),
      2200
    );
}

function finishAnimation() {
  const card = $("timerCard");

  card.classList.remove(
    "session-finished"
  );

  void card.offsetWidth;

  card.classList.add(
    "session-finished"
  );

  setTimeout(
    () =>
      card.classList.remove(
        "session-finished"
      ),
    900
  );
}


/* =========================================================
   THEME
   ========================================================= */

const savedTheme =
  localStorage.getItem(
    "study-room-theme"
  ) || "dark";

document.documentElement.dataset.theme =
  savedTheme;

$("themeToggle").onclick = () => {

  const next =
    document.documentElement.dataset.theme === "dark"
      ? "light"
      : "dark";

  document.documentElement.dataset.theme =
    next;

  localStorage.setItem(
    "study-room-theme",
    next
  );

  $("themeToggle").textContent =
    next === "dark"
      ? "☀"
      : "☾";
};

$("themeToggle").textContent =
  savedTheme === "dark"
    ? "☀"
    : "☾";

/* =========================================================
   FULLSCREEN
   ========================================================= */

const fullscreenBtn = $("fullscreenBtn");

fullscreenBtn.onclick = async () => {

  try {

    if (!document.fullscreenElement) {

      await document.documentElement.requestFullscreen();

    } else {

      await document.exitFullscreen();

    }

  } catch (_) {}

};

document.addEventListener(
  "fullscreenchange",
  () => {

    const isFullscreen =
      !!document.fullscreenElement;

    fullscreenBtn.textContent =
      isFullscreen ? "⛶" : "⛶";

    fullscreenBtn.title =
      isFullscreen
        ? "Exit fullscreen"
        : "Enter fullscreen";

  }
);


/* =========================================================
   CREATE ROOM
   ========================================================= */
let selectedRoomType = "normal";

document
  .querySelectorAll(".room-type-btn")
  .forEach(btn => {

    btn.addEventListener("click", () => {

      selectedRoomType =
        btn.dataset.roomType;

      document
        .querySelectorAll(".room-type-btn")
        .forEach(b =>
          b.classList.toggle(
            "active",
            b === btn
          )
        );

    });

  });

$("createBtn").onclick = () => {

  myName =
    nameInput.value.trim() || "Guest";

  unlockAudio();
  requestNotifications();

  socket.emit(
    "create-room",
    { name: myName ,
    type: selectedRoomType},
    result => {

      if (!result.ok) {
        return showError(
          result.error
        );
      }

      enterRoom(result.state);

      addSystemMessage(
        "Room created. Share the code with your friends."
      );
    }
  );
};


/* =========================================================
   JOIN ROOM
   ========================================================= */

$("joinBtn").onclick = () => {

  myName =
    nameInput.value.trim() || "Guest";

  unlockAudio();
  requestNotifications();

  const code =
    codeInput.value
      .trim()
      .toUpperCase();

  if (!code) {
    return showError(
      "Enter a room code."
    );
  }

  socket.emit(
    "join-room",
    {
      code,
      name: myName
    },
    result => {

      if (!result.ok) {
        return showError(
          result.error
        );
      }

      enterRoom(result.state);

      addSystemMessage(
        `You joined room ${result.state.code}.`
      );
    }
  );
};

codeInput.addEventListener(
  "input",
  e =>
    e.target.value =
      e.target.value.toUpperCase()
);


/* =========================================================
   TIMER CONTROLS
   ========================================================= */

$("startBtn").onclick = () => {

  unlockAudio();
  requestNotifications();

  socket.emit(
    "timer-action",
    {
      action:
        state?.timer.running
          ? "pause"
          : "start"
    }
  );
};

$("resetBtn").onclick = () =>
  socket.emit(
    "timer-action",
    { action: "reset" }
  );

$("skipBtn").onclick = () => {

  unlockAudio();

  socket.emit(
    "timer-action",
    { action: "skip" }
  );
};


/* =========================================================
   TASK CONTROLS
   ========================================================= */

$("addTaskBtn").type = "button";

$("addTaskBtn").onclick = () => {

  const input =
    $("taskInput");

  const text =
    input.value.trim();

  if (!text) {
    input.focus();
    return;
  }

  socket.emit(
    "add-task",
    { text },
    result => {

      if (
        result &&
        !result.ok
      ) {
        toast(
          result.error ||
          "Couldn't add task"
        );

        return;
      }

      input.value = "";

      input.focus();
    }
  );
};

$("taskInput").addEventListener(
  "keydown",
  e => {

    if (e.key === "Enter") {

      e.preventDefault();

      $("addTaskBtn").click();
    }
  }
);


/* =========================================================
   LEAVE ROOM
   ========================================================= */

$("leaveBtn").onclick = () => {

  if (
    !confirm(
      "Leave this room?"
    )
  ) {
    return;
  }

  socket.emit(
    "leave-room"
  );

  state = null;

  room.classList.add(
    "hidden"
  );

  lobby.classList.remove(
    "hidden"
  );

  $("roomBadge")
    .classList.add(
      "hidden"
    );

  $("messages").innerHTML = "";

  showError("");

  toast(
    "You left the room"
  );
};


/* =========================================================
   TIMER SETTINGS
   ========================================================= */

$("settingsBtn").onclick =
  () =>
    $("settingsDialog")
      .showModal();

$("saveSettings").onclick = e => {

  e.preventDefault();

  socket.emit(
    "set-settings",
    {
      studyMinutes:
        $("studyMinutes").value,

      breakMinutes:
        $("breakMinutes").value
    }
  );

  $("settingsDialog").close();
};


/* =========================================================
   COPY ROOM CODE
   ========================================================= */

$("copyRoom").onclick =
  async () => {

    try {

      await navigator.clipboard
        .writeText(
          state.code
        );

      toast(
        "Room code copied"
      );

    } catch (_) {

      toast(
        `Room code: ${state.code}`
      );
    }
  };


/* =========================================================
   STATUS BUTTONS
   ========================================================= */

document
  .querySelectorAll(".status-btn")
  .forEach(btn => {

    btn.type = "button";

    btn.addEventListener(
      "click",
      () => {

        const status =
          btn.dataset.status;

        if (
          ![
            "studying",
            "break",
            "afk"
          ].includes(status)
        ) {
          return;
        }

        socket.emit(
          "set-status",
          { status }
        );
      }
    );
  });


/* =========================================================
   EMOJI PICKER
   ========================================================= */

$("emojiToggle").onclick =
  () =>
    $("emojiPicker")
      .classList.toggle(
        "hidden"
      );

$("emojiPicker").addEventListener(
  "click",
  e => {

    const btn =
      e.target.closest(
        "button[data-emoji]"
      );

    if (!btn) return;

    selectedEmoji =
      btn.dataset.emoji;

    $("messageInput").value +=
      selectedEmoji;

    $("messageInput").focus();

    $("emojiPicker")
      .classList.add(
        "hidden"
      );
  }
);

document.addEventListener(
  "click",
  e => {

    if (
      !e.target.closest(
        ".emoji-wrap"
      )
    ) {
      $("emojiPicker")
        .classList.add(
          "hidden"
        );
    }
  }
);


/* =========================================================
   SEND MESSAGE
   ========================================================= */

$("chatForm").onsubmit = e => {

  e.preventDefault();

  const input =
    $("messageInput");

  const text =
    input.value.trim();

  if (!text) return;

  unlockAudio();

  socket.emit(
    "send-message",
    { text }
  );

  input.value = "";
};


/* =========================================================
   ROOM STATE
   ========================================================= */

socket.on(
  "room-state",
  next => {

    state = next;

    if (
      !room.classList.contains(
        "hidden"
      )
    ) {
      renderState();
    }
  }
);


/* =========================================================
   TIMER UPDATE
   ========================================================= */

socket.on(
  "timer",
  t => {

    if (!state) return;

    state.timer = t;

    renderTimer(t);
  }
);


/* =========================================================
   CHAT MESSAGE
   ========================================================= */

socket.on(
  "message",
  msg => {

    const isMine =
      msg.name === myName;

    const el =
      document.createElement(
        "div"
      );

    el.className =
      "msg" +
      (isMine
        ? " mine"
        : "");

    el.innerHTML = `
      <div class="meta">
        ${escapeHtml(msg.name)}
      </div>

      <div class="bubble">
        ${escapeHtml(msg.text)}
      </div>
    `;

    $("messages")
      .appendChild(el);

    $("messages").scrollTop =
      $("messages").scrollHeight;

    /* 🔊 Only play sound for other people */
    if (!isMine) {
      playChatSound();
    }
  }
);


/* =========================================================
   TIMER FINISHED
   ========================================================= */

socket.on(
  "timer-finished",
  ({ phase }) => {

    playSessionEndSound();

    sendSessionNotification(
      phase
    );

    finishAnimation();

    toast(
      phase === "break"
        ? "Focus session finished — break time 🌿"
        : "Break's over — back to work."
    );
  }
);


/* =========================================================
   SESSION COMPLETED
   ========================================================= */

socket.on(
  "session-completed",
  count => {

    if (!state) return;

    state.sessionsCompleted =
      count;

    renderSessionCount();

    toast(
      `🔥 Session ${count} complete!`
    );
  }
);
/* =========================
   STUDY AMBIENCE
   ========================= */

let ambienceAudio = null;
let ambienceSource = null;
let noiseNode = null;
let noiseGain = null;

const ambienceVolume = $("ambienceVolume");
const ambienceSelect = $("ambienceSelect");

const ambienceFiles = {
  rain: "/sounds/rain.mp3",
  nature: "/sounds/Nature.mp3",
  forest: "/sounds/Forest.mp3",
  cafe: "/sounds/cafe.mp3",
  fireplace: "/sounds/fireplace.mp3",
  library: "/sounds/library.mp3",
  ocean: "/sounds/ocean.mp3",
  birds: "/sounds/birds.mp3"
};

function stopAmbience() {
  if (ambienceAudio) {
    ambienceAudio.pause();
    ambienceAudio.currentTime = 0;
    ambienceAudio = null;
  }

  if (noiseNode) {
    try {
      noiseNode.stop();
    } catch (_) {}
    noiseNode.disconnect();
    noiseNode = null;
  }

  if (noiseGain) {
    noiseGain.disconnect();
    noiseGain = null;
  }

  ambienceSource = null;
}

function createNoise(type) {
  unlockAudio();

  if (!audioContext) return;

  const bufferSize = audioContext.sampleRate * 2;
  const buffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate
  );

  const data = buffer.getChannelData(0);

  if (type === "white") {
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  if (type === "brown") {
    let last = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }

  noiseNode = audioContext.createBufferSource();
  noiseNode.buffer = buffer;
  noiseNode.loop = true;

  noiseGain = audioContext.createGain();
  noiseGain.gain.value = Number(ambienceVolume.value);

  noiseNode.connect(noiseGain);
  noiseGain.connect(audioContext.destination);

  noiseNode.start();
}

function playAmbience(type) {
  stopAmbience();

  if (type === "none") return;

  if (type === "white" || type === "brown") {
    createNoise(type);
    return;
  }

  const file = ambienceFiles[type];

  if (!file) return;

  ambienceAudio = new Audio(file);
  ambienceAudio.loop = true;
  ambienceAudio.volume = Number(ambienceVolume.value);

  ambienceAudio.play().catch(() => {
    toast("Tap the ambience button again to start the sound.");
  });
}

ambienceSelect.addEventListener("change", () => {
  const sound = ambienceSelect.value;

  unlockAudio();
  playAmbience(sound);

  localStorage.setItem(
    "study-room-ambience",
    sound
  );
});

ambienceVolume.addEventListener("input", () => {
  const volume = Number(ambienceVolume.value);

  if (ambienceAudio) {
    ambienceAudio.volume = volume;
  }

  if (noiseGain) {
    noiseGain.gain.value = volume;
  }

  localStorage.setItem(
    "study-room-ambience-volume",
    volume
  );
});

/* Restore personal ambience settings */

const savedAmbience =
  localStorage.getItem("study-room-ambience") || "none";

const savedAmbienceVolume =
  localStorage.getItem("study-room-ambience-volume");

if (savedAmbienceVolume !== null) {
  ambienceVolume.value = savedAmbienceVolume;
}

ambienceSelect.value = savedAmbience;
/* =========================
   BACKGROUND SETTINGS
   ========================= */

const backgroundDialog = $("backgroundDialog");
const backgroundBtn = $("backgroundBtn");

const backgroundOptions =
  document.querySelectorAll(".background-option");

const backgroundOpacity =
  $("backgroundOpacity");

const resetBackground =
  $("resetBackground");

const backgroundStyles = {
  default: {
    type: "color",
    value: ""
  },

  night: {
    type: "gradient",
    value: "radial-gradient(circle at 20% 20%, #20263d 0%, #0b0d12 55%, #050608 100%)"
  },

  forest: {
    type: "gradient",
    value: "linear-gradient(135deg, #10251c 0%, #183b2a 45%, #07110c 100%)"
  },

  rainStatic: {
    type: "gradient",
    value: "linear-gradient(135deg, #172332 0%, #26384d 50%, #0b1119 100%)"
  },

  rain: {
    type: "video",
    value: "/backgrounds/rain.mp4"
  },

  thunderstorm: {
    type: "video",
    value: "/backgrounds/thunderstorm.mp4"
  },

  desk1: {
    type: "video",
    value: "/backgrounds/desk1.mp4"
  },

  desk2: {
    type: "video",
    value: "/backgrounds/desk2.mp4"
  }
};
backgroundBtn.onclick = () => {
  backgroundDialog.showModal();
};

function applyBackground(name, opacity) {

  const bg =
    backgroundStyles[name] ||
    backgroundStyles.default;

  const video =
    $("backgroundVideo");

  // Stop any currently playing background video
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  // Reset normal background
  document.body.style.background = "";
  document.body.classList.remove("video-background");

  if (bg.type === "gradient") {

    document.body.style.background =
      bg.value;

 } else if (bg.type === "video") {

  document.body.classList.add("video-background");

  if (video) {
    video.src = bg.value;
    video.load();

    video.play().catch(() => {});
  }

}

  // Card transparency
  document.querySelectorAll(
    ".card, .timer-card"
  ).forEach(el => {

    el.style.background =
      `rgba(15, 18, 25, ${opacity})`;

  });

  // Highlight selected option
  backgroundOptions.forEach(option => {

    option.classList.toggle(
      "active",
      option.dataset.background === name
    );

  });

  localStorage.setItem(
    "study-room-background",
    name
  );

  localStorage.setItem(
    "study-room-background-opacity",
    opacity
  );
}

backgroundOptions.forEach(option => {

  option.addEventListener("click", () => {

    const name =
      option.dataset.background;

    applyBackground(
      name,
      Number(backgroundOpacity.value)
    );

  });

});

backgroundOpacity.addEventListener(
  "input",
  () => {

    const name =
      localStorage.getItem(
        "study-room-background"
      ) || "default";

    applyBackground(
      name,
      Number(backgroundOpacity.value)
    );

  }
);

resetBackground.addEventListener(
  "click",
  () => {

    backgroundOpacity.value = "0.78";

    applyBackground(
      "default",
      0.78
    );

  }
);

const savedBackground =
  localStorage.getItem(
    "study-room-background"
  ) || "default";

const savedBackgroundOpacity =
  localStorage.getItem(
    "study-room-background-opacity"
  ) || "0.78";

backgroundOpacity.value =
  savedBackgroundOpacity;

applyBackground(
  savedBackground,
  Number(savedBackgroundOpacity)
);
/* =========================
   2D GAME CANVAS
   ========================= */

const studyWorld = document.getElementById("studyWorld");

if (studyWorld) {
  const ctx = studyWorld.getContext("2d");

  const libraryTileset = new Image();
  libraryTileset.src = "/assets/library/library.png";

  function resizeStudyWorld() {
    const rect = studyWorld.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) return;

    studyWorld.width = rect.width;
    studyWorld.height = rect.height;

    drawStudyWorld();
  }

function drawStudyWorld() {
  if (!libraryTileset.complete) return;

  ctx.clearRect(
    0,
    0,
    studyWorld.width,
    studyWorld.height
  );

  ctx.imageSmoothingEnabled = false;

  const W = studyWorld.width;
  const H = studyWorld.height;

  // =========================
  // FLOOR
  // =========================

  const tileSize = 48;

  for (let y = 0; y < H; y += tileSize) {
    for (let x = 0; x < W; x += tileSize) {
      ctx.drawImage(
        libraryTileset,
        24,
        216,
        48,
        48,
        x,
        y,
        tileSize,
        tileSize
      );
      
    }
  }

  // =========================
  // BACK WALL
  // =========================

  ctx.drawImage(
    libraryTileset,
    936,
    0,
    536,
    165,
    0,
    0,
    W,
    H * 0.30
  );
 // =========================
  // WALL BOOKSHELVES
  // =========================

  // Right bookshelf 1
  ctx.drawImage(
    libraryTileset,
    268,
    384,
    92,
    120,
    W - 315,
    1,
    120,
    160
  );

  // Right bookshelf 2
  ctx.drawImage(
    libraryTileset,
    148,
    384,
    92,
    120,
    W - 165,
    1,
    120,
    160
  );

  // =========================
  // LARGE CLOCK
  // =========================

  ctx.drawImage(
    libraryTileset,
    78,
    24,
    72,
    125,
    W / 2 - 50,
    35,
    100,
    175
  );
 // =========================
// RIGHT WALL BORDER
// =========================

ctx.drawImage(
  libraryTileset,
  1460,
  0,
  12,
  528,
  W - 10,
  15,
  12,
  studyWorld.height
);
// =========================
  // MAIN STUDY RUG
  // =========================

  ctx.drawImage(
    libraryTileset,
    456,
    24,
    168,
    72,
    W / 2 - 230,
    300,
    460,
    190
  );


  // =========================
// TOP TABLE CHAIRS
// =========================

// TOP-LEFT CHAIR — correct opposite-facing sprite
ctx.drawImage(
  libraryTileset,
  672,
  101,
  48,
  57,
  W / 2 - 115,
  270,
  75,
  90
);

// TOP-RIGHT CHAIR — correct opposite-facing sprite
ctx.drawImage(
  libraryTileset,
  672,
  101,
  48,
  57,
  W / 2 + 40,
  270,
  75,
  90
);

// OPEN BOOK — top-left chair
ctx.drawImage(
  libraryTileset,
  290,
  78,
  48,
  35,
  W / 2 - 115,
  365,
  58,
  42
);

// OPEN BOOK — top-right chair
ctx.drawImage(
  libraryTileset,
  290,
  78,
  48,
  35,
  W / 2 + 57,
  365,
  58,
  42
);
  // =========================
  // MAIN STUDY TABLE
  // =========================

  ctx.drawImage(
    libraryTileset,
    360,
    216,
    168,
    96,
    W / 2 - 170,
    330,
    340,
    170
  );
// =========================
// STUDY TABLE ITEMS
// =========================

// OPEN BOOK — left chair
ctx.drawImage(
  libraryTileset,
  290,
  78,
  48,
  35,
  W / 2 - 115,
  415,
  58,
  42
);

// OPEN BOOK — right chair
ctx.drawImage(
  libraryTileset,
  290,
  78,
  48,
  35,
  W / 2 + 57,
  415,
  58,
  42
);

// LAMP — center of table
ctx.drawImage(
  libraryTileset,
  625,
  125,
  30,
  43,
  W / 2 - 15,
  345,
  45,
  65
);
  // =========================
  // BOTTOM TABLE CHAIRS
  // =========================

  ctx.drawImage(
    libraryTileset,
    672,
    39,
    48,
    57,
    W / 2 - 115,
    500,
    75,
    90
  );

  ctx.drawImage(
    libraryTileset,
    672,
    39,
    48,
    57,
    W / 2 + 40,
    500,
    75,
    90
  );

}
  libraryTileset.onload = () => {
    resizeStudyWorld();
  };

  window.addEventListener(
    "resize",
    resizeStudyWorld
  );

  /*
    Watch for the 2D room becoming visible.
    This is important because the room starts hidden.
  */
  const sceneObserver = new ResizeObserver(() => {
    resizeStudyWorld();
  });

  sceneObserver.observe(studyWorld);

  resizeStudyWorld();
}
