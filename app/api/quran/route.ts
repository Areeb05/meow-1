import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export async function GET() {
  try {
    const csvFilePath = path.join(process.cwd(), 'data', 'output.csv');
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    const quranVerses = records.map((record: any) => ({
      surahNo: parseInt(record.surah_no),
      surahNameEn: record.surah_name_en,
      surahNameAr: record.surah_name_ar,
      ayahNoSurah: parseInt(record.ayah_no_surah),
      ayahAr: record.ayah_ar,
      ayahEn: record.ayah_en,
      reference: `${record.surah_no}:${record.ayah_no_surah}`
    }));

    return NextResponse.json(quranVerses);
  } catch (error) {
    console.error('Error loading Quran data:', error);
    return NextResponse.json({ error: 'Failed to load Quran data' }, { status: 500 });
  }
} 