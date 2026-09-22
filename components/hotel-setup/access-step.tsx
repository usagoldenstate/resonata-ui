"use client"

// Step 11 — who at the hotel can see it. Two doors: grant an existing user,
// or email an invitation. Auto-satisfied when the hotel belongs to an
// organization, because everyone granted that organization already sees it.

import * as React from "react"
import { Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchAdminUsers,
  grantUserHotelAccess,
  inviteUser,
  patchSetupProgress,
  type UserAccessItem,
} from "@/lib/api"

import {
  Field,
  Notice,
  StepCard,
  StepNav,
  describeApiError,
  isAbortError,
  type StepContext,
} from "./shared"

export function AccessStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext, goBack, hasBack } = ctx
  const [users, setUsers] = React.useState<UserAccessItem[] | null>(null)
  const [selected, setSelected] = React.useState("")
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const load = React.useCallback(
    (signal?: AbortSignal) =>
      fetchAdminUsers({ signal })
        .then(setUsers)
        .catch((e) => {
          if (isAbortError(e)) return
          setUsers([])
          setError(describeApiError(e))
        }),
    [],
  )

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const granted = (users ?? []).filter(
    (u) =>
      u.role === "platform_admin" ||
      u.hotels.some((h) => h.hotel_id === hotelId) ||
      (detail.organization_id
        ? u.organizations.some((o) => o.organization_id === detail.organization_id)
        : false),
  )

  const grant = async () => {
    const user = (users ?? []).find((u) => u.user_id === selected)
    if (!user) {
      setError("Pick a user to grant.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await grantUserHotelAccess({
        auth_subject: user.auth_subject,
        email: user.email,
        hotel_id: hotelId,
      })
      setNotice(`${user.email} now has access.`)
      setSelected("")
      await load()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setBusy(false)
    }
  }

  const invite = async () => {
    if (!inviteEmail.trim()) {
      setError("Enter an email address to invite.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await inviteUser({
        email: inviteEmail.trim(),
        role: "operator",
        hotel_ids: [hotelId],
        organization_ids: [],
      })
      setNotice(`Invitation sent to ${res.email}. Access applies when they sign up.`)
      setInviteEmail("")
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setBusy(false)
    }
  }

  const finish = async (status: "done" | "skipped") => {
    setSaving(true)
    setError(null)
    try {
      await patchSetupProgress(hotelId, { step: "access", status })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <StepCard
        title="Who can see this hotel"
        description={
          detail.organization_id
            ? `This hotel belongs to ${detail.organization_id}, so everyone granted that organization already sees it. Add individual grants only for people outside it.`
            : "Operators only see hotels they were granted. Platform admins see everything."
        }
      >
        {granted.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Has access:</span>
            {granted.map((u) => (
              <Badge key={u.user_id} variant="secondary" className="text-[10px]">
                {u.email}
                {u.role === "platform_admin" ? " (admin)" : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <Notice>No one but platform admins can see this hotel yet.</Notice>
        )}

        <Field label="Grant an existing user" htmlFor="grantUser">
          <div className="flex gap-2">
            <select
              id="grantUser"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={users === null}
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-70"
            >
              <option value="">Select a user…</option>
              {(users ?? [])
                .filter((u) => u.role !== "platform_admin")
                .map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.email}
                  </option>
                ))}
            </select>
            <Button type="button" variant="outline" onClick={grant} disabled={busy}>
              Grant
            </Button>
          </div>
        </Field>

        <Field
          label="Or invite someone new"
          htmlFor="inviteEmail"
          hint="Clerk emails them a sign-up link; the grant is applied when they finish signing up."
        >
          <div className="flex gap-2">
            <Input
              id="inviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="manager@example.com"
            />
            <Button type="button" variant="outline" onClick={invite} disabled={busy}>
              Invite
            </Button>
          </div>
        </Field>

        {notice ? (
          <Notice tone="success">
            <span className="inline-flex items-center gap-2">
              <Check className="h-3.5 w-3.5" />
              {notice}
            </span>
          </Notice>
        ) : null}
      </StepCard>

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={() => finish("done")}
        onSkip={() => finish("skipped")}
        saving={saving}
        error={error}
        nextLabel="Continue"
      />
    </div>
  )
}
