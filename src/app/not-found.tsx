import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold text-navy-900">Page not found</h1>
      <p className="text-slate-600">This page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/portal" className="font-semibold text-navy-700 underline">Go to my committee</Link>
    </main>
  );
}
