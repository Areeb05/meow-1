import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export interface QuranVerse {
  surahNo: number;
  surahNameEn: string;
  surahNameAr: string;
  ayahNoSurah: number;
  ayahAr: string;
  ayahEn: string;
  reference: string;
}

// Read and parse the CSV file
const csvFilePath = path.join(process.cwd(), 'data', 'output.csv');
const fileContent = fs.readFileSync(csvFilePath, 'utf-8');

const records = parse(fileContent, {
  columns: true,
  skip_empty_lines: true
});

const quranVerses: QuranVerse[] = records.map((record: any) => ({
  surahNo: parseInt(record.surah_no),
  surahNameEn: record.surah_name_en,
  surahNameAr: record.surah_name_ar,
  ayahNoSurah: parseInt(record.ayah_no_surah),
  ayahAr: record.ayah_ar,
  ayahEn: record.ayah_en,
  reference: `${record.surah_no}:${record.ayah_no_surah}`
}));

export async function GET() {
  return NextResponse.json(quranVerses);
} 