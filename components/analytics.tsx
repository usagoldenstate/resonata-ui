"use client"

import { Analytics as VercelAnalytics, type BeforeSendEvent } from "@vercel/analytics/next"

// The public sales follow-up page (app/inquiry/[token]) carries its whole
// authorization in the URL, and Vercel Analytics records the real page URL —
// not just the route pattern — on every pageview. Left alone, every follow-up
// link would be copied verbatim into the Analytics dashboard, where it stays
// valid indefinitely (the backend mints these tokens without expiry). Replace
// the token segment so the page still counts as a pageview without the
// capability riding along.
//
// A client component because `beforeSend` is a function and the root layout
// that mounts this is a server component.
const INQUIRY_TOKEN = /\/inquiry\/[^/?#]+/

function scrubInquiryToken(event: BeforeSendEvent): BeforeSendEvent {
  if (!INQUIRY_TOKEN.test(event.url)) return event
  return { ...event, url: event.url.replace(INQUIRY_TOKEN, "/inquiry/_") }
}

export function Analytics() {
  return <VercelAnalytics beforeSend={scrubInquiryToken} />
}
