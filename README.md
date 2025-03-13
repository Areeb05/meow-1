Welcome to the NextJS 13 base template bootstrapped using the `create-next-app`. This template supports TypeScript, but you can use normal JavaScript as well.

## Getting Started

Hit the run button to start the development server.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) allow you to create custom request handlers for a given route using the Web Request and Response APIs.

The `app/api` directory is mapped to `/api/*`. Folders in this directory with files named `route.ts` are treated as [Route handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) instead of pages.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Productionizing your Next App

To make your next App run smoothly in production make sure to deploy your project with [Repl Deployments](https://docs.replit.com/hosting/deployments/about-deployments)!

You can also produce a production build by running `npm run build` and [changing the run command](https://docs.replit.com/programming-ide/configuring-repl#run) to `npm run start`.

# Real-time Audio Transcription App

This is a Next.js application with a custom Express server that provides real-time audio transcription using Google Cloud Speech-to-Text and Socket.io.

## Features

- Real-time audio transcription using Google Cloud Speech-to-Text API
- WebSocket communication with Socket.io
- Next.js frontend with React and Tailwind CSS
- Custom Express server for handling both Next.js and WebSocket connections

## Setup and Configuration

### Environment Variables

Copy the `.env.example` file to `.env` and configure the following variables:

```bash
# Required: Google Cloud Speech-to-Text credentials
GOOGLE_CLOUD_KEY_FILE=./path-to-your-credentials.json
# Or use the credentials directly (preferred for Replit)
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}

# Server Configuration
PORT=3000
NODE_ENV=development

# WebSocket Configuration
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

### Google Cloud Speech-to-Text Setup

1. Create a [Google Cloud Project](https://console.cloud.google.com/)
2. Enable the Speech-to-Text API
3. Create a service account and download the JSON key file
4. Either:
   - Save the key file and specify its path in GOOGLE_CLOUD_KEY_FILE
   - Copy the contents of the JSON file directly into GOOGLE_CLOUD_CREDENTIALS

### Running on Replit

When running on Replit, the app will automatically detect the Replit environment and configure CORS accordingly. Make sure to:

1. Set the GOOGLE_CLOUD_CREDENTIALS environment variable in your Replit secrets
2. The Socket.io connection will automatically use the correct Replit URL
3. Make sure CORS_ORIGINS includes your Replit domain (automatic in most cases)

## Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

## Production

```bash
# Build the application
npm run build

# Start the production server
npm start
```

## How It Works

1. The Express server in `server.ts` sets up both Next.js and Socket.io
2. The client connects to the WebSocket server from the browser
3. Audio data is captured using RecordRTC and streamed to the server
4. Google Speech-to-Text processes the audio and returns transcriptions
5. Transcriptions are sent back to the client in real-time

## Troubleshooting

### Socket.io Connection Issues

If you're having trouble connecting to the WebSocket server:

1. Check that your environment variables are correctly set
2. Ensure CORS is properly configured for your domain
3. Try using the browser's developer tools to debug connection issues
4. Check the server logs for any errors

### Audio Recording Issues

If microphone access isn't working:

1. Make sure your browser has permission to access the microphone
2. Check that you're using a secure context (HTTPS) in production
3. Ensure RecordRTC is properly configured

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [Google Cloud Speech-to-Text](https://cloud.google.com/speech-to-text)
- [RecordRTC Documentation](https://recordrtc.org/)
