var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/test_harness.js
function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: err.message });
        return;
      }
      resolve(response ?? { error: "No response." });
    });
  });
}
__name(sendToBackground, "sendToBackground");
window.__bilgeHarness = {
  sendToContent(payload) {
    return sendToBackground({ to: "CONTENT_SCRIPT", payload });
  },
  sendToBackground(payload) {
    return sendToBackground({ to: "BACKGROUND", payload });
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3Rlc3RfaGFybmVzcy5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyogZ2xvYmFsIGNocm9tZSAqL1xuXG5mdW5jdGlvbiBzZW5kVG9CYWNrZ3JvdW5kKG1lc3NhZ2UpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBjb25zdCBlcnIgPSBjaHJvbWUucnVudGltZS5sYXN0RXJyb3I7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJlc29sdmUoeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlc29sdmUocmVzcG9uc2UgPz8geyBlcnJvcjogJ05vIHJlc3BvbnNlLicgfSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG53aW5kb3cuX19iaWxnZUhhcm5lc3MgPSB7XG4gIHNlbmRUb0NvbnRlbnQocGF5bG9hZCkge1xuICAgIHJldHVybiBzZW5kVG9CYWNrZ3JvdW5kKHsgdG86ICdDT05URU5UX1NDUklQVCcsIHBheWxvYWQgfSk7XG4gIH0sXG4gIHNlbmRUb0JhY2tncm91bmQocGF5bG9hZCkge1xuICAgIHJldHVybiBzZW5kVG9CYWNrZ3JvdW5kKHsgdG86ICdCQUNLR1JPVU5EJywgcGF5bG9hZCB9KTtcbiAgfVxufTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7OztBQUVBLFNBQVMsaUJBQWlCLFNBQVM7QUFDakMsU0FBTyxJQUFJLFFBQVEsQ0FBQyxZQUFZO0FBQzlCLFdBQU8sUUFBUSxZQUFZLFNBQVMsQ0FBQyxhQUFhO0FBQ2hELFlBQU0sTUFBTSxPQUFPLFFBQVE7QUFDM0IsVUFBSSxLQUFLO0FBQ1AsZ0JBQVEsRUFBRSxPQUFPLElBQUksUUFBUSxDQUFDO0FBQzlCO0FBQUEsTUFDRjtBQUNBLGNBQVEsWUFBWSxFQUFFLE9BQU8sZUFBZSxDQUFDO0FBQUEsSUFDL0MsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNIO0FBWFM7QUFhVCxPQUFPLGlCQUFpQjtBQUFBLEVBQ3RCLGNBQWMsU0FBUztBQUNyQixXQUFPLGlCQUFpQixFQUFFLElBQUksa0JBQWtCLFFBQVEsQ0FBQztBQUFBLEVBQzNEO0FBQUEsRUFDQSxpQkFBaUIsU0FBUztBQUN4QixXQUFPLGlCQUFpQixFQUFFLElBQUksY0FBYyxRQUFRLENBQUM7QUFBQSxFQUN2RDtBQUNGOyIsCiAgIm5hbWVzIjogW10KfQo=
