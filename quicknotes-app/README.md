# QuickNotes

QuickNotes is a lightweight, responsive web application designed for capturing, organising, and managing thoughts and tasks in real time. Built using semantic HTML5, modern CSS3 with Flexbox and media queries, and vanilla JavaScript, it lets users add categorised notes, search them instantly, and persist all data in the browser's `localStorage` across sessions — no frameworks, no build steps, no backend required.

## Features

- **Categorised Note Creation**: Assign notes to Personal, Work, or Study categories, each distinguished with a distinct left-border colour, background tint, and badge.
- **Form Validation & Error Handling**: Empty submissions and notes over 200 characters are rejected with a clear message in `#error-message`.
- **Safe DOM Rendering**: Note cards are built with `document.createElement()` and `textContent`, never `innerHTML`, preventing XSS injection.
- **Real-Time Live Search**: Filters notes by keyword as you type in the search box, case-insensitively.
- **Accurate Note Counter**: Grammatically correct count — "You have no notes yet.", "You have 1 note.", or "You have N notes."
- **LocalStorage Persistence**: Notes are saved as JSON on every change and restored on page load using `JSON.stringify` and `JSON.parse`.
- **Responsive Layout**: A centred 700 px max-width column with a Flexbox form that stacks vertically on screens 600 px or narrower.
- **Bonus — Clear All**: A "Clear All" button prompts `confirm("Delete all notes?")` before wiping every note at once.

## How to Run Locally

No build tools or dependencies are needed.

1. **Clone or navigate to the project folder:**
   ```bash
   cd quicknotes-app
   ```

2. **Open directly in your browser:**  
   Double-click `index.html`, or drag it into Chrome / Edge / Firefox.

3. **Or serve via a local static server:**
   ```bash
   # Node.js
   npx serve .

   # Python 3
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000` (or the port shown).

4. **VS Code:** Right-click `index.html` → **Open with Live Server**.

## What I Learned

1. **Safe DOM rendering prevents XSS**: Using `createElement` + `textContent` instead of `innerHTML` ensures that any text a user types is treated as plain text, never executed as HTML or script.
2. **Structured state with `localStorage`**: Keeping an in-memory array of `{ id, text, category, createdAt }` objects and syncing it to `localStorage` via `JSON.stringify`/`JSON.parse` taught me how client-side persistence works without a server.
3. **Declarative `render()` enables live filtering**: Separating the render step from the state means search filtering just calls `render()` with a filtered subset — the source array never changes, so removing a filter instantly restores all notes.
4. **Flexbox + media queries for responsive forms**: Wrapping inputs in a `display: flex; flex-wrap: wrap` form lets controls flow naturally on wide screens and stack to full-width on mobile with a single `flex-direction: column` override at 600 px.
