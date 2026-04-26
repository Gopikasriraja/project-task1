// ============================================================
//  app.js — Project Tasks  (with Sudoku, Notes & AI Chatbot)
// ============================================================

// ── 1. SUPABASE SETUP ────────────────────────────────────────
const SUPABASE_URL     = "https://blkqlntxknkkjmgltksl.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsa3FsbnR4a25ra2ptZ2x0a3NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDk4MDUsImV4cCI6MjA5Mjc4NTgwNX0.6ET9oPtZCthoLAtxl__Y62Md5bE2Tbl7c9m-k368OCM"
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 2. APP STATE ──────────────────────────────────────────────
let tasks = [];
let currentFilter = "all";
let editingId = null;

// ── 3. BOOT ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setTodayDate();
  await loadTasks();
  setupEnterKey();
  // New features
  initSudoku();
  initNotes();
  initChatEnterKey();
});

function setTodayDate() {
  const el = document.getElementById("today-date");
  el.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric"
  });
}

function setupEnterKey() {
  document.getElementById("task-input").addEventListener("keydown", e => {
    if (e.key === "Enter") addTask();
  });
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── 4. LOAD TASKS ─────────────────────────────────────────────
async function loadTasks() {
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("⚠ Could not load tasks. Check Supabase config.");
    console.error("Supabase load error:", error.message);
    return;
  }
  tasks = data || [];
  renderAll();
}

// ── 5. ADD TASK ───────────────────────────────────────────────
async function addTask() {
  const input    = document.getElementById("task-input");
  const priority = document.getElementById("priority-select").value;
  const text     = input.value.trim();
  const errorEl  = document.getElementById("input-error");

  if (!text) {
    errorEl.textContent = "Please enter a task before adding.";
    input.focus();
    return;
  }
  errorEl.textContent = "";

  const newTask = { text, priority, completed: false };

  const { data, error } = await db
    .from("tasks").insert([newTask]).select().single();

  if (error) {
    showToast("⚠ Could not add task.");
    console.error("Insert error:", error.message);
    return;
  }

  tasks.unshift(data);
  input.value = "";
  renderAll();
  showToast("Task added ✓");
}

// ── 6. TOGGLE COMPLETE ────────────────────────────────────────
async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const newStatus = !task.completed;

  const { error } = await db.from("tasks").update({ completed: newStatus }).eq("id", id);
  if (error) { showToast("⚠ Could not update task."); return; }

  task.completed = newStatus;
  renderAll();
  showToast(newStatus ? "Marked as complete ✓" : "Marked as pending");
}

// ── 7. EDIT MODAL ─────────────────────────────────────────────
function openEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingId = id;
  const modalInput    = document.getElementById("modal-input");
  const modalPriority = document.getElementById("modal-priority");
  modalInput.value = task.text;
  modalPriority.innerHTML = ["low","medium","high"].map(p =>
    `<option value="${p}" ${task.priority === p ? "selected" : ""}>${capitalize(p)}</option>`
  ).join("");
  document.getElementById("modal-overlay").classList.remove("hidden");
  modalInput.focus();
}

async function saveEdit() {
  const newText     = document.getElementById("modal-input").value.trim();
  const newPriority = document.getElementById("modal-priority").value;
  if (!newText) return;

  const { error } = await db
    .from("tasks").update({ text: newText, priority: newPriority }).eq("id", editingId);
  if (error) { showToast("⚠ Could not save edit."); return; }

  const task = tasks.find(t => t.id === editingId);
  if (task) { task.text = newText; task.priority = newPriority; }

  closeModalDirect();
  renderAll();
  showToast("Task updated ✓");
}

function closeModal(e) {
  if (e.target === document.getElementById("modal-overlay")) closeModalDirect();
}
function closeModalDirect() {
  document.getElementById("modal-overlay").classList.add("hidden");
  editingId = null;
}

// ── 8. DELETE ─────────────────────────────────────────────────
async function deleteTask(id) {
  const { error } = await db.from("tasks").delete().eq("id", id);
  if (error) { showToast("⚠ Could not delete task."); return; }
  tasks = tasks.filter(t => t.id !== id);
  renderAll();
  showToast("Task deleted");
}

// ── 9. CLEAR COMPLETED ────────────────────────────────────────
async function clearCompleted() {
  const completed = tasks.filter(t => t.completed);
  if (completed.length === 0) { showToast("No completed tasks to clear."); return; }
  const ids = completed.map(t => t.id);
  const { error } = await db.from("tasks").delete().in("id", ids);
  if (error) { showToast("⚠ Could not clear tasks."); return; }
  tasks = tasks.filter(t => !t.completed);
  renderAll();
  showToast(`Cleared ${ids.length} completed task${ids.length > 1 ? "s" : ""}`);
}

// ── 10. FILTER ────────────────────────────────────────────────
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  renderAll();
}

// ── 11. RENDER ────────────────────────────────────────────────
function renderAll() { updateStats(); renderList(); }

function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = total - done;
  const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById("stat-total").textContent   = total;
  document.getElementById("stat-done").textContent    = done;
  document.getElementById("stat-pending").textContent = pending;
  document.getElementById("ring-pct").textContent     = pct + "%";
  document.getElementById("ring-fill").setAttribute(
    "stroke-dasharray", `${pct} ${100 - pct}`
  );
}

function renderList() {
  const list  = document.getElementById("task-list");
  const empty = document.getElementById("empty-state");
  const visible = tasks.filter(t => {
    if (currentFilter === "pending") return !t.completed;
    if (currentFilter === "done")    return  t.completed;
    return true;
  });
  if (visible.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = visible.map(task => buildTaskHTML(task)).join("");
}

function buildTaskHTML(task) {
  const dateStr = new Date(task.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric"
  });
  const priorityBadge = task.completed
    ? `<span class="badge badge-done">Done</span>`
    : `<span class="badge badge-${task.priority}">${capitalize(task.priority)}</span>`;

  return `
    <div class="task-item priority-${task.priority} ${task.completed ? "completed" : ""}"
         id="task-${task.id}">
      <input type="checkbox" class="task-checkbox"
        ${task.completed ? "checked" : ""}
        onchange="toggleTask('${task.id}')" title="Toggle complete"/>
      <div class="task-body">
        <div class="task-text">${escapeHTML(task.text)}</div>
        <div class="task-meta">
          ${priorityBadge}
          <span class="task-date">Added ${dateStr}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-icon" onclick="openEdit('${task.id}')" title="Edit task">✎</button>
        <button class="btn-icon del" onclick="deleteTask('${task.id}')" title="Delete task">✕</button>
      </div>
    </div>`;
}

// ── 12. HELPERS ───────────────────────────────────────────────
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}


// ════════════════════════════════════════════════════════════
//  ✦  SUDOKU ENGINE
// ════════════════════════════════════════════════════════════

let sdkSolution  = [];   // The full solved board
let sdkPuzzle    = [];   // The puzzle (with 0 for blanks)
let sdkSelected  = null; // Currently selected cell index
let sdkTimerVal  = 0;
let sdkTimerInt  = null;
let sdkDifficulty = "medium";

// Entry point — called on load and on difficulty buttons
function initSudoku() {
  newSudokuGame("medium");
}

function newSudokuGame(difficulty) {
  sdkDifficulty = difficulty;
  clearInterval(sdkTimerInt);
  sdkTimerVal = 0;
  sdkSelected = null;
  updateTimerDisplay();

  // Update active button styling
  document.querySelectorAll(".sdk-btn").forEach(b => b.classList.remove("sdk-btn-active"));
  document.querySelectorAll(".sdk-btn").forEach(b => {
    if (b.textContent.trim().toLowerCase() === difficulty) b.classList.add("sdk-btn-active");
  });

  const removes = { easy: 30, medium: 45, hard: 55 }[difficulty] || 45;

  sdkSolution = generateSolvedBoard();
  sdkPuzzle   = makePuzzle(sdkSolution, removes);

  renderSudokuGrid();
  document.getElementById("sdk-status").className = "sdk-status";
  document.getElementById("sdk-status").innerHTML = `<p>New ${capitalize(difficulty)} puzzle — good luck!</p>`;

  // Start timer after first cell is selected
  sdkTimerInt = setInterval(() => {
    sdkTimerVal++;
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const m = String(Math.floor(sdkTimerVal / 60)).padStart(2, "0");
  const s = String(sdkTimerVal % 60).padStart(2, "0");
  document.getElementById("sdk-timer").textContent = `${m}:${s}`;
}

function renderSudokuGrid() {
  const grid = document.getElementById("sudoku-grid");
  grid.innerHTML = "";

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement("div");
    cell.className = "sdk-cell";
    cell.dataset.index = i;

    // Thick-border rows
    const row = Math.floor(i / 9);
    if (row === 2) cell.classList.add("sdk-row-3");
    if (row === 5) cell.classList.add("sdk-row-6");

    if (sdkPuzzle[i] !== 0) {
      cell.textContent = sdkPuzzle[i];
      cell.classList.add("sdk-given");
    }

    cell.addEventListener("click", () => selectCell(i));
    grid.appendChild(cell);
  }
}

function selectCell(index) {
  document.querySelectorAll(".sdk-cell").forEach(c => c.classList.remove("sdk-selected"));
  const cell = document.querySelector(`.sdk-cell[data-index="${index}"]`);
  if (!cell || cell.classList.contains("sdk-given")) {
    sdkSelected = null;
    return;
  }
  cell.classList.add("sdk-selected");
  sdkSelected = index;
}

function insertNum(num) {
  if (sdkSelected === null) {
    showToast("Tap a cell first!");
    return;
  }
  const cell = document.querySelector(`.sdk-cell[data-index="${sdkSelected}"]`);
  if (!cell || cell.classList.contains("sdk-given")) return;

  cell.classList.remove("sdk-error", "sdk-correct");

  if (num === 0) {
    cell.textContent = "";
    sdkPuzzle[sdkSelected] = 0;
  } else {
    cell.textContent = num;
    cell.classList.add("sdk-user");
    sdkPuzzle[sdkSelected] = num;
  }
}

// Keyboard support
document.addEventListener("keydown", e => {
  if (sdkSelected === null) return;
  const n = parseInt(e.key);
  if (n >= 1 && n <= 9) insertNum(n);
  if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") insertNum(0);
});

function checkSudoku() {
  let correct = 0, wrong = 0, empty = 0;

  for (let i = 0; i < 81; i++) {
    const cell = document.querySelector(`.sdk-cell[data-index="${i}"]`);
    if (cell.classList.contains("sdk-given")) continue;
    cell.classList.remove("sdk-error", "sdk-correct");

    if (sdkPuzzle[i] === 0) { empty++; continue; }
    if (sdkPuzzle[i] === sdkSolution[i]) { correct++; cell.classList.add("sdk-correct"); }
    else                                 { wrong++;   cell.classList.add("sdk-error"); }
  }

  const statusEl = document.getElementById("sdk-status");
  if (wrong === 0 && empty === 0) {
    clearInterval(sdkTimerInt);
    statusEl.className = "sdk-status success";
    statusEl.innerHTML = `<p>🎉 Solved in ${document.getElementById("sdk-timer").textContent}! Perfect!</p>`;
    showToast("Sudoku solved! 🎉");
  } else if (wrong > 0) {
    statusEl.className = "sdk-status error";
    statusEl.innerHTML = `<p>${wrong} error${wrong>1?"s":""}, ${empty} cell${empty!==1?"s":""} left. Keep going!</p>`;
  } else {
    statusEl.className = "sdk-status";
    statusEl.innerHTML = `<p>${empty} cell${empty!==1?"s":""} remaining — looking good so far!</p>`;
  }
}

function solveSudoku() {
  for (let i = 0; i < 81; i++) {
    const cell = document.querySelector(`.sdk-cell[data-index="${i}"]`);
    if (cell.classList.contains("sdk-given")) continue;
    cell.textContent = sdkSolution[i];
    cell.classList.remove("sdk-error", "sdk-correct");
    cell.classList.add("sdk-user");
    sdkPuzzle[i] = sdkSolution[i];
  }
  clearInterval(sdkTimerInt);
  const statusEl = document.getElementById("sdk-status");
  statusEl.className = "sdk-status success";
  statusEl.innerHTML = `<p>Solution revealed! Try a new puzzle when you're ready.</p>`;
}

// ── Sudoku Generation ─────────────────────────────────────────
function generateSolvedBoard() {
  const board = Array(81).fill(0);
  solveBoardBT(board);
  return board;
}

function solveBoardBT(board) {
  const empty = board.indexOf(0);
  if (empty === -1) return true;

  const nums = shuffle([1,2,3,4,5,6,7,8,9]);
  for (const n of nums) {
    if (isValidPlacement(board, empty, n)) {
      board[empty] = n;
      if (solveBoardBT(board)) return true;
      board[empty] = 0;
    }
  }
  return false;
}

function makePuzzle(solution, removes) {
  const puzzle = [...solution];
  const indices = shuffle([...Array(81).keys()]);
  let removed = 0;

  for (const idx of indices) {
    if (removed >= removes) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;

    // Quick uniqueness check (shallow)
    const copy = [...puzzle];
    if (countSolutions(copy, 0) === 1) {
      removed++;
    } else {
      puzzle[idx] = backup;
    }
  }
  return puzzle;
}

function countSolutions(board, count) {
  const empty = board.indexOf(0);
  if (empty === -1) return count + 1;
  for (let n = 1; n <= 9; n++) {
    if (isValidPlacement(board, empty, n)) {
      board[empty] = n;
      count = countSolutions(board, count);
      board[empty] = 0;
      if (count > 1) return count; // Short-circuit
    }
  }
  return count;
}

function isValidPlacement(board, pos, num) {
  const row = Math.floor(pos / 9);
  const col = pos % 9;
  const boxR = Math.floor(row / 3) * 3;
  const boxC = Math.floor(col / 3) * 3;

  for (let i = 0; i < 9; i++) {
    if (board[row * 9 + i] === num) return false;       // Row
    if (board[i * 9 + col] === num) return false;       // Col
    const br = boxR + Math.floor(i / 3);
    const bc = boxC + (i % 3);
    if (board[br * 9 + bc] === num) return false;       // Box
  }
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


// ════════════════════════════════════════════════════════════
//  ✦  DAILY NOTES  (Day 1–7)
// ════════════════════════════════════════════════════════════

let activeDay = 1;
const NOTES_KEY = "projecttasks_notes_v1";

function initNotes() {
  renderNoteTabs();
  renderNoteEditor(activeDay);
}

function getNotesData() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveNotesData(data) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(data));
}

function renderNoteTabs() {
  const tabsEl = document.getElementById("notes-tabs");
  const data   = getNotesData();

  tabsEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const day  = i + 1;
    const done = data[`day${day}_done`] === true;
    const tick = done ? `<span class="day-tick"></span>` : "";
    const cls  = [
      "notes-tab",
      activeDay === day ? "active" : "",
      done ? "day-done" : ""
    ].filter(Boolean).join(" ");
    return `<button class="${cls}" onclick="switchNoteDay(${day})">Day ${day}${tick}</button>`;
  }).join("");
}

function switchNoteDay(day) {
  // Save current textarea before switching
  const ta = document.getElementById("note-textarea");
  if (ta) {
    const data = getNotesData();
    data[`day${activeDay}`] = ta.value;
    saveNotesData(data);
  }
  activeDay = day;
  renderNoteTabs();
  renderNoteEditor(day);
}

function renderNoteEditor(day) {
  const wrap = document.getElementById("note-editor-wrap");
  const data = getNotesData();
  const text = data[`day${day}`] || "";
  const done = data[`day${day}_done`] === true;
  const charCount = text.length;

  wrap.innerHTML = `
    <div class="note-editor-inner">
      <p class="note-day-label">Day ${day} — ${getDayLabel(day)}</p>
      <textarea
        id="note-textarea"
        class="note-textarea"
        placeholder="Write your notes, reflections, or progress for Day ${day}…"
        maxlength="2000"
        oninput="onNoteInput()"
      >${escapeHTML(text)}</textarea>
      <div class="note-footer">
        <span class="note-char-count" id="note-char-count">${charCount}/2000</span>
        <div class="note-done-row">
          <input
            type="checkbox"
            class="note-done-check"
            id="note-done-check"
            ${done ? "checked" : ""}
            onchange="onDayDoneToggle(${day})"
          />
          <label class="note-done-label" for="note-done-check">
            Mark Day ${day} as complete
          </label>
        </div>
      </div>
    </div>`;
}

function onNoteInput() {
  const ta = document.getElementById("note-textarea");
  const count = document.getElementById("note-char-count");
  count.textContent = `${ta.value.length}/2000`;
  // Auto-save
  const data = getNotesData();
  data[`day${activeDay}`] = ta.value;
  saveNotesData(data);
}

function onDayDoneToggle(day) {
  const isDone = document.getElementById("note-done-check").checked;
  const data   = getNotesData();
  data[`day${day}_done`] = isDone;
  // Also save textarea
  const ta = document.getElementById("note-textarea");
  if (ta) data[`day${day}`] = ta.value;
  saveNotesData(data);
  renderNoteTabs();
  showToast(isDone ? `Day ${day} marked complete ✓` : `Day ${day} unmarked`);
}

function saveAllNotes() {
  const ta = document.getElementById("note-textarea");
  if (ta) {
    const data = getNotesData();
    data[`day${activeDay}`] = ta.value;
    saveNotesData(data);
  }
  showToast("Notes saved ✓");
}

function getDayLabel(day) {
  const labels = [
    "Getting Started", "Building Momentum", "Deep Work", "Midpoint Check-in",
    "Pushing Through", "Final Sprint", "Reflection & Review"
  ];
  return labels[day - 1] || `Day ${day}`;
}


// ════════════════════════════════════════════════════════════
//  ✦  AI CHATBOT  (Claude API)
// ════════════════════════════════════════════════════════════

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
let chatHistory = [];    // Stores { role, content } pairs for context
let isThinking  = false; // Prevents double-sends

const BOT_SYSTEM_PROMPT = `You are a friendly, knowledgeable assistant embedded in a productivity and task-management web app called ProjectTasks.

Your specialties are:
- Fitness & health (jogging, exercise routines, habits, nutrition, sleep, wellness)
- Productivity & task management (prioritization, time-blocking, focus techniques, GTD)
- Habit building and daily routine optimization
- Motivation, goal setting, and progress tracking

When a user asks about a specific activity (like jogging), give a thorough, well-structured response covering:
1. What it is / benefits
2. How to get started or improve
3. A simple progress plan or milestones they can track
4. A motivational closing note

Format your answers clearly using short paragraphs. Use emojis sparingly for visual appeal.
Keep responses concise but informative — aim for 150-300 words unless more depth is genuinely needed.
Always be warm, encouraging, and practical.`;

function initChatEnterKey() {
  document.getElementById("chat-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function sendSuggestion(btn) {
  const text = btn.textContent.replace(/^[^\w]+/, "").trim();
  document.getElementById("chat-input").value = text;
  sendMessage();
}

async function sendMessage() {
  if (isThinking) return;

  const input   = document.getElementById("chat-input");
  const userMsg = input.value.trim();
  if (!userMsg) return;

  input.value = "";
  isThinking  = true;
  document.getElementById("btn-send").disabled = true;

  // Hide suggestion chips after first message
  const suggestions = document.getElementById("chat-suggestions");
  if (suggestions) suggestions.style.display = "none";

  // Show user bubble
  appendBubble("user", userMsg);
  chatHistory.push({ role: "user", content: userMsg });

  // Show typing indicator
  const typingId = appendTypingIndicator();

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: BOT_SYSTEM_PROMPT,
        messages: chatHistory
      })
    });

    const json = await response.json();
    const botReply = json?.content?.[0]?.text || "Sorry, I couldn't generate a response. Please try again.";

    removeTypingIndicator(typingId);
    chatHistory.push({ role: "assistant", content: botReply });

    // Check if reply contains progress info → render a visual progress bar
    const hasProgress = /progress|week|day \d|plan|schedule|milestone/i.test(botReply);
    appendBubble("bot", botReply, hasProgress);

  } catch (err) {
    removeTypingIndicator(typingId);
    appendBubble("bot", "⚠ I couldn't reach the AI server. Please check your connection and try again.");
    console.error("Chat API error:", err);
  }

  isThinking = false;
  document.getElementById("btn-send").disabled = false;
}

function appendBubble(role, text, showProgress = false) {
  const win  = document.getElementById("chat-window");
  const div  = document.createElement("div");
  const isBot = role === "bot";

  div.className = `chat-bubble ${isBot ? "bot-bubble" : "user-bubble"}`;

  // Convert markdown-like **bold** and newlines to HTML
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .split("\n")
    .filter(l => l.trim())
    .map(l => `<p>${l}</p>`)
    .join("");

  let progressHTML = "";
  if (showProgress && isBot) {
    const pct = Math.floor(Math.random() * 30) + 10; // Starts low — shows beginning of journey
    progressHTML = `
      <div style="margin-top:10px;">
        <p style="font-size:12px;color:var(--ink3);margin-bottom:4px;">Your starting point — track progress as you go:</p>
        <div class="chat-progress-bar">
          <div class="chat-progress-fill" style="width:${pct}%"></div>
        </div>
        <p style="font-size:11px;color:var(--ink3);margin-top:4px;">${pct}% of your first week goal</p>
      </div>`;
  }

  div.innerHTML = `
    <div class="bubble-icon">${isBot ? "✦" : "U"}</div>
    <div class="bubble-body">${formatted}${progressHTML}</div>`;

  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function appendTypingIndicator() {
  const win = document.getElementById("chat-window");
  const id  = "typing-" + Date.now();
  const div = document.createElement("div");
  div.className = "chat-bubble bot-bubble";
  div.id = id;
  div.innerHTML = `
    <div class="bubble-icon">✦</div>
    <div class="bubble-body">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

function clearChat() {
  chatHistory = [];
  const win = document.getElementById("chat-window");
  win.innerHTML = `
    <div class="chat-bubble bot-bubble">
      <div class="bubble-icon">✦</div>
      <div class="bubble-body">
        <p>Conversation cleared! Ask me anything — fitness, productivity, habits, or anything else!</p>
      </div>
    </div>`;
  // Restore suggestions
  const s = document.getElementById("chat-suggestions");
  if (s) s.style.display = "flex";
}
