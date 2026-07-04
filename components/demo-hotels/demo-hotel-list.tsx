"use client"

// Table of mock-PMS ("demo") hotels for the Demo Hotels page. Demo hotels
// aren't a distinct backend concept — they're just hotels on the mock PMS
// adapter (see lib/api.ts's filterMockHotels), so this list is a client-side
// filter over the same GET /admin/hotels the rest of the admin UI uses.

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Loader2, Power, PowerOff } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ApiError,
  fetchAdminHotels,
  filterMockHotels,
  updateHotelPlatformSettings,
  type AdminHotelListItem,
} from "@/lib/api"
import { useHotel } from "@/lib/hotel-context"

function describeError(e: unknown): string {
  if (e instanceof ApiError) return `${e.status} ${e.message}`
  return e instanceof Error ? e.message : String(e)
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError"
}

export function DemoHotelList({ refreshKey }: { refreshKey: number }) {
  const [hotels, setHotels] = React.useState<AdminHotelListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pendingToggle, setPendingToggle] =
    React.useState<AdminHotelListItem | null>(null)
  const [toggling, setToggling] = React.useState<string | null>(null)

  const router = useRouter()
  const { setHotelId } = useHotel()

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const all = await fetchAdminHotels({ signal })
      setHotels(filterMockHotels(all))
    } catch (e) {
      if (isAbortError(e)) return
      setError(describeError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
    // refreshKey is bumped by the parent after a successful create so the
    // new/updated hotel shows up without a full page reload.
  }, [load, refreshKey])

  const openHotel = (hotelId: string, path: string) => {
    setHotelId(hotelId)
    router.push(path)
  }

  const confirmToggle = async () => {
    if (!pendingToggle) return
    const target = pendingToggle
    const nextActive = !target.is_active
    setToggling(target.hotel_id)
    try {
      await updateHotelPlatformSettings(target.hotel_id, {
        is_active: nextActive,
      })
      setHotels((prev) =>
        prev.map((h) =>
          h.hotel_id === target.hotel_id ? { ...h, is_active: nextActive } : h,
        ),
      )
      toast.success(
        nextActive
          ? `${target.display_name} reactivated.`
          : `${target.display_name} deactivated.`,
      )
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setToggling(null)
      setPendingToggle(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo Hotels</CardTitle>
        <CardDescription>
          Mock-PMS hotels used for sales and onboarding demos — no real PMS
          credentials required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading demo hotels…
          </div>
        ) : error ? (
          <div className="py-4 text-sm text-destructive">{error}</div>
        ) : hotels.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No demo hotels yet. Use the wizard below to create one.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hotel ID</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotels.map((h) => (
                <TableRow key={h.hotel_id}>
                  <TableCell className="font-mono text-xs">
                    {h.hotel_id}
                  </TableCell>
                  <TableCell>{h.display_name}</TableCell>
                  <TableCell>
                    <Badge variant={h.is_active ? "default" : "outline"}>
                      {h.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openHotel(h.hotel_id, "/knowledge-base")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggling === h.hotel_id}
                        onClick={() => setPendingToggle(h)}
                      >
                        {toggling === h.hotel_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : h.is_active ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                        {h.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open) setPendingToggle(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.is_active ? "Deactivate" : "Reactivate"}{" "}
              {pendingToggle?.display_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle?.is_active
                ? "This hotel will stop accepting calls and won't be selectable in the hotel picker until reactivated."
                : "This hotel becomes selectable again and can accept calls, assuming its Vapi phone routing is still configured."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmToggle()}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
