import { loadArbByToken } from "@/server/arb";
import { getDownload } from "@/lib/storage";
import { isUuid } from "@/server/loaders";

export const dynamic = "force-dynamic";

/** Resident download: only files attached to the request that this private link belongs to. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const r = isUuid(id) ? await loadArbByToken(token) : null;
  const doc = r?.documents.find((d) => d.id === id);
  if (!doc) return new Response("Not found", { status: 404 });
  const target = await getDownload(doc, new URL(req.url).searchParams.get("inline") === "1");
  if (target.type === "redirect") return Response.redirect(target.url, 302);
  return new Response(new Uint8Array(target.body), {
    headers: {
      "Content-Type": target.contentType,
      "Content-Disposition": target.disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
