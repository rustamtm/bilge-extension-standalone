(function () {
  function renderError(message) {
    try {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<pre style="margin-top:12px;white-space:pre-wrap;">Reload failed: ${String(message)}</pre>`,
      );
    } catch (_err) {
      // ignore
    }
  }

  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.reload !== 'function') {
      renderError('chrome.runtime.reload is unavailable (is this running as an extension page?)');
      return;
    }
    chrome.runtime.reload();
  } catch (err) {
    renderError((err && err.message) || err || 'unknown');
  }
})();

