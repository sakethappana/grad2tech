import { Icon, Wordmark } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <div style={{ position: "relative", zIndex: 1 }}>
          <Wordmark light href="/" />
          <div style={{ marginTop: 48 }}>
            <h1>Your learning portal for Full Stack Development.</h1>
            <p>Live classes, daily assignments, weekly assessments and trainer feedback — in one place.</p>
            <ul>
              <li>
                <Icon name="clipboard" /> Daily assignments and feedback
              </li>
              <li>
                <Icon name="test" /> Practice tests and weekly examinations
              </li>
              <li>
                <Icon name="code" /> Coding playground and project workspace
              </li>
              <li>
                <Icon name="question" /> Doubt discussions with your trainers
              </li>
            </ul>
          </div>
        </div>
        <p className="auth__foot">
          Portal access is created by Grad2Tech after admission. <a href="/">Back to the website</a>
        </p>
      </aside>
      <main className="auth__main" id="main">
        <div className="auth__card">{children}</div>
      </main>
    </div>
  );
}
