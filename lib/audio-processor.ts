export class AudioProcessor {
  private audioContext: AudioContext;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private isProcessing = false;

  constructor() {
    this.audioContext = new AudioContext({
      sampleRate: 16000,
      latencyHint: 'interactive'
    });
  }

  async setupAudio(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0; // Normal volume

      // Create script processor for audio processing
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Connect nodes
      source.connect(this.gainNode);
      this.gainNode.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (e) => {
        if (!this.isProcessing) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        this.processAudioData(inputData);
      };

    } catch (error) {
      console.error('Audio setup failed:', error);
      throw this.handleAudioError(error);
    }
  }

  private processAudioData(data: Float32Array): void {
    // Normalize audio levels
    const normalizedData = this.normalizeAudio(data);
    
    // Apply noise reduction
    const denoisedData = this.reduceNoise(normalizedData);
    
    // Convert to proper format for speech recognition
    const processedData = this.convertToSpeechFormat(denoisedData);
    
    // Emit processed audio data
    this.onAudioProcessed?.(processedData);
  }

  private normalizeAudio(data: Float32Array): Float32Array {
    const max = Math.max(...data.map(Math.abs));
    if (max === 0) return data;
    
    return data.map(sample => sample / max);
  }

  private reduceNoise(data: Float32Array): Float32Array {
    // Simple noise reduction using a moving average
    const windowSize = 3;
    const result = new Float32Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let j = -windowSize; j <= windowSize; j++) {
        const index = i + j;
        if (index >= 0 && index < data.length) {
          sum += data[index];
          count++;
        }
      }
      
      result[i] = sum / count;
    }
    
    return result;
  }

  private convertToSpeechFormat(data: Float32Array): Float32Array {
    // Convert to 16-bit PCM format required by speech recognition
    const pcmData = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      pcmData[i] = Math.max(-32768, Math.min(32767, data[i] * 32768));
    }
    return new Float32Array(pcmData.buffer);
  }

  private handleAudioError(error: unknown): Error {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return new Error('Microphone access denied. Please allow microphone access to use this feature.');
        case 'NotFoundError':
          return new Error('No microphone found. Please connect a microphone and try again.');
        case 'NotReadableError':
          return new Error('Microphone is already in use by another application.');
        default:
          return new Error('An error occurred while accessing the microphone.');
      }
    }
    return error instanceof Error ? error : new Error('Unknown audio error occurred.');
  }

  public startProcessing(): void {
    this.isProcessing = true;
  }

  public stopProcessing(): void {
    this.isProcessing = false;
  }

  public setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  public async cleanup(): Promise<void> {
    this.stopProcessing();
    
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    await this.audioContext.close();
  }

  // Callback for processed audio data
  public onAudioProcessed?: (data: Float32Array) => void;
} 