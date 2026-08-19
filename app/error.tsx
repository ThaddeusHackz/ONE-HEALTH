"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-red">Desk fault</p>
      <h1 className="font-display mt-3 text-3xl">This page failed to render</h1>
      <p className="mt-3 text-sm text-muted">{error.message || "Unexpected error"}</p>
      <button onClick={() => reset()} className="mt-6 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}
