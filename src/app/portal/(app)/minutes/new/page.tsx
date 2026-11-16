import { requireMember } from "@/lib/session";
import { WriteMinutesView } from "@/views/write-minutes";

export const metadata = { title: "Write Minutes" };

export default async function Page() {
  const actor = await requireMember();
  return <WriteMinutesView actor={actor} />;
}
