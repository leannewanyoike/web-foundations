# Course Reflection: Web Foundations

The most difficult concept for me was understanding how to scale an application and manage multiple users making changes at the same time. At first, I thought adding more components, such as caches, load balancers and read replicas, automatically made a system better. However, the URL shortener walkthrough helped me understand that good system design starts with a simple solution and only adds complexity when there is a clear need.

I also found database transactions and isolation levels challenging, especially when dealing with situations like multiple users trying to book the same seat. I learned that without proper concurrency control, two users could end up booking the same seat. Working through examples helped me understand why database locks and transactions are important. The key lesson for me was to understand the problem first before deciding which technology or solution to use.

What I would improve in my capstone

One of the most useful pieces of feedback I received was to show the API request in the browser's Network tab when creating a note. I would include this in my demo because it would make it easier to show how the frontend communicates with the backend.

I would also improve how QuickNotes handles errors. For example, if the API is unavailable, the application should display a clear message instead of leaving the user wondering what went wrong. Another improvement would be to move tasks such as sending emails and processing notifications to background jobs rather than handling everything in the main request. This would help keep the application responsive, especially as more users start using it.

Finally, I would spend more time explaining the decisions behind my design. Rather than just showing the architecture, I would explain why I chose a particular approach and what trade-offs were involved.

What I will learn next

My next step is to build the QuickNotes API using Node.js and Express so I can put the concepts from the course into practice. I then want to connect it to PostgreSQL so that notes can be stored and retrieved for different users.

Once I am comfortable with these basics, I plan to learn more about background processing, caching and database performance. I also want to explore system design using The System Design Primer to understand how larger applications handle increasing traffic and more complex workloads.

Overall, this course has helped me understand that building a good application is not just about writing code. It is also about making sensible design decisions, understanding potential problems and knowing when a simpler solution is enough.
