import { expect } from 'chai';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { callMonitor } from '../vapi-agent.js';

// Mock event emitter for testing
class MockEventEmitter extends EventEmitter {}

// Mock the call monitor's event emitter
const mockEmitter = new MockEventEmitter();

// Replace the real emitter with our mock for testing
callMonitor.emitter = mockEmitter;

describe('Call Monitoring', () => {
  let sandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Reset call monitor state before each test
    callMonitor.activeCalls.clear();
  });

  afterEach(() => {
    sandbox.restore();
    // Remove all event listeners after each test
    mockEmitter.removeAllListeners();
  });

  describe('addCall', () => {
    it('should add a call to active calls', () => {
      const callId = 'call_123';
      const metadata = { assistantId: 'asst_123' };
      
      callMonitor.addCall(callId, metadata);
      
      expect(callMonitor.activeCalls.has(callId)).to.be.true;
      expect(callMonitor.activeCalls.get(callId)).to.deep.include(metadata);
    });
  });

  describe('removeCall', () => {
    it('should remove a call from active calls', () => {
      const callId = 'call_123';
      callMonitor.addCall(callId, {});
      
      callMonitor.removeCall(callId);
      
      expect(callMonitor.activeCalls.has(callId)).to.be.false;
    });
  });

  describe('getCall', () => {
    it('should return call data if call exists', () => {
      const callId = 'call_123';
      const metadata = { assistantId: 'asst_123' };
      callMonitor.addCall(callId, metadata);
      
      const callData = callMonitor.getCall(callId);
      
      expect(callData).to.deep.include(metadata);
    });

    it('should return undefined for non-existent call', () => {
      const callData = callMonitor.getCall('nonexistent');
      expect(callData).to.be.undefined;
    });
  });

  describe('Event Emission', () => {
    it('should emit call:started event when call is added', (done) => {
      const callId = 'call_123';
      const metadata = { assistantId: 'asst_123' };
      
      callMonitor.on('call:started', (data) => {
        try {
          expect(data.callId).to.equal(callId);
          expect(data.metadata).to.deep.equal(metadata);
          done();
        } catch (error) {
          done(error);
        }
      });
      
      callMonitor.addCall(callId, metadata);
    });
  });
});
