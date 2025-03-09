import { validateConfig } from '../config';

const config = validateConfig();

export function validateAudioInput(data: unknown): data is ArrayBuffer {
  if (!(data instanceof ArrayBuffer)) {
    return false;
  }

  // Check if the data size is within limits
  if (data.byteLength > config.maxAudioChunkSize) {
    return false;
  }

  // Check if the data is not empty
  if (data.byteLength === 0) {
    return false;
  }

  return true;
}

export function validateSampleRate(sampleRate: number): boolean {
  // Google Speech-to-Text supports 8000Hz, 16000Hz, and 48000Hz
  const supportedSampleRates = [8000, 16000, 48000];
  return supportedSampleRates.includes(sampleRate);
}

export function validateAudioFormat(mimeType: string): boolean {
  const supportedFormats = [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/wav',
  ];
  return supportedFormats.includes(mimeType);
}

export function validateBitDepth(bitDepth: number): boolean {
  // Google Speech-to-Text supports 16-bit linear PCM
  return bitDepth === 16;
}

export function validateChannelCount(channels: number): boolean {
  // Google Speech-to-Text requires mono audio
  return channels === 1;
}

function checkWavHeader(buffer: Buffer): boolean {
  // WAV header is 44 bytes
  if (buffer.length < 44) {
    return false;
  }

  // Check RIFF header
  const riffHeader = buffer.toString('ascii', 0, 4);
  if (riffHeader !== 'RIFF') {
    return false;
  }

  // Check WAVE format
  const waveFormat = buffer.toString('ascii', 8, 12);
  if (waveFormat !== 'WAVE') {
    return false;
  }

  // Check audio format (1 for PCM)
  const audioFormat = buffer.readUInt16LE(20);
  if (audioFormat !== 1) {
    return false;
  }

  // Check number of channels (1 for mono)
  const numChannels = buffer.readUInt16LE(22);
  if (numChannels !== 1) {
    return false;
  }

  // Check sample rate (should be 16000)
  const sampleRate = buffer.readUInt32LE(24);
  if (sampleRate !== 16000) {
    return false;
  }

  return true;
} 