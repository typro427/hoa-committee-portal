import { requireAdmin } from "@/lib/session";
import { DocumentsListView } from "@/views/documents";

export const metadata = { title: "Documents" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdmin();
  return <DocumentsListView actor={actor} sp={await searchParams} />;
}
