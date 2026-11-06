"use client"

import { Analytics as VercelAnalytics, type BeforeSendEvent } from "@vercel/analytics/next"

// The public sales follow-up and recording pages (app/inquiry/[token],
// app/recording/[token]) carry their whole authorization in the URL, and Vercel
// Analytics records the real page URL — not just the route pattern — on every
// pageview. Left alone, every link would be copied verbatim into the Analytics
// dashboard, where a follow-up link stays valid indefinitely. Replace the token
// segment so the page still counts as a pageview without the capability
// riding along.
//
// A client component because `beforeSend` is a function and the root layout
// that mounts this is a server component.
const LINK_TOKEN = /\/(inquiry|recording)\/[^/?#]+/

function scrubLinkToken(event: BeforeSendEvent): BeforeSendEvent {
  if (!LINK_TOKEN.test(event.url)) return event
  return { ...event, url: event.url.replace(LINK_TOKEN, "/$1/_") }
}

export function Analytics() {
  return <VercelAnalytics beforeSend={scrubLinkToken} />
}
