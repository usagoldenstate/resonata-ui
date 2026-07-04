"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import {
  LayoutDashboard,
  PhoneCall,
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
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/lib/current-user-context"
import { featureFlags } from "@/lib/env"
import { useHotel } from "@/lib/hotel-context"
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard"

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
      { label: "Call Log", href: "/call-log", icon: <PhoneCall className="w-4 h-4" />, visible: true },
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
  const pathname = usePathname()
  const { hotels, hotelId, setHotelId, loading, accessState } = useHotel()
  const { isPlatformAdmin } = useCurrentUser()
  const { signOut } = useClerk()

  // Block in-app navigation when the current page reports unsaved edits.
  // Used on every <Link> click and the hotel <select> change handler.
  const guardedNav = (e: React.MouseEvent) => {
    if (!confirmDiscardUnsaved()) {
      e.preventDefault()
    }
  }

  return (
    <aside className="w-52 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-semibold text-sidebar-foreground">
          Resona<span className="text-[#6b7a4a]">ta</span>
        </h1>
      </div>

      <div className="px-4 pb-4">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">
          Hotel
        </label>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : accessState === "error" ? (
          <div className="text-xs text-destructive">Load failed</div>
        ) : accessState === "no-access" || hotels.length === 0 ? (
          <div className="text-xs text-muted-foreground">No hotels assigned</div>
        ) : (
          <select
            value={hotelId ?? ""}
            onChange={(e) => {
              if (e.target.value === hotelId) return
              if (!confirmDiscardUnsaved()) {
                // Revert the visible selection. The element is uncontrolled-ish
                // here (re-renders from `hotelId` state), so resetting the
                // value attribute syncs the DOM with our refusal to switch.
                e.target.value = hotelId ?? ""
                return
              }
              setHotelId(e.target.value)
            }}
            className="w-full text-sm rounded-md border border-sidebar-border bg-background px-2 py-1.5"
          >
            {hotels.map((h) => (
              <option key={h.hotel_id} value={h.hotel_id}>
                {h.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <nav className="flex-1 px-3 pb-2 overflow-y-auto">
        {sections.map((section) => {
          const items = section.items.filter((item) => item.visible)
          if (items.length === 0) return null
          const accent = ACCENT[section.accent]
          return (
            <div key={section.label} className="mb-4">
              <div
                className={cn(
                  "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider",
                  accent.label,
                )}
              >
                {section.label}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={guardedNav}
                        className={cn(
                          "relative w-full flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg text-sm transition-colors",
                          isActive
                            ? cn(accent.activeBg, accent.activeText, "font-medium")
                            : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50",
                        )}
                      >
                        {isActive && (
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full",
                              accent.rail,
                            )}
                          />
                        )}
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
          onClick={guardedNav}
          className={cn(
            "w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm transition-colors",
            pathname === "/settings"
              ? "bg-muted/60 text-sidebar-foreground font-medium"
              : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50",
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        {isPlatformAdmin ? (
          <Link
            href="/demo-hotels"
            onClick={guardedNav}
            className={cn(
              "w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm transition-colors",
              pathname === "/demo-hotels"
                ? "bg-muted/60 text-sidebar-foreground font-medium"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50",
            )}
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            Demo Hotels
          </Link>
        ) : null}
        {isPlatformAdmin ? (
          <Link
            href="/dev-pages"
            onClick={guardedNav}
            className={cn(
              "w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm transition-colors",
              pathname === "/dev-pages"
                ? "bg-muted/60 text-sidebar-foreground font-medium"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50",
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
            await signOut({ redirectUrl: "/sign-in" })
          }}
          className="w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-muted/50 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
