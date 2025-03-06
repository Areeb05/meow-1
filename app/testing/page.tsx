"use client";
import { QuranSearch } from "../components/QuranSearch";

export default function TestingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-900 to-black">
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      {/* Header Section */}
      <header className="relative border-b border-gray-800/20 bg-gray-900/30 backdrop-blur-xl">
        <div className="relative max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-block">
              <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-200 to-teal-200 mb-3">
                Quran Text Search
              </h1>
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" />
            </div>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto mt-4">
              Search through verses of the Quran using text in both English and Arabic
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl blur-2xl opacity-50 group-hover:opacity-75 transition-opacity" />
          <div className="relative bg-gray-900/50 backdrop-blur-xl border border-gray-800/50 rounded-2xl shadow-2xl p-8 md:p-10">
            <div className="max-w-3xl mx-auto">
              <div className="mb-10 text-center space-y-2">
                <h2 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-emerald-200 to-teal-200">
                  Text Search
                </h2>
                <p className="text-gray-400">
                  Type any word or phrase to find matching verses
                </p>
              </div>
              <QuranSearch />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <span>Search powered by</span>
            <span className="text-emerald-500 font-medium">Fuse.js</span>
            <span>•</span>
            <span>Verses from</span>
            <span className="text-emerald-500 font-medium">The Quran</span>
          </div>
        </div>
      </footer>
    </div>
  );
} 