// Select all required elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// Updates character and word counters and applies warning/over state classes
function updateCounts() {
  const text = noteText.value;
  const chars = text.length;
  charCount.textContent = `${chars} / 200 characters`;

  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  wordCount.textContent = `${words} words`;

  if (chars > 200) {
    charCount.classList.remove("warning");
    charCount.classList.add("over");
  } else if (chars > 180) {
    charCount.classList.add("warning");
    charCount.classList.remove("over");
  } else {
    charCount.classList.remove("warning");
    charCount.classList.remove("over");
  }
}

// Empties the textarea, resets counters, and removes the saved draft
function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  updateCounts();
}

// Toggles dark mode on <body>, updates the button label, and remembers choice in localStorage
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

// Event Listeners
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("draft", noteText.value);
});

clearBtn.addEventListener("click", clearAll);

noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Esc") {
    clearAll();
  }
});

themeToggle.addEventListener("click", toggleTheme);

// Restore saved draft and theme on page load, then update counters
const savedDraft = localStorage.getItem("draft");
if (savedDraft !== null) {
  noteText.value = savedDraft;
}

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "Light mode";
} else {
  document.body.classList.remove("dark");
  themeToggle.textContent = "Dark mode";
}

updateCounts();
