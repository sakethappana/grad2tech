/**
 * DEMO-ONLY: five open practice tests with no closing date, for showing the portal.
 * Local databases only. Re-running skips tests that already exist (matched by title).
 *
 *   npm run seed:demo-tests
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { createAssessment, publishAssessment, upsertQuestion, type QuestionInput } from "../src/server/assessments/admin";

const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Refusing to run: demo tests are only created in a local database.");
  process.exit(1);
}

const base: Omit<QuestionInput, "type" | "topic" | "prompt" | "marks" | "options" | "correctOptionIds" | "solution"> = {
  inputFormat: null,
  outputFormat: null,
  constraints: null,
  starterCode: {},
  allowedLanguages: [],
  timeLimitMs: null,
  memoryLimitKb: null,
  scoring: null,
  cases: [],
};

function mcq(topic: string, prompt: string, options: string[], correct: number[], solution: string, marks = 2): QuestionInput {
  const opts = options.map((text, i) => ({ id: `o${i + 1}`, text }));
  return {
    ...base,
    type: correct.length > 1 ? "MCQ_MULTI" : "MCQ_SINGLE",
    topic,
    prompt,
    marks,
    options: opts,
    correctOptionIds: correct.map((i) => opts[i].id),
    solution,
  };
}

function short(topic: string, prompt: string, solution: string, marks = 4): QuestionInput {
  return { ...base, type: "SHORT_ANSWER", topic, prompt, marks, options: [], correctOptionIds: [], solution };
}

const TESTS: { title: string; instructions: string; questions: QuestionInput[] }[] = [
  {
    title: "[Demo] HTML & CSS Fundamentals",
    instructions: "Covers semantic HTML, the box model and responsive layout. Answers save automatically.",
    questions: [
      mcq("HTML", "Which element is the most appropriate for the main navigation links of a page?", ["`<div>`", "`<nav>`", "`<section>`", "`<aside>`"], [1], "`<nav>` marks a block of major navigation links."),
      mcq("CSS", "In the standard CSS box model, which of these are included in an element's `width` when `box-sizing: content-box`?", ["Content only", "Content + padding", "Content + padding + border", "Content + padding + border + margin"], [0], "With content-box, width covers only the content area."),
      mcq("CSS", "Which properties are used with Flexbox? (Select all that apply)", ["`justify-content`", "`grid-template-columns`", "`align-items`", "`flex-direction`"], [0, 2, 3], "`grid-template-columns` belongs to CSS Grid."),
      mcq("Responsive design", "Which media query targets screens 768px wide or narrower?", ["`@media (min-width: 768px)`", "`@media (max-width: 768px)`", "`@media (width > 768px)`", "`@media screen and (orientation: portrait)`"], [1], "max-width applies at that width and below."),
      short("Accessibility", "Why should every `<img>` that conveys meaning have an `alt` attribute? Give one example.", "Screen readers announce the alt text, and it shows if the image fails to load. Example: alt=\"Student dashboard showing three pending assignments\"."),
    ],
  },
  {
    title: "[Demo] JavaScript Basics",
    instructions: "Variables, functions, arrays and asynchronous code.",
    questions: [
      mcq("Variables", "Which keyword declares a block-scoped variable that cannot be reassigned?", ["`var`", "`let`", "`const`", "`static`"], [2], "`const` is block-scoped and cannot be reassigned."),
      mcq("Arrays", "What does `[1, 2, 3].map(n => n * 2)` return?", ["`[1, 2, 3]`", "`[2, 4, 6]`", "`12`", "`undefined`"], [1], "`map` returns a new array with each element transformed."),
      mcq("Types", "What is the result of `typeof null` in JavaScript?", ["`\"null\"`", "`\"undefined\"`", "`\"object\"`", "`\"number\"`"], [2], "A long-standing quirk: `typeof null` is \"object\"."),
      mcq("Async", "Which of these return or work with Promises? (Select all that apply)", ["`fetch()`", "`async` functions", "`setTimeout()`", "`Promise.all()`"], [0, 1, 3], "`setTimeout` uses a callback and returns a timer id, not a Promise."),
      short("Async", "Explain in two or three sentences what `await` does inside an `async` function.", "await pauses that async function until the Promise settles, then returns its value (or throws its error), without blocking the rest of the program."),
    ],
  },
  {
    title: "[Demo] React Essentials",
    instructions: "Components, props, state and effects.",
    questions: [
      mcq("Components", "How do you pass data from a parent component to a child in React?", ["Using state", "Using props", "Using refs", "Using the DOM"], [1], "Props pass data down from parent to child."),
      mcq("State", "Which hook adds local state to a function component?", ["`useEffect`", "`useState`", "`useMemo`", "`useRef`"], [1], "`useState` returns the state value and a setter."),
      mcq("Lists", "Why does React need a `key` prop when rendering a list?", ["For styling each item", "To identify items between renders", "To make items clickable", "It is required by HTML"], [1], "Keys let React match items across renders efficiently and correctly."),
      mcq("Effects", "When does `useEffect(() => { ... }, [])` run its effect?", ["On every render", "Only after the first render", "Never", "Only when the component unmounts"], [1], "An empty dependency array runs the effect once after the first render."),
      short("Components", "What is the difference between props and state?", "Props are inputs passed from a parent and are read-only in the child; state is data owned and updated by the component itself, and changing it re-renders the component."),
    ],
  },
  {
    title: "[Demo] Node.js & Express APIs",
    instructions: "HTTP methods, routing, middleware and status codes.",
    questions: [
      mcq("HTTP", "Which HTTP method is normally used to create a new resource?", ["GET", "POST", "DELETE", "HEAD"], [1], "POST creates a new resource; PUT/PATCH update."),
      mcq("Status codes", "Which status code means \"Not Found\"?", ["200", "201", "404", "500"], [2], "404 Not Found."),
      mcq("Express", "What does `app.use(express.json())` do?", ["Starts the server", "Parses JSON request bodies", "Sends JSON responses", "Connects to a database"], [1], "It is middleware that parses JSON bodies into `req.body`."),
      mcq("Express", "Which of these are valid ways to send a response in Express? (Select all that apply)", ["`res.json({ ok: true })`", "`res.send('hi')`", "`res.status(201).json(data)`", "`req.send('hi')`"], [0, 1, 2], "Responses are sent with `res`, not `req`."),
      short("Middleware", "What is middleware in Express? Give one example of what it is used for.", "A function that runs between the request and the route handler, with access to req, res and next. Examples: logging, authentication, parsing bodies."),
    ],
  },
  {
    title: "[Demo] Databases & SQL",
    instructions: "Tables, keys, queries and relationships.",
    questions: [
      mcq("Keys", "What does a primary key guarantee?", ["Values are sorted", "Each row is uniquely identified", "Values are encrypted", "The column can be empty"], [1], "A primary key uniquely identifies each row and cannot be null."),
      mcq("SQL", "Which SQL statement returns rows from a table?", ["`INSERT`", "`UPDATE`", "`SELECT`", "`DROP`"], [2], "`SELECT` reads rows."),
      mcq("SQL", "Which clause filters rows before grouping?", ["`WHERE`", "`HAVING`", "`ORDER BY`", "`LIMIT`"], [0], "`WHERE` filters rows; `HAVING` filters groups."),
      mcq("Joins", "Which joins return rows that have a match in both tables? (Select all that apply)", ["`INNER JOIN`", "`JOIN` (without a keyword)", "`LEFT JOIN`", "`CROSS JOIN`"], [0, 1], "Plain `JOIN` is an inner join; LEFT JOIN also keeps unmatched left rows."),
      short("Relationships", "What is a foreign key, and why is it useful?", "A column that references the primary key of another table. It links related rows and lets the database prevent references to rows that don't exist."),
    ],
  },
];

async function main() {
  const admin = (await prisma.user.findUnique({ where: { email: "admin@gmail.com" } })) ?? (await prisma.user.findFirst({ where: { role: "ADMIN" } }));
  if (!admin) throw new Error("No admin account found. Create one first.");
  const batch = await prisma.batch.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } });
  if (!batch) throw new Error("No active batch found. Create a batch first.");

  for (const t of TESTS) {
    if (await prisma.assessment.findFirst({ where: { title: t.title, status: { not: "CANCELLED" } } })) {
      console.log(`exists: ${t.title}`);
      continue;
    }
    const a = await createAssessment(admin.id, {
      title: t.title,
      instructions: t.instructions,
      kind: "PRACTICE",
      opensAt: new Date(Date.now() - 60_000),
      // Effectively no deadline: open until the end of 2035.
      closesAt: new Date("2035-12-31T18:29:00Z"),
      durationMinutes: 600,
      maxAttempts: 20,
      passPercent: 50,
      randomizeQuestions: false,
      resultPolicy: "WHEN_GRADED",
      solutionPolicy: "NEVER",
      helpPolicy: "ALLOWED",
      batchIds: [batch.id],
      studentIds: [],
    });
    for (const q of t.questions) await upsertQuestion(admin.id, a.id, null, q);
    await publishAssessment(admin.id, a.id, null);
    console.log(`created: ${t.title} (${t.questions.length} questions) for batch ${batch.code}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
