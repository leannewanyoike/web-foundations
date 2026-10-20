PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_notes_user_created_at
  ON notes(user_id, created_at DESC);

CREATE INDEX idx_note_tags_tag_id
  ON note_tags(tag_id, note_id);

INSERT INTO users (id, name, email) VALUES
  (1, 'Amina', 'amina@example.com'),
  (2, 'Brian', 'brian@example.com'),
  (3, 'Leanne', 'leanne@example.com'),
  (4, 'Kendi', 'kendi@example.com');

INSERT INTO notes (id, user_id, text, created_at) VALUES
  (1, 1, 'Prepare the project brief', '2026-10-18T08:00:00Z'),
  (2, 1, 'Send the meeting notes', '2026-10-20T09:30:00Z'),
  (3, 2, 'Sketch the dashboard layout', '2026-10-19T14:15:00Z'),
  (4, 3, 'Pick up supplies', '2026-10-17T11:00:00Z');

INSERT INTO tags (id, name) VALUES
  (1, 'urgent'),
  (2, 'work'),
  (3, 'personal');

INSERT INTO note_tags (note_id, tag_id) VALUES
  (1, 2),
  (2, 1),
  (2, 2),
  (3, 2),
  (4, 3);

-- All of Amina's notes, newest first.
SELECT notes.text, notes.created_at
FROM users
JOIN notes ON notes.user_id = users.id
WHERE users.name = 'Amina'
ORDER BY notes.created_at DESC, notes.id DESC;

-- All notes tagged "urgent" (notes -> note_tags -> tags).
SELECT notes.text, notes.created_at
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags ON tags.id = note_tags.tag_id
WHERE tags.name = 'urgent'
ORDER BY notes.created_at DESC, notes.id DESC;

-- Count every user's notes, including users with none.
SELECT users.name, COUNT(notes.id) AS note_count
FROM users
LEFT JOIN notes ON notes.user_id = users.id
GROUP BY users.id, users.name
ORDER BY users.name;