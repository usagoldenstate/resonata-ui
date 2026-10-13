"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import {
  LayoutDashboard,
  MessageSquareText,
  PhoneCall,
  Inbox,
  BarChart3,
  CircleSlash,
  DollarSign,
  HelpCircle,
  Building2,
  Bed,
  Mic,
  Settings,
  Wrench,
  FlaskConical,
  LogOut,
  Menu,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/lib/current-user-context"
import { featureFlags } from "@/lib/env"
import { organizationScopeLabel, useHotel } from "@/lib/hotel-context"
import { lineRequiredFor, routeAvailable } from "@/lib/product-lines"
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard"

import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { OptionSelect } from "@/components/ui/option-select"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

type Accent = "insights" | "agent"

type NavItem = { label: string; href: string; icon: ReactNode; visible: boolean }
type NavSection = { label: string; accent: Accent; items: NavItem[] }

// Everything reporting-flavored — the dashboard, call log, per-metric reports,
// and FAQ analytics — lives under Insights. Everything that shapes how the
// voice agent behaves lives under Agent. Each section carries its own accent
// so color signals which part of the product you're in.
const sections: NavSection[] = [
  {
    label: "Insights",
    accent: "insights",
    items: [
      { label: "Dashboard", href: "/", icon: <LayoutDashboard className="w-4 h-4" />, visible: featureFlags.showDashboard },
      { label: "Ask Insights", href: "/reporting/chat", icon: <MessageSquareText className="w-4 h-4" />, visible: featureFlags.showReporting && featureFlags.showReportingChat },
      { label: "Call Log", href: "/call-log", icon: <PhoneCall className="w-4 h-4" />, visible: true },
      { label: "Sales Inquiries", href: "/sales-inquiries", icon: <Inbox className="w-4 h-4" />, visible: true },
      { label: "Call Metrics", href: "/reporting/call-metrics", icon: <BarChart3 className="w-4 h-4" />, visible: featureFlags.showReporting },
      { label: "Not Booked Reasons", href: "/reporting/not-booked", icon: <CircleSlash className="w-4 h-4" />, visible: featureFlags.showReporting },
      { label: "Revenue", href: "/reporting/revenue", icon: <DollarSign className="w-4 h-4" />, visible: featureFlags.showReporting },
      { label: "FAQs", href: "/faqs", icon: <HelpCircle className="w-4 h-4" />, visible: true },
    ],
  },
  {
    label: "Agent",
    accent: "agent",
    items: [
      { label: "Knowledge Base", href: "/knowledge-base", icon: <Building2 className="w-4 h-4" />, visible: true },
      { label: "Room Mapping", href: "/room-mapping", icon: <Bed className="w-4 h-4" />, visible: true },
      { label: "Agent Configuration", href: "/agent-config", icon: <Mic className="w-4 h-4" />, visible: true },
    ],
  },
]

// Full, static class strings per accent so Tailwind's JIT sees them. Do not
// build these by interpolation — `bg-brand-${accent}/10` would be purged.
const ACCENT: Record<Accent, { label: string; activeText: string; activeBg: string; rail: string; icon: string }> = {
  insights: {
    label: "text-brand-insights",
    activeText: "text-brand-insights",
    activeBg: "bg-brand-insights/10",
    rail: "bg-brand-insights",
    icon: "text-brand-insights",
  },
  agent: {
    label: "text-brand-agent",
    activeText: "text-brand-agent",
    activeBg: "bg-brand-agent/10",
    rail: "bg-brand-agent",
    icon: "text-brand-agent",
  },
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { hotels, organizations, scope, setScope, loading, accessState, scopeLines } = useHotel()
  // Items tied to one product line show only when the scope has that line
  // (the same rule the protected layout's page guard enforces). Until the
  // hotel list loads, line-specific items stay hidden rather than flashing a
  // reservations nav at a sales-only hotel.
  const lineVisible = (href: string) =>
    scopeLines ? routeAvailable(href, scopeLines) : lineRequiredFor(href) === null
  // Scope select value: "hotel:<id>" or "org:<id>".
  const scopeValue = scope ? (scope.kind === "hotel" ? `hotel:${scope.hotelId}` : `org:${scope.organizationId}`) : ""
  const independentHotels = hotels.filter((h) => !h.organization_id)
  const { isPlatformAdmin } = useCurrentUser()
  const { signOut } = useClerk()
  const currentPageLabel = sections.flatMap(section => section.items).find(item => item.href === pathname)?.label
    ?? ({ "/settings": "Settings", "/demo-hotels": "Demo Hotels", "/dev-pages": "Dev Pages" }[pathname])
    ?? "Workspace"

  // Block in-app navigation when the current page reports unsaved edits.
  // Used on every <Link> click and the hotel select change handler.
  const guardedNav = (e: React.MouseEvent) => {
    if (!confirmDiscardUnsaved()) {
      e.preventDefault()
    } else {
      setMobileOpen(false)
    }
  }

  const navigation = (hotelSelectId: string) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pb-7 pt-8">
        <Link href={sections[0].items.find(item => item.visible && lineVisible(item.href))?.href ?? "/knowledge-base"} onClick={guardedNav} aria-label="Resonata home" className="inline-flex">
          <BrandLogo />
        </Link>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your hospitality workspace</p>
      </div>

      <div className="mx-4 mb-7 rounded-xl border border-sidebar-border bg-card p-3 shadow-xs">
        <label htmlFor={hotelSelectId} className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Building2 className="size-3" aria-hidden="true" /> Property or portfolio
        </label>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : accessState === "error" ? (
          <div className="text-xs text-destructive">Load failed</div>
        ) : accessState === "no-access" || hotels.length === 0 ? (
          <div className="text-xs text-muted-foreground">No hotels assigned</div>
        ) : (
          <OptionSelect
            id={hotelSelectId}
            value={scopeValue}
            onValueChange={(next) => {
              if (next === scopeValue) return
              // Refusing leaves `scope` untouched, so the controlled value
              // keeps showing the current selection.
              if (!confirmDiscardUnsaved()) return
              const sep = next.indexOf(":")
              const kind = next.slice(0, sep)
              const id = next.slice(sep + 1)
              setScope(kind === "org" ? { kind: "org", organizationId: id } : { kind: "hotel", hotelId: id })
            }}
            className="h-auto rounded-lg border-0 bg-muted/60 px-2.5 py-2 text-[13px] font-semibold shadow-none hover:bg-muted"
            groups={organizations.map((group) => ({
              label: group.display_name,
              options: [
                // The portfolio entry only once it spans two or more hotels
                // the user can see; "(N hotels)" is honest for a partial grant.
                ...(group.hotels.length >= 2
                  ? [{ value: `org:${group.organization_id}`, label: organizationScopeLabel(group) }]
                  : []),
                ...group.hotels.map((h) => ({ value: `hotel:${h.hotel_id}`, label: h.display_name })),
              ],
            }))}
            options={independentHotels.map((h) => ({ value: `hotel:${h.hotel_id}`, label: h.display_name }))}
          />
        )}
      </div>

      <nav aria-label="Main navigation" className="flex-1 px-4 pb-2 overflow-y-auto">
        {sections.map((section) => {
          const items = section.items.filter((item) => item.visible && lineVisible(item.href))
          if (items.length === 0) return null
          const accent = ACCENT[section.accent]
          return (
            <div key={section.label} className="mb-6">
              <div
                className={cn(
                  "px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em]",
                  accent.label,
                )}
              >
                {section.label}
              </div>
              <ul className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={guardedNav}
                        className={cn(
                          "app-nav-link relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors",
                          isActive
                            ? cn(accent.activeBg, accent.activeText, "font-bold")
                            : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/70",
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0",
                            isActive ? accent.icon : "text-muted-foreground",
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-0.5">
        <Link
          href="/settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          onClick={guardedNav}
          className={cn(
            "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] transition-colors",
            pathname === "/settings"
              ? "bg-muted/60 text-sidebar-foreground font-medium"
              : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/70",
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        {isPlatformAdmin ? (
          <Link
            href="/demo-hotels"
            aria-current={pathname === "/demo-hotels" ? "page" : undefined}
            onClick={guardedNav}
            className={cn(
              "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] transition-colors",
              pathname === "/demo-hotels"
                ? "bg-muted/60 text-sidebar-foreground font-medium"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/70",
            )}
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            Demo Hotels
          </Link>
        ) : null}
        {isPlatformAdmin ? (
          <Link
            href="/dev-pages"
            aria-current={pathname === "/dev-pages" ? "page" : undefined}
            onClick={guardedNav}
            className={cn(
              "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] transition-colors",
              pathname === "/dev-pages"
                ? "bg-muted/60 text-sidebar-foreground font-medium"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/70",
            )}
          >
            <Wrench className="w-4 h-4 shrink-0" />
            Dev Pages
          </Link>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            window.localStorage.removeItem("resonata.selected_hotel_id")
            window.localStorage.removeItem("resonata.hotel_scope")
            await signOut({ redirectUrl: "/sign-in" })
          }}
          className="w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/70 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar md:flex">
        {navigation("desktop-hotel")}
      </aside>
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-3 border-b bg-sidebar px-4 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open navigation"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-0 bg-sidebar" aria-describedby={undefined}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {navigation("mobile-hotel")}
          </SheetContent>
        </Sheet>
        <BrandLogo className="!w-32" />
        <span className="ml-auto truncate text-xs text-muted-foreground">{currentPageLabel}</span>
      </div>
    </>
  )
}
