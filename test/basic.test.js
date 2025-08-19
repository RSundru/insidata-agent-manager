import { strict as assert } from 'assert';
import { describe, it } from 'mocha';

// Simple test to verify the test setup works
describe('Basic Test', () => {
  it('should pass a basic test', () => {
    assert.strictEqual(1 + 1, 2);
  });

  it('should have the required environment variables', () => {
    assert.ok(process.env.VAPI_API_KEY, 'VAPI_API_KEY is not set');
    assert.ok(process.env.VAPI_WEBHOOK_SECRET, 'VAPI_WEBHOOK_SECRET is not set');
  });
});
