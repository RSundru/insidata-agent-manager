/**
 * Mock VAPI Client for testing
 * Simulates the VAPI client behavior without making actual API calls
 */
class MockVapiClient {
  constructor() {
    this.assistants = new Map();
    this.calls = new Map();
    this.phoneNumbers = new Map();
    this.recordings = new Map();
    this.events = [];
    
    // Initialize with some test data
    this._initializeTestData();
  }

  // Initialize with test data
  _initializeTestData() {
    // Add test assistant
    const assistantId = 'asst_test123';
    this.assistants.set(assistantId, {
      id: assistantId,
      name: 'Test Assistant',
      firstMessage: 'Hello, how can I help you today?',
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7
      },
      voice: {
        provider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Add test phone number
    const phoneNumberId = 'ph_test123';
    this.phoneNumbers.set(phoneNumberId, {
      id: phoneNumberId,
      phoneNumber: '+1234567890',
      countryCode: 'US',
      capabilities: ['voice', 'sms'],
      createdAt: new Date().toISOString()
    });
  }

  // Assistants API
  assistants = {
    create: async (params) => {
      const id = `asst_${Math.random().toString(36).substring(2, 15)}`;
      const now = new Date().toISOString();
      const assistant = {
        id,
        ...params,
        createdAt: now,
        updatedAt: now
      };
      this.assistants.set(id, assistant);
      return assistant;
    },

    list: async () => {
      return Array.from(this.assistants.values());
    },

    get: async (assistantId) => {
      const assistant = this.assistants.get(assistantId);
      if (!assistant) {
        throw new Error(`Assistant ${assistantId} not found`);
      }
      return assistant;
    },

    update: async (assistantId, updates) => {
      const assistant = await this.assistants.get(assistantId);
      if (!assistant) {
        throw new Error(`Assistant ${assistantId} not found`);
      }
      const updated = { ...assistant, ...updates, updatedAt: new Date().toISOString() };
      this.assistants.set(assistantId, updated);
      return updated;
    },

    delete: async (assistantId) => {
      if (!this.assistants.has(assistantId)) {
        throw new Error(`Assistant ${assistantId} not found`);
      }
      this.assistants.delete(assistantId);
      return { success: true };
    }
  };

  // Calls API
  calls = {
    create: async (params) => {
      const callId = `call_${Math.random().toString(36).substring(2, 15)}`;
      const now = new Date().toISOString();
      const call = {
        id: callId,
        status: 'in-progress',
        assistantId: params.assistantId,
        phoneNumberId: params.phoneNumberId,
        customer: params.customer,
        recordingUrl: `https://example.com/recordings/${callId}.mp3`,
        createdAt: now,
        updatedAt: now,
        events: [
          {
            id: `evt_${Math.random().toString(36).substring(2, 15)}`,
            type: 'call.started',
            timestamp: now,
            data: { status: 'ringing' }
          }
        ]
      };
      this.calls.set(callId, call);
      
      // Simulate call progression
      setTimeout(() => this._simulateCallProgress(callId), 1000);
      
      return call;
    },

    get: async (callId) => {
      const call = this.calls.get(callId);
      if (!call) {
        throw new Error(`Call ${callId} not found`);
      }
      return call;
    },

    end: async (callId) => {
      const call = await this.calls.get(callId);
      if (!call) {
        throw new Error(`Call ${callId} not found`);
      }
      
      const now = new Date().toISOString();
      call.status = 'completed';
      call.endedAt = now;
      call.updatedAt = now;
      call.events.push({
        id: `evt_${Math.random().toString(36).substring(2, 15)}`,
        type: 'call.ended',
        timestamp: now,
        data: { reason: 'user_ended' }
      });
      
      return call;
    },

    list: async () => {
      return Array.from(this.calls.values());
    }
  };

  // Phone Numbers API
  phoneNumbers = {
    list: async () => {
      return Array.from(this.phoneNumbers.values());
    },
    
    get: async (phoneNumberId) => {
      const number = this.phoneNumbers.get(phoneNumberId);
      if (!number) {
        throw new Error(`Phone number ${phoneNumberId} not found`);
      }
      return number;
    }
  };

  // Recordings API
  recordings = {
    list: async () => {
      return Array.from(this.recordings.values());
    },
    
    get: async (recordingId) => {
      const recording = this.recordings.get(recordingId);
      if (!recording) {
        throw new Error(`Recording ${recordingId} not found`);
      }
      return recording;
    },
    
    delete: async (recordingId) => {
      if (!this.recordings.has(recordingId)) {
        throw new Error(`Recording ${recordingId} not found`);
      }
      this.recordings.delete(recordingId);
      return { success: true };
    }
  };

  // Helper to simulate call progress
  _simulateCallProgress(callId) {
    const call = this.calls.get(callId);
    if (!call || call.status === 'completed') return;

    const now = new Date().toISOString();
    
    if (call.status === 'in-progress') {
      // Simulate call answered
      call.status = 'in-progress';
      call.answeredAt = now;
      call.events.push({
        id: `evt_${Math.random().toString(36).substring(2, 15)}`,
        type: 'call.answered',
        timestamp: now,
        data: {}
      });
      
      // Simulate some transcription events
      setTimeout(() => {
        this._simulateTranscription(callId, 'Hello, this is a test call.');
      }, 1000);
      
      // Simulate call ending after some time
      setTimeout(() => {
        this.calls.end(callId);
      }, 30000);
    }
  }
  
  // Helper to simulate transcription
  _simulateTranscription(callId, text) {
    const call = this.calls.get(callId);
    if (!call) return;
    
    const now = new Date().toISOString();
    const event = {
      id: `evt_${Math.random().toString(36).substring(2, 15)}`,
      type: 'call.transcription',
      timestamp: now,
      data: {
        text,
        speaker: 'user',
        confidence: 0.95,
        language: 'en-US'
      }
    };
    
    call.events.push(event);
    
    // Also simulate assistant response after a delay
    if (Math.random() > 0.5) {
      setTimeout(() => {
        const responseText = "I'm a test assistant. How can I help you today?";
        this._simulateTranscription(callId, responseText);
      }, 1500);
    }
  }
}

module.exports = MockVapiClient;
