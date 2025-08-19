import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import { retry } from '../utils/retry.js';
import { VapiError, ERROR_CODES } from '../utils/errorHandler.js';

/**
 * Call Monitoring Service
 * Provides real-time monitoring and event handling for VAPI calls
 */
class CallMonitor extends EventEmitter {
  constructor(vapiClient, options = {}) {
    super();
    this.vapi = vapiClient;
    this.activeCalls = new Map();
    this.monitoringInterval = options.monitoringInterval || 5000; // 5 seconds
    this.monitoringEnabled = false;
    this.monitoringIntervalId = null;
  }

  /**
   * Start monitoring active calls
   */
  startMonitoring() {
    if (this.monitoringIntervalId) {
      return; // Already monitoring
    }

    this.monitoringEnabled = true;
    this.monitoringIntervalId = setInterval(
      this._monitorCalls.bind(this),
      this.monitoringInterval
    );
    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring active calls
   */
  stopMonitoring() {
    if (!this.monitoringIntervalId) {
      return;
    }

    clearInterval(this.monitoringIntervalId);
    this.monitoringIntervalId = null;
    this.monitoringEnabled = false;
    this.emit('monitoring:stopped');
  }

  /**
   * Add a call to be monitored
   * @param {string} callId - The call ID to monitor
   * @param {Object} metadata - Additional metadata to associate with the call
   */
  async addCall(callId, metadata = {}) {
    if (this.activeCalls.has(callId)) {
      return;
    }

    const callData = {
      id: callId,
      metadata,
      status: 'initializing',
      events: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
      analytics: {
        talkTime: 0,
        silenceDuration: 0,
        interruptions: 0,
        sentimentScores: []
      }
    };

    this.activeCalls.set(callId, callData);
    this.emit('call:added', callData);

    // Start monitoring if not already started
    if (!this.monitoringIntervalId) {
      this.startMonitoring();
    }

    return callData;
  }

  /**
   * Remove a call from monitoring
   * @param {string} callId - The call ID to remove
   */
  removeCall(callId) {
    if (!this.activeCalls.has(callId)) {
      return;
    }

    const callData = this.activeCalls.get(callId);
    this.activeCalls.delete(callId);
    this.emit('call:removed', callData);

    // Stop monitoring if no more active calls
    if (this.activeCalls.size === 0) {
      this.stopMonitoring();
    }
  }

  /**
   * Get call data by ID
   * @param {string} callId - The call ID to get data for
   * @returns {Object|null} Call data or null if not found
   */
  getCall(callId) {
    return this.activeCalls.get(callId) || null;
  }

  /**
   * Get all active calls
   * @returns {Array} Array of active call data
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Process call events
   * @private
   */
  async _processCallEvents(callId, events = []) {
    const callData = this.getCall(callId);
    if (!callData) {
      return;
    }

    for (const event of events) {
      // Skip if we've already processed this event
      if (callData.events.some(e => e.id === event.id)) {
        continue;
      }

      // Update call status based on event type
      if (event.type === 'call.answered') {
        callData.status = 'in-progress';
        callData.answeredAt = new Date(event.timestamp);
      } else if (event.type === 'call.ended') {
        callData.status = 'completed';
        callData.endedAt = new Date(event.timestamp);
        callData.duration = (callData.endedAt - callData.createdAt) / 1000; // in seconds
      } else if (event.type === 'call.transcription') {
        callData.transcription = event.data.text;
        this._analyzeTranscription(callData, event.data);
      } else if (event.type === 'call.sentiment') {
        callData.analytics.sentimentScores.push({
          score: event.data.score,
          timestamp: new Date(event.timestamp)
        });
      }

      // Add to events array
      callData.events.push({
        id: event.id,
        type: event.type,
        timestamp: new Date(event.timestamp),
        data: event.data || {}
      });

      callData.lastUpdated = new Date();
      this.emit(`call:${event.type}`, { callId, ...event });
    }

    this.emit('call:updated', callData);
  }

  /**
   * Analyze transcription for insights
   * @private
   */
  _analyzeTranscription(callData, transcription) {
    // Simple analysis - count words, detect interruptions, etc.
    const wordCount = transcription.text.split(/\s+/).length;
    const isInterruption = transcription.speaker === 'assistant' && 
                         transcription.text.endsWith('?') &&
                         transcription.text.length < 30; // Short questions might be interruptions
    
    if (isInterruption) {
      callData.analytics.interruptions += 1;
    }

    // Update talk time (very rough estimate)
    const wordsPerMinute = 150; // Average speaking rate
    callData.analytics.talkTime += (wordCount / wordsPerMinute) * 60; // in seconds
  }

  /**
   * Monitor active calls for updates
   * @private
   */
  async _monitorCalls() {
    if (!this.monitoringEnabled) {
      return;
    }

    try {
      // Process each active call
      for (const [callId, callData] of this.activeCalls.entries()) {
        if (callData.status === 'completed') {
          continue; // Skip completed calls
        }

        try {
          // Get call details with retry logic
          const call = await retry(
            () => this.vapi.calls.get(callId),
            {
              maxRetries: 3,
              shouldRetry: (error) => {
                // Don't retry for 404 (call not found)
                return error.response?.status !== 404;
              }
            }
          );

          // Update call status
          if (call.status !== callData.status) {
            const oldStatus = callData.status;
            callData.status = call.status;
            this.emit('call:status_changed', {
              callId,
              from: oldStatus,
              to: call.status,
              timestamp: new Date()
            });
          }

          // Process any new events
          if (call.events && call.events.length > 0) {
            await this._processCallEvents(callId, call.events);
          }

          // If call is completed, remove it after a delay
          if (call.status === 'completed' && callData.status !== 'completed') {
            setTimeout(() => this.removeCall(callId), 30000); // Keep for 30s after completion
          }
        } catch (error) {
          console.error(`Error monitoring call ${callId}:`, error);
          this.emit('error', error);
        }
      }
    } catch (error) {
      console.error('Error in call monitoring:', error);
      this.emit('error', error);
    }
  }
}

export { CallMonitor };
