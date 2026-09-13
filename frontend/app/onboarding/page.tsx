import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in · Fluxpay" };

export default function Onboarding() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 bg-zinc-950 px-6 font-sans text-zinc-50">
      <h1 className="text-2xl font-semibold">Welcome to Fluxpay</h1>
      <button className="rounded-full bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-950">
        Continue with Face ID / passkey
      </button>
    </main>
  );
}
