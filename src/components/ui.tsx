import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Icon, type IconName } from "./icons";

export type Tone = "ok" | "warn" | "bad" | "info" | "teal" | "muted";

export function Badge({ tone = "muted", children, plain = false }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`badge badge--${tone}${plain ? " badge--plain" : ""}`}>{children}</span>;
}

export function PageHead({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  flush = false,
  footer,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  footer?: ReactNode;
  id?: string;
}) {
  return (
    <section className="card" id={id} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="card__head">
          {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
          {description && <p>{description}</p>}
        </div>
      )}
      <div className={flush ? "card__body card__body--flush" : "card__body"}>{children}</div>
      {footer && <div className="card__foot">{footer}</div>}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  href,
  alert = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </>
  );
  const cls = `stat${alert ? " stat--alert" : ""}`;
  return href ? (
    <Link className={cls} href={href}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Empty({ icon = "info", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Alert({ tone = "info", children, title }: { tone?: "ok" | "warn" | "bad" | "info"; children: ReactNode; title?: string }) {
  const icon: IconName = tone === "ok" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div className={`alert alert--${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon} />
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

/** Renders user-authored Markdown safely: raw HTML is skipped and output is sanitised. */
export function Markdown({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {c}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function Pager({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <span className="row">
        {page > 1 ? (
          <Link className="btn btn--secondary btn--sm" href={hrefFor(page - 1)}>
            Previous
          </Link>
        ) : (
          <span className="btn btn--secondary btn--sm" aria-disabled="true">
            Previous
          </span>
        )}
        {page < pages ? (
          <Link className="btn btn--secondary btn--sm" href={hrefFor(page + 1)}>
            Next
          </Link>
        ) : (
          <span className="btn btn--secondary btn--sm" aria-disabled="true">
            Next
          </span>
        )}
      </span>
    </nav>
  );
}

export function Meter({ value, label }: { value: number | null; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
