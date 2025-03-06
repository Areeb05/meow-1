"use client";

import { useState, useCallback, memo, useEffect } from "react";
import Fuse from "fuse.js";
import type { FuseResult } from "fuse.js";
import { QuranVerse } from "../../data/quran";

// Memoized result card component for better performance
const SearchResult = memo(({ result }: { result: FuseResult<QuranVerse> }) => (
  <div className="bg-gray-800/70 border border-gray-700/50 rounded-xl p-6 
                transition-all duration-200 hover:border-emerald-500/30">
    <div className="flex justify-between items-start mb-2">
      <div className="text-emerald-500 text-sm">
        {result.item.surahNameEn} [{result.item.reference}]
      </div>
      <div className="text-emerald-500/60 text-sm">
        Match: {((1 - (result.score || 0)) * 100).toFixed(0)}%
      </div>
    </div>
    <div className="mb-4 text-right text-2xl font-arabic text-emerald-200">
      {result.item.ayahAr}
    </div>
    <div className="text-gray-300 text-lg">
      {result.item.ayahEn}
    </div>
  </div>
));

SearchResult.displayName = 'SearchResult';

export function QuranSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<FuseResult<QuranVerse>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fuse, setFuse] = useState<Fuse<QuranVerse> | null>(null);

  // Fetch Quran data and initialize Fuse.js
  useEffect(() => {
    async function loadQuranData() {
      try {
        const response = await fetch('/api/quran');
        if (!response.ok) throw new Error('Failed to load Quran data');
        
        const verses: QuranVerse[] = await response.json();
        const fuseInstance = new Fuse<QuranVerse>(verses, {
          keys: ["ayahEn", "ayahAr"],
          threshold: 0.4,
          includeScore: true,
        });
        
        setFuse(fuseInstance);
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading Quran data:', err);
        setError('Failed to load Quran data. Please try again later.');
        setIsLoading(false);
      }
    }

    loadQuranData();
  }, []);

  const handleSearch = useCallback((term: string) => {
    if (!fuse) return;
    const trimmedTerm = term.trim();
    setSearchResults(trimmedTerm ? fuse.search(trimmedTerm) : []);
  }, [fuse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            const newTerm = e.target.value;
            setSearchTerm(newTerm);
            handleSearch(newTerm);
          }}
          placeholder="Search verses in Arabic or English..."
          className="w-full px-5 py-4 text-lg text-gray-100 bg-gray-800/70 
                   border border-gray-700 rounded-xl 
                   focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50
                   transition-colors"
          aria-label="Search verses"
        />
      </div>

      {searchResults.length > 0 ? (
        <div className="space-y-4">
          {searchResults.map((result) => (
            <SearchResult key={`${result.item.surahNo}-${result.item.ayahNoSurah}`} result={result} />
          ))}
        </div>
      ) : searchTerm && (
        <div className="text-center py-8">
          <p className="text-gray-300">No matching verses found</p>
        </div>
      )}
    </div>
  );
} 