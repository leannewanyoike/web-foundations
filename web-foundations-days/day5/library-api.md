# Library API Design

A REST API for managing a library's book collection.

**Base URL:** `https://api.library.example.com/v1`

---

## Endpoints

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns an array of all books in the library.
- **Request body:** None
- **Success status:** `200 OK`

---

### 2. Get a single book

- **Method:** `GET`
- **Path:** `/books/:id`
- **Description:** Returns the full details of the book with the given ID.
- **Request body:** None
- **Success status:** `200 OK`

---

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book to the library collection.
- **Example request body:**
  ```json
  {
    "title": "The Pragmatic Programmer",
    "author": "David Thomas",
    "year": 1999,
    "genre": "Software"
  }
  ```
- **Success status:** `201 Created`

---

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/books/:id`
- **Description:** Replaces all fields of the book with the given ID.
- **Example request body:**
  ```json
  {
    "title": "The Pragmatic Programmer",
    "author": "David Thomas",
    "year": 2019,
    "genre": "Software"
  }
  ```
- **Success status:** `200 OK`

---

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/:id`
- **Description:** Permanently removes the book with the given ID from the collection.
- **Request body:** None
- **Success status:** `204 No Content`

---

### 6. List books by author

- **Method:** `GET`
- **Path:** `/books?author=:name`
- **Description:** Returns all books whose author name contains the given query string (not case-sensitive). Uses a query parameter so no new route is needed.
- **Example:** `GET /books?author=Tolkien`
- **Request body:** None
- **Success status:** `200 OK`

---

## Error Codes

| Code | Name | Example situation |
|------|------|-------------------|
| `400` | Bad Request | A `POST /books` request is sent without a required field (e.g. `title` is missing from the request body). |
| `404` | Not Found | A `GET /books/999` request is made but no book with ID 999 exists in the database. |
