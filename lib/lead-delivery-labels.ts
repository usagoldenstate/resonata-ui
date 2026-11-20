import type { LeadDeliveryState, LeadDeliveryStatus } from "./api"

// "Submitted" is the strongest word this connection can honestly use:
// Web-to-Lead only says the request was received, so nothing here may claim a
// lead was created or accepted.
export const LEAD_CREATION_CAVEAT = "Lead creation is not confirmed by this connection."

export function leadBadgeLabel(state: Pick<LeadDeliveryState, "status" | "provider_label">): string | null {
  const provider = state.provider_label
  const labels: Record<LeadDeliveryStatus, string | null> = {
    pending: `Waiting for ${provider} submission`,
    sending: `Sending to ${provider}`,
    submitted: `Submitted to ${provider}`,
    failed: `${provider}: retrying`,
    gave_up: `${provider}: needs attention`,
    needs_review: `${provider}: needs review`,
    skipped: null, // Detail-only: most sales calls that skip have nothing to act on.
  }
  return labels[state.status]
}

const REASON_DETAIL: Record<string, string> = {
  waiting_for_call: "Waiting for the call to finish.",
  waiting_for_classification: "Waiting for the call to be classified as a new or existing inquiry.",
  waiting_for_dispatch: "Ready to send on the next delivery run, within about 10 minutes.",
  call_not_finalized: "The call was never finalized, so it has not been sent.",
  classification_unavailable: "The call could not be classified as a new or existing inquiry, so it has not been sent.",
  missing_transcript: "The call has no transcript, so it has not been sent.",
  destination_changed: "The lead destination changed after this inquiry came in. A platform admin needs to confirm the new one.",
  provider_rejected: "The request was refused. Check the lead delivery settings.",
  provider_unavailable: "The service was unavailable.",
  provider_exception: "The service reported an error.",
  unexpected_response: "The service gave an unexpected response, so the outcome is unclear.",
  transport_failed: "The connection failed.",
  interrupted: "The send was interrupted, so the outcome is unclear.",
  attempts_exhausted: "Automatic attempts are used up.",
  disabled: "Lead delivery was turned off. A platform admin can re-enable it in settings, then review and retry this inquiry.",
  processing_failed: "The lead could not be prepared. A platform admin should check Diagnostics and fix the cause before retrying if automatic retries have stopped.",
  existing_inquiry: "Not sent: this caller is following up on an existing inquiry.",
  partial_missing_contact: "Not sent: this partial inquiry has no name or no way to reach the caller.",
  erased: "Not sent further: this inquiry was erased under a privacy request.",
  inquiry_deleted: "Not sent: the inquiry was deleted.",
  call_deleted: "Not sent: the call was deleted.",
  not_sales_call: "Not sent: this was not a sales call.",
  superseded: "A later submission from this call was sent instead.",
}

export function leadReasonText(reason: string | null | undefined): string | null {
  return reason ? (REASON_DETAIL[reason] ?? null) : null
}

// Only the states a platform admin can send back to the queue.
export function leadCanRetry(status: LeadDeliveryStatus): boolean {
  return status === "failed" || status === "gave_up" || status === "needs_review"
}
