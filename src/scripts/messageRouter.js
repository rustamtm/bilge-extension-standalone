/**
 * MessageRouter - Advanced message routing for Bilge AI Workspace
 * Provides structured handling, validation, and error management for extension messaging.
 */

class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.interceptors = [];
    console.log("[MessageRouter] Initialized");
  }

  /**
   * Register a handler for a specific action
   * @param {string} action - The action identifier
   * @param {Function} handler - Async function (request, sender) => response
   */
  register(action, handler) {
    if (this.handlers.has(action)) {
      console.warn(`[MessageRouter] Overwriting handler for action: ${action}`);
    }
    this.handlers.set(action, handler);
  }

  /**
   * Add a global interceptor for all messages
   * @param {Function} interceptor - Function (request, sender) => boolean (true to block)
   */
  addInterceptor(interceptor) {
    this.interceptors.push(interceptor);
  }

  /**
   * Dispatch an incoming message to the appropriate handler
   */
  async dispatch(request, sender) {
    const action = request.action || (request.payload && request.payload.action) || request.type;
    
    // Run interceptors
    for (const interceptor of this.interceptors) {
      if (interceptor(request, sender)) {
        throw new Error("Message blocked by interceptor");
      }
    }

    const handler = this.handlers.get(action);
    if (!handler) {
      // Not an error, might be intended for another listener
      return null;
    }

    try {
      return await handler(request, sender);
    } catch (err) {
      console.error(`[MessageRouter] Error handling ${action}:`, err);
      return { ok: false, error: err.message || String(err) };
    }
  }

  /**
   * Listen for chrome.runtime.onMessage
   */
  listen() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Check for nested action in payload if standard action is missing
      const action = request.action || (request.payload && request.payload.action) || request.type;
      
      if (!this.handlers.has(action)) return false;

      this.dispatch(request, sender).then(response => {
        if (response !== null) {
          sendResponse(response);
        }
      });

      return true; // Always async
    });
  }
}

// Export for service worker use
export default MessageRouter;
