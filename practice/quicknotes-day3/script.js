console.log("Hello from JavaScript!");
console.log(2 + 3);

// 1. Our data: an array of note objects
let notes = [];

// 2. Check that a note's text is acceptable
function isValidNote(text) {
  if (!text || typeof text !== "string") {
    return false;
  }
  const cleaned = text.trim();
  return cleaned.length > 0 && cleaned.length <= 200;
}

// 3. Add a note (returns true if added, false if rejected)
function addNote(text) {
  if (!isValidNote(text)) {
    console.log("❌ Note rejected: must be 1-200 characters.");
    return false;
  }

  let id = Date.now();
  // Ensure unique id if added within the same millisecond
  while (notes.some((note) => note.id === id)) {
    id++;
  }

  const note = {
    id: id,
    text: text.trim(),
  };

  notes.push(note);
  console.log(`✅ Note added: "${note.text}"`);
  return true;
}

// 4. List all notes
function listNotes() {
  if (notes.length === 0) {
    console.log("No notes to display.");
    console.log("You have 0 notes.");
    return;
  }

  notes.forEach((note, index) => {
    console.log(`${index + 1}. ${note.text}`);
  });
  console.log(`You have ${notes.length} ${notes.length === 1 ? "note" : "notes"}.`);
}

// 5. Delete a note by id
function deleteNote(id) {
  const initialLength = notes.length;
  notes = notes.filter((note) => note.id !== id && note.id !== Number(id));

  if (notes.length < initialLength) {
    console.log(`🗑️ Note ${id} deleted.`);
    return true;
  } else {
    console.log(`❌ Note with id ${id} not found.`);
    return false;
  }
}

// 6. Initial test notes
addNote("Revise HTML forms");
addNote("Push my code to Github");
addNote("");
listNotes();