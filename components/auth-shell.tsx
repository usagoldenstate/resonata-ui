import type { ReactNode } from "react"
import { ArrowUpRight, Check } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-2">
      <section className="auth-brand-panel hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <a href="https://resonata.io/" aria-label="Resonata website" className="w-fit"><BrandLogo className="!w-44" /></a>
        <div className="max-w-lg py-16">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.18em] text-[#f69468]">Voice AI for hotels</p>
          <h1 className="text-5xl font-extrabold leading-[1.12] tracking-[-0.05em] xl:text-6xl">Always on.<br />Always <span className="text-[#f69468]">there for<br />your guests.</span></h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-[#b6b4ae]">Your conversations, insights, and voice agent. All in one thoughtful workspace.</p>
          <div className="mt-10 space-y-4 text-sm">
            {["A clearer view of every call", "Your property knowledge, connected", "Your team stays in control"].map(text => <p key={text} className="flex items-center gap-3"><Check className="size-4 text-[#f69468]" />{text}</p>)}
          </div>
        </div>
        <a href="https://resonata.io/" className="inline-flex w-fit items-center gap-2 text-xs text-[#b6b4ae] hover:text-white">Discover Resonata <ArrowUpRight className="size-3.5" /></a>
      </section>
      <section className="flex min-w-0 flex-col items-center justify-center gap-8 px-4 py-12 sm:px-8">
        <a href="https://resonata.io/" aria-label="Resonata website" className="lg:hidden"><BrandLogo /></a>
        {children}
        <p className="text-center text-xs text-muted-foreground">A warm welcome. A smarter workspace.</p>
      </section>
    </main>
  )
}
