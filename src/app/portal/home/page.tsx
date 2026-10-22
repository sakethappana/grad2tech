import { redirect } from "next/navigation";
import { homeFor, pageUser } from "@/server/session";

/** Post-login landing: the destination comes from the role stored on the server. */
export default async function PortalHome() {
  const user = await pageUser();
  redirect(homeFor(user.role));
}
