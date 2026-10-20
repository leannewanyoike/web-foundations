// ── Element references ────────────────────────────────────────────────────────
const loadBtn   = document.getElementById("load-btn");
const statusEl  = document.getElementById("status");
const notesList = document.getElementById("notes-list");
const noteForm  = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");

const API_BASE = "https://jsonplaceholder.typicode.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set the #status paragraph text (and optionally a colour hint). */
function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.style.color =
    type === "error"   ? "red"   :
    type === "success" ? "green" :
    "inherit";
}

/** Append a single note <li> to #notes-list using textContent (never innerHTML). */
function appendNote(note) {
  const li = document.createElement("li");

  const strong = document.createElement("strong");
  strong.textContent = note.title;

  const small = document.createElement("small");
  small.textContent = ` — id: ${note.id}`;

  li.appendChild(strong);
  li.appendChild(small);
  notesList.appendChild(li);
}

// ── Load notes (GET) ──────────────────────────────────────────────────────────

async function loadNotes() {
  // Disable button and show loading state
  loadBtn.disabled = true;
  notesList.innerHTML = "";
  setStatus("Loading notes…");

  try {
    const response = await fetch(`${API_BASE}/posts?_limit=5`);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const notes = await response.json();

    notes.forEach(appendNote);
    setStatus(`Loaded ${notes.length} notes from the server.`, "success");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  } finally {
    loadBtn.disabled = false;
  }
}

// ── Create a note (POST) ──────────────────────────────────────────────────────

async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) {
    setStatus("Please enter a title before sending.", "error");
    return;
  }

  // Disable form while request is in flight
  const submitBtn = noteForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  setStatus("Sending note to server…");

  try {
    const response = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title,
        body: "",
        userId: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const created = await response.json();

    // JSONPlaceholder echoes the new post back with a fake id (101)
    setStatus(
      `Note created! Server gave it id: ${created.id} — title: "${created.title}"`,
      "success"
    );

    titleInput.value = "";
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  } finally {
    submitBtn.disabled = false;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
loadBtn.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
