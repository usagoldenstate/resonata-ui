"use client"

import * as React from "react"
import { Loader2, RefreshCw, Trash2, UserPlus, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type AdminHotelListItem,
  ApiError,
  deleteUser,
  fetchAdminHotels,
  fetchAdminUsers,
  grantUserHotelAccess,
  revokeUserHotelAccess,
  type UserAccessItem,
  type UserGrantedHotel,
} from "@/lib/api"
import { useCurrentUser } from "@/lib/current-user-context"

type LoadState = {
  hotels: AdminHotelListItem[]
  users: UserAccessItem[]
  loading: boolean
  error: string | null
}

const emptyLoadState: LoadState = {
  hotels: [],
  users: [],
  loading: true,
  error: null,
}

export function UserAccessPanel() {
  const { user: currentUser } = useCurrentUser()
  const [state, setState] = React.useState<LoadState>(emptyLoadState)
  const [authSubject, setAuthSubject] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [hotelId, setHotelId] = React.useState("")
  const [granting, setGranting] = React.useState(false)
  // "userId:hotelId" of the grant currently being revoked, or null.
  const [revoking, setRevoking] = React.useState<string | null>(null)
  // user_id of the user currently being deleted, or null.
  const [deleting, setDeleting] = React.useState<string | null>(null)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [hotels, users] = await Promise.all([
        fetchAdminHotels({ signal }),
        fetchAdminUsers({ signal }),
      ])
      setState({ hotels, users, loading: false, error: null })
    } catch (e) {
      if (isAbortError(e)) return
      setState((prev) => ({ ...prev, loading: false, error: describeError(e) }))
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const canGrant =
    authSubject.trim().length > 0 &&
    email.trim().length > 2 &&
    hotelId.length > 0 &&
    !granting

  const grant = async () => {
    if (!canGrant) return
    setGranting(true)
    try {
      const user = await grantUserHotelAccess({
        auth_subject: authSubject.trim(),
        email: email.trim(),
        hotel_id: hotelId,
      })
      toast.success(`${user.email} now has access to ${hotelId}.`)
      setAuthSubject("")
      setEmail("")
      await load()
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setGranting(false)
    }
  }

  const revoke = async (user: UserAccessItem, hotel: UserGrantedHotel) => {
    if (
      !window.confirm(
        `Revoke ${user.email}'s access to ${hotel.display_name}? They will no longer see this hotel after their next page load.`,
      )
    ) {
      return
    }
    const key = `${user.user_id}:${hotel.hotel_id}`
    setRevoking(key)
    try {
      const updated = await revokeUserHotelAccess(user.user_id, hotel.hotel_id)
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.user_id === updated.user_id ? updated : u)),
      }))
      toast.success(`Revoked ${user.email}'s access to ${hotel.display_name}.`)
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setRevoking(null)
    }
  }

  const removeUser = async (user: UserAccessItem) => {
    if (
      !window.confirm(
        `Delete ${user.email} everywhere? This removes their hotel grants, their dashboard access, AND their Clerk account. They would need to sign up again from scratch to come back.`,
      )
    ) {
      return
    }
    setDeleting(user.user_id)
    try {
      await deleteUser(user.user_id)
      setState((prev) => ({
        ...prev,
        users: prev.users.filter((u) => u.user_id !== user.user_id),
      }))
      toast.success(`Deleted ${user.email}.`)
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <section className="rounded-lg border border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Grant Hotel Access</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Finds or creates the user (new users become operators) and grants them
          access to the selected hotel. Get the Clerk User ID from the Clerk
          dashboard (Users → select user → User ID, looks like{" "}
          <code className="text-xs">user_2abc...</code>).
        </p>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="grant-auth-subject">Clerk User ID</Label>
            <Input
              id="grant-auth-subject"
              value={authSubject}
              onChange={(event) => setAuthSubject(event.target.value)}
              placeholder="user_2abc..."
              className="bg-card font-mono text-sm"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-email">Email</Label>
            <Input
              id="grant-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="hotelier@example.com"
              className="bg-card"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <Label>Hotel</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Pick a hotel" />
              </SelectTrigger>
              <SelectContent>
                {state.hotels.map((hotel) => (
                  <SelectItem key={hotel.hotel_id} value={hotel.hotel_id}>
                    {hotel.display_name} ({hotel.hotel_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={grant} disabled={!canGrant}>
            {granting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Grant Access
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Users</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={state.loading || granting}
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
        </div>

        {state.error ? (
          <div className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        ) : state.loading ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : state.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Clerk User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hotels</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Delete</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.users.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {user.auth_subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "platform_admin" ? "default" : "outline"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.is_active ? (
                      <span className="text-sm text-muted-foreground">active</span>
                    ) : (
                      <Badge variant="destructive">inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.hotels.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {user.role === "platform_admin" ? "all hotels" : "—"}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.hotels.map((hotel) => {
                          const key = `${user.user_id}:${hotel.hotel_id}`
                          return (
                            <Badge
                              key={hotel.hotel_id}
                              variant="secondary"
                              className="gap-1 pr-1"
                              title={`Granted ${formatDateTime(hotel.granted_at)}`}
                            >
                              {hotel.display_name}
                              <button
                                type="button"
                                aria-label={`Revoke access to ${hotel.display_name}`}
                                onClick={() => void revoke(user, hotel)}
                                disabled={revoking !== null}
                                className="rounded-sm p-0.5 hover:bg-foreground/10 disabled:opacity-50"
                              >
                                {revoking === key ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </button>
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {currentUser?.user_id === user.user_id ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${user.email}`}
                        title={`Delete ${user.email}`}
                        onClick={() => void removeUser(user)}
                        disabled={deleting !== null || revoking !== null}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deleting === user.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail =
      typeof error.body === "object" && error.body !== null && "detail" in error.body
        ? String((error.body as { detail: unknown }).detail)
        : error.message
    return `${error.status} ${detail}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
