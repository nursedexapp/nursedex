import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-warm-white">
      <div className="text-center">
        <h1 className="font-heading text-5xl text-teal mb-4">NurseDex</h1>
        <p className="font-body text-xl text-soft-black-light mb-8">
          Find care that feels like family.
        </p>
        <Link
          href="/brand"
          className="inline-block bg-teal text-warm-white px-8 py-3 rounded-lg font-body font-medium hover:bg-teal-dark transition-colors"
        >
          View Brand Guidelines
        </Link>
      </div>
    </main>
  );
}
