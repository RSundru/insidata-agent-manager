import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline as _pipeline } from 'stream';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { VapiError, ERROR_CODES } from '../utils/errorHandler.js';
import { retry } from '../utils/retry.js';

const pipeline = promisify(_pipeline);

// Get current directory in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Call Recording Manager
 * Handles downloading, storing, and managing call recordings
 */
class CallRecordingManager {
  /**
   * Create a new CallRecordingManager
   * @param {Object} vapiClient - Initialized VAPI client
   * @param {Object} options - Configuration options
   * @param {string} [options.storagePath='./recordings'] - Base path to store recordings
   * @param {number} [options.retentionDays=30] - Number of days to keep recordings
   * @param {number} [options.maxRetries=3] - Max retries for download operations
   */
  constructor(vapiClient, options = {}) {
    this.vapi = vapiClient;
    this.storagePath = options.storagePath || path.join(process.cwd(), 'recordings');
    this.retentionDays = options.retentionDays || 30;
    this.maxRetries = options.maxRetries || 3;
    
    // Ensure storage directory exists
    this._ensureStoragePath().catch(console.error);
  }

  /**
   * Ensure the storage directory exists
   * @private
   */
  async _ensureStoragePath() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new VapiError(
          `Failed to create storage directory: ${error.message}`,
          'STORAGE_ERROR',
          { path: this.storagePath, error }
        );
      }
    }
  }

  /**
   * Get recording information
   * @param {string} callId - The call ID
   * @returns {Promise<Object>} Recording information
   */
  async getRecordingInfo(callId) {
    try {
      const call = await this.vapi.calls.get(callId);
      
      if (!call.recordingUrl) {
        throw new VapiError(
          'No recording available for this call',
          'RECORDING_NOT_AVAILABLE'
        );
      }

      return {
        callId,
        recordingUrl: call.recordingUrl,
        duration: call.duration,
        createdAt: call.createdAt,
        status: call.status,
        localPath: this._getLocalPath(callId)
      };
    } catch (error) {
      throw new VapiError(
        `Failed to get recording info: ${error.message}`,
        'FETCH_ERROR',
        { callId, error }
      );
    }
  }

  /**
   * Download a call recording
   * @param {string} callId - The call ID
   * @param {Object} options - Download options
   * @param {boolean} [options.force=false] - Force re-download if file exists
   * @returns {Promise<string>} Path to the downloaded file
   */
  async downloadRecording(callId, options = {}) {
    const { force = false } = options;
    const localPath = this._getLocalPath(callId);
    
    try {
      // Check if file already exists
      if (!force) {
        try {
          await fs.access(localPath);
          return localPath; // File already exists
        } catch (error) {
          // File doesn't exist, proceed with download
        }
      }

      // Get recording URL
      const recordingInfo = await this.getRecordingInfo(callId);
      
      if (!recordingInfo.recordingUrl) {
        throw new VapiError(
          'No recording URL available',
          'NO_RECORDING_URL',
          { callId }
        );
      }

      // Download with retry logic
      await retry(
        async () => {
          const response = await fetch(recordingInfo.recordingUrl);
          
          if (!response.ok) {
            throw new VapiError(
              `Failed to download recording: ${response.statusText}`,
              'DOWNLOAD_ERROR',
              { status: response.status, statusText: response.statusText }
            );
          }
          
          // Ensure directory exists
          await fs.mkdir(path.dirname(localPath), { recursive: true });
          
          // Stream to file
          const fileStream = createWriteStream(localPath, { flags: 'w' });
          await pipeline(response.body, fileStream);
        },
        {
          maxRetries: this.maxRetries,
          shouldRetry: (error) => {
            // Don't retry for 404 or other client errors
            return ![
              'NOT_FOUND',
              'RECORDING_NOT_AVAILABLE',
              'NO_RECORDING_URL'
            ].includes(error.code);
          }
        }
      );

      return localPath;
    } catch (error) {
      // Clean up partially downloaded file if it exists
      try {
        await fs.unlink(localPath).catch(() => {});
      } catch (cleanupError) {
        console.error('Error cleaning up failed download:', cleanupError);
      }
      
      throw new VapiError(
        `Failed to download recording: ${error.message}`,
        'DOWNLOAD_FAILED',
        { callId, error }
      );
    }
  }

  /**
   * Delete a local recording
   * @param {string} callId - The call ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteLocalRecording(callId) {
    const localPath = this._getLocalPath(callId);
    
    try {
      await fs.unlink(localPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // File doesn't exist
      }
      throw new VapiError(
        `Failed to delete recording: ${error.message}`,
        'DELETE_ERROR',
        { callId, error }
      );
    }
  }

  /**
   * Clean up old recordings based on retention policy
   * @returns {Promise<{deleted: number, errors: number}>} Cleanup results
   */
  async cleanupOldRecordings() {
    try {
      const files = await fs.readdir(this.storagePath);
      const now = new Date();
      const cutoffTime = now.setDate(now.getDate() - this.retentionDays);
      
      let deleted = 0;
      let errors = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(this.storagePath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.birthtime < cutoffTime) {
            await fs.unlink(filePath);
            deleted++;
          }
        } catch (error) {
          console.error(`Error cleaning up file ${file}:`, error);
          errors++;
        }
      }
      
      return { deleted, errors };
    } catch (error) {
      throw new VapiError(
        `Failed to clean up recordings: ${error.message}`,
        'CLEANUP_ERROR',
        { error }
      );
    }
  }

  /**
   * Get the local path for a recording
   * @private
   */
  _getLocalPath(callId) {
    return path.join(this.storagePath, `${callId}.mp3`);
  }
}

export default CallRecordingManager;
