import { requireAdmin } from "@/lib/session";
import { WriteMinutesView } from "@/views/write-minutes";

export const metadata = { title: "Write Minutes" };

export default async function Page() {
  const actor = await requireAdmin();
  return <WriteMinutesView actor={actor} />;
}
