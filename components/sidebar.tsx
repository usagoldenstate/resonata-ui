"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import {
  LayoutDashboard,
  MessageSquareText,
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

// Insights vs Agent is still the information architecture. Visual accent is
// the same site orange on both section labels, matching resonata.io.
const sections: NavSection[] = [
  {
    label: "Insights",
    accent: "insights",
    items: [
      { label: "Dashboard", href: "/", icon: <LayoutDashboard className="w-4 h-4" />, visible: featureFlags.showDashboard },
      { label: "Ask Insights", href: "/reporting/chat", icon: <MessageSquareText className="w-4 h-4" />, visible: featureFlags.showReporting && featureFlags.showReportingChat },
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

// Section labels share the site orange. Active items are a quiet ink pill —
// color lives on the heading, not on every row.
const navLabelClass = "px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"
const navItemClass = "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
const navItemActive = "bg-black/[0.05] text-foreground"
const navItemIdle = "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"

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
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="px-5 pt-6 pb-3">
        <Link href="/" onClick={guardedNav} className="block w-fit">
          <img src="/images/logo.png" alt="Resonata" className="h-7 w-auto" />
        </Link>
      </div>

      <div className="px-4 pb-5">
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary block mb-2">
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
            className="w-full text-sm rounded-xl border border-border bg-card px-3 py-2"
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
          return (
            <div key={section.label} className="mb-5">
              <div className={navLabelClass}>
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
                        className={cn(navItemClass, isActive ? navItemActive : navItemIdle)}
                      >
                        <span className="shrink-0">{item.icon}</span>
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
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-black/[0.05] text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]",
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
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
              pathname === "/demo-hotels"
                ? "bg-black/[0.05] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]",
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
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
              pathname.startsWith("/dev-pages")
                ? "bg-black/[0.05] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]",
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
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
