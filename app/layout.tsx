import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ErrorBoundary } from '@/components/error-boundary'
import { Suspense } from 'react'
import { Loading } from '@/components/loading'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Quran Recitation Translation',
  description: 'Real-time Arabic Quran recitation transcription and translation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={inter.className}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </body>
    </html>
  )
}
