import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-display text-4xl">No such desk</h1>
      <p className="mt-3 text-muted">That path is not part of the Ghana Health Service site.</p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
        Return home
      </Link>
    </div>
  );
}
