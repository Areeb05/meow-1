import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define the schema for Google Cloud credentials
const googleCloudCredentialsSchema = z.object({
  type: z.string(),
  project_id: z.string(),
  private_key_id: z.string(),
  private_key: z.string(),
  client_email: z.string(),
  client_id: z.string(),
  auth_uri: z.string(),
  token_uri: z.string(),
  auth_provider_x509_cert_url: z.string(),
  client_x509_cert_url: z.string(),
});

// Define the schema for server configuration
const configSchema = z.object({
  port: z.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  corsOrigins: z.array(z.string()).default([]),
  googleCloudCredentials: googleCloudCredentialsSchema,
  maxReconnectAttempts: z.number().default(5),
  reconnectDelay: z.number().default(1000),
  maxAudioChunkSize: z.number().default(1024 * 1024), // 1MB
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(100), // limit each IP to 100 requests per windowMs
  }),
});

// Type for the parsed configuration
export type ServerConfig = z.infer<typeof configSchema>;

function parseGoogleCloudCredentials(): z.infer<typeof googleCloudCredentialsSchema> {
  try {
    const credentialsStr = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credentialsStr) {
      throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is not set');
    }

    const credentials = JSON.parse(credentialsStr);
    return googleCloudCredentialsSchema.parse(credentials);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid Google Cloud credentials: ${error.message}`);
    }
    throw error;
  }
}

function getCorsOrigins(): string[] {
  const origins = process.env.CORS_ORIGINS?.split(',') || [];
  
  // Add default origins based on environment
  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    );
  }

  // Add Replit domain if present
  const replitDomain = process.env.REPLIT_DOMAIN;
  if (replitDomain) {
    origins.push(
      `https://${replitDomain}`,
      `http://${replitDomain}`,
      `ws://${replitDomain}`,
      `wss://${replitDomain}`
    );
  }

  return [...new Set(origins)]; // Remove duplicates
}

export function validateConfig(): ServerConfig {
  try {
    const config = configSchema.parse({
      port: parseInt(process.env.PORT || '3001', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
      corsOrigins: getCorsOrigins(),
      googleCloudCredentials: parseGoogleCloudCredentials(),
      maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '5', 10),
      reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '1000', 10),
      maxAudioChunkSize: parseInt(process.env.MAX_AUDIO_CHUNK_SIZE || '1048576', 10),
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${issues}`);
    }
    throw error;
  }
} 