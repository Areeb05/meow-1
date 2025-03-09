export function validateAudioInput(audioChunk: Buffer): boolean {
  // Check if the input is a Buffer
  if (!Buffer.isBuffer(audioChunk)) {
    return false;
  }

  // Check if the chunk size is reasonable (not too small or too large)
  const minSize = 1024; // 1KB
  const maxSize = 1024 * 1024; // 1MB
  if (audioChunk.length < minSize || audioChunk.length > maxSize) {
    return false;
  }

  // Check if the chunk contains valid audio data
  // This is a basic check - you might want to add more sophisticated validation
  const hasValidHeader = checkWavHeader(audioChunk);
  if (!hasValidHeader) {
    return false;
  }

  return true;
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