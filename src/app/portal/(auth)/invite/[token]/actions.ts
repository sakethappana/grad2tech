"use server";

import { toActionError, type ActionResult } from "@/server/errors";
import { str } from "@/server/form";
import { acceptInvitation } from "@/server/people";

export async function acceptInviteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const password = str(fd, "password");
    if (password !== str(fd, "confirm")) {
      return { ok: false, error: "The two passwords don't match.", fieldErrors: { confirm: "Passwords don't match" } };
    }
    await acceptInvitation(str(fd, "token"), password);
    return { ok: true, data: { redirect: "/portal/login?welcome=1" } };
  } catch (e) {
    const r = toActionError(e);
    if (r.fieldErrors?.form) r.fieldErrors = { password: r.fieldErrors.form };
    return r;
  }
}
