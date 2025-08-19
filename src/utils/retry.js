/**
 * Retry utility for API calls with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in milliseconds
 * @param {Function} [options.shouldRetry] - Function to determine if a retry should be attempted
 * @returns {Promise<any>} - Result of the function call
 */
const retry = async (fn, { 
  maxRetries = 3, 
  initialDelay = 1000,
  shouldRetry = (error) => true
} = {}) => {
  let retries = 0;
  let lastError;
  
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error) || retries === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = initialDelay * Math.pow(2, retries);
      const jitter = Math.random() * 0.2 * delay; // Add up to 20% jitter
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      
      retries++;
    }
  }
  
  throw lastError || new Error('Retry failed');
};

export { retry };
