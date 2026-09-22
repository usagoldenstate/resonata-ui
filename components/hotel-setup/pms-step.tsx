"use client"

// Step 3 — PMS connection. Credentials are write-only: the backend returns
// which field names are set, never their values, so the form is never
// prefilled and nothing is kept in browser storage.

import * as React from "react"
import { CheckCircle2, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  apiBaseUrl,
  fetchPmsCredentials,
  patchSetupProgress,
  testPmsCredentials,
  updateHotelPlatformSettings,
  updatePmsCredentials,
  type PmsCredentialsState,
  type PmsCredentialsTestResult,
} from "@/lib/api"

import {
  CopyBox,
  Field,
  Notice,
  PMS_CHOICES,
  RadioCard,
  StepCard,
  StepNav,
  describeApiError,
  isAbortError,
  type StepContext,
} from "./shared"

type CredentialField = {
  key: string
  label: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
  hint?: string
  numeric?: boolean
}

const STAYNTOUCH_FIELDS: CredentialField[] = [
  { key: "client_id", label: "Client ID" },
  { key: "client_secret", label: "Client secret", secret: true },
  {
    key: "hotel_id",
    label: "StayNTouch hotel ID",
    numeric: true,
    hint: "The numeric property id in StayNTouch — not the Resonata hotel ID.",
  },
  {
    key: "base_url",
    label: "API base URL",
    optional: true,
    placeholder: "https://api.stayntouch.com",
    hint: "Leave blank for the default production host.",
  },
  {
    key: "webhook_signature_secret",
    label: "Webhook signature secret",
    secret: true,
    optional: true,
    hint: "Shared secret StayNTouch signs rate-change webhooks with.",
  },
]

const OPERA_BASE_FIELDS: CredentialField[] = [
  { key: "client_id", label: "Client ID" },
  { key: "client_secret", label: "Client secret", secret: true },
  { key: "app_key", label: "App key", secret: true },
  {
    key: "opera_hotel_code",
    label: "OPERA hotel code",
    placeholder: "5859INT",
    hint: "The property code as OPERA knows it.",
  },
  { key: "base_url", label: "API base URL", placeholder: "https://your-host.hospitality-api.eu-frankfurt-1.ocs.oc-test.com" },
  { key: "token_url", label: "Token URL", placeholder: "https://…/oauth/v1/tokens" },
  { key: "external_system", label: "External system code", optional: true },
  { key: "originating_application", label: "Originating application", optional: true },
]

const OPERA_CLIENT_CREDENTIALS_FIELDS: CredentialField[] = [
  {
    key: "enterprise_id",
    label: "Enterprise ID",
    hint: "Required for the client_credentials grant — the token and every data call are enterprise-scoped.",
  },
]

const OPERA_PASSWORD_FIELDS: CredentialField[] = [
  { key: "username", label: "Username" },
  { key: "password", label: "Password", secret: true },
]

export function PmsStep({ ctx }: { ctx: StepContext }) {
  const { hotelId, detail, reload, goNext, goBack, hasBack } = ctx
  const provider = detail.pms_provider

  const [state, setState] = React.useState<PmsCredentialsState | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [replacing, setReplacing] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [grantType, setGrantType] = React.useState<"client_credentials" | "password">(
    "client_credentials",
  )
  const [sourceCode, setSourceCode] = React.useState(
    typeof detail.pms_config?.reservation_source_code === "string"
      ? (detail.pms_config.reservation_source_code as string)
      : "",
  )
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<PmsCredentialsTestResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const isMock = provider === "mock"
  // The connector is changeable for as long as the hotel is a draft. Once it
  // goes live its holds and attribution point into this PMS, so the backend
  // refuses the swap and the picker goes away with it.
  const canChangeProvider = !detail.is_active
  const [switching, setSwitching] = React.useState<string | null>(null)

  const switchProvider = async (next: string) => {
    if (next === provider || switching) return
    setSwitching(next)
    setError(null)
    setTestResult(null)
    try {
      await updateHotelPlatformSettings(hotelId, { pms_provider: next })
      // Anything typed for the outgoing PMS is meaningless for the incoming
      // one, and the backend has just discarded the stored credentials.
      setValues({})
      setState(null)
      setReplacing(true)
      await reload()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSwitching(null)
    }
  }

  const providerPicker = canChangeProvider ? (
    <StepCard
      title="Property management system"
      description="Changeable while the hotel is inactive. Switching discards any credentials and cached rooms saved for the current one."
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {PMS_CHOICES.map((choice) => (
          <RadioCard
            key={choice.value}
            checked={provider === choice.value}
            onSelect={() => void switchProvider(choice.value)}
            label={choice.label}
            blurb={choice.blurb}
            disabled={switching !== null}
          />
        ))}
      </div>
    </StepCard>
  ) : null

  React.useEffect(() => {
    if (isMock) return
    const controller = new AbortController()
    fetchPmsCredentials(hotelId, { signal: controller.signal })
      .then((s) => {
        setState(s)
        setReplacing(!s.configured)
      })
      .catch((e) => {
        if (isAbortError(e)) return
        setLoadError(describeApiError(e))
        setReplacing(true)
      })
    return () => controller.abort()
    // `provider` matters as much as `isMock`: a stayntouch→opera swap keeps
    // isMock false, and without a refetch the form would still be reporting
    // the discarded StayNTouch fields as set.
  }, [hotelId, isMock, provider])

  const fields: CredentialField[] =
    provider === "stayntouch"
      ? STAYNTOUCH_FIELDS
      : provider === "opera"
        ? [
            ...OPERA_BASE_FIELDS,
            ...(grantType === "password"
              ? OPERA_PASSWORD_FIELDS
              : OPERA_CLIENT_CREDENTIALS_FIELDS),
          ]
        : []

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const saveCredentials = async () => {
    setSaving(true)
    setError(null)
    setTestResult(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const field of fields) {
        const raw = (values[field.key] ?? "").trim()
        if (!raw) {
          if (field.optional) continue
          throw new Error(`${field.label} is required.`)
        }
        payload[field.key] = field.numeric ? Number(raw) : raw
      }
      if (provider === "opera") payload.oauth_grant_type = grantType
      const next = await updatePmsCredentials(hotelId, payload)
      setState(next)
      setValues({})
      setReplacing(false)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setError(null)
    try {
      setTestResult(await testPmsCredentials(hotelId))
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setTesting(false)
    }
  }

  const saveSourceCode = async () => {
    // pms_config is replaced wholesale by the PATCH, so merge rather than
    // overwrite — the cancellation setup keeps its own keys in there.
    const nextConfig: Record<string, unknown> = { ...(detail.pms_config ?? {}) }
    const trimmed = sourceCode.trim()
    if (trimmed) nextConfig.reservation_source_code = trimmed
    else delete nextConfig.reservation_source_code
    await updateHotelPlatformSettings(hotelId, { pms_config: nextConfig })
  }

  const continueOn = async () => {
    setSaving(true)
    setError(null)
    try {
      if (provider === "stayntouch") await saveSourceCode()
      await patchSetupProgress(hotelId, { step: "pms", status: "done" })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const skip = async () => {
    setSaving(true)
    setError(null)
    try {
      await patchSetupProgress(hotelId, { step: "pms", status: "skipped" })
      await reload()
      goNext()
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  if (isMock) {
    return (
      <div className="space-y-6">
        {providerPicker}
        <StepCard
          title="PMS connection"
          description="This hotel runs on the mock adapter."
        >
          <Notice tone="success">
            No credentials are needed — availability and quotes come from fixture data.
            Room types are read from the demo catalog instead of a live PMS.
          </Notice>
        </StepCard>
        <StepNav
          onBack={goBack}
          hasBack={hasBack}
          onNext={continueOn}
          saving={saving}
          error={error}
          nextLabel="Continue"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {providerPicker}
      <StepCard
        title={`${provider === "stayntouch" ? "StayNTouch" : "OPERA"} credentials`}
        description="Stored encrypted at rest and never returned to this page again. Nothing here is saved in your browser."
      >
        {loadError ? <Notice tone="error">{loadError}</Notice> : null}

        {state?.configured && !replacing ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Configured:</span>
              {state.fields_set.map((name) => (
                <Badge key={name} variant="secondary" className="font-mono text-[10px]">
                  {name}
                </Badge>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={() => setReplacing(true)}>
              Replace credentials
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {provider === "opera" ? (
              <Field
                label="OAuth grant type"
                htmlFor="grantType"
                hint="client_credentials is the go-forward flow; password is only for legacy sandboxes."
              >
                <select
                  id="grantType"
                  value={grantType}
                  onChange={(e) =>
                    setGrantType(e.target.value as "client_credentials" | "password")
                  }
                  className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <option value="client_credentials">client_credentials</option>
                  <option value="password">password</option>
                </select>
              </Field>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((field) => (
                <Field
                  key={field.key}
                  label={
                    <>
                      {field.label}
                      {field.optional ? (
                        <span className="ml-1 text-muted-foreground/70">(optional)</span>
                      ) : null}
                    </>
                  }
                  htmlFor={`cred_${field.key}`}
                  hint={field.hint}
                >
                  <Input
                    id={`cred_${field.key}`}
                    type={field.secret ? "password" : "text"}
                    autoComplete="new-password"
                    inputMode={field.numeric ? "numeric" : undefined}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                </Field>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={saveCredentials} disabled={saving}>
                {saving ? "Saving…" : "Save credentials"}
              </Button>
              {state?.configured ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setReplacing(false)
                    setValues({})
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {state?.configured ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={runTest} disabled={testing}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
            {testResult ? (
              <Notice tone={testResult.ok ? "success" : "error"}>
                <span className="inline-flex items-start gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </span>
              </Notice>
            ) : null}
          </div>
        ) : null}
      </StepCard>

      {provider === "stayntouch" ? (
        <StepCard
          title="StayNTouch extras"
          description="Both are optional, and both are pasted into StayNTouch rather than here."
        >
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Webhook URL to register in StayNTouch for rate-change events:
            </p>
            <CopyBox
              value={`${apiBaseUrl() || "<API base URL>"}/webhooks/stayntouch/${hotelId}`}
            />
          </div>
          <Field
            label="Reservation source code override"
            htmlFor="sourceCode"
            hint='Leave blank to use the standard "RESONATA" source. Set it only where that source cannot be configured in StayNTouch (the shared UAT sandbox uses "API").'
          >
            <Input
              id="sourceCode"
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              placeholder="RESONATA"
              className="font-mono"
            />
          </Field>
        </StepCard>
      ) : null}

      <StepNav
        onBack={goBack}
        hasBack={hasBack}
        onNext={continueOn}
        onSkip={skip}
        saving={saving}
        error={error}
        nextLabel="Continue"
      />
    </div>
  )
}
