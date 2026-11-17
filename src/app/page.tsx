import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { Landing } from "./landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const t = await getTenant();
  if (t.kind === "platform") return <Landing />;
  redirect("/login");
}
