import { EventEmitter } from 'events';

interface WebSocketEvents {
  transcription: (text: string) => void;
  error: (message: string) => void;
  connectionStatus: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export class WebSocketManager {
  private static instance: WebSocketManager;
  private socket: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventEmitter = new EventEmitter();
  private isRecording = false;

  private constructor() {
    this.url = this.getWebSocketUrl();
    this.connect();
  }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return '';
    
    const isSecure = window.location.protocol === 'https:';
    const host = window.location.host;
    const wsProtocol = isSecure ? 'wss' : 'ws';
    
    // Use environment variable for development if available
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }
    
    return `${wsProtocol}://${host}`;
  }

  private connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.eventEmitter.emit('connectionStatus', 'connecting');
    
    try {
      this.socket = new WebSocket(this.url);
      
      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.eventEmitter.emit('connectionStatus', 'connected');
      };

      this.socket.onclose = () => {
        this.eventEmitter.emit('connectionStatus', 'disconnected');
        this.handleReconnect();
      };

      this.socket.onerror = (error) => {
        this.eventEmitter.emit('error', 'WebSocket connection error');
        console.error('WebSocket error:', error);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcription') {
            this.eventEmitter.emit('transcription', data.text);
          } else if (data.type === 'error') {
            this.eventEmitter.emit('error', data.message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.handleReconnect();
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.eventEmitter.emit('error', 'Maximum reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  public startRecording(): void {
    this.isRecording = true;
  }

  public stopRecording(): void {
    this.isRecording = false;
  }

  public sendAudioData(data: ArrayBuffer): void {
    if (!this.isRecording || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.socket.send(data);
    } catch (error) {
      console.error('Error sending audio data:', error);
      this.eventEmitter.emit('error', 'Failed to send audio data');
    }
  }

  public onTranscription(callback: WebSocketEvents['transcription']): () => void {
    this.eventEmitter.on('transcription', callback);
    return () => this.eventEmitter.off('transcription', callback);
  }

  public onError(callback: WebSocketEvents['error']): () => void {
    this.eventEmitter.on('error', callback);
    return () => this.eventEmitter.off('error', callback);
  }

  public onConnectionStatus(callback: WebSocketEvents['connectionStatus']): () => void {
    this.eventEmitter.on('connectionStatus', callback);
    return () => this.eventEmitter.off('connectionStatus', callback);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
