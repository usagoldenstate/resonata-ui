import type { SalesEventCategory, SalesInquiryKind } from "@/lib/api"

// Display labels for the sales inquiry vocabularies. The values mirror the
// backend's schemas/sales_inquiry.py; what each category means is defined in
// the post-call classifier's prompt.
export const EVENT_CATEGORY_LABELS: Record<SalesEventCategory, string> = {
  wedding: "Wedding",
  social_event: "Social event",
  corporate_event: "Corporate event",
  conference: "Conference",
  group_room_block: "Rooms only",
  other: "Other",
  not_specified: "Not specified",
}

// Never "New" / "Follow-up": those words belong to the response status.
export const INQUIRY_KIND_LABELS: Record<SalesInquiryKind, string> = {
  initial_inquiry: "Initial inquiry",
  existing_inquiry: "Existing inquiry",
}
