"use client"

import * as React from "react"
import {
  ChevronDown,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  fetchOrganizations,
  fetchPendingInvitations,
  grantUserHotelAccess,
  grantUserOrganizationAccess,
  inviteUser,
  type Organization,
  type PendingInvitation,
  revokeInvitation,
  revokeUserHotelAccess,
  revokeUserOrganizationAccess,
  updateUserRole,
  type UserAccessItem,
  type UserGrantedHotel,
  type UserGrantedOrganization,
} from "@/lib/api"
import { useCurrentUser } from "@/lib/current-user-context"

type Role = "operator" | "platform_admin"

type LoadState = {
  hotels: AdminHotelListItem[]
  organizations: Organization[]
  users: UserAccessItem[]
  invitations: PendingInvitation[]
  loading: boolean
  error: string | null
}

const emptyLoadState: LoadState = {
  hotels: [],
  organizations: [],
  users: [],
  invitations: [],
  loading: true,
  error: null,
}

export function UserAccessPanel() {
  const { user: currentUser } = useCurrentUser()
  const [state, setState] = React.useState<LoadState>(emptyLoadState)

  // ── Invite form ───────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<Role>("operator")
  const [inviteHotels, setInviteHotels] = React.useState<string[]>([])
  // Org-level grants: the invitee sees every hotel in the organization, now
  // and as hotels are added — nothing is copied per hotel.
  const [inviteOrgs, setInviteOrgs] = React.useState<string[]>([])
  const [inviting, setInviting] = React.useState(false)
  // invitation_id currently being revoked, or null.
  const [revokingInvite, setRevokingInvite] = React.useState<string | null>(null)

  // ── Manual grant form (advanced / break-glass) ─────────────────────────────
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const [authSubject, setAuthSubject] = React.useState("")
  const [email, setEmail] = React.useState("")
  // Either one hotel or one organization per manual grant.
  const [grantTarget, setGrantTarget] = React.useState("")
  const [granting, setGranting] = React.useState(false)

  // "userId:hotelId" of the grant currently being revoked, or null.
  const [revoking, setRevoking] = React.useState<string | null>(null)
  // user_id of the user currently being deleted, or null.
  const [deleting, setDeleting] = React.useState<string | null>(null)
  // user_id of the user whose role is currently being saved, or null.
  const [savingRole, setSavingRole] = React.useState<string | null>(null)
  // The role change awaiting confirmation in the dialog, or null.
  const [pendingRole, setPendingRole] = React.useState<{
    user: UserAccessItem
    nextRole: Role
  } | null>(null)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [hotels, organizations, users, invitations] = await Promise.all([
        fetchAdminHotels({ signal }),
        fetchOrganizations({ signal }),
        fetchAdminUsers({ signal }),
        fetchPendingInvitations({ signal }),
      ])
      setState({ hotels, organizations, users, invitations, loading: false, error: null })
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

  const hotelLabels = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const h of state.hotels) map.set(h.hotel_id, h.display_name)
    return map
  }, [state.hotels])

  const orgLabels = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const o of state.organizations) map.set(o.organization_id, o.display_name)
    return map
  }, [state.organizations])

  const toggleInviteHotel = (id: string) => {
    setInviteHotels((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id],
    )
  }
  const toggleInviteOrg = (id: string) => {
    setInviteOrgs((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id],
    )
  }

  // An operator needs at least one grant of EITHER kind.
  const canInvite =
    inviteEmail.trim().length > 2 &&
    !inviting &&
    (inviteRole === "platform_admin" || inviteHotels.length > 0 || inviteOrgs.length > 0)

  const invite = async () => {
    if (!canInvite) return
    setInviting(true)
    try {
      const result = await inviteUser({
        email: inviteEmail.trim(),
        role: inviteRole,
        hotel_ids: inviteRole === "platform_admin" ? [] : inviteHotels,
        organization_ids: inviteRole === "platform_admin" ? [] : inviteOrgs,
      })
      toast.success(
        `Invitation sent to ${result.email} — they'll get an email to set up their account.`,
      )
      setInviteEmail("")
      setInviteHotels([])
      setInviteOrgs([])
      setInviteRole("operator")
      await load()
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setInviting(false)
    }
  }

  const revokeInvite = async (inv: PendingInvitation) => {
    if (
      !window.confirm(
        `Revoke the invitation for ${inv.email}? The sign-up link they were emailed will stop working.`,
      )
    ) {
      return
    }
    setRevokingInvite(inv.invitation_id)
    try {
      await revokeInvitation(inv.invitation_id)
      setState((prev) => ({
        ...prev,
        invitations: prev.invitations.filter(
          (i) => i.invitation_id !== inv.invitation_id,
        ),
      }))
      toast.success(`Revoked the invitation for ${inv.email}.`)
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setRevokingInvite(null)
    }
  }

  const canGrant =
    authSubject.trim().length > 0 &&
    email.trim().length > 2 &&
    grantTarget.length > 0 &&
    !granting

  const grant = async () => {
    if (!canGrant) return
    setGranting(true)
    try {
      const sep = grantTarget.indexOf(":")
      const kind = grantTarget.slice(0, sep)
      const id = grantTarget.slice(sep + 1)
      const user =
        kind === "org"
          ? await grantUserOrganizationAccess({
              auth_subject: authSubject.trim(),
              email: email.trim(),
              organization_id: id,
            })
          : await grantUserHotelAccess({
              auth_subject: authSubject.trim(),
              email: email.trim(),
              hotel_id: id,
            })
      toast.success(
        `${user.email} now has access to ${kind === "org" ? `every hotel in ${orgLabels.get(id) ?? id}` : id}.`,
      )
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

  const revokeOrg = async (user: UserAccessItem, org: UserGrantedOrganization) => {
    if (
      !window.confirm(
        `Revoke ${user.email}'s access to every hotel in ${org.display_name}? Any direct per-hotel grants they hold are kept.`,
      )
    ) {
      return
    }
    const key = `${user.user_id}:org:${org.organization_id}`
    setRevoking(key)
    try {
      const updated = await revokeUserOrganizationAccess(user.user_id, org.organization_id)
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.user_id === updated.user_id ? updated : u)),
      }))
      toast.success(`Revoked ${user.email}'s access to ${org.display_name}.`)
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

  const changeRole = async (user: UserAccessItem, nextRole: Role) => {
    setPendingRole(null)
    setSavingRole(user.user_id)
    try {
      const updated = await updateUserRole(user.user_id, nextRole)
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.user_id === updated.user_id ? updated : u)),
      }))
      toast.success(
        nextRole === "platform_admin"
          ? `${user.email} is now a platform admin.`
          : `${user.email} is now an operator.`,
      )
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setSavingRole(null)
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* ── Invite a user (primary action) ── */}
      <section className="rounded-lg border border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Invite a User</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Enter an email and Clerk will send them a sign-up link. Their role and
          hotel access are applied automatically once they finish signing up — no
          Clerk User ID needed.
        </p>

        <div className="grid gap-4 lg:grid-cols-[1fr_240px_240px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="hotelier@example.com"
                className="bg-card"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as Role)}
              >
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="platform_admin">Platform admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hotels</Label>
            {inviteRole === "platform_admin" ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Platform admins have access to <strong>all hotels</strong>.
              </div>
            ) : state.hotels.length === 0 ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                {state.loading ? "Loading hotels…" : "No hotels available."}
              </div>
            ) : (
              <ScrollArea className="h-40 rounded-md border border-border bg-card">
                <div className="space-y-1 p-2">
                  {state.hotels.map((hotel) => (
                    <label
                      key={hotel.hotel_id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={inviteHotels.includes(hotel.hotel_id)}
                        onCheckedChange={() => toggleInviteHotel(hotel.hotel_id)}
                      />
                      <span className="truncate">{hotel.display_name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="space-y-2">
            <Label>Organizations</Label>
            {inviteRole === "platform_admin" ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Not applicable for platform admins.
              </div>
            ) : state.organizations.length === 0 ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                {state.loading ? "Loading…" : "No organizations yet."}
              </div>
            ) : (
              <ScrollArea className="h-40 rounded-md border border-border bg-card">
                <div className="space-y-1 p-2">
                  {state.organizations.map((org) => (
                    <label
                      key={org.organization_id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50"
                      title="Every hotel in the organization, including ones added later"
                    >
                      <Checkbox
                        checked={inviteOrgs.includes(org.organization_id)}
                        onCheckedChange={() => toggleInviteOrg(org.organization_id)}
                      />
                      <span className="truncate">
                        {org.display_name}{" "}
                        <span className="text-muted-foreground">({org.hotel_count})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={invite} disabled={!canInvite}>
            {inviting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Invitation
          </Button>
          {inviteRole === "operator" && (inviteHotels.length > 0 || inviteOrgs.length > 0) ? (
            <span className="text-sm text-muted-foreground">
              {[
                inviteHotels.length > 0 && `${inviteHotels.length} hotel${inviteHotels.length === 1 ? "" : "s"}`,
                inviteOrgs.length > 0 && `${inviteOrgs.length} organization${inviteOrgs.length === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" + ")}{" "}
              selected
            </span>
          ) : null}
        </div>
      </section>

      {/* ── Pending invitations ── */}
      {state.invitations.length > 0 ? (
        <section className="rounded-lg border border-border p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Pending Invitations
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Revoke</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.invitations.map((inv) => (
                <TableRow key={inv.invitation_id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={inv.role === "platform_admin" ? "default" : "outline"}
                    >
                      {inv.role ?? "operator"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.role === "platform_admin" ? (
                      <span className="text-sm text-muted-foreground">all hotels</span>
                    ) : inv.hotel_ids.length === 0 && inv.organization_ids.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {inv.organization_ids.map((oid) => (
                          <Badge key={`org:${oid}`} variant="default" title="Organization (every hotel in it)">
                            {orgLabels.get(oid) ?? oid}
                          </Badge>
                        ))}
                        {inv.hotel_ids.map((hid) => (
                          <Badge key={hid} variant="secondary">
                            {hotelLabels.get(hid) ?? hid}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.created_at ? formatDateTime(inv.created_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Revoke invitation for ${inv.email}`}
                      title={`Revoke invitation for ${inv.email}`}
                      onClick={() => void revokeInvite(inv)}
                      disabled={revokingInvite !== null}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {revokingInvite === inv.invitation_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* ── Advanced: manual grant by Clerk User ID (break-glass) ── */}
      <Collapsible
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        className="rounded-lg border border-border"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-base font-semibold text-foreground">
                Advanced: grant access by Clerk User ID
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                advancedOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-5 pb-5">
          <p className="mb-5 text-sm text-muted-foreground">
            Break-glass for a user who already has a Clerk account (created
            outside the invite flow). Finds or creates the user (new users become
            operators) and grants access to one hotel or one organization. Get the Clerk User ID from
            the Clerk dashboard (Users → select user → User ID, looks like{" "}
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
              <Label>Hotel or organization</Label>
              <Select value={grantTarget} onValueChange={setGrantTarget}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Pick a hotel or organization" />
                </SelectTrigger>
                <SelectContent>
                  {state.organizations.map((org) => (
                    <SelectItem key={`org:${org.organization_id}`} value={`org:${org.organization_id}`}>
                      Organization: {org.display_name} ({org.hotel_count} hotel{org.hotel_count === 1 ? "" : "s"})
                    </SelectItem>
                  ))}
                  {state.hotels.map((hotel) => (
                    <SelectItem key={`hotel:${hotel.hotel_id}`} value={`hotel:${hotel.hotel_id}`}>
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
        </CollapsibleContent>
      </Collapsible>

      <section className="rounded-lg border border-border p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Users</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={state.loading || granting || inviting}
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
                <TableHead>Access</TableHead>
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
                    <div className="flex items-center gap-2">
                      <Badge variant={user.role === "platform_admin" ? "default" : "outline"}>
                        {user.role}
                      </Badge>
                      {currentUser?.user_id === user.user_id ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={savingRole !== null}
                          onClick={() =>
                            setPendingRole({
                              user,
                              nextRole:
                                user.role === "platform_admin"
                                  ? "operator"
                                  : "platform_admin",
                            })
                          }
                        >
                          {savingRole === user.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : user.role === "platform_admin" ? (
                            <ShieldOff className="h-3 w-3" />
                          ) : (
                            <Shield className="h-3 w-3" />
                          )}
                          {user.role === "platform_admin"
                            ? "Make operator"
                            : "Make platform admin"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.is_active ? (
                      <span className="text-sm text-muted-foreground">active</span>
                    ) : (
                      <Badge variant="destructive">inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.role === "platform_admin" ? (
                      <span className="text-sm text-muted-foreground">
                        all hotels
                      </span>
                    ) : user.hotels.length === 0 && user.organizations.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.organizations.map((org) => {
                          const key = `${user.user_id}:org:${org.organization_id}`
                          return (
                            <Badge
                              key={key}
                              variant="default"
                              className="gap-1 pr-1"
                              title={`Organization — every hotel in it. Granted ${formatDateTime(org.granted_at)}`}
                            >
                              {org.display_name}
                              <button
                                type="button"
                                aria-label={`Revoke access to organization ${org.display_name}`}
                                onClick={() => void revokeOrg(user, org)}
                                disabled={revoking !== null}
                                className="rounded-sm p-0.5 hover:bg-background/20 disabled:opacity-50"
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

      <AlertDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRole(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRole?.nextRole === "platform_admin"
                ? `Make ${pendingRole?.user.email} a platform admin?`
                : `Make ${pendingRole?.user.email} an operator?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole?.nextRole === "platform_admin" ? (
                <>
                  Platform admins have <strong>full access to every hotel</strong>,
                  all platform settings, and the ability to manage and delete
                  other users — including granting admin to anyone else. Only do
                  this for people you fully trust. Are you sure you want to
                  continue?
                </>
              ) : (
                <>
                  This removes their platform-admin access. They will only see
                  hotels they have been explicitly granted. Are you sure?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRole) {
                  void changeRole(pendingRole.user, pendingRole.nextRole)
                }
              }}
            >
              {pendingRole?.nextRole === "platform_admin"
                ? "Make platform admin"
                : "Make operator"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
