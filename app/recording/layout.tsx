import type { Metadata } from "next"

// The page below is public (proxy.ts) and plays a call keyed only by the signed
// token in the URL. It is a client component and cannot export metadata, hence
// this otherwise-empty server layout.
export const metadata: Metadata = {
  title: "Call recording",
  robots: { index: false, follow: false },
}

export default function RecordingLayout({ children }: { children: React.ReactNode }) {
  return children
}
