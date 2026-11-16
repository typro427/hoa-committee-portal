import { requireMember } from "@/lib/session";
import { ZoomImportView } from "@/views/write-minutes";

export const metadata = { title: "Import from Zoom" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireMember();
  return <ZoomImportView actor={actor} minutesId={(await params).id} />;
}
