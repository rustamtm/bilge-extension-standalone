var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/smartFormEngine.js
var SmartFormEngine = class {
  static {
    __name(this, "SmartFormEngine");
  }
  constructor() {
    this.contextAnalyzer = new ContextAnalyzer();
    this.fieldPredictor = new FieldPredictor();
    this.anomalyDetector = new AnomalyDetector();
    this.autoCorrector = new AutoCorrector();
    this.learningModule = new LearningModule();
    this.forms = [];
    this.fieldRelationships = /* @__PURE__ */ new Map();
    this.shadowRoot = null;
    this.uiContainer = null;
  }
  init() {
    this.setupShadowDOM();
    document.addEventListener("DOMContentLoaded", this.scanForms.bind(this));
    window.addEventListener("load", this.enhanceForms.bind(this));
  }
  setupShadowDOM() {
    const hostId = "bilge-ui-host";
    let host = document.getElementById(hostId);
    if (!host) {
      host = document.createElement("div");
      host.id = hostId;
      host.style.cssText = "position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
      const mount = document.body || document.documentElement;
      if (!mount) {
        document.addEventListener("DOMContentLoaded", () => this.setupShadowDOM(), { once: true });
        return;
      }
      mount.appendChild(host);
    }
    this.shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
    this.uiContainer = this.shadowRoot.querySelector("#bilge-ui-container");
    if (!this.uiContainer) {
      this.uiContainer = document.createElement("div");
      this.uiContainer.id = "bilge-ui-container";
      this.shadowRoot.appendChild(this.uiContainer);
    }
    let style = this.shadowRoot.querySelector("#bilge-ui-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "bilge-ui-style";
      style.textContent = `
      .bilge-confidence-indicator {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #3a86ff;
        box-shadow: 0 0 5px rgba(58, 134, 255, 0.5);
        pointer-events: none;
        transition: all 0.3s ease;
      }
      .bilge-suggestion {
        position: absolute;
        background: #4a86e8;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }
    `;
      this.shadowRoot.appendChild(style);
    }
  }
  scanForms() {
    this.forms = Array.from(document.querySelectorAll("form"));
    this.forms.forEach((form) => {
      this.contextAnalyzer.analyzeFormStructure(form);
      this.fieldRelationships.set(
        form,
        this.contextAnalyzer.detectFieldRelationships(form)
      );
    });
  }
  enhanceForms() {
    this.forms.forEach((form) => {
      this.injectSmartFeatures(form);
      this.enablePredictiveCompletion(form);
    });
  }
  injectSmartFeatures(form) {
    const fields = form.querySelectorAll("input, select, textarea");
    fields.forEach((field) => {
      field.addEventListener("input", this.handleFieldInput.bind(this, field));
      field.addEventListener("blur", this.validateField.bind(this, field));
      this.addConfidenceIndicator(field);
    });
  }
  handleFieldInput(field) {
    const prediction = this.fieldPredictor.predict(field);
    if (prediction.confidence > 0.8) {
      this.autoCorrector.applySuggestion(field, prediction.value);
    }
  }
  validateField(field) {
    const anomalyScore = this.anomalyDetector.detect(field);
    if (anomalyScore > 0.7) {
      this.autoCorrector.correctField(field);
    }
  }
  addConfidenceIndicator(field) {
    const indicator = document.createElement("div");
    indicator.className = "bilge-confidence-indicator";
    const updatePosition = /* @__PURE__ */ __name(() => {
      const rect = field.getBoundingClientRect();
      indicator.style.left = `${rect.right - 15 + window.scrollX}px`;
      indicator.style.top = `${rect.top + rect.height / 2 - 6 + window.scrollY}px`;
    }, "updatePosition");
    updatePosition();
    this.uiContainer.appendChild(indicator);
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });
  }
};
var smartFormEngine = new SmartFormEngine();
smartFormEngine.init();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3NtYXJ0Rm9ybUVuZ2luZS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gU01BUlQgRk9STSBFTkdJTkUgLSBDb3JlIGludGVsbGlnZW5jZSBodWJcbmNsYXNzIFNtYXJ0Rm9ybUVuZ2luZSB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuY29udGV4dEFuYWx5emVyID0gbmV3IENvbnRleHRBbmFseXplcigpO1xuICAgIHRoaXMuZmllbGRQcmVkaWN0b3IgPSBuZXcgRmllbGRQcmVkaWN0b3IoKTtcbiAgICB0aGlzLmFub21hbHlEZXRlY3RvciA9IG5ldyBBbm9tYWx5RGV0ZWN0b3IoKTtcbiAgICB0aGlzLmF1dG9Db3JyZWN0b3IgPSBuZXcgQXV0b0NvcnJlY3RvcigpO1xuICAgIHRoaXMubGVhcm5pbmdNb2R1bGUgPSBuZXcgTGVhcm5pbmdNb2R1bGUoKTtcbiAgICBcbiAgICB0aGlzLmZvcm1zID0gW107XG4gICAgdGhpcy5maWVsZFJlbGF0aW9uc2hpcHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zaGFkb3dSb290ID0gbnVsbDtcbiAgICB0aGlzLnVpQ29udGFpbmVyID0gbnVsbDtcbiAgfVxuXG4gIGluaXQoKSB7XG4gICAgdGhpcy5zZXR1cFNoYWRvd0RPTSgpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCB0aGlzLnNjYW5Gb3Jtcy5iaW5kKHRoaXMpKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIHRoaXMuZW5oYW5jZUZvcm1zLmJpbmQodGhpcykpO1xuICB9XG5cbiAgc2V0dXBTaGFkb3dET00oKSB7XG4gICAgY29uc3QgaG9zdElkID0gJ2JpbGdlLXVpLWhvc3QnO1xuICAgIGxldCBob3N0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaG9zdElkKTtcbiAgICBpZiAoIWhvc3QpIHtcbiAgICAgIC8vIENyZWF0ZSBTaGFkb3cgSG9zdFxuICAgICAgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgaG9zdC5pZCA9IGhvc3RJZDtcbiAgICAgIC8vIFBvc2l0aW9uIGl0IGFic29sdXRlbHkgdG8gY292ZXIgdGhlIHZpZXdwb3J0IHdpdGhvdXQgYWZmZWN0aW5nIGxheW91dFxuICAgICAgaG9zdC5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAwOyBsZWZ0OiAwOyB3aWR0aDogMDsgaGVpZ2h0OiAwOyB6LWluZGV4OiAyMTQ3NDgzNjQ3Oyc7XG5cbiAgICAgIGNvbnN0IG1vdW50ID0gZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgICBpZiAoIW1vdW50KSB7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB0aGlzLnNldHVwU2hhZG93RE9NKCksIHsgb25jZTogdHJ1ZSB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgbW91bnQuYXBwZW5kQ2hpbGQoaG9zdCk7XG4gICAgfVxuXG4gICAgdGhpcy5zaGFkb3dSb290ID0gaG9zdC5zaGFkb3dSb290IHx8IGhvc3QuYXR0YWNoU2hhZG93KHsgbW9kZTogJ29wZW4nIH0pO1xuICAgIFxuICAgIC8vIENyZWF0ZSBVSSBDb250YWluZXIgaW5zaWRlIFNoYWRvdyBSb290XG4gICAgdGhpcy51aUNvbnRhaW5lciA9IHRoaXMuc2hhZG93Um9vdC5xdWVyeVNlbGVjdG9yKCcjYmlsZ2UtdWktY29udGFpbmVyJyk7XG4gICAgaWYgKCF0aGlzLnVpQ29udGFpbmVyKSB7XG4gICAgICB0aGlzLnVpQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICB0aGlzLnVpQ29udGFpbmVyLmlkID0gJ2JpbGdlLXVpLWNvbnRhaW5lcic7XG4gICAgICB0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQodGhpcy51aUNvbnRhaW5lcik7XG4gICAgfVxuXG4gICAgLy8gSW5qZWN0IFN0eWxlcyBpbnRvIFNoYWRvdyBET01cbiAgICBsZXQgc3R5bGUgPSB0aGlzLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcignI2JpbGdlLXVpLXN0eWxlJyk7XG4gICAgaWYgKCFzdHlsZSkge1xuICAgICAgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgICAgc3R5bGUuaWQgPSAnYmlsZ2UtdWktc3R5bGUnO1xuICAgICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAuYmlsZ2UtY29uZmlkZW5jZS1pbmRpY2F0b3Ige1xuICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICAgIHdpZHRoOiAxMnB4O1xuICAgICAgICBoZWlnaHQ6IDEycHg7XG4gICAgICAgIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgICAgICAgYmFja2dyb3VuZC1jb2xvcjogIzNhODZmZjtcbiAgICAgICAgYm94LXNoYWRvdzogMCAwIDVweCByZ2JhKDU4LCAxMzQsIDI1NSwgMC41KTtcbiAgICAgICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gICAgICB9XG4gICAgICAuYmlsZ2Utc3VnZ2VzdGlvbiB7XG4gICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgICAgYmFja2dyb3VuZDogIzRhODZlODtcbiAgICAgICAgY29sb3I6IHdoaXRlO1xuICAgICAgICBwYWRkaW5nOiA0cHggOHB4O1xuICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICBib3gtc2hhZG93OiAwIDJweCA1cHggcmdiYSgwLDAsMCwwLjIpO1xuICAgICAgfVxuICAgIGA7XG4gICAgICB0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuICAgIH1cbiAgfVxuXG4gIHNjYW5Gb3JtcygpIHtcbiAgICB0aGlzLmZvcm1zID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdmb3JtJykpO1xuICAgIHRoaXMuZm9ybXMuZm9yRWFjaChmb3JtID0+IHtcbiAgICAgIHRoaXMuY29udGV4dEFuYWx5emVyLmFuYWx5emVGb3JtU3RydWN0dXJlKGZvcm0pO1xuICAgICAgdGhpcy5maWVsZFJlbGF0aW9uc2hpcHMuc2V0KGZvcm0sIFxuICAgICAgICB0aGlzLmNvbnRleHRBbmFseXplci5kZXRlY3RGaWVsZFJlbGF0aW9uc2hpcHMoZm9ybSkpO1xuICAgIH0pO1xuICB9XG5cbiAgZW5oYW5jZUZvcm1zKCkge1xuICAgIHRoaXMuZm9ybXMuZm9yRWFjaChmb3JtID0+IHtcbiAgICAgIHRoaXMuaW5qZWN0U21hcnRGZWF0dXJlcyhmb3JtKTtcbiAgICAgIHRoaXMuZW5hYmxlUHJlZGljdGl2ZUNvbXBsZXRpb24oZm9ybSk7XG4gICAgfSk7XG4gIH1cblxuICBpbmplY3RTbWFydEZlYXR1cmVzKGZvcm0pIHtcbiAgICAvLyBBZGQgVUkgZW5oYW5jZW1lbnRzIGFuZCBldmVudCBsaXN0ZW5lcnNcbiAgICBjb25zdCBmaWVsZHMgPSBmb3JtLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QsIHRleHRhcmVhJyk7XG4gICAgZmllbGRzLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgZmllbGQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLmhhbmRsZUZpZWxkSW5wdXQuYmluZCh0aGlzLCBmaWVsZCkpO1xuICAgICAgZmllbGQuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIHRoaXMudmFsaWRhdGVGaWVsZC5iaW5kKHRoaXMsIGZpZWxkKSk7XG4gICAgICB0aGlzLmFkZENvbmZpZGVuY2VJbmRpY2F0b3IoZmllbGQpO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlRmllbGRJbnB1dChmaWVsZCkge1xuICAgIGNvbnN0IHByZWRpY3Rpb24gPSB0aGlzLmZpZWxkUHJlZGljdG9yLnByZWRpY3QoZmllbGQpO1xuICAgIGlmIChwcmVkaWN0aW9uLmNvbmZpZGVuY2UgPiAwLjgpIHtcbiAgICAgIHRoaXMuYXV0b0NvcnJlY3Rvci5hcHBseVN1Z2dlc3Rpb24oZmllbGQsIHByZWRpY3Rpb24udmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhbGlkYXRlRmllbGQoZmllbGQpIHtcbiAgICBjb25zdCBhbm9tYWx5U2NvcmUgPSB0aGlzLmFub21hbHlEZXRlY3Rvci5kZXRlY3QoZmllbGQpO1xuICAgIGlmIChhbm9tYWx5U2NvcmUgPiAwLjcpIHtcbiAgICAgIHRoaXMuYXV0b0NvcnJlY3Rvci5jb3JyZWN0RmllbGQoZmllbGQpO1xuICAgIH1cbiAgfVxuXG4gIGFkZENvbmZpZGVuY2VJbmRpY2F0b3IoZmllbGQpIHtcbiAgICAvLyBVSSBlbGVtZW50IHNob3dpbmcgcHJlZGljdGlvbiBjb25maWRlbmNlXG4gICAgY29uc3QgaW5kaWNhdG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaW5kaWNhdG9yLmNsYXNzTmFtZSA9ICdiaWxnZS1jb25maWRlbmNlLWluZGljYXRvcic7XG4gICAgXG4gICAgLy8gUG9zaXRpb24gcmVsYXRpdmUgdG8gdGhlIGZpZWxkJ3Mgdmlld3BvcnQgY29vcmRpbmF0ZXNcbiAgICBjb25zdCB1cGRhdGVQb3NpdGlvbiA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHJlY3QgPSBmaWVsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGluZGljYXRvci5zdHlsZS5sZWZ0ID0gYCR7cmVjdC5yaWdodCAtIDE1ICsgd2luZG93LnNjcm9sbFh9cHhgO1xuICAgICAgaW5kaWNhdG9yLnN0eWxlLnRvcCA9IGAke3JlY3QudG9wICsgcmVjdC5oZWlnaHQvMiAtIDYgKyB3aW5kb3cuc2Nyb2xsWX1weGA7XG4gICAgfTtcblxuICAgIHVwZGF0ZVBvc2l0aW9uKCk7XG4gICAgdGhpcy51aUNvbnRhaW5lci5hcHBlbmRDaGlsZChpbmRpY2F0b3IpO1xuICAgIFxuICAgIC8vIFJlcG9zaXRpb24gb24gc2Nyb2xsL3Jlc2l6ZVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzY3JvbGwnLCB1cGRhdGVQb3NpdGlvbiwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB1cGRhdGVQb3NpdGlvbiwgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICB9XG59XG5cbi8vIEluaXRpYWxpemUgb24gbG9hZFxuY29uc3Qgc21hcnRGb3JtRW5naW5lID0gbmV3IFNtYXJ0Rm9ybUVuZ2luZSgpO1xuc21hcnRGb3JtRW5naW5lLmluaXQoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7QUFDQSxJQUFNLGtCQUFOLE1BQXNCO0FBQUEsRUFEdEIsT0FDc0I7QUFBQTtBQUFBO0FBQUEsRUFDcEIsY0FBYztBQUNaLFNBQUssa0JBQWtCLElBQUksZ0JBQWdCO0FBQzNDLFNBQUssaUJBQWlCLElBQUksZUFBZTtBQUN6QyxTQUFLLGtCQUFrQixJQUFJLGdCQUFnQjtBQUMzQyxTQUFLLGdCQUFnQixJQUFJLGNBQWM7QUFDdkMsU0FBSyxpQkFBaUIsSUFBSSxlQUFlO0FBRXpDLFNBQUssUUFBUSxDQUFDO0FBQ2QsU0FBSyxxQkFBcUIsb0JBQUksSUFBSTtBQUNsQyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxjQUFjO0FBQUEsRUFDckI7QUFBQSxFQUVBLE9BQU87QUFDTCxTQUFLLGVBQWU7QUFDcEIsYUFBUyxpQkFBaUIsb0JBQW9CLEtBQUssVUFBVSxLQUFLLElBQUksQ0FBQztBQUN2RSxXQUFPLGlCQUFpQixRQUFRLEtBQUssYUFBYSxLQUFLLElBQUksQ0FBQztBQUFBLEVBQzlEO0FBQUEsRUFFQSxpQkFBaUI7QUFDZixVQUFNLFNBQVM7QUFDZixRQUFJLE9BQU8sU0FBUyxlQUFlLE1BQU07QUFDekMsUUFBSSxDQUFDLE1BQU07QUFFVCxhQUFPLFNBQVMsY0FBYyxLQUFLO0FBQ25DLFdBQUssS0FBSztBQUVWLFdBQUssTUFBTSxVQUFVO0FBRXJCLFlBQU0sUUFBUSxTQUFTLFFBQVEsU0FBUztBQUN4QyxVQUFJLENBQUMsT0FBTztBQUNWLGlCQUFTLGlCQUFpQixvQkFBb0IsTUFBTSxLQUFLLGVBQWUsR0FBRyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQ3pGO0FBQUEsTUFDRjtBQUNBLFlBQU0sWUFBWSxJQUFJO0FBQUEsSUFDeEI7QUFFQSxTQUFLLGFBQWEsS0FBSyxjQUFjLEtBQUssYUFBYSxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBR3ZFLFNBQUssY0FBYyxLQUFLLFdBQVcsY0FBYyxxQkFBcUI7QUFDdEUsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUNyQixXQUFLLGNBQWMsU0FBUyxjQUFjLEtBQUs7QUFDL0MsV0FBSyxZQUFZLEtBQUs7QUFDdEIsV0FBSyxXQUFXLFlBQVksS0FBSyxXQUFXO0FBQUEsSUFDOUM7QUFHQSxRQUFJLFFBQVEsS0FBSyxXQUFXLGNBQWMsaUJBQWlCO0FBQzNELFFBQUksQ0FBQyxPQUFPO0FBQ1YsY0FBUSxTQUFTLGNBQWMsT0FBTztBQUN0QyxZQUFNLEtBQUs7QUFDWCxZQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFzQnBCLFdBQUssV0FBVyxZQUFZLEtBQUs7QUFBQSxJQUNuQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLFlBQVk7QUFDVixTQUFLLFFBQVEsTUFBTSxLQUFLLFNBQVMsaUJBQWlCLE1BQU0sQ0FBQztBQUN6RCxTQUFLLE1BQU0sUUFBUSxVQUFRO0FBQ3pCLFdBQUssZ0JBQWdCLHFCQUFxQixJQUFJO0FBQzlDLFdBQUssbUJBQW1CO0FBQUEsUUFBSTtBQUFBLFFBQzFCLEtBQUssZ0JBQWdCLHlCQUF5QixJQUFJO0FBQUEsTUFBQztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxlQUFlO0FBQ2IsU0FBSyxNQUFNLFFBQVEsVUFBUTtBQUN6QixXQUFLLG9CQUFvQixJQUFJO0FBQzdCLFdBQUssMkJBQTJCLElBQUk7QUFBQSxJQUN0QyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsb0JBQW9CLE1BQU07QUFFeEIsVUFBTSxTQUFTLEtBQUssaUJBQWlCLHlCQUF5QjtBQUM5RCxXQUFPLFFBQVEsV0FBUztBQUN0QixZQUFNLGlCQUFpQixTQUFTLEtBQUssaUJBQWlCLEtBQUssTUFBTSxLQUFLLENBQUM7QUFDdkUsWUFBTSxpQkFBaUIsUUFBUSxLQUFLLGNBQWMsS0FBSyxNQUFNLEtBQUssQ0FBQztBQUNuRSxXQUFLLHVCQUF1QixLQUFLO0FBQUEsSUFDbkMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLGlCQUFpQixPQUFPO0FBQ3RCLFVBQU0sYUFBYSxLQUFLLGVBQWUsUUFBUSxLQUFLO0FBQ3BELFFBQUksV0FBVyxhQUFhLEtBQUs7QUFDL0IsV0FBSyxjQUFjLGdCQUFnQixPQUFPLFdBQVcsS0FBSztBQUFBLElBQzVEO0FBQUEsRUFDRjtBQUFBLEVBRUEsY0FBYyxPQUFPO0FBQ25CLFVBQU0sZUFBZSxLQUFLLGdCQUFnQixPQUFPLEtBQUs7QUFDdEQsUUFBSSxlQUFlLEtBQUs7QUFDdEIsV0FBSyxjQUFjLGFBQWEsS0FBSztBQUFBLElBQ3ZDO0FBQUEsRUFDRjtBQUFBLEVBRUEsdUJBQXVCLE9BQU87QUFFNUIsVUFBTSxZQUFZLFNBQVMsY0FBYyxLQUFLO0FBQzlDLGNBQVUsWUFBWTtBQUd0QixVQUFNLGlCQUFpQiw2QkFBTTtBQUMzQixZQUFNLE9BQU8sTUFBTSxzQkFBc0I7QUFDekMsZ0JBQVUsTUFBTSxPQUFPLEdBQUcsS0FBSyxRQUFRLEtBQUssT0FBTyxPQUFPO0FBQzFELGdCQUFVLE1BQU0sTUFBTSxHQUFHLEtBQUssTUFBTSxLQUFLLFNBQU8sSUFBSSxJQUFJLE9BQU8sT0FBTztBQUFBLElBQ3hFLEdBSnVCO0FBTXZCLG1CQUFlO0FBQ2YsU0FBSyxZQUFZLFlBQVksU0FBUztBQUd0QyxXQUFPLGlCQUFpQixVQUFVLGdCQUFnQixFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQ25FLFdBQU8saUJBQWlCLFVBQVUsZ0JBQWdCLEVBQUUsU0FBUyxLQUFLLENBQUM7QUFBQSxFQUNyRTtBQUNGO0FBR0EsSUFBTSxrQkFBa0IsSUFBSSxnQkFBZ0I7QUFDNUMsZ0JBQWdCLEtBQUs7IiwKICAibmFtZXMiOiBbXQp9Cg==
