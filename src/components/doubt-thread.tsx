import { dt } from "@/lib/display";
import { Icon } from "./icons";
import { Badge, Markdown, initials } from "./ui";

type Message = {
  id: string;
  body: string;
  codeSnippet: string | null;
  codeLanguage: string | null;
  createdAt: Date;
  author: { id: string; name: string; role: "ADMIN" | "STUDENT" };
  files: { id: string; filename: string }[];
};

export function DoubtMessages({ messages }: { messages: Message[] }) {
  return (
    <ol className="thread" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {messages.map((m) => {
        const staff = m.author.role === "ADMIN";
        return (
          <li key={m.id} className={`msg${staff ? " msg--staff" : ""}`}>
            <span className="avatar" aria-hidden="true" style={staff ? { background: "var(--teal)", color: "var(--navy)" } : undefined}>
              {initials(m.author.name)}
            </span>
            <div className="msg__bubble">
              <div className="msg__head">
                <strong>{m.author.name}</strong>
                {staff && <Badge tone="teal" plain>Trainer</Badge>}
                <span className="muted">{dt(m.createdAt)}</span>
              </div>
              <Markdown>{m.body}</Markdown>
              {m.codeSnippet && (
                <div style={{ marginTop: 10 }}>
                  {m.codeLanguage && <span className="small muted">{m.codeLanguage}</span>}
                  <pre className="codeblock">{m.codeSnippet}</pre>
                </div>
              )}
              {m.files.length > 0 && (
                <div className="row" style={{ marginTop: 10 }}>
                  {m.files.map((f) => (
                    <a key={f.id} className="btn btn--secondary btn--sm" href={`/api/files/${f.id}`} target="_blank" rel="noopener">
                      <Icon name="file" /> {f.filename}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const messageInclude = {
  orderBy: { createdAt: "asc" as const },
  include: {
    author: { select: { id: true, name: true, role: true } },
    files: { select: { id: true, filename: true } },
  },
};
