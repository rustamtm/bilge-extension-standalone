// Bilge AI Workspace background script
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: {tabId: tab.id!},
    files: ['content.js']
  });
});