import type { Metadata } from "next";

export const metadata: Metadata = { title: "Split · Fluxpay" };

export default function Split() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-2 bg-zinc-950 px-6 font-sans text-zinc-50">
      <h1 className="text-2xl font-semibold">Split</h1>
      <p className="text-sm text-zinc-400">One tap, all settled.</p>
    </main>
  );
}
