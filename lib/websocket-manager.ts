import { Socket, io } from 'socket.io-client';

interface ServerToClientEvents {
  transcription: (text: string) => void;
  error: (message: string) => void;
}

interface ClientToServerEvents {
  audio: (chunk: Buffer) => void;
}

type TranscriptionCallback = (text: string) => void;
type ErrorCallback = (error: string) => void;
type ConnectionCallback = (status: boolean) => void;

export class WebSocketManager {
  private static instance: WebSocketManager;
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private audioBuffer: Buffer[] = [];
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private readonly maxReconnectDelay = 5000;
  private transcriptionCallbacks: Set<TranscriptionCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private constructor() {
    console.log('[DEBUG] WebSocketManager: Constructor called');
    const initSocket = async () => {
      console.log('[DEBUG] WebSocketManager: Initializing socket connection');
      try {
        console.log('[DEBUG] WebSocketManager: Fetching WebSocket URL from', window.location.origin);
        // First, try to get the WebSocket URL from the server
        const response = await fetch(window.location.origin, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        
        console.log('[DEBUG] WebSocketManager: Server response status:', response.status);
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[DEBUG] WebSocketManager: Server response data:', data);
        
        if (!data?.websocket?.url) {
          throw new Error('Invalid server response: missing websocket URL');
        }

        const SOCKET_URL = data.websocket.url;
        console.log('[DEBUG] WebSocketManager: Using server provided WebSocket URL:', SOCKET_URL);
        this.initializeSocket(SOCKET_URL);
      } catch (error) {
        console.error('[DEBUG] WebSocketManager: Failed to get WebSocket URL from server:', error);
        
        // Fallback to constructing URL based on current location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const SOCKET_URL = `${protocol}//${window.location.hostname}`;
        
        console.log('[DEBUG] WebSocketManager: Using fallback WebSocket URL:', SOCKET_URL);
        this.initializeSocket(SOCKET_URL);
      }
    };

    // Start initialization
    initSocket();
  }

  private initializeSocket(url: string): void {
    console.log('[DEBUG] WebSocketManager: Initializing socket with URL:', url);
    try {
      this.socket = io(url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: this.maxReconnectDelay,
        timeout: 20000,
        autoConnect: false,
        withCredentials: true,
        path: '/socket.io'
      });

      console.log('[DEBUG] WebSocketManager: Socket instance created:', !!this.socket);
      this.setupEventHandlers();
    } catch (error) {
      console.error('[DEBUG] WebSocketManager: Failed to initialize socket:', error);
      this.notifyError(`Socket initialization failed: ${error.message}`);
    }
  }

  private setupEventHandlers(): void {
    console.log('[DEBUG] WebSocketManager: Setting up event handlers');
    if (!this.socket) {
      console.warn('[DEBUG] WebSocketManager: Cannot setup event handlers: socket not initialized');
      return;
    }

    this.socket.on('connect', () => {
      console.log('[DEBUG] WebSocketManager: Connected to WebSocket server with ID:', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.flushAudioBuffer();
      this.notifyConnectionStatus(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[DEBUG] WebSocketManager: Disconnected from WebSocket server. Reason:', reason);
      this.isConnected = false;
      this.notifyConnectionStatus(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[DEBUG] WebSocketManager: Connection error:', error);
      console.log('[DEBUG] WebSocketManager: Reconnect attempts:', this.reconnectAttempts);
      this.isConnected = false;
      this.reconnectAttempts++;
      this.notifyError(`Connection error: ${error.message || 'Unknown error'}`);
    });

    this.socket.on('error', (error) => {
      console.error('[DEBUG] WebSocketManager: WebSocket error:', error);
      this.notifyError(`WebSocket error: ${error}`);
    });

    this.socket.on('transcription', (text) => {
      console.log('[DEBUG] WebSocketManager: Received transcription:', text);
      this.notifyTranscription(text);
    });
  }

  public connect(): void {
    console.log('[DEBUG] WebSocketManager: Connect called. Socket exists:', !!this.socket);
    if (this.socket && !this.socket.connected) {
      console.log('[DEBUG] WebSocketManager: Initiating WebSocket connection...');
      this.socket.connect();
    } else if (!this.socket) {
      console.log('[DEBUG] WebSocketManager: Socket not initialized yet, waiting...');
      setTimeout(() => this.connect(), 2000);
    }
  }

  public disconnect(): void {
    console.log('[DEBUG] WebSocketManager: Disconnect called. Socket exists:', !!this.socket);
    if (this.socket) {
      this.socket.disconnect();
    }
    this.audioBuffer = [];
    this.isConnected = false;
  }

  public sendAudio(chunk: Buffer): void {
    if (!chunk || chunk.length === 0) {
      console.warn('[DEBUG] WebSocketManager: Attempted to send empty audio chunk');
      return;
    }

    console.log('[DEBUG] WebSocketManager: Sending audio chunk. Connected:', this.isConnected, 'Socket exists:', !!this.socket);
    if (this.isConnected && this.socket) {
      try {
        this.socket.emit('audio', chunk);
      } catch (error) {
        console.error('[DEBUG] WebSocketManager: Error sending audio chunk:', error);
        this.notifyError('Failed to send audio data');
      }
    } else {
      console.log('[DEBUG] WebSocketManager: Socket not connected, buffering audio chunk');
      this.audioBuffer.push(chunk);
      if (this.audioBuffer.length > 100) {
        this.audioBuffer.shift();
      }
    }
  }

  private flushAudioBuffer(): void {
    if (this.audioBuffer.length > 0) {
      console.log(`Flushing ${this.audioBuffer.length} buffered audio chunks`);
      while (this.audioBuffer.length > 0) {
        const chunk = this.audioBuffer.shift();
        if (chunk) {
          this.sendAudio(chunk);
        }
      }
    }
  }

  // Event subscription methods
  public onTranscription(callback: TranscriptionCallback): () => void {
    this.transcriptionCallbacks.add(callback);
    return () => this.transcriptionCallbacks.delete(callback);
  }

  public onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  public onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  // Event notification methods
  private notifyTranscription(text: string): void {
    this.transcriptionCallbacks.forEach(callback => callback(text));
  }

  private notifyError(error: string): void {
    this.errorCallbacks.forEach(callback => callback(error));
  }

  private notifyConnectionStatus(status: boolean): void {
    this.connectionCallbacks.forEach(callback => callback(status));
  }

  // Status methods
  public isSocketConnected(): boolean {
    return this.isConnected;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  public getSocketId(): string | null {
    return this.socket?.id || null;
  }
} 