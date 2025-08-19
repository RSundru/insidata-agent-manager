# VAPI Server SDK

An enhanced SDK for the VAPI.AI platform, providing robust features for managing voice assistants, calls, recordings, and webhooks.

## Features

- **Assistant Management**: Create, list, update, and delete VAPI assistants
- **Call Handling**: Make, receive, and manage phone calls
- **Phone Number Management**: List and purchase phone numbers
- **Call Recording**: Record and manage call recordings
- **Webhook Support**: Handle call events via webhooks
- **Caching**: Built-in caching for better performance
- **Error Handling**: Comprehensive error handling and logging

## Prerequisites

- Node.js 16+ (LTS recommended)
- npm or yarn
- VAPI API Key ([Get it here](https://app.vapi.ai))

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/windsurf-project.git
cd windsurf-project

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
VAPI_API_KEY=your_vapi_api_key
VAPI_BASE_URL=https://api.vapi.ai
NODE_ENV=development
```

## Usage

### Basic Example

```javascript
import { createAssistant, startCall } from './vapi-agent.js';

// Create a new assistant
const assistant = await createAssistant(
  'Support Bot',
  'Hello! How can I help you today?',
  'You are a helpful support assistant.',
  {
    model: 'gpt-4o',
    voice: {
      provider: 'vapi',
      voiceId: 'Elliot'
    }
  }
);

// Start a call
const call = await startCall({
  assistantId: assistant.id,
  customerNumber: '+1234567890',
  phoneNumberId: 'your-phone-number-id'
});
```

## API Reference

### Assistant Management

- `createAssistant(name, firstMessage, systemPrompt, options)`
- `listAssistants(options)`
- `updateAssistant(assistantId, updates)`
- `deleteAssistant(assistantId)`

### Call Management

- `startCall(options)`
- `getCallDetails(callId, options)`
- `endCall(callId)`
- `getCallTranscript(callId)`
- `getCallRecording(callId)`

### Phone Number Management

- `listPhoneNumbers(options)`
- `purchasePhoneNumber(phoneNumber, options)`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository.

### Webhook Server Example

```javascript
import express from 'express';
import { webhookHandler } from './vapi-agent.js';

const app = express();
app.use(express.json());

// Handle webhook events
app.post('/webhook', webhookHandler.getMiddleware());

// Or handle specific events
webhookHandler.on('call.answered', (data) => {
  console.log('Call answered:', data);
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

## API Reference

### Core Functions

- `createAssistant(name, firstMessage, systemPrompt, options)` - Create a new assistant
- `listAssistants()` - List all assistants
- `updateAssistant(assistantId, updates)` - Update an assistant
- `deleteAssistant(assistantId)` - Delete an assistant
- `startPhoneCall(assistantId, phoneNumber, phoneNumberId, metadata)` - Start a phone call
- `endCall(callId)` - End a call
- `getCallDetails(callId)` - Get call details

### Services

#### CallMonitor
- `startMonitoring()` - Start monitoring active calls
- `stopMonitoring()` - Stop monitoring
- `addCall(callId, metadata)` - Add a call to monitor
- `removeCall(callId)` - Stop monitoring a call
- `getCall(callId)` - Get call data
- `getActiveCalls()` - Get all active calls

#### RecordingManager
- `getRecordingInfo(callId)` - Get recording information
- `downloadRecording(callId, options)` - Download a call recording
- `deleteLocalRecording(callId)` - Delete a local recording
- `cleanupOldRecordings()` - Clean up old recordings based on retention policy

#### WebhookHandler
- `handleWebhook(req, res)` - Handle incoming webhook
- `on(eventType, handler)` - Register an event handler
- `registerHandlers(handlers)` - Register multiple event handlers
- `getMiddleware()` - Get Express middleware function

## Testing

Run the test suite:

```bash
npm test
```

## License

MIT
