# QuickNotes

QuickNotes is a lightweight, responsive web application designed for capturing, organizing, and managing thoughts and tasks in real time. Built using semantic HTML5, modern CSS3 with Flexbox and responsive card layouts, and vanilla JavaScript, it allows users to add categorized notes, perform instant live searches, and safely persist their data in browser local storage across sessions without relying on heavy external libraries or frameworks.

## Features

- **Categorized Note Creation**: Assign notes to Personal, Work, or Study categories, each distinguished with distinct card borders, background tints, and badges.
- **Form Validation & Error Handling**: Comprehensive validation ensuring empty submissions or notes exceeding 200 characters are gracefully rejected with a visible alert message in `#error-message`.
- **Safe DOM Rendering**: Dynamically builds note cards utilizing `document.createElement()` and `textContent` to strictly prevent Cross-Site Scripting (XSS) vulnerabilities.
- **Real-Time Live Search**: Instantly filters notes by keywords or categories as you type in the search box, updating the view while maintaining full data integrity.
- **Accurate Counter Tracking**: Live note counter that grammatically adapts for zero notes ("You have 0 notes."), a single note ("You have 1 note."), and multiple notes.
- **Persistent LocalStorage**: Automatically synchronizes note records using `localStorage`, `JSON.stringify`, and `JSON.parse` so notes persist seamlessly across browser refreshes.
- **Responsive Card Layout**: Polished desktop presentation with flexbox controls that neatly stack into a mobile-friendly layout on screens under 600px (`@media (max-width: 600px)`).

## How to Run Locally

You do not need any build steps, bundlers, or third-party dependencies to run QuickNotes.

1. **Clone or navigate to the repository**:
   ```bash
   cd quicknotes-app
   ```

2. **Open directly in your web browser**:
   - Double click `index.html` to open it in Google Chrome, Microsoft Edge, Firefox, or Safari.
   
3. **Or serve via a local static server**:
   - Using Node.js:
     ```bash
     npx serve .
     ```
   - Using Python 3:
     ```bash
     python -m http.server 8000
     ```
   - Using VS Code: Right-click `index.html` and select **Open with Live Server**.

## What I Learned

1. **Safe DOM Rendering and XSS Mitigation**: Constructing UI components with `document.createElement()` and populating user input strictly via `textContent` ensures that arbitrary HTML or script injection cannot execute, reinforcing frontend security best practices.
2. **State Management & LocalStorage Persistence**: Managing an in-memory array of structured objects (`{ id, text, category, createdAt }`) and pairing state changes with `JSON.stringify` and `JSON.parse` taught me how to maintain persistent user data across reloads without a dedicated backend database.
3. **Responsive Web Design with Flexbox & Media Queries**: Designing fluid input controls that automatically wrap on desktop and gracefully stack into full-width touch-friendly components below 600px (`@media (max-width: 600px)`) highlighted the importance of mobile-first and responsive design principles.
4. **Declarative Rendering & Real-Time Filtering**: Creating a decoupled `render()` function that accepts a dataset parameter allows real-time search filtering without mutating or losing the master state array.
