import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Geist_Mono, Mulish } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const mulish = Mulish({
  subsets: ["latin"],
  variable: "--font-mulish",
  weight: ["300", "400", "500", "600", "700", "800"],
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: 'Resonata Dashboard',
  description: 'Call management and analytics dashboard',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Set per-request by proxy.ts. ClerkProvider stamps it onto the clerk-js
  // <script> tag so the CSP's script-src nonce covers it. Reading headers()
  // here intentionally makes all pages dynamic — a per-request nonce can't
  // live in prerendered static HTML.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <ClerkProvider nonce={nonce}>
      <html lang="en">
        <body className={`${mulish.variable} ${geistMono.variable} font-sans antialiased`}>
          {children}
          <Toaster />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </body>
      </html>
    </ClerkProvider>
  )
}
