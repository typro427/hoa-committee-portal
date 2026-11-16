import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Render health check: verifies the app can reach PostgreSQL. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
