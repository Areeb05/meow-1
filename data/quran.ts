
export interface QuranVerse {
  surahNo: number;
  surahNameEn: string;
  surahNameAr: string;
  ayahNoSurah: number;
  ayahAr: string;
  ayahEn: string;
  reference: string;
}

// This is a placeholder. In a real app, you would fetch this data from an API
// instead of using fs which isn't available in the browser
const quranVerses: QuranVerse[] = [
  {
    surahNo: 1,
    surahNameEn: "Al-Fatiha",
    surahNameAr: "الفاتحة",
    ayahNoSurah: 1,
    ayahAr: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    ayahEn: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
    reference: "1:1"
  },
  // You would add more verses here
];

export default quranVerses;
