import { expect } from 'chai';
import sinon from 'sinon';

/**
 * Creates a mock Express request object
 */
export const mockRequest = (body = {}, params = {}, query = {}, headers = {}) => ({
  body,
  params,
  query,
  headers: {
    'content-type': 'application/json',
    'x-vapi-signature': 'test-signature',
    ...headers
  },
  get(header) {
    return this.headers[header.toLowerCase()];
  }
});

/**
 * Creates a mock Express response object with spies
 */
export const mockResponse = () => {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  res.end = sinon.stub();
  return res;
};

/**
 * Asserts that a function throws an error with a specific code
 */
export const expectErrorWithCode = async (fn, code) => {
  try {
    await fn();
    expect.fail('Expected function to throw an error');
  } catch (error) {
    expect(error).to.have.property('code', code);
  }
};

/**
 * Creates a delay
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
