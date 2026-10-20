# School Database Design

## Tables

- `students` stores each student's ID, required name, and unique required email address.
- `courses` stores each course's ID and required, unique name.
- `enrolments` records which student takes which course and stores that enrolment's grade. Its student and course IDs are required foreign keys; the grade can be `NULL` until it is assigned.

## Relationships

One student can have many enrolments, and one course can have many enrolments. Together these form a many-to-many relationship between students and courses: each student can take multiple courses, and each course can have multiple students. The `enrolments` join table is needed to represent that relationship and to store the grade that belongs to a particular student-course pair. Its unique constraint prevents a student from enrolling in the same course twice.

## Index

The database creates an index on `enrolments.course_id`. It helps SQLite find the students enrolled in a course and calculate course enrolment counts without scanning every enrolment row. The unique `(student_id, course_id)` constraint already provides an index useful for looking up a student's enrolments.

## SQL or NoSQL

I would choose SQL for this system. Students, courses, and enrolments have clear relationships, and the database needs reliable foreign keys, unique email addresses, and protection against duplicate enrolments. SQLite transactions and constraints keep those rules consistent when records are added or updated. A NoSQL database could store this data, but it would require more application-side work to enforce the same relationships and rules.