const surfaces = [
  { name: "Pay", href: "/pay", desc: "Send, request, split" },
  { name: "Streams", href: "/streams", desc: "Pay per second" },
  { name: "Activity", href: "/activity", desc: "Live feed" },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-zinc-950 font-sans text-zinc-50">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="text-lg font-semibold tracking-tight">Fluxpay</div>
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <a className="hover:text-zinc-100" href="/onboarding">
            Sign in
          </a>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6">
        <p className="text-sm text-zinc-500">Money that moves like a message.</p>
        {surfaces.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="group flex flex-col gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 transition-colors hover:border-zinc-600"
          >
            <span className="text-lg font-medium">{s.name}</span>
            <span className="text-sm text-zinc-400">{s.desc}</span>
          </a>
        ))}
      </main>
    </div>
  );
}
