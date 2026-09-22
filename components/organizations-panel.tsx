"use client"

// Platform-admin management of organizations (management companies): list
// with hotel counts, create, rename. Membership is set per hotel on the
// Settings page (Organization field); access is granted per organization in
// the User Access panel. No delete — an org with hotels must not vanish, and
// an empty one costs nothing to keep.

import * as React from "react"
import { Building2, Check, Loader2, Pencil, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  createOrganization,
  fetchOrganizations,
  type Organization,
  renameOrganization,
} from "@/lib/api"

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63)
}

export function OrganizationsPanel() {
  const [orgs, setOrgs] = React.useState<Organization[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [newId, setNewId] = React.useState("")
  const [newName, setNewName] = React.useState("")
  const [idTouched, setIdTouched] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null)
  const [renaming, setRenaming] = React.useState(false)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      setOrgs(await fetchOrganizations({ signal }))
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return
      setError(describeError(e))
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const effectiveId = idTouched ? newId : slugify(newName)
  const canCreate = SLUG_RE.test(effectiveId) && newName.trim().length > 0 && !creating

  const create = async () => {
    if (!canCreate) return
    setCreating(true)
    try {
      const org = await createOrganization({ organization_id: effectiveId, display_name: newName.trim() })
      toast.success(`Created ${org.display_name}. Attach hotels on each hotel's Settings page.`)
      setNewId("")
      setNewName("")
      setIdTouched(false)
      await load()
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setCreating(false)
    }
  }

  const rename = async () => {
    if (!editing || !editing.name.trim() || renaming) return
    setRenaming(true)
    try {
      const updated = await renameOrganization(editing.id, editing.name.trim())
      setOrgs((prev) =>
        prev ? prev.map((o) => (o.organization_id === updated.organization_id ? updated : o)) : prev,
      )
      setEditing(null)
      toast.success(`Renamed to ${updated.display_name}.`)
    } catch (e) {
      toast.error(describeError(e))
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <section className="rounded-lg border border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Create an Organization</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          A management company or portfolio. Attach hotels to it from each hotel&apos;s
          Settings page, then grant users the organization (User Access below) so they
          see every hotel in it — including hotels added later.
        </p>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="org-name">Display name</Label>
            <Input
              id="org-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Coastal Hospitality"
              className="bg-card"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-id">Organization ID</Label>
            <Input
              id="org-id"
              value={effectiveId}
              onChange={(e) => {
                setIdTouched(true)
                setNewId(e.target.value)
              }}
              placeholder="coastal"
              className="bg-card font-mono text-sm"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Permanent slug: lowercase letters, digits, <code>_</code> or <code>-</code>.
            </p>
          </div>
          <Button type="button" onClick={create} disabled={!canCreate}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border p-5">
        <h2 className="mb-4 text-base font-semibold text-foreground">Organizations</h2>
        {error ? (
          <div className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : orgs === null ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organizations yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Hotels</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Rename</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.organization_id}>
                  <TableCell className="font-medium">
                    {editing?.id === org.organization_id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`New name for ${org.display_name}`}
                          value={editing.name}
                          onChange={(e) => setEditing({ id: org.organization_id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void rename()
                            if (e.key === "Escape") setEditing(null)
                          }}
                          className="h-8 bg-card"
                          autoFocus
                        />
                        <Button type="button" size="icon" variant="ghost" aria-label="Save name" onClick={() => void rename()} disabled={renaming}>
                          {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Cancel rename" onClick={() => setEditing(null)} disabled={renaming}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      org.display_name
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{org.organization_id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{org.hotel_count}</TableCell>
                  <TableCell className="text-right">
                    {editing?.id === org.organization_id ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename ${org.display_name}`}
                        title={`Rename ${org.display_name}`}
                        onClick={() => setEditing({ id: org.organization_id, name: org.display_name })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
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
  if (error instanceof Error) return error.message
  return String(error)
}
