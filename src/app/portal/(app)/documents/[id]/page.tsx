import { requireMember } from "@/lib/session";
import { DocumentDetailView } from "@/views/documents";

export const metadata = { title: "Document" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireMember();
  return <DocumentDetailView actor={actor} id={(await params).id} />;
}
