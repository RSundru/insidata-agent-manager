import { vapi } from './vapi-agent.js';

/**
 * Allowed values for VAPI configuration
 */
const ALLOWED_VALUES = {
  model: {
    providers: ['openai', 'anthropic', 'google', 'azure', 'meta'],
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    temperature: { min: 0, max: 2 },
    maxTokens: { min: 100, max: 4000 }
  },
  voice: {
    providers: ['vapi', '11labs', 'playht', 'deepgram', 'azure', 'google'],
    vapiVoices: ['Elliot', 'Kylie', 'Rohan', 'Lily', 'Savannah', 'Hana', 'Neha', 'Cole', 'Harry', 'Paige', 'Spencer'],
    elevenLabsVoices: ['21m00Tcm4TlvDq8ikWAM', 'EXAVITQu4vr4xnSDxMaL', 'MF3mGyEYCl7XYWbV9V6O'],
    speed: { min: 0.5, max: 2.0 },
    stability: { min: 0, max: 1 },
    similarityBoost: { min: 0, max: 1 }
  },
  webhookMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
};

/**
 * Default configuration for VAPI assistants
 * This includes all configurable elements for both creation and updates
 */
const DEFAULT_AGENT_CONFIG = {
  // Basic Information
  name: 'My Assistant',
  firstMessage: 'Hello! How can I help you today?',
  
  // Model Configuration
  model: {
    // Required
    provider: 'openai',  // openai, anthropic, google, azure, meta
    model: 'gpt-4o',     // Model name (e.g., gpt-4o, claude-3-opus, etc.)
    
    // System and context messages
    messages: [
      {
        role: 'system',
        content: 'You are a helpful AI assistant.'
      }
    ],
    
    // Model parameters
    temperature: 0.7,    // 0-2 (higher = more creative/random)
    topP: 1.0,          // 0-1 (nucleus sampling)
    maxTokens: 1000,     // 1-4000
    stop: [],           // Stop sequences
    presencePenalty: 0,  // -2 to 2
    frequencyPenalty: 0, // -2 to 2
    functions: [],      // Function definitions
    functionCall: 'auto' // 'none', 'auto', or {name: 'function_name'}
  },
  
  // Voice Configuration
  voice: {
    // Required
    provider: 'vapi',   // vapi, 11labs, playht, deepgram, azure, google
    voiceId: 'Elliot',  // Voice ID from the provider
    
    // Voice parameters
    speed: 1.0,         // 0.5-2.0
    stability: 0.5,     // 0-1 (voice stability)
    similarityBoost: 0.75, // 0-1 (voice similarity)
    
    // Provider-specific settings
    model: null,        // Voice model (if applicable)
    language: 'en-US',  // Language code
    
    // 11Labs specific
    optimizeStreamingLatency: 1, // 1-4 (lower = faster streaming)
    
    // Azure specific
    region: null,       // Azure region
    
    // Google specific
    languageCode: null, // Google language code
    ssmlGender: null    // MALE, FEMALE, or NEUTRAL
  },
  
  // Call Settings
  endCallFunctionEnabled: true,  // Whether to enable end call function
  callTimeout: 300,              // Call timeout in seconds
  maxDurationSeconds: 3600,      // Maximum call duration
  
  // Recording Settings
  recordingEnabled: false,       // Enable/disable call recording
  recordingFileFormat: 'mp3',    // mp3 or wav
  recordingTranscriptionEnabled: false, // Enable transcription
  recordingTranscriptionProvider: 'vapi', // vapi, deepgram, etc.
  recordingTranscriptionLanguage: 'en', // Language code
  
  // Webhook Settings
  webhookUrl: '',                // Webhook URL for events
  webhookEvents: ['call.ended'], // Events to receive
  webhookHeaders: {},            // Custom headers
  webhookAuth: {                // Auth for webhook
    type: 'none',               // none, basic, bearer, api_key
    config: {}
  },
  
  // Recording Webhook Settings
  recordingWebhookUrl: '',
  recordingWebhookMethod: 'POST',
  recordingWebhookAddAuthHeader: false,
  
  // Metadata
  metadata: {
    createdBy: 'vapi-sdk',
    version: '1.0',
    environment: 'development', // development, staging, production
    teamId: null,              // Team/workspace ID
    tags: []                   // Custom tags
  },
  
  // Advanced Settings
  silenceTimeoutMs: 10000,      // Milliseconds of silence before timeout
  responseDelayMs: 0,           // Delay before responding (ms)
  interruptSensitivity: 'high',  // low, medium, high
  firstMessageMode: 'assistant-speaks-first', // or 'user-speaks-first'
  
  // Voice Activity Detection (VAD)
  vad: {
    enabled: true,
    mode: 'aggressive',         // aggressive, balanced, gentle
    silenceTimeoutMs: 1000,
    minSpeechDurationMs: 300,
    maxSpeechDurationMs: 30000
  },
  
  // Conversation Settings
  conversationType: 'unassisted', // unassisted or assisted
  humanHandoff: {
    enabled: false,
    message: 'Let me transfer you to a human agent...',
    transferNumber: null
  },
  
  // Analytics
  analytics: {
    enabled: true,
    trackUtm: true,            // Track UTM parameters
    trackReferrer: true,       // Track HTTP referrer
    trackDeviceInfo: true      // Track device information
  }
};

/**
 * Validate and normalize configuration values
 */
function validateConfig(config) {
  const errors = [];
  
  // Validate model settings
  if (config.model) {
    const { model } = config;
    
    if (model.provider && !ALLOWED_VALUES.model.providers.includes(model.provider)) {
      errors.push(`Invalid model provider. Allowed values: ${ALLOWED_VALUES.model.providers.join(', ')}`);
    }
    
    if (model.model && !ALLOWED_VALUES.model.models.includes(model.model)) {
      errors.push(`Invalid model. Allowed values: ${ALLOWED_VALUES.model.models.join(', ')}`);
    }
    
    if (model.temperature !== undefined && 
        (model.temperature < ALLOWED_VALUES.model.temperature.min || 
         model.temperature > ALLOWED_VALUES.model.temperature.max)) {
      errors.push(`Temperature must be between ${ALLOWED_VALUES.model.temperature.min} and ${ALLOWED_VALUES.model.temperature.max}`);
    }
    
    if (model.maxTokens !== undefined && 
        (model.maxTokens < ALLOWED_VALUES.model.maxTokens.min || 
         model.maxTokens > ALLOWED_VALUES.model.maxTokens.max)) {
      errors.push(`Max tokens must be between ${ALLOWED_VALUES.model.maxTokens.min} and ${ALLOWED_VALUES.model.maxTokens.max}`);
    }
  }
  
  // Validate voice settings
  if (config.voice) {
    const { voice } = config;
    
    if (voice.provider && !ALLOWED_VALUES.voice.providers.includes(voice.provider)) {
      errors.push(`Invalid voice provider. Allowed values: ${ALLOWED_VALUES.voice.providers.join(', ')}`);
    }
    
    if (voice.voiceId && voice.provider === 'vapi' && !ALLOWED_VALUES.voice.vapiVoices.includes(voice.voiceId)) {
      errors.push(`Invalid VAPI voice. Allowed values: ${ALLOWED_VALUES.voice.vapiVoices.join(', ')}`);
    }
    
    // Add validation for other voice providers if needed
    
    if (voice.speed !== undefined && 
        (voice.speed < ALLOWED_VALUES.voice.speed.min || 
         voice.speed > ALLOWED_VALUES.voice.speed.max)) {
      errors.push(`Voice speed must be between ${ALLOWED_VALUES.voice.speed.min} and ${ALLOWED_VALUES.voice.speed.max}`);
    }
    
    if (voice.stability !== undefined && 
        (voice.stability < ALLOWED_VALUES.voice.stability.min || 
         voice.stability > ALLOWED_VALUES.voice.stability.max)) {
      errors.push(`Voice stability must be between ${ALLOWED_VALUES.voice.stability.min} and ${ALLOWED_VALUES.voice.stability.max}`);
    }
    
    if (voice.similarityBoost !== undefined && 
        (voice.similarityBoost < ALLOWED_VALUES.voice.similarityBoost.min || 
         voice.similarityBoost > ALLOWED_VALUES.voice.similarityBoost.max)) {
      errors.push(`Voice similarity boost must be between ${ALLOWED_VALUES.voice.similarityBoost.min} and ${ALLOWED_VALUES.voice.similarityBoost.max}`);
    }
  }
  
  // Validate webhook settings
  if (config.recordingWebhookMethod && !ALLOWED_VALUES.webhookMethods.includes(config.recordingWebhookMethod)) {
    errors.push(`Invalid webhook method. Allowed values: ${ALLOWED_VALUES.webhookMethods.join(', ')}`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n- ${errors.join('\n- ')}`);
  }
  
  return config;
}

/**
 * Merge default config with custom overrides and validate
 */
function getAgentConfig(overrides = {}) {
  // Deep clone the default config
  const config = JSON.parse(JSON.stringify(DEFAULT_AGENT_CONFIG));
  
  // Apply overrides
  const mergedConfig = deepMerge(config, overrides);
  
  // Validate the merged configuration
  return validateConfig(mergedConfig);
}

/**
 * Deep merge objects
 */
function deepMerge(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

async function listAssistants() {
  console.log('Fetching assistants...');
  const assistants = await vapi.assistants.list();
  console.log(`\nFound ${assistants.length} assistants:`);
  assistants.forEach(assistant => {
    console.log(`- ${assistant.name} (ID: ${assistant.id})`);
  });
  return assistants;
}

/**
 * Create a new VAPI assistant
 * @param {string} name - Name of the assistant
 * @param {string} systemPrompt - System prompt for the assistant
 * @param {Object} [overrides] - Configuration overrides
 * @returns {Promise<Object>} Created assistant
 */
async function createAgent(name, systemPrompt, overrides = {}) {
  try {
    console.log(`\nCreating a new VAPI agent named "${name}"...`);
    
    // Prepare configuration
    const config = getAgentConfig({
      name,
      model: {
        messages: [
          {
            role: 'system',
            content: systemPrompt
          }
        ]
      },
      firstMessage: `Hello! This is ${name}, how can I help you today?`,
      ...overrides
    });
    
    console.log('Using configuration:', JSON.stringify(config, null, 2));
    
    const assistant = await vapi.assistants.create(config);

    console.log('✅ Assistant created successfully!');
    console.log('Name:', assistant.name);
    console.log('ID:', assistant.id);
    console.log('\nYou can now view and manage this assistant at:');
    console.log(`https://app.vapi.ai/assistants/${assistant.id}`);
    
    return assistant;
  } catch (error) {
    console.error('❌ Error creating assistant:', error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Update an existing assistant with the provided fields
 * @param {string} assistantName - Name of the assistant to update
 * @param {Object} updates - Configuration overrides (same as createAgent)
 * @returns {Promise<Object>} Updated assistant object
 */
async function updateAgent(assistantName, updates) {
  try {
    console.log(`\nSearching for assistant named "${assistantName}"...`);
    const assistants = await vapi.assistants.list();
    const targetAssistant = assistants.find(a => a.name === assistantName);
    
    if (!targetAssistant) {
      throw new Error(`Could not find an assistant named "${assistantName}"`);
    }
    
    console.log(`Updating assistant: ${targetAssistant.name} (${targetAssistant.id})`);
    
    // Get default config and apply updates
    const updatePayload = getAgentConfig(updates);
    
    // Remove any fields that shouldn't be updated
    const fieldsToRemove = ['id', 'createdAt', 'updatedAt'];
    fieldsToRemove.forEach(field => delete updatePayload[field]);
    
    console.log('Updating with payload:', JSON.stringify(updatePayload, null, 2));
    
    const updatedAssistant = await vapi.assistants.update(targetAssistant.id, updatePayload);

    console.log('✅ Assistant updated successfully!');
    console.log('Name:', updatedAssistant.name);
    console.log('ID:', updatedAssistant.id);
    
    // Log important updated fields
    if (updates.voice) {
      console.log('Voice:', updatedAssistant.voice?.voiceId || 'Not set');
    }
    if (updates.model) {
      console.log('Model:', updatedAssistant.model?.model || 'Not set');
    }
    if (updates.recordingEnabled !== undefined) {
      console.log('Recording:', updates.recordingEnabled ? 'Enabled' : 'Disabled');
    }
    
    console.log('\nYou can now view and manage this assistant at:');
    console.log(`https://app.vapi.ai/assistants/${updatedAssistant.id}`);
    
    return updatedAssistant;
  } catch (error) {
    console.error(`❌ Error updating assistant "${assistantName}":`, error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Example usage
async function main() {
  try {
    // List all assistants
    await listAssistants();
    
    // Example: Create a new agent
    // await createAgent(
    //   'My Assistant',
    //   'You are a helpful AI assistant.',
    //   'Elliot'
    // );
    
    // Example: Update multiple fields of an existing agent
    // await updateAgent('Sam', {
    //   name: 'Sam Updated',
    //   firstMessage: 'Hello! This is the updated Sam, how may I assist you today?',
    //   voice: {
    //     provider: 'vapi',
    //     voiceId: 'Elliot'
    //   },
    //   model: {
    //     provider: 'openai',
    //     model: 'gpt-4o',
    //     messages: [
    //       {
    //         role: 'system',
    //         content: 'You are an updated AI assistant with enhanced capabilities.'
    //       }
    //     ]
    //   },
    //   recordingEnabled: true,
    //   metadata: {
    //     version: '2.0',
    //     lastUpdated: new Date().toISOString()
    //   }
    // });
    
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

// Run the function if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

// Export functions for use in other modules
export { createAgent, updateAgent, listAssistants };
