interface AudioProcessorConfig {
  onStart: () => void;
  onStop: () => void;
  onData: (data: ArrayBuffer) => void;
  onError: (error: Error) => void;
}

export class AudioProcessor {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private config: AudioProcessorConfig;
  private chunks: Blob[] = [];
  private isRecording = false;

  constructor(config: AudioProcessorConfig) {
    this.config = config;
  }

  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      return;
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // Create MediaRecorder instance
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: this.getSupportedMimeType(),
      });

      // Set up event handlers
      this.recorder.ondataavailable = this.handleDataAvailable.bind(this);
      this.recorder.onstart = () => {
        this.isRecording = true;
        this.chunks = [];
        this.config.onStart();
      };
      this.recorder.onstop = () => {
        this.isRecording = false;
        this.config.onStop();
      };
      this.recorder.onerror = (event) => {
        this.isRecording = false;
        this.config.onError(new Error(event.error.message));
      };

      // Start recording
      this.recorder.start(100); // Collect data every 100ms
    } catch (error) {
      this.config.onError(error instanceof Error ? error : new Error('Failed to start recording'));
    }
  }

  public stopRecording(): void {
    if (!this.isRecording || !this.recorder) {
      return;
    }

    try {
      this.recorder.stop();
      this.cleanup();
    } catch (error) {
      this.config.onError(error instanceof Error ? error : new Error('Failed to stop recording'));
    }
  }

  private getSupportedMimeType(): string {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];

    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    throw new Error('No supported audio MIME type found');
  }

  private async handleDataAvailable(event: BlobEvent): Promise<void> {
    if (event.data.size > 0) {
      this.chunks.push(event.data);
      
      try {
        // Convert blob to ArrayBuffer
        const arrayBuffer = await event.data.arrayBuffer();
        this.config.onData(arrayBuffer);
      } catch (error) {
        this.config.onError(new Error('Failed to process audio data'));
      }
    }
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.recorder) {
      this.recorder = null;
    }

    this.chunks = [];
    this.isRecording = false;
  }

  public isActive(): boolean {
    return this.isRecording;
  }
} 