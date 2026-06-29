"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import { ChevronDown, LogOut } from "lucide-react"

import { useCurrentUser } from "@/lib/current-user-context"
import { featureFlags } from "@/lib/env"
import { useHotel } from "@/lib/hotel-context"
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard"

type NavItem = { label: string; href: string; visible: boolean }

// Every page has an explicit `visible` flag. Knowledge Base, Call Log, and
// FAQs are always on. Dashboard remains gated by its feature flag.
const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", visible: featureFlags.showDashboard },
  { label: "Call Log", href: "/call-log", visible: true },
  { label: "FAQs", href: "/faqs", visible: true },
  { label: "Knowledge Base", href: "/knowledge-base", visible: true },
]

const reportingSubItems = [
  { label: "Call Metrics", href: "/reporting/call-metrics" },
  { label: "Not Booked Reasons", href: "/reporting/not-booked" },
  { label: "Revenue", href: "/reporting/revenue" },
]

export function Sidebar() {
  const pathname = usePathname()
  const isReportingActive = pathname.startsWith("/reporting")
  const [reportingExpanded, setReportingExpanded] = useState(isReportingActive)
  const { hotels, hotelId, setHotelId, loading, accessState } = useHotel()
  const { isPlatformAdmin } = useCurrentUser()
  const { signOut } = useClerk()

  const visibleNavItems = navItems.filter((item) => item.visible)

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

      <nav className="flex-1 px-4">
        <ul className="space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={guardedNav}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    isActive
                      ? "text-sidebar-foreground font-medium"
                      : "text-muted-foreground hover:text-sidebar-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6b7a4a]" />
                  )}
                  {item.label}
                </Link>
              </li>
            )
          })}

          {featureFlags.showReporting && (
            <li>
              <button
                onClick={() => setReportingExpanded(!reportingExpanded)}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  isReportingActive
                    ? "text-sidebar-foreground font-medium"
                    : "text-muted-foreground hover:text-sidebar-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  {isReportingActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6b7a4a]" />
                  )}
                  Reporting
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${reportingExpanded ? "rotate-180" : ""}`}
                />
              </button>

              {reportingExpanded && (
                <ul className="mt-1 ml-4 space-y-1">
                  {reportingSubItems.map((subItem) => {
                    const isSubActive = pathname === subItem.href
                    return (
                      <li key={subItem.href}>
                        <Link
                          href={subItem.href}
                          onClick={guardedNav}
                          className={`w-full text-left px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                            isSubActive
                              ? "text-sidebar-foreground font-medium"
                              : "text-muted-foreground hover:text-sidebar-foreground"
                          }`}
                        >
                          {isSubActive && (
                            <span className="w-1 h-1 rounded-full bg-[#6b7a4a]" />
                          )}
                          {subItem.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )}
        </ul>
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <Link
          href="/settings"
          onClick={guardedNav}
          className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-sidebar-foreground transition-colors flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
          Settings
        </Link>
        {isPlatformAdmin ? (
          <Link
            href="/dev-pages"
            onClick={guardedNav}
            className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
              pathname === "/dev-pages"
                ? "text-sidebar-foreground font-medium"
                : "text-muted-foreground hover:text-sidebar-foreground"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                pathname === "/dev-pages" ? "bg-[#6b7a4a]" : "bg-transparent"
              }`}
            />
            Dev Pages
          </Link>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            window.localStorage.removeItem("resonata.selected_hotel_id")
            await signOut({ redirectUrl: "/sign-in" })
          }}
          className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-sidebar-foreground transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
