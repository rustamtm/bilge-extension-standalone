var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/reload.js
(function() {
  function renderError(message) {
    try {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<pre style="margin-top:12px;white-space:pre-wrap;">Reload failed: ${String(message)}</pre>`
      );
    } catch (_err) {
    }
  }
  __name(renderError, "renderError");
  try {
    if (typeof chrome === "undefined" || !chrome.runtime || typeof chrome.runtime.reload !== "function") {
      renderError("chrome.runtime.reload is unavailable (is this running as an extension page?)");
      return;
    }
    chrome.runtime.reload();
  } catch (err) {
    renderError(err && err.message || err || "unknown");
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3JlbG9hZC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiKGZ1bmN0aW9uICgpIHtcbiAgZnVuY3Rpb24gcmVuZGVyRXJyb3IobWVzc2FnZSkge1xuICAgIHRyeSB7XG4gICAgICBkb2N1bWVudC5ib2R5Lmluc2VydEFkamFjZW50SFRNTChcbiAgICAgICAgJ2JlZm9yZWVuZCcsXG4gICAgICAgIGA8cHJlIHN0eWxlPVwibWFyZ2luLXRvcDoxMnB4O3doaXRlLXNwYWNlOnByZS13cmFwO1wiPlJlbG9hZCBmYWlsZWQ6ICR7U3RyaW5nKG1lc3NhZ2UpfTwvcHJlPmAsXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgIC8vIGlnbm9yZVxuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiBjaHJvbWUgPT09ICd1bmRlZmluZWQnIHx8ICFjaHJvbWUucnVudGltZSB8fCB0eXBlb2YgY2hyb21lLnJ1bnRpbWUucmVsb2FkICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZW5kZXJFcnJvcignY2hyb21lLnJ1bnRpbWUucmVsb2FkIGlzIHVuYXZhaWxhYmxlIChpcyB0aGlzIHJ1bm5pbmcgYXMgYW4gZXh0ZW5zaW9uIHBhZ2U/KScpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjaHJvbWUucnVudGltZS5yZWxvYWQoKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmVuZGVyRXJyb3IoKGVyciAmJiBlcnIubWVzc2FnZSkgfHwgZXJyIHx8ICd1bmtub3duJyk7XG4gIH1cbn0pKCk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Q0FBQyxXQUFZO0FBQ1gsV0FBUyxZQUFZLFNBQVM7QUFDNUIsUUFBSTtBQUNGLGVBQVMsS0FBSztBQUFBLFFBQ1o7QUFBQSxRQUNBLHFFQUFxRSxPQUFPLE9BQU8sQ0FBQztBQUFBLE1BQ3RGO0FBQUEsSUFDRixTQUFTLE1BQU07QUFBQSxJQUVmO0FBQUEsRUFDRjtBQVRTO0FBV1QsTUFBSTtBQUNGLFFBQUksT0FBTyxXQUFXLGVBQWUsQ0FBQyxPQUFPLFdBQVcsT0FBTyxPQUFPLFFBQVEsV0FBVyxZQUFZO0FBQ25HLGtCQUFZLDhFQUE4RTtBQUMxRjtBQUFBLElBQ0Y7QUFDQSxXQUFPLFFBQVEsT0FBTztBQUFBLEVBQ3hCLFNBQVMsS0FBSztBQUNaLGdCQUFhLE9BQU8sSUFBSSxXQUFZLE9BQU8sU0FBUztBQUFBLEVBQ3REO0FBQ0YsR0FBRzsiLAogICJuYW1lcyI6IFtdCn0K
