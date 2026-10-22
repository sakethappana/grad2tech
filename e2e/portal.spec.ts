import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

/**
 * End-to-end checks against a running dev server with `npm run seed:dev` data.
 * The dev seed password is read from DEV_SEED_PASSWORD in .env.
 */
const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "";
const TRAINER = "trainer@grad2tech.test";
const STUDENT = "student.one@grad2tech.test";

async function signIn(page: Page, email: string, as: "student" | "admin") {
  await page.goto(`/portal/login?as=${as}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeAll(() => {
  if (!PASSWORD) throw new Error("Set DEV_SEED_PASSWORD (used by npm run seed:dev) to run e2e tests.");
});

test("public site links to the Learning Portal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("From graduation");
  await page.getByRole("link", { name: "Learning Portal" }).first().click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("link", { name: /Student Login/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Admin \/ Trainer Login/ })).toBeVisible();
});

test("the chosen login option never decides the role", async ({ page }) => {
  // A student who picks the admin option still lands in the student portal.
  await signIn(page, STUDENT, "admin");
  await expect(page).toHaveURL(/\/portal\/student$/);
  await page.goto("/portal/admin");
  await expect(page).toHaveURL(/\/portal\/student$/);
  // Admin-only API rejects students.
  const res = await page.request.get("/api/reports/export");
  expect(res.status()).toBe(403);
});

test("signed-out visitors are sent to sign in, keeping the destination", async ({ page }) => {
  await page.goto("/portal/student/tests");
  await expect(page).toHaveURL(/\/portal\/login\?.*next=%2Fportal%2Fstudent%2Ftests/);
  const res = await page.request.get("/api/notifications/summary");
  expect(res.status()).toBe(401);
});

test("wrong password shows a clear error", async ({ page }) => {
  await page.goto("/portal/login?as=student");
  await page.getByLabel("Email").fill(STUDENT);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(/not correct|Too many attempts/);
});

test("trainer sees the overview and can open every sidebar section", async ({ page }) => {
  await signIn(page, TRAINER, "admin");
  await expect(page).toHaveURL(/\/portal\/admin$/);
  for (const name of ["Batches", "Students", "Assignments", "Tests", "Doubts", "Live Classes", "Projects", "Reports", "Announcements", "Settings", "Overview"]) {
    await page.getByRole("navigation", { name: "Portal navigation" }).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("text=Something went wrong")).toHaveCount(0);
  }
});

test("student dashboard, assignment draft and submission", async ({ page }) => {
  await signIn(page, STUDENT, "student");
  await expect(page.getByText("Next step")).toBeVisible();
  await page.goto("/portal/student/assignments?view=all");
  await page.getByRole("link", { name: /\[Dev sample\] Build a responsive profile card/ }).click();
  await page.getByLabel("Written response").fill("My card uses flexbox. 😀 नमस्ते");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await expect(page.getByLabel("Written response")).toHaveValue(/नमस्ते/);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText(/Submitted/).first()).toBeVisible();
});

test("test attempt: autosave survives reload, then submit", async ({ page }) => {
  await signIn(page, STUDENT, "student");
  await page.goto("/portal/student/tests");
  await page.getByRole("link", { name: /\[Dev sample\] JavaScript basics practice/ }).first().click();
  const start = page.getByRole("button", { name: /Start (test|attempt)/ });
  if (await start.isVisible()) await start.click();
  else await page.getByRole("link", { name: /Resume attempt/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByLabel("let").check();
  await expect(page.getByText("All answers saved")).toBeVisible();
  const before = await page.getByRole("timer").textContent();
  await page.reload();
  await expect(page.getByLabel("let")).toBeChecked();
  const after = await page.getByRole("timer").textContent();
  expect(after).not.toBeNull();
  expect(before).not.toBeNull();
  await page.getByRole("button", { name: "Submit test" }).click();
  await page.getByRole("button", { name: "Yes, submit" }).click();
  await expect(page.getByText("Submission received.")).toBeVisible();
});

test("doubt: student asks, trainer replies, student sees the reply", async ({ browser }) => {
  const studentPage = await (await browser.newContext()).newPage();
  await signIn(studentPage, STUDENT, "student");
  await studentPage.goto("/portal/student/doubts/new");
  const title = `E2E doubt ${Date.now()}`;
  await studentPage.getByLabel("Short title").fill(title);
  await studentPage.getByLabel("Topic").fill("Promises");
  await studentPage.getByLabel("What's the problem?").fill("My promise resolves to undefined when I chain then().");
  await studentPage.getByRole("button", { name: "Post doubt" }).click();
  await expect(studentPage.getByRole("heading", { name: title })).toBeVisible();

  const trainerPage = await (await browser.newContext()).newPage();
  await signIn(trainerPage, TRAINER, "admin");
  await trainerPage.goto("/portal/admin/doubts?status=unanswered");
  await trainerPage.getByRole("link", { name: title }).click();
  await trainerPage.getByLabel("Reply").fill("Return the promise from inside then().");
  await trainerPage.getByRole("button", { name: "Post reply" }).click();
  await expect(trainerPage.getByText("Reply posted.")).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.getByText("Return the promise from inside then().")).toBeVisible();
});

test("workspace: static project saves, reopens and previews in a sandbox", async ({ page }) => {
  await signIn(page, STUDENT, "student");
  await page.goto("/portal/student/workspace");
  await page.getByLabel("Project name").fill(`E2E site ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTitle("Page preview")).toBeVisible();
  const frame = page.frameLocator('iframe[title="Page preview"]');
  await expect(frame.getByRole("heading", { name: "Hello, Grad2Tech!" })).toBeVisible();
  // The preview runs in an opaque origin: it cannot read the portal's cookies.
  const sandbox = await page.getByTitle("Page preview").getAttribute("sandbox");
  expect(sandbox).not.toContain("allow-same-origin");
  await page.reload();
  await expect(page.getByRole("button", { name: /index\.html/ })).toBeVisible();
});
