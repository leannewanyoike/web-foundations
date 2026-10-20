// Select DOM elements with querySelector
const noteForm = document.querySelector("#note-form");
const noteInput = document.querySelector("#note-input");
const categorySelect = document.querySelector("#note-category");
const errorMessage = document.querySelector("#error-message");
const searchInput = document.querySelector("#search-input");
const noteCount = document.querySelector("#note-count");
const noteList = document.querySelector("#note-list");

// In-memory notes array
let notes = [];

// Format timestamps for display
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

// Update the note count message for zero, one, and many notes
function updateCount(count) {
  if (count === 0) {
    noteCount.textContent = "You have 0 notes.";
  } else if (count === 1) {
    noteCount.textContent = "You have 1 note.";
  } else {
    noteCount.textContent = `You have ${count} notes.`;
  }
}

// Validate input text
function validateNoteText(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    errorMessage.textContent = "Note cannot be empty.";
    return false;
  }
  if (trimmed.length > 200) {
    errorMessage.textContent = "Note cannot exceed 200 characters.";
    return false;
  }
  errorMessage.textContent = "";
  return true;
}

// Render the list of notes into the DOM
function render(notesToRender = notes) {
  if (!noteList || !noteCount) return;

  noteList.innerHTML = "";
  updateCount(notesToRender.length);

  if (notesToRender.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-notes-hint";
    emptyLi.textContent = "No notes yet. Add your first note above!";
    noteList.appendChild(emptyLi);
    return;
  }

  notesToRender.forEach((note) => {
    const li = document.createElement("li");
    li.className = `note-card ${note.category} category-${note.category}`;

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "note-body";

    // Text content using textContent (never innerHTML for user text)
    const textP = document.createElement("p");
    textP.className = "note-text";
    textP.textContent = note.text;

    const metaDiv = document.createElement("div");
    metaDiv.className = "note-meta";

    const badge = document.createElement("span");
    badge.className = "category-badge";
    badge.textContent = note.category;

    const date = document.createElement("time");
    date.className = "note-date";
    date.textContent = formatDate(note.createdAt);

    metaDiv.appendChild(badge);
    metaDiv.appendChild(date);

    bodyDiv.appendChild(textP);
    bodyDiv.appendChild(metaDiv);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteNote(note.id));

    li.appendChild(bodyDiv);
    li.appendChild(deleteBtn);
    noteList.appendChild(li);
  });
}

// Add a new note
function addNote(text, category) {
  if (!validateNoteText(text)) {
    return false;
  }

  const newNote = {
    id: Date.now(),
    text: text.trim(),
    category: category || "personal",
    createdAt: new Date().toISOString()
  };

  notes.unshift(newNote);
  render();
  return true;
}

// Delete note by id
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id && n.id !== Number(id));
  render();
}

// Listen for form submission
if (noteForm && noteInput) {
  noteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const category = categorySelect ? categorySelect.value : "personal";
    const added = addNote(noteInput.value, category);
    if (added) {
      noteInput.value = "";
      noteInput.focus();
    }
  });

  // Clear error message when user begins typing
  noteInput.addEventListener("input", () => {
    if (errorMessage && errorMessage.textContent) {
      errorMessage.textContent = "";
    }
  });
}

// Initial render
render();
