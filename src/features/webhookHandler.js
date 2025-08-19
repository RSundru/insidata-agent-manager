import crypto from 'crypto';
import { VapiError, ERROR_CODES } from '../utils/errorHandler.js';

/**
 * Webhook Handler for VAPI call events
 */
class WebhookHandler {
  /**
   * Create a new WebhookHandler
   * @param {Object} options - Configuration options
   * @param {string} [options.secret] - Webhook secret for signature verification
   * @param {Function} [options.onEvent] - Global event handler
   */
  constructor(options = {}) {
    this.secret = options.secret || process.env.VAPI_WEBHOOK_SECRET;
    this.eventHandlers = new Map();
    this.globalEventHandler = options.onEvent || null;
  }

  /**
   * Verify webhook signature
   * @private
   */
  _verifySignature(signature, payload, timestamp) {
    if (!this.secret) {
      console.warn('Webhook secret not set, skipping signature verification');
      return true; // Skip verification if no secret is set
    }

    const hmac = crypto.createHmac('sha256', this.secret);
    const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
    const expectedSignature = hmac.update(signedPayload).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Process incoming webhook
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Processed event data
   */
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['vapi-signature'];
      const timestamp = req.headers['vapi-timestamp'];
      const event = req.body;

      // Verify signature if secret is set
      if (this.secret && (!signature || !timestamp)) {
        throw new VapiError('Missing required headers for webhook verification', 'MISSING_HEADERS');
      }

      if (this.secret && !this._verifySignature(signature, event, timestamp)) {
        throw new VapiError('Invalid webhook signature', 'INVALID_SIGNATURE');
      }

      // Process the event
      const result = await this._processEvent(event);
      
      // Send success response
      res.status(200).json({ received: true, event: result });
      return result;
    } catch (error) {
      console.error('Webhook processing error:', error);
      
      const statusCode = error.statusCode || 400;
      const message = error.message || 'Webhook processing failed';
      
      res.status(statusCode).json({
        error: message,
        code: error.code || 'WEBHOOK_ERROR'
      });
      
      throw error;
    }
  }

  /**
   * Process a single webhook event
   * @private
   */
  async _processEvent(event) {
    if (!event || !event.type) {
      throw new VapiError('Invalid event format', 'INVALID_EVENT');
    }

    const eventType = event.type;
    const eventData = event.data || {};

    // Call global event handler if set
    if (this.globalEventHandler) {
      try {
        await this.globalEventHandler(eventType, eventData);
      } catch (error) {
        console.error('Error in global event handler:', error);
      }
    }

    // Call specific event handler if registered
    if (this.eventHandlers.has(eventType)) {
      const handler = this.eventHandlers.get(eventType);
      try {
        await handler(eventData);
      } catch (error) {
        console.error(`Error in ${eventType} handler:`, error);
        throw new VapiError(
          `Error processing ${eventType} event`,
          'HANDLER_ERROR',
          { originalError: error.message }
        );
      }
    }

    return { type: eventType, data: eventData };
  }

  /**
   * Register an event handler
   * @param {string} eventType - Event type to handle (e.g., 'call.answered')
   * @param {Function} handler - Event handler function
   */
  on(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new VapiError('Handler must be a function', 'INVALID_HANDLER');
    }
    this.eventHandlers.set(eventType, handler);
    return this;
  }

  /**
   * Register multiple event handlers
   * @param {Object} handlers - Object mapping event types to handler functions
   */
  registerHandlers(handlers) {
    if (typeof handlers !== 'object') {
      throw new VapiError('Handlers must be an object', 'INVALID_HANDLERS');
    }

    for (const [eventType, handler] of Object.entries(handlers)) {
      this.on(eventType, handler);
    }

    return this;
  }

  /**
   * Create an Express middleware for handling webhooks
   * @returns {Function} Express middleware function
   */
  getMiddleware() {
    return this.handleWebhook.bind(this);
  }

  /**
   * Helper to create a webhook endpoint in Express
   * @param {Object} app - Express app instance
   * @param {string} path - Webhook path (default: '/webhook')
   */
  createEndpoint(app, path = '/webhook') {
    app.post(path, express.json(), this.getMiddleware());
  }
}

export default WebhookHandler;
