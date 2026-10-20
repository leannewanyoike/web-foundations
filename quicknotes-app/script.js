// Select DOM elements with querySelector
const noteForm = document.querySelector("#note-form");
const noteInput = document.querySelector("#note-input");
const categorySelect = document.querySelector("#note-category");
const errorMessage = document.querySelector("#error-message");
const searchInput = document.querySelector("#search-input");
const noteCount = document.querySelector("#note-count");
const noteList = document.querySelector("#note-list");

// LocalStorage key
const STORAGE_KEY = "quicknotes_app_data";

// Load saved notes from localStorage or initialize empty array
let notes = loadNotes();

// Load notes from localStorage using JSON.parse
function loadNotes() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (err) {
    console.error("Error loading notes from localStorage:", err);
    return [];
  }
}

// Save notes to localStorage using JSON.stringify
function saveNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (err) {
    console.error("Error saving notes to localStorage:", err);
  }
}

// Generate a readable date and time string
function getReadableDateTime() {
  const now = new Date();
  return now.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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

// Validate input text (empty or > 200 characters)
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

// Render notes list into the DOM using createElement and textContent
function render(notesToRender = getVisibleNotes()) {
  if (!noteList || !noteCount) return;

  noteList.innerHTML = "";
  updateCount(notesToRender.length);

  if (notesToRender.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "empty-notes-hint";
    const query = searchInput ? searchInput.value.trim() : "";
    emptyLi.textContent = query !== ""
      ? "No notes found matching your search."
      : "No notes yet. Add your first note above!";
    noteList.appendChild(emptyLi);
    return;
  }

  notesToRender.forEach((note) => {
    const li = document.createElement("li");
    li.className = `note-card ${note.category} category-${note.category}`;
    li.dataset.id = note.id;

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "note-body";

    // Note text using textContent (never innerHTML for user text)
    const textP = document.createElement("p");
    textP.className = "note-text";
    textP.textContent = note.text;

    const metaDiv = document.createElement("div");
    metaDiv.className = "note-meta";

    // Small category label
    const badge = document.createElement("span");
    badge.className = "category-badge";
    badge.textContent = note.category;

    // Readable date and time
    const date = document.createElement("time");
    date.className = "note-date";
    date.textContent = note.createdAt;

    metaDiv.appendChild(badge);
    metaDiv.appendChild(date);

    bodyDiv.appendChild(textP);
    bodyDiv.appendChild(metaDiv);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete note: ${note.text.slice(0, 20)}`);
    deleteBtn.addEventListener("click", () => deleteNote(note.id));

    li.appendChild(bodyDiv);
    li.appendChild(deleteBtn);
    noteList.appendChild(li);
  });
}

// Filter notes based on active search input query
function getVisibleNotes() {
  if (!searchInput) return notes;
  const term = searchInput.value.trim().toLowerCase();
  if (term === "") return notes;

  return notes.filter((note) => {
    const textMatch = note.text.toLowerCase().includes(term);
    const categoryMatch = note.category.toLowerCase().includes(term);
    return textMatch || categoryMatch;
  });
}

// Add a new note with id, text, category, and createdAt (readable date and time)
function addNote(text, category) {
  if (!validateNoteText(text)) {
    return false;
  }

  let id = Date.now();
  while (notes.some((note) => note.id === id)) {
    id++;
  }

  const newNote = {
    id: id,
    text: text.trim(),
    category: category || "personal",
    createdAt: getReadableDateTime()
  };

  notes.unshift(newNote);
  saveNotes();
  render();
  return true;
}

// Delete note by id
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id && n.id !== Number(id));
  saveNotes();
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

// Live search listener
if (searchInput) {
  searchInput.addEventListener("input", () => {
    render();
  });
}

// Initial render from loaded localStorage data
render();
