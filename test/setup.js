import chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';

// Configure chai
chai.use(sinonChai);
chai.use(chaiAsPromised);

// Make chai and sinon available globally
global.expect = chai.expect;
global.sinon = sinon;

// Setup environment variables for testing
process.env.NODE_ENV = 'test';
process.env.VAPI_API_KEY = 'test-api-key';
process.env.VAPI_WEBHOOK_SECRET = 'test-webhook-secret';

// Add afterEach hook to clean up sinon stubs
afterEach(() => {
  sinon.restore();
});
