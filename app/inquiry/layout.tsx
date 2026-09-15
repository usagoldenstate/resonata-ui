import type { Metadata } from "next"

// The follow-up page below is public (proxy.ts) and shows a caller's name,
// phone, email and notes, keyed only by the signed token in the URL. Those
// tokens never expire, so if a link ever escapes the sales mailbox — forwarded,
// pasted into a ticket — nothing else stops a crawler from indexing it. The
// page itself is a client component and cannot export metadata, hence this
// otherwise-empty server layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function InquiryLayout({ children }: { children: React.ReactNode }) {
  return children
}
