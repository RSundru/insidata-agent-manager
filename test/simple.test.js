import { expect } from 'chai';
import { vapi } from '../vapi-agent.js';

// Simple test to verify the test setup works
describe('VAPI SDK Smoke Test', () => {
  it('should have a valid VAPI client', () => {
    expect(vapi).to.be.an('object');
    expect(vapi.assistants).to.be.an('object');
    expect(vapi.calls).to.be.an('object');
  });

  it('should have the required environment variables', () => {
    expect(process.env.VAPI_API_KEY).to.exist;
    expect(process.env.VAPI_WEBHOOK_SECRET).to.exist;
  });
});
