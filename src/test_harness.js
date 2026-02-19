/* global chrome */

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: err.message });
        return;
      }
      resolve(response ?? { error: 'No response.' });
    });
  });
}

window.__bilgeHarness = {
  sendToContent(payload) {
    return sendToBackground({ to: 'CONTENT_SCRIPT', payload });
  },
  sendToBackground(payload) {
    return sendToBackground({ to: 'BACKGROUND', payload });
  }
};

