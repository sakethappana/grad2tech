/** Starter projects for the Full Stack Workspace. */

export type TemplateKey = "static-web" | "react" | "node-express" | "fullstack";

export type Template = {
  key: TemplateKey;
  name: string;
  description: string;
  /** "static" previews in a sandboxed frame; "node" runs in a WebContainer. */
  runtime: "static" | "node";
  /** Commands the workspace runs. */
  install?: string[];
  start?: string[];
  files: Record<string, string>;
};

const staticWeb: Template = {
  key: "static-web",
  name: "HTML, CSS & JavaScript",
  description: "A plain web page. Preview runs instantly in the browser.",
  runtime: "static",
  files: {
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My page</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="card">
    <h1>Hello, Grad2Tech!</h1>
    <p>Edit <code>index.html</code>, <code>styles.css</code> and <code>script.js</code>.</p>
    <button id="counter">Clicked 0 times</button>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
    "styles.css": `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  background: #f7f8fa;
  color: #0b1220;
}
.card {
  padding: 32px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(11, 18, 32, 0.08);
}
button {
  padding: 10px 16px;
  border: 0;
  border-radius: 8px;
  background: #14b8a6;
  color: #0b1220;
  font-weight: 700;
  cursor: pointer;
}
`,
    "script.js": `let count = 0;
const button = document.getElementById("counter");
button.addEventListener("click", () => {
  count += 1;
  button.textContent = \`Clicked \${count} time\${count === 1 ? "" : "s"}\`;
  console.log("count is", count);
});
`,
  },
};

const react: Template = {
  key: "react",
  name: "React frontend",
  description: "A React app built with Vite.",
  runtime: "node",
  install: ["npm", "install"],
  start: ["npm", "run", "dev"],
  files: {
    "package.json": JSON.stringify(
      {
        name: "react-starter",
        private: true,
        type: "module",
        scripts: { dev: "vite --host", build: "vite build" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { vite: "^5.4.10", "@vitejs/plugin-react": "^4.3.3" },
      },
      null,
      2,
    ) + "\n",
    "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>React starter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    "src/main.jsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

createRoot(document.getElementById("root")).render(<App />);
`,
    "src/App.jsx": `import { useState } from "react";

export default function App() {
  const [todos, setTodos] = useState(["Learn components", "Learn state"]);
  const [text, setText] = useState("");

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setTodos([...todos, text.trim()]);
    setText("");
  }

  return (
    <main className="app">
      <h1>My todos</h1>
      <form onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a todo" />
        <button>Add</button>
      </form>
      <ul>
        {todos.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </main>
  );
}
`,
    "src/App.css": `body { margin: 0; font-family: system-ui, sans-serif; background: #f7f8fa; color: #0b1220; }
.app { max-width: 480px; margin: 48px auto; padding: 24px; background: #fff; border-radius: 12px; }
form { display: flex; gap: 8px; }
input { flex: 1; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
button { padding: 8px 14px; border: 0; border-radius: 8px; background: #14b8a6; font-weight: 700; }
`,
  },
};

const nodeExpress: Template = {
  key: "node-express",
  name: "Node.js / Express API",
  description: "A REST API with Express. The preview shows the running server.",
  runtime: "node",
  install: ["npm", "install"],
  start: ["npm", "start"],
  files: {
    "package.json": JSON.stringify(
      {
        name: "express-api-starter",
        private: true,
        type: "module",
        scripts: { start: "node server.js" },
        dependencies: { express: "^4.21.1" },
      },
      null,
      2,
    ) + "\n",
    "server.js": `import express from "express";

const app = express();
app.use(express.json());

// In-memory data for practice. Restarting the server resets it.
let nextId = 3;
const todos = [
  { id: 1, title: "Learn routing", done: true },
  { id: 2, title: "Learn middleware", done: false },
];

app.get("/", (req, res) => {
  res.type("html").send(\`<h1>Express API is running</h1>
<p>Try <a href="/api/todos">GET /api/todos</a></p>\`);
});

app.get("/api/todos", (req, res) => res.json(todos));

app.post("/api/todos", (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  const todo = { id: nextId++, title, done: false };
  todos.push(todo);
  res.status(201).json(todo);
});

app.patch("/api/todos/:id", (req, res) => {
  const todo = todos.find((t) => t.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: "not found" });
  if (typeof req.body?.done === "boolean") todo.done = req.body.done;
  res.json(todo);
});

const port = 3000;
app.listen(port, () => console.log(\`API listening on port \${port}\`));
`,
    "README.md": `# Express API starter

- \`GET /api/todos\` lists todos
- \`POST /api/todos\` with \`{ "title": "..." }\` creates one
- \`PATCH /api/todos/:id\` with \`{ "done": true }\` updates one
`,
  },
};

const fullstack: Template = {
  key: "fullstack",
  name: "React + Node.js full stack",
  description: "A React client and an Express API running together.",
  runtime: "node",
  install: ["npm", "install"],
  start: ["npm", "run", "dev"],
  files: {
    "package.json": JSON.stringify(
      {
        name: "fullstack-starter",
        private: true,
        type: "module",
        scripts: {
          dev: 'concurrently -n api,web "node server/index.js" "vite --host"',
        },
        dependencies: { express: "^4.21.1", react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { vite: "^5.4.10", "@vitejs/plugin-react": "^4.3.3", concurrently: "^9.0.1" },
      },
      null,
      2,
    ) + "\n",
    "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Requests to /api are forwarded to the Express server.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3001" } },
});
`,
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Full stack starter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/client/main.jsx"></script>
  </body>
</html>
`,
    "client/main.jsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
`,
    "client/App.jsx": `import { useEffect, useState } from "react";

export default function App() {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  async function load() {
    try {
      const res = await fetch("/api/notes");
      setNotes(await res.json());
    } catch {
      setError("Could not reach the API");
    }
  }

  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) { setText(""); load(); }
  }

  return (
    <main style={{ maxWidth: 520, margin: "48px auto", fontFamily: "system-ui" }}>
      <h1>Notes</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <form onSubmit={add} style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note" style={{ flex: 1 }} />
        <button>Save</button>
      </form>
      <ul>{notes.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
    </main>
  );
}
`,
    "server/index.js": `import express from "express";

const app = express();
app.use(express.json());

let nextId = 2;
const notes = [{ id: 1, text: "The API is connected" }];

app.get("/api/notes", (req, res) => res.json(notes));
app.post("/api/notes", (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const note = { id: nextId++, text };
  notes.push(note);
  res.status(201).json(note);
});

app.listen(3001, () => console.log("API listening on port 3001"));
`,
  },
};

export const TEMPLATES: Record<TemplateKey, Template> = {
  "static-web": staticWeb,
  react,
  "node-express": nodeExpress,
  fullstack,
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export function isTemplateKey(k: string): k is TemplateKey {
  return k in TEMPLATES;
}
