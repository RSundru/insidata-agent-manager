// Import the Vapi server SDK and utilities
import { VapiClient } from '@vapi-ai/server-sdk';
import { fileURLToPath } from 'url';
import path from 'path';
import { EventEmitter } from 'events';
import { retry } from './src/utils/retry.js';
import { VapiError, ERROR_CODES, asyncHandler } from './src/utils/errorHandler.js';
import { CallMonitor } from './src/features/callMonitoring.js';
import CallRecordingManager from './src/features/callRecordingManager.js';
import WebhookHandler from './src/features/webhookHandler.js';

// Event emitter for SDK events
export const vapiEvents = new EventEmitter();

// Get current directory in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * VAPI Client Configuration
 * @typedef {Object} VapiClientConfig
 * @property {string} token - VAPI API key
 * @property {string} [baseUrl] - Base URL for the VAPI API
 * @property {number} [timeout] - Request timeout in milliseconds
 * @property {Object} [axiosConfig] - Custom Axios configuration
 * @property {boolean} [enableLogging] - Enable debug logging
 * @property {string} [version] - API version to use
 */

// Initialize the Vapi client with enhanced configuration
const vapi = new VapiClient({
  token: process.env.VAPI_API_KEY || 'YOUR_API_KEY_HERE',
  baseUrl: process.env.VAPI_BASE_URL || 'https://api.vapi.ai',
  timeout: parseInt(process.env.VAPI_TIMEOUT || '30000'),
  enableLogging: process.env.NODE_ENV === 'development',
  version: process.env.VAPI_VERSION || '2024-01-01',
  axiosConfig: {
    headers: {
      'User-Agent': `VAPI-Node-SDK/1.0.0 ${process.env.npm_package_version || ''}`,
      'X-VAPI-Source': 'node-sdk'
    }
  }
});

// Initialize services with enhanced configuration
const callMonitor = new CallMonitor(vapi, {
  monitoringInterval: parseInt(process.env.VAPI_MONITOR_INTERVAL || '3000'),
  maxConcurrentCalls: parseInt(process.env.VAPI_MAX_CONCURRENT_CALLS || '100'),
  eventBufferSize: parseInt(process.env.VAPI_EVENT_BUFFER_SIZE || '1000')
});

const recordingManager = new CallRecordingManager(vapi, {
  storagePath: process.env.VAPI_RECORDING_PATH || path.join(__dirname, 'recordings'),
  retentionDays: parseInt(process.env.VAPI_RETENTION_DAYS || '30'),
  encryptionKey: process.env.VAPI_ENCRYPTION_KEY,
  storageProvider: process.env.VAPI_STORAGE_PROVIDER || 'local', // 'local', 's3', 'gcs', 'azure'
  storageConfig: {
    // Common storage configuration
    acl: 'private',
    // Provider-specific configs can be added here
    ...(process.env.VAPI_STORAGE_CONFIG ? JSON.parse(process.env.VAPI_STORAGE_CONFIG) : {})
  }
});

const webhookHandler = new WebhookHandler({
  secret: process.env.VAPI_WEBHOOK_SECRET,
  path: process.env.VAPI_WEBHOOK_PATH || '/vapi/webhook',
  maxBodySize: process.env.VAPI_WEBHOOK_MAX_BODY_SIZE || '10mb',
  onEvent: (eventType, eventData) => {
    // Emit event for internal use
    vapiEvents.emit(eventType, eventData);
    
    // Log the event
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Webhook] ${eventType}`, JSON.stringify(eventData, null, 2));
    }
  },
  // Webhook verification
  verifySignature: true,
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // Limit each IP to 100 requests per windowMs
  }
});

/**
 * Cache configuration and management
 */
const cache = {
  assistants: {
    data: null,
    ttl: 5 * 60 * 1000, // 5 minutes
    lastUpdated: 0
  },
  phoneNumbers: {
    data: null,
    ttl: 30 * 60 * 1000, // 30 minutes
    lastUpdated: 0
  },
  calls: {
    // In-memory store for active calls
    data: {},
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    cleanupInterval: setInterval(() => {
      const now = Date.now();
      Object.keys(cache.calls.data).forEach(callId => {
        if (now - (cache.calls.data[callId]?.timestamp || 0) > cache.calls.ttl) {
          delete cache.calls.data[callId];
        }
      });
    }, 60 * 60 * 1000) // Cleanup hourly
  },
  recordings: {
    data: {},
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxSize: 1000 // Max number of recordings to keep in memory
  },
  
  // Cache utility methods
  async get(key, fetchFn, options = {}) {
    const cacheItem = this[key];
    if (!cacheItem) throw new Error(`Invalid cache key: ${key}`);
    
    const now = Date.now();
    const forceRefresh = options.forceRefresh || false;
    
    if (forceRefresh || !cacheItem.data || now - cacheItem.lastUpdated > cacheItem.ttl) {
      try {
        cacheItem.data = await fetchFn();
        cacheItem.lastUpdated = now;
      } catch (error) {
        console.error(`Failed to update cache for ${key}:`, error);
        if (!cacheItem.data) throw error; // Only throw if we don't have cached data
      }
    }
    
    return cacheItem.data;
  },
  
  // Invalidate specific cache
  invalidate(key) {
    if (this[key] && this[key].data) {
      this[key].data = null;
      this[key].lastUpdated = 0;
      return true;
    }
    return false;
  },
  
  // Clear all caches
  clear() {
    Object.keys(this).forEach(key => {
      if (this[key] && typeof this[key] === 'object' && 'data' in this[key]) {
        this[key].data = null;
        this[key].lastUpdated = 0;
      }
    });
  }
};

// Start monitoring for active calls
callMonitor.startMonitoring();

// Set up event listeners
callMonitor.on('call:added', (call) => {
  console.log(`[CallMonitor] New call started: ${call.id}`);
});

callMonitor.on('call:status_changed', ({ callId, from, to }) => {
  console.log(`[CallMonitor] Call ${callId} status changed: ${from} -> ${to}`);
});

callMonitor.on('call:transcription', ({ callId, data }) => {
  console.log(`[CallMonitor] Transcription (${callId}): ${data.text}`);
});

callMonitor.on('error', (error) => {
  console.error('[CallMonitor] Error:', error);
});

/**
 * Assistant configuration options
 * @typedef {Object} AssistantOptions
 * @property {string} [model='gpt-4o'] - Model to use
 * @property {number} [temperature=0.7] - Temperature for generation (0-2)
 * @property {string} [voiceProvider='vapi'] - Voice provider (vapi, 11labs, etc.)
 * @property {string} [voiceId='Elliot'] - Voice ID
 * @property {boolean} [enableTranscription=true] - Enable call transcription
 * @property {Object} [metadata] - Custom metadata
 * @property {Array} [functions] - Custom functions
 * @property {string} [language='en-US'] - Language code
 * @property {Object} [voice] - Complete voice configuration
 * @property {Object} [modelConfig] - Complete model configuration
 * @property {boolean} [endCallFunctionEnabled=true] - Enable end call function
 * @property {boolean} [recordingEnabled=false] - Enable call recording
 * @property {string} [recordingFileFormat='mp3'] - Recording format (mp3, wav)
 * @property {Object} [webhook] - Webhook configuration
 * @property {string} [webhook.url] - Webhook URL
 * @property {Array<string>} [webhook.events] - Events to receive
 * @property {Object} [webhook.headers] - Custom headers
 * @property {Object} [webhook.auth] - Authentication configuration
 */

/**
 * Create a new Vapi assistant with comprehensive configuration
 * @param {string} name - Name of the assistant
 * @param {string} firstMessage - First message the assistant will say
 * @param {string} systemPrompt - System prompt for the assistant
 * @param {AssistantOptions} [options] - Additional options
 * @returns {Promise<Object>} The created assistant
 */
async function createAssistant(name, firstMessage, systemPrompt, options = {}) {
  const defaultOptions = {
    model: 'gpt-4o',
    temperature: 0.7,
    voiceProvider: 'vapi',
    voiceId: 'Elliot',
    enableTranscription: true,
    endCallFunctionEnabled: true,
    recordingEnabled: false,
    language: 'en-US',
    metadata: {}
  };
  
  const {
    model,
    temperature,
    voiceProvider,
    voiceId,
    enableTranscription,
    endCallFunctionEnabled,
    recordingEnabled,
    language,
    metadata,
    functions,
    webhook,
    ...restOptions
  } = { ...defaultOptions, ...options };
  
  try {
    const assistantData = {
      name,
      firstMessage,
      language,
      metadata: {
        createdBy: 'vapi-sdk',
        version: '1.0',
        ...metadata
      },
      model: {
        provider: 'openai',
        model,
        temperature: Math.min(Math.max(temperature, 0), 2), // Clamp to 0-2
        messages: [
          {
            role: 'system',
            content: systemPrompt
          }
        ],
        ...(functions && { functions }),
        ...(options.modelConfig || {})
      },
      voice: {
        provider: voiceProvider,
        voiceId,
        ...(options.voice || {})
      },
      enableTranscription,
      endCallFunctionEnabled,
      recordingEnabled,
      ...(webhook && { webhook }),
      ...restOptions
    };
    
    // Apply any custom model or voice config
    if (options.modelConfig) {
      assistantData.model = { ...assistantData.model, ...options.modelConfig };
    }
    
    if (options.voice) {
      assistantData.voice = { ...assistantData.voice, ...options.voice };
    }
    
    // Create the assistant
    const assistant = await vapi.assistants.create(assistantData);
    
    // Invalidate cache
    cache.invalidate('assistants');
    
    // Emit event
    vapiEvents.emit('assistant:created', assistant);
    
    return assistant;
  } catch (error) {
    const errorMessage = `Failed to create assistant: ${error.message}`;
    console.error(errorMessage, { name, error });
    
    throw new VapiError(
      ERROR_CODES.ASSISTANT_CREATION_FAILED,
      errorMessage,
      { 
        name,
        originalError: error,
        options: {
          ...options,
          systemPrompt: systemPrompt ? '[REDACTED]' : undefined
        }
      }
    );
  }
}

/**
 * Start a phone call using the assistant with enhanced monitoring
 * @param {string} assistantId - ID of the assistant to use
 * @param {string} phoneNumber - Phone number to call (in E.164 format, e.g., "+1234567890")
 * @param {string} phoneNumberId - Your Vapi phone number ID
 * @param {Object} [metadata] - Additional metadata to associate with the call
 * @returns {Promise<Object>} The call object
 */
async function startPhoneCall(assistantId, phoneNumber, phoneNumberId, metadata = {}) {
  const call = await vapi.calls.create({
    phoneNumberId,
    customer: { 
      number: phoneNumber,
      ...(metadata.customer || {})
    },
    assistantId,
    metadata: {
      initiatedBy: 'api',
      timestamp: new Date().toISOString(),
      ...metadata
    }
  });
  
  // Add call to monitoring
  await callMonitor.addCall(call.id, {
    assistantId,
    phoneNumber,
    ...metadata
  });
  
  console.log(`[Call] Started: ${call.id} to ${phoneNumber}`);
  return call;
}

/**
 * Example usage of the VAPI SDK with all features
 */
async function main() {
  try {
    console.log('=== VAPI SDK Demo ===\n');

    // 1. List or create an assistant
    console.log('Listing assistants...');
    let assistants = await listAssistants();
    
    let assistant;
    if (assistants.length === 0) {
      console.log('\nCreating a new demo assistant...');
      assistant = await createAssistant(
        'Demo Assistant',
        'Hello! This is your Vapi assistant calling. How can I help you today?',
        `You are a helpful assistant that can answer questions about Vapi and help users with their needs.
        Keep your responses concise and to the point.`,
        {
          model: 'gpt-4o',
          temperature: 0.7,
          enableTranscription: true
        }
      );
    } else {
      assistant = assistants[0];
      console.log(`Using existing assistant: ${assistant.name} (${assistant.id})`);
    }

    // 2. List available phone numbers
    console.log('\nListing available phone numbers...');
    const phoneNumbers = await listPhoneNumbers();
    
    if (phoneNumbers.length === 0) {
      console.log('No phone numbers available. Please add a phone number in your Vapi dashboard.');
      return;
    }

    const phoneNumber = phoneNumbers[0];
    console.log(`Using phone number: ${phoneNumber.phoneNumber} (${phoneNumber.id})`);

    // 3. Start a test call (commented out for safety)
    /*
    console.log('\nStarting a test call...');
    const call = await startPhoneCall(
      assistant.id,
      '+1234567890', // Replace with actual number
      phoneNumber.id,
      {
        purpose: 'demo',
        campaign: 'test-campaign'
      }
    );

    console.log(`Call started with ID: ${call.id}`);

    // Schedule call to end after 60 seconds
    setTimeout(async () => {
      console.log('\nEnding the call...');
      await endCall(call.id);
      console.log('Call ended');
      
      // Download the recording
      try {
        console.log('\nDownloading call recording...');
        const recordingPath = await recordingManager.downloadRecording(call.id);
        console.log(`Recording saved to: ${recordingPath}`);
      } catch (error) {
        console.error('Error downloading recording:', error.message);
      }
    }, 60000);
    */

    console.log('\nDemo setup complete. Uncomment the call section to start a test call.');
    console.log('You can also use the exported functions in your own code.');
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

// Run the example
if (process.env.NODE_ENV !== 'test') {
  main();
}

/**
 * List all available assistants with pagination and filtering
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=50] - Number of items per page
 * @param {string} [options.cursor] - Cursor for pagination
 * @param {string} [options.search] - Search query
 * @param {string} [options.sortBy='createdAt'] - Field to sort by
 * @param {string} [options.sortOrder='desc'] - Sort order ('asc' or 'desc')
 * @param {boolean} [useCache=true] - Use cached data if available
 * @returns {Promise<Object>} Paginated list of assistants and pagination info
 */
async function listAssistants(options = {}, useCache = true) {
  const {
    limit = 50,
    cursor,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    ...otherParams
  } = options;

  const cacheKey = `assistants:${JSON.stringify({ limit, cursor, search, sortBy, sortOrder })}`;
  
  const fetchAssistants = async () => {
    const params = {
      limit,
      cursor,
      search,
      sort: `${sortOrder === 'desc' ? '-' : ''}${sortBy}`,
      ...otherParams
    };
    
    const response = await vapi.assistants.list(params);
    
    // Store individual assistants in cache for quick lookup
    if (response.data) {
      response.data.forEach(assistant => {
        cache.assistants.data = cache.assistants.data || {};
        cache.assistants.data[assistant.id] = assistant;
      });
    }
    
    return response;
  };
  
  try {
    if (useCache && cache.assistants?.data && !cursor && !search) {
      // Return cached data if available and no pagination/search
      const now = Date.now();
      if (now - cache.assistants.lastUpdated < cache.assistants.ttl) {
        return {
          data: Object.values(cache.assistants.data || {}),
          hasMore: false,
          cursor: null
        };
      }
    }
    
    return await fetchAssistants();
  } catch (error) {
    console.error('Error listing assistants:', error);
    throw new VapiError(
      ERROR_CODES.API_ERROR,
      'Failed to list assistants',
      { originalError: error, options }
    );
  }
}

/**
 * Update an existing assistant
 * @param {string} assistantId - ID of the assistant to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} The updated assistant
 */
async function updateAssistant(assistantId, updates) {
  try {
    const updatedAssistant = await vapi.assistants.update(assistantId, updates);
    // Invalidate cache
    cache.assistants = null;
    return updatedAssistant;
  } catch (error) {
    console.error(`Error updating assistant ${assistantId}:`, error);
    throw error;
  }
}

/**
 * Delete an assistant
 * @param {string} assistantId - ID of the assistant to delete
 * @returns {Promise<boolean>} True if deletion was successful
 */
async function deleteAssistant(assistantId) {
  try {
    await vapi.assistants.delete(assistantId);
    // Invalidate cache
    cache.assistants = null;
    return true;
  } catch (error) {
    console.error(`Error deleting assistant ${assistantId}:`, error);
    throw error;
  }
}

/**
 * Phone number configuration options
 * @typedef {Object} PhoneNumberOptions
 * @property {string} [countryCode='US'] - ISO 3166-1 alpha-2 country code
 * @property {Array<string>} [capabilities] - Required capabilities (e.g., ['voice', 'sms'])
 * @property {Object} [webhook] - Webhook configuration for this number
 */

/**
 * List available phone numbers with filtering
 * @param {Object} [options] - Query options
 * @param {string} [options.countryCode] - Filter by country code
 * @param {Array<string>} [options.capabilities] - Filter by capabilities
 * @param {boolean} [useCache=true] - Use cached data if available
 * @returns {Promise<Object>} List of phone numbers
 */
async function listPhoneNumbers(options = {}, useCache = true) {
  const fetchNumbers = async () => {
    const params = {
      ...(options.countryCode && { country_code: options.countryCode }),
      ...(options.capabilities && { capabilities: options.capabilities.join(',') })
    };
    
    const response = await vapi.phoneNumbers.list(params);
    
    // Cache individual numbers
    if (response.data) {
      cache.phoneNumbers.data = cache.phoneNumbers.data || {};
      response.data.forEach(number => {
        cache.phoneNumbers.data[number.id] = number;
      });
    }
    
    return response;
  };
  
  try {
    return await cache.get('phoneNumbers', fetchNumbers, { forceRefresh: !useCache });
  } catch (error) {
    throw new VapiError(
      ERROR_CODES.API_ERROR,
      'Failed to list phone numbers',
      { originalError: error }
    );
  }
}

/**
 * Purchase a new phone number
 * @param {string} phoneNumber - Phone number to purchase (E.164 format)
 * @param {PhoneNumberOptions} [options] - Additional options
 * @returns {Promise<Object>} The purchased phone number
 */
async function purchasePhoneNumber(phoneNumber, options = {}) {
  try {
    const number = await vapi.phoneNumbers.create({
      phoneNumber,
      countryCode: options.countryCode || 'US',
      capabilities: options.capabilities || ['voice'],
      webhook: options.webhook
    });
    
    cache.invalidate('phoneNumbers');
    vapiEvents.emit('phoneNumber:purchased', number);
    return number;
  } catch (error) {
    throw new VapiError(
      ERROR_CODES.PHONE_NUMBER_ERROR,
      `Failed to purchase number: ${error.message}`,
      { phoneNumber, error }
    );
  }
}

/**
 * Call configuration options
 * @typedef {Object} CallOptions
 * @property {string} [assistantId] - Assistant ID for the call
 * @property {string} [customerNumber] - Customer phone number (E.164 format)
 * @property {string} [phoneNumberId] - Your Vapi phone number ID
 * @property {Object} [metadata] - Custom metadata for the call
 * @property {Object} [assistantOverrides] - Override assistant settings for this call
 * @property {Object} [recording] - Recording settings
 * @property {boolean} [recording.enabled] - Enable/disable call recording
 * @property {string} [recording.format] - Recording format (mp3, wav)
 */

/**
 * Get details of a specific call with enhanced metadata
 * @param {string} callId - ID of the call to get details for
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.includeTranscript=true] - Include call transcript if available
 * @param {boolean} [options.includeRecording=true] - Include recording URL if available
 * @returns {Promise<Object>} Enhanced call details
 */
async function getCallDetails(callId, options = {}) {
  const {
    includeTranscript = true,
    includeRecording = true,
    ...otherOptions
  } = options;
  
  try {
    // Get basic call info
    const call = await vapi.calls.get(callId, otherOptions);
    
    // Get additional data in parallel
    const [transcript, recording] = await Promise.all([
      includeTranscript ? getCallTranscript(callId).catch(() => null) : null,
      includeRecording ? getCallRecording(callId).catch(() => null) : null
    ]);
    
    // Get call events if available
    let events = [];
    try {
      events = await vapi.calls.listEvents(callId);
    } catch (e) {
      console.warn(`Could not fetch events for call ${callId}:`, e);
    }
    
    // Build enhanced call object
    const enhancedCall = {
      ...call,
      metadata: {
        ...call.metadata,
        duration: call.endedAt ? 
          (new Date(call.endedAt) - new Date(call.startedAt)) / 1000 : null,
        status: call.endedAt ? 'completed' : 'in-progress'
      },
      ...(transcript && { transcript }),
      ...(recording && { recording }),
      events,
      _retrievedAt: new Date().toISOString()
    };
    
    // Update cache
    cache.calls.data = cache.calls.data || {};
    cache.calls.data[callId] = {
      ...enhancedCall,
      timestamp: Date.now()
    };
    
    return enhancedCall;
  } catch (error) {
    throw new VapiError(
      ERROR_CODES.CALL_ERROR,
      `Failed to get call details: ${error.message}`,
      { callId, originalError: error }
    );
  }
}

/**
 * Get call transcript
 * @param {string} callId - ID of the call
 * @returns {Promise<Array>} Call transcript
 */
async function getCallTranscript(callId) {
  try {
    return await vapi.calls.getTranscript(callId);
  } catch (error) {
    console.error(`Error getting transcript for call ${callId}:`, error);
    throw error;
  }
}

/**
 * Get call recording URL
 * @param {string} callId - ID of the call
 * @returns {Promise<string>} Recording URL
 */
async function getCallRecording(callId) {
  try {
    const recording = await vapi.calls.getRecording(callId);
    return recording?.url || null;
  } catch (error) {
    console.error(`Error getting recording for call ${callId}:`, error);
    throw error;
  }
}

/**
 * Start a new call
 * @param {CallOptions} options - Call configuration
 * @returns {Promise<Object>} Call details
 */
async function startCall(options) {
  const {
    assistantId,
    customerNumber,
    phoneNumberId,
    metadata = {},
    assistantOverrides = {},
    recording = {},
    ...otherOptions
  } = options;
  
  try {
    const call = await vapi.calls.create({
      assistantId,
      customer: { number: customerNumber },
      phoneNumberId,
      metadata,
      assistantOverrides,
      recording: {
        enabled: true,
        format: 'mp3',
        ...recording
      },
      ...otherOptions
    });
    
    // Update cache
    cache.calls.data = cache.calls.data || {};
    cache.calls.data[call.id] = {
      ...call,
      timestamp: Date.now()
    };
    
    // Emit event
    vapiEvents.emit('call:started', call);
    
    return call;
  } catch (error) {
    throw new VapiError(
      ERROR_CODES.CALL_ERROR,
      `Failed to start call: ${error.message}`,
      { options, originalError: error }
    );
  }
}

/**
 * End an ongoing call
 * @param {string} callId - ID of the call to end
 * @returns {Promise<Object>} The ended call details
 */
async function endCall(callId) {
  try {
    const call = await vapi.calls.end(callId);
    // Update cache
    cache.calls[callId] = call;
    return call;
  } catch (error) {
    console.error(`Error ending call ${callId}:`, error);
  }
}

// Wrap functions with asyncHandler
const wrappedCreateAssistant = asyncHandler(createAssistant);
const wrappedStartPhoneCall = asyncHandler(startPhoneCall);
const wrappedListAssistants = asyncHandler(listAssistants);
const wrappedUpdateAssistant = asyncHandler(updateAssistant);
const wrappedDeleteAssistant = asyncHandler(deleteAssistant);
const wrappedListPhoneNumbers = asyncHandler(listPhoneNumbers);
const wrappedGetCallDetails = asyncHandler(getCallDetails);
const wrappedEndCall = asyncHandler(endCall);

// Export all functionality
export {
  // VAPI client
  vapi,
  
  // Core functions (wrapped with asyncHandler)
  wrappedCreateAssistant as createAssistant,
  wrappedStartPhoneCall as startPhoneCall,
  wrappedListAssistants as listAssistants,
  wrappedUpdateAssistant as updateAssistant,
  wrappedDeleteAssistant as deleteAssistant,
  wrappedListPhoneNumbers as listPhoneNumbers,
  wrappedGetCallDetails as getCallDetails,
  wrappedEndCall as endCall,
  
  // Services
  callMonitor,
  recordingManager,
  webhookHandler,
  
  // Utilities
  retry,
  VapiError,
  ERROR_CODES,
  asyncHandler
};

// Type definitions for better IDE support
/**
 * @typedef {Object} Assistant
 * @property {string} id - Unique identifier for the assistant
 * @property {string} name - Display name of the assistant
 * @property {string} firstMessage - The first message the assistant will say
 * @property {Object} model - Configuration for the AI model
 * @property {Object} voice - Configuration for the voice
 * @property {string} createdAt - ISO timestamp of when the assistant was created
 * @property {string} updatedAt - ISO timestamp of when the assistant was last updated
 */

/**
 * @typedef {Object} Call
 * @property {string} id - Unique identifier for the call
 * @property {string} status - Current status of the call
 * @property {string} [assistantId] - ID of the assistant handling the call
 * @property {Object} [customer] - Information about the customer
 * @property {string} [recordingUrl] - URL to download the call recording
 * @property {string} [transcription] - Full transcription of the call
 * @property {number} [duration] - Duration of the call in seconds
 * @property {string} [startedAt] - ISO timestamp of when the call started
 * @property {string} [endedAt] - ISO timestamp of when the call ended
 */

/**
 * @typedef {Object} PhoneNumber
 * @property {string} id - Unique identifier for the phone number
 * @property {string} phoneNumber - The phone number in E.164 format
 * @property {string} countryCode - Country code (e.g., 'US')
 * @property {string[]} capabilities - Capabilities of the number (e.g., ['voice', 'sms'])
 * @property {string} createdAt - ISO timestamp of when the number was created
 */
