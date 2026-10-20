PRAGMA foreign_keys = ON;

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  course_name TEXT NOT NULL UNIQUE
);

CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  grade TEXT,
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
  UNIQUE (student_id, course_id)
);

CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);

INSERT INTO students (student_id, name, email) VALUES
  (1, 'Lilian Wanyoike', 'lilian.wanyoike@example.edu'),
  (2, 'James Mwangi', 'james.mwangi@example.edu'),
  (3, 'Amina Hassan', 'amina.hassan@example.edu'),
  (4, 'Brian Otieno', 'brian.otieno@example.edu'),
  (5, 'Grace Njeri', 'grace.njeri@example.edu');

INSERT INTO courses (course_id, course_name) VALUES
  (1, 'Web Foundations'),
  (2, 'Database Design'),
  (3, 'JavaScript Basics');

INSERT INTO enrolments (enrolment_id, student_id, course_id, grade) VALUES
  (1, 1, 1, NULL),
  (2, 1, 2, 'A'),
  (3, 2, 1, 'B'),
  (4, 3, 2, 'A'),
  (5, 4, 3, 'B');

-- All courses and grades for one student, selected by name.
SELECT c.course_name, e.grade
FROM students AS s
JOIN enrolments AS e ON e.student_id = s.student_id
JOIN courses AS c ON c.course_id = e.course_id
WHERE s.name = 'Lilian Wanyoike'
ORDER BY c.course_name;

-- All students enrolled on one course.
SELECT s.name, s.email
FROM courses AS c
JOIN enrolments AS e ON e.course_id = c.course_id
JOIN students AS s ON s.student_id = e.student_id
WHERE c.course_name = 'Database Design'
ORDER BY s.name;

-- Student count per course, including courses with no enrolments.
SELECT c.course_name, COUNT(e.student_id) AS student_count
FROM courses AS c
LEFT JOIN enrolments AS e ON e.course_id = c.course_id
GROUP BY c.course_id, c.course_name
ORDER BY c.course_name;

-- Students who have no enrolments.
SELECT s.student_id, s.name, s.email
FROM students AS s
LEFT JOIN enrolments AS e ON e.student_id = s.student_id
WHERE e.enrolment_id IS NULL
ORDER BY s.name;

-- Record a grade for the first enrolment.
UPDATE enrolments
SET grade = 'A'
WHERE enrolment_id = 1;