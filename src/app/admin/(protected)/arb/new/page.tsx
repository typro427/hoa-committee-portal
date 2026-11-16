import { requireAdmin } from "@/lib/session";
import { ArbNewView } from "@/views/arb-views";

export const metadata = { title: "Enter an ARB Request" };

export default async function Page() {
  const actor = await requireAdmin();
  return <ArbNewView actor={actor} />;
}
