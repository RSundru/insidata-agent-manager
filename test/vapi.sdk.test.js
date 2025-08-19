const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs').promises;
const path = require('path');
const { VapiClient } = require('@vapi-ai/server-sdk');
const MockVapiClient = require('./utils/mockVapiClient');

// Import our modules
const CallMonitor = require('../src/features/callMonitoring');
const CallRecordingManager = require('../src/features/callRecordingManager');
const WebhookHandler = require('../src/features/webhookHandler');
const { VapiError } = require('../src/utils/errorHandler');

describe('VAPI SDK', () => {
  let mockClient;
  let callMonitor;
  let recordingManager;
  let webhookHandler;

  // Test data
  const testAssistant = {
    name: 'Test Assistant',
    firstMessage: 'Hello, this is a test',
    model: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7
    },
    voice: {
      provider: '11labs',
      voiceId: 'test-voice-123'
    }
  };

  const testCall = {
    assistantId: 'asst_test123',
    phoneNumberId: 'ph_test123',
    customer: { number: '+1234567890' }
  };

  before(() => {
    // Use mock client for testing
    mockClient = new MockVapiClient();
    
    // Initialize components with mock client
    callMonitor = new CallMonitor(mockClient);
    recordingManager = new CallRecordingManager(mockClient, {
      storagePath: './test-recordings'
    });
    webhookHandler = new WebhookHandler({
      secret: 'test-secret'
    });
  });

  afterEach(async () => {
    // Clean up after each test
    sinon.restore();
    callMonitor.stopMonitoring();
    
    // Clean up test recordings
    try {
      await fs.rm('./test-recordings', { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Assistant Management', () => {
    it('should create a new assistant', async () => {
      const assistant = await mockClient.assistants.create(testAssistant);
      expect(assistant).to.have.property('id');
      expect(assistant.name).to.equal(testAssistant.name);
      expect(assistant.firstMessage).to.equal(testAssistant.firstMessage);
    });

    it('should list all assistants', async () => {
      const assistants = await mockClient.assistants.list();
      expect(assistants).to.be.an('array');
      expect(assistants.length).to.be.greaterThan(0);
    });

    it('should update an assistant', async () => {
      const assistant = await mockClient.assistants.create(testAssistant);
      const updatedName = 'Updated Test Assistant';
      const updated = await mockClient.assistants.update(assistant.id, { 
        name: updatedName 
      });
      expect(updated.name).to.equal(updatedName);
    });

    it('should delete an assistant', async () => {
      const assistant = await mockClient.assistants.create(testAssistant);
      await mockClient.assistants.delete(assistant.id);
      
      // Verify deletion by trying to get the assistant
      try {
        await mockClient.assistants.get(assistant.id);
        throw new Error('Assistant should have been deleted');
      } catch (error) {
        expect(error.message).to.include('not found');
      }
    });
  });

  describe('Call Management', () => {
    it('should start a new call', async () => {
      const call = await mockClient.calls.create(testCall);
      expect(call).to.have.property('id');
      expect(call.assistantId).to.equal(testCall.assistantId);
      expect(call.status).to.equal('in-progress');
    });

    it('should get call details', async () => {
      const call = await mockClient.calls.create(testCall);
      const details = await mockClient.calls.get(call.id);
      expect(details.id).to.equal(call.id);
      expect(details.events).to.be.an('array');
    });

    it('should end a call', async () => {
      const call = await mockClient.calls.create(testCall);
      const endedCall = await mockClient.calls.end(call.id);
      expect(endedCall.status).to.equal('completed');
      expect(endedCall.endedAt).to.exist;
    });
  });

  describe('Call Monitor', () => {
    it('should monitor call events', (done) => {
      const callSpy = sinon.spy();
      const eventSpy = sinon.spy();
      
      callMonitor.on('call:status_changed', callSpy);
      callMonitor.on('call:transcription', eventSpy);
      
      mockClient.calls.create(testCall).then((call) => {
        callMonitor.addCall(call.id);
        
        // Wait for events to be processed
        setTimeout(() => {
          expect(callSpy.called).to.be.true;
          expect(eventSpy.called).to.be.true;
          done();
        }, 3000);
      });
    });
  });

  describe('Webhook Handler', () => {
    it('should process webhook events', async () => {
      const eventSpy = sinon.spy();
      webhookHandler.on('test.event', eventSpy);
      
      const event = {
        type: 'test.event',
        data: { foo: 'bar' }
      };
      
      const req = {
        headers: {
          'vapi-signature': 'mocked-signature',
          'vapi-timestamp': Date.now().toString()
        },
        body: event
      };
      
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      
      // Stub signature verification
      const stub = sinon.stub(webhookHandler, '_verifySignature').returns(true);
      
      await webhookHandler.handleWebhook(req, res);
      
      expect(eventSpy.calledOnce).to.be.true;
      expect(eventSpy.firstCall.args[0]).to.deep.equal(event.data);
      expect(res.status.calledWith(200)).to.be.true;
      
      stub.restore();
    });
  });

  describe('Call Recording Manager', () => {
    it('should get recording info', async () => {
      const call = await mockClient.calls.create(testCall);
      const info = await recordingManager.getRecordingInfo(call.id);
      
      expect(info).to.have.property('recordingUrl');
      expect(info.callId).to.equal(call.id);
    });

    it('should download a recording', async () => {
      const call = await mockClient.calls.create(testCall);
      const filePath = await recordingManager.downloadRecording(call.id);
      
      // Verify file exists
      const stats = await fs.stat(filePath);
      expect(stats.isFile()).to.be.true;
    });

    it('should clean up old recordings', async () => {
      // Create a test recording
      const call = await mockClient.calls.create(testCall);
      await recordingManager.downloadRecording(call.id);
      
      // Set retention to 0 days to force cleanup
      recordingManager.retentionDays = 0;
      
      const result = await recordingManager.cleanupOldRecordings();
      expect(result.deleted).to.be.greaterThan(0);
      
      // Verify file was deleted
      try {
        await fs.access(recordingManager._getLocalPath(call.id));
        throw new Error('File should have been deleted');
      } catch (error) {
        expect(error.code).to.equal('ENOENT');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      try {
        await mockClient.assistants.get('non-existent-id');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('Error');
        expect(error.message).to.include('not found');
      }
    });
  });
});
