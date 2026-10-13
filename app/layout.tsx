import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Mulish, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { Analytics } from '@/components/analytics'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const mulish = Mulish({ subsets: ["latin"], variable: "--font-mulish", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: 'Resonata Dashboard',
  description: 'Call management and analytics dashboard',
  icons: {
    icon: [{ url: '/brand/favicon-32.png', type: 'image/png', sizes: '32x32' }],
    apple: '/brand/apple-touch-icon.png',
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
    <ClerkProvider nonce={nonce} appearance={{
      variables: { colorPrimary: '#c34a1a', borderRadius: '0.875rem', fontFamily: 'var(--font-mulish), sans-serif' },
    }}>
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
