"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold text-navy-900">Something went wrong</h1>
      <p className="text-slate-600">Please try again. If the problem continues, contact your administrator.</p>
      <button onClick={reset} className="rounded-lg bg-navy-800 px-4 py-2 font-semibold text-white">Try again</button>
    </main>
  );
}
