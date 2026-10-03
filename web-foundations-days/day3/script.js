// ── Starting data ────────────────────────────────────────────────
let notes = [
  { id: 1, text: "Buy milk and bread",                category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment",        category: "study"    },
  { id: 3, text: "Email the project report to Grace",  category: "work"     },
  { id: 4, text: "Revise JavaScript arrays",           category: "study"    },
  { id: 5, text: "Call mum",                           category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// ── 1. searchNotes ────────────────────────────────────────────────
// Returns all notes whose text contains `word` (case-insensitive).
function searchNotes(word) {
  const lower = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(lower));
}

console.log("── searchNotes ──────────────────────────────");
console.log(searchNotes("arrays"));
// Expected: [ { id: 4, text: "Revise JavaScript arrays", category: "study" } ]
console.log(searchNotes("the"));
// Expected: notes 2 and 3 (both contain "the")
console.log(searchNotes("zzz"));
// Expected: [] (no match)

// ── 2. longestNote ────────────────────────────────────────────────
// Returns the note object with the most characters, or null if empty.
function longestNote() {
  if (notes.length === 0) return null;
  return notes.reduce((longest, note) =>
    note.text.length > longest.text.length ? note : longest
  );
}

console.log("\n── longestNote ──────────────────────────────");
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

// ── 3. countByCategory ───────────────────────────────────────────
// Returns { personal: n, work: n, study: n }.
function countByCategory() {
  const counts = {};
  notes.forEach((note) => {
    counts[note.category] = (counts[note.category] || 0) + 1;
  });
  return counts;
}

console.log("\n── countByCategory ──────────────────────────");
console.log(countByCategory());
// Expected: { personal: 2, work: 1, study: 2 }

// ── 4. getSummary ────────────────────────────────────────────────
// Returns "5 notes: 2 personal, 1 work, 2 study."
// Uses "note" for exactly one note, "notes" otherwise.
function getSummary() {
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";
  const counts = countByCategory();
  const parts = Object.entries(counts)
    .map(([category, count]) => `${count} ${category}`)
    .join(", ");
  return `${total} ${word}: ${parts}.`;
}

console.log("\n── getSummary ───────────────────────────────");
console.log(getSummary());
// Expected: "5 notes: 2 personal, 2 study, 1 work."

// ── 5. isDuplicate ────────────────────────────────────────────────
// Returns true if a note with the same trimmed, lowercased text exists.
function isDuplicate(text) {
  const normalised = text.trim().toLowerCase();
  return notes.some((note) => note.text.trim().toLowerCase() === normalised);
}

console.log("\n── isDuplicate ──────────────────────────────");
console.log(isDuplicate("Call mum"));          // true  – exact match
console.log(isDuplicate("  CALL MUM  "));      // true  – case + space ignored
console.log(isDuplicate("Call dad"));          // false – no match

// ── 6. addNote ────────────────────────────────────────────────────
// Adds a note only if: 1–200 chars, not a duplicate, valid category.
// Returns true when added, false otherwise.
function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length === 0 || cleaned.length > 200) {
    console.log("❌ Rejected: text must be 1–200 characters.");
    return false;
  }

  if (!VALID_CATEGORIES.includes(category)) {
    console.log(`❌ Rejected: category must be one of ${VALID_CATEGORIES.join(", ")}.`);
    return false;
  }

  if (isDuplicate(cleaned)) {
    console.log("❌ Rejected: a note with that text already exists.");
    return false;
  }

  const id = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id, text: cleaned, category });
  console.log(`✅ Note added: "${cleaned}" [${category}]`);
  return true;
}

console.log("\n── addNote ──────────────────────────────────");
addNote("Read Clean Code",        "study");    // ✅ added
addNote("Call mum",               "personal"); // ❌ duplicate
addNote("",                       "work");     // ❌ empty text
addNote("Plan weekend trip",      "fun");      // ❌ invalid category
addNote("Review pull requests",   "work");     // ✅ added

console.log("\n── Final state ──────────────────────────────");
console.log(getSummary());
// Expected: "7 notes: 2 personal, 2 work, 3 study."
console.log(notes);
