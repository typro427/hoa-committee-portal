import { getRouteActor } from "@/lib/session";
import { loadDocument } from "@/server/loaders";
import { getDownload } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRouteActor();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  let doc;
  try {
    doc = await loadDocument(actor, (await params).id); // enforces committee isolation
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  await audit(actor, { action: "document.downloaded", entityType: "document", entityId: doc.id, committeeId: doc.committeeId });
  const target = await getDownload(doc, inline);
  if (target.type === "redirect") return Response.redirect(target.url, 302);
  return new Response(new Uint8Array(target.body), {
    headers: {
      "Content-Type": target.contentType,
      "Content-Disposition": target.disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
