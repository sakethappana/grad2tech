import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { buildStaticPreview } from "@/lib/static-preview";
import { buildZip, createEntry, createProject, deleteEntry, getProjectFor, renameEntry, saveFile, submitProject, validatePath } from "@/server/workspace/projects";
import { makeUser, prisma, resetDb } from "./helpers";

beforeEach(resetDb);

describe("full-stack workspace (workflow 12)", () => {
  it("a saved project can be reopened and submitted as a fixed snapshot", async () => {
    const s = await makeUser("STUDENT");
    const p = await createProject(s.id, { name: "Notes app", template: "fullstack", briefId: null });
    await saveFile(s.id, p.id, "server/index.js", "console.log('v1')");
    await createEntry(s.id, p.id, "client/components", "folder");
    await createEntry(s.id, p.id, "client/components/List.jsx", "file");
    await renameEntry(s.id, p.id, "client/components", "client/ui");

    // Reopen (fresh read from the database).
    const reopened = await getProjectFor(s, p.id);
    const files = Object.fromEntries(reopened.files.map((f) => [f.path, f.content]));
    expect(files["server/index.js"]).toBe("console.log('v1')");
    expect(files["client/ui/List.jsx"]).toBe("");
    expect(files["package.json"]).toContain("concurrently");

    const sub = await submitProject(s, p.id, "First version");
    await saveFile(s.id, p.id, "server/index.js", "console.log('v2')");
    const frozen = await prisma.projectSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect((frozen.snapshot as Record<string, string>)["server/index.js"]).toBe("console.log('v1')");

    const zip = await JSZip.loadAsync(await buildZip(frozen.snapshot as Record<string, string>));
    expect(await zip.file("server/index.js")!.async("string")).toBe("console.log('v1')");
  });

  it("only the owner can change a project; admins can read it", async () => {
    const owner = await makeUser("STUDENT", "Owner");
    const other = await makeUser("STUDENT", "Other");
    const admin = await makeUser("ADMIN");
    const p = await createProject(owner.id, { name: "Site", template: "static-web", briefId: null });
    await expect(saveFile(other.id, p.id, "index.html", "hacked")).rejects.toMatchObject({ status: 404 });
    await expect(getProjectFor(other, p.id)).rejects.toMatchObject({ status: 404 });
    expect((await getProjectFor(admin, p.id)).id).toBe(p.id);
    await expect(deleteEntry(other.id, p.id, "index.html")).rejects.toMatchObject({ status: 404 });
  });

  it("rejects unsafe paths and oversized files", async () => {
    for (const bad of ["../etc/passwd", "/abs.js", "a/../../b", "node_modules/x.js", "a b.js", ".git/config"]) {
      expect(() => validatePath(bad)).toThrow();
    }
    expect(validatePath("./src/App.jsx")).toBe("src/App.jsx");
    const s = await makeUser("STUDENT");
    const p = await createProject(s.id, { name: "Big", template: "static-web", briefId: null });
    await expect(saveFile(s.id, p.id, "big.txt", "x".repeat(600_000))).rejects.toMatchObject({ status: 422 });
  });

  it("static previews inline project files for a sandboxed frame", () => {
    const html = buildStaticPreview({
      "index.html": '<html><head><link rel="stylesheet" href="styles.css"></head><body><script src="script.js"></script></body></html>',
      "styles.css": "body{color:red}",
      "script.js": "console.log('</script> safe')",
    });
    expect(html).toContain("body{color:red}");
    expect(html).toContain("console.log('<\\/script> safe')");
    expect(html).toContain("__g2tPreview");
  });
});
