import type { Metadata } from "next";

export const metadata: Metadata = { title: "Claim · Fluxpay" };

export default async function LinkClaim({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-2 bg-zinc-950 px-6 font-sans text-zinc-50">
      <h1 className="text-2xl font-semibold">You&apos;ve got money</h1>
      <p className="text-sm text-zinc-400">Claim this link · {id}</p>
      <button className="rounded-full bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-950">
        Claim with passkey
      </button>
    </main>
  );
}
