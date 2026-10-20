// ── Element references ────────────────────────────────────────────────────────
const loadBtn     = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusEl    = document.querySelector("#status");
const usersList   = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// In-memory store for the full user array loaded from the server
let allUsers = [];

// ── Render ────────────────────────────────────────────────────────────────────

/**
 * Draws any array of user objects into #users-list.
 * Uses createElement and textContent — never innerHTML — for safety.
 * Shows a "no match" message when the list is empty and a filter is active.
 */
function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    usersList.appendChild(li);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const details = document.createElement("span");
    details.textContent = ` — ${user.email} | ${user.address.city} | ${user.company.name}`;

    li.appendChild(name);
    li.appendChild(details);
    usersList.appendChild(li);
  });
}

// ── Load (GET) ────────────────────────────────────────────────────────────────

/**
 * Fetches all users from the API using async / await and try / catch / finally.
 * Checks response.ok before parsing JSON.
 * Shows loading, success and error messages in #status.
 * Disables the load button while the request is in flight.
 */
async function loadUsers() {
  // Loading state
  loadBtn.disabled = true;
  statusEl.textContent = "Loading users…";
  usersList.innerHTML = "";
  allUsers = [];

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const users = await response.json();
    allUsers = users;

    renderUsers(allUsers);
    statusEl.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    console.error("loadUsers failed:", error);
  } finally {
    // Always re-enable the button, whether the request succeeded or failed
    loadBtn.disabled = false;
  }
}

// ── Filter ────────────────────────────────────────────────────────────────────

/**
 * Filters the in-memory allUsers array by name (case-insensitive).
 * Calls renderUsers with the filtered subset — no new network request.
 */
function filterUsers() {
  const term = filterInput.value.trim().toLowerCase();

  if (term === "") {
    renderUsers(allUsers);
    return;
  }

  const filtered = allUsers.filter((user) =>
    user.name.toLowerCase().includes(term)
  );

  renderUsers(filtered);
}

// ── Event listeners ───────────────────────────────────────────────────────────
loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);
