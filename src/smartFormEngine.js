// SMART FORM ENGINE - Core intelligence hub
class SmartFormEngine {
  constructor() {
    this.contextAnalyzer = new ContextAnalyzer();
    this.fieldPredictor = new FieldPredictor();
    this.anomalyDetector = new AnomalyDetector();
    this.autoCorrector = new AutoCorrector();
    this.learningModule = new LearningModule();
    
    this.forms = [];
    this.fieldRelationships = new Map();
    this.shadowRoot = null;
    this.uiContainer = null;
  }

  init() {
    this.setupShadowDOM();
    document.addEventListener('DOMContentLoaded', this.scanForms.bind(this));
    window.addEventListener('load', this.enhanceForms.bind(this));
  }

  setupShadowDOM() {
    const hostId = 'bilge-ui-host';
    let host = document.getElementById(hostId);
    if (!host) {
      // Create Shadow Host
      host = document.createElement('div');
      host.id = hostId;
      // Position it absolutely to cover the viewport without affecting layout
      host.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';

      const mount = document.body || document.documentElement;
      if (!mount) {
        document.addEventListener('DOMContentLoaded', () => this.setupShadowDOM(), { once: true });
        return;
      }
      mount.appendChild(host);
    }

    this.shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
    
    // Create UI Container inside Shadow Root
    this.uiContainer = this.shadowRoot.querySelector('#bilge-ui-container');
    if (!this.uiContainer) {
      this.uiContainer = document.createElement('div');
      this.uiContainer.id = 'bilge-ui-container';
      this.shadowRoot.appendChild(this.uiContainer);
    }

    // Inject Styles into Shadow DOM
    let style = this.shadowRoot.querySelector('#bilge-ui-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'bilge-ui-style';
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
    this.forms = Array.from(document.querySelectorAll('form'));
    this.forms.forEach(form => {
      this.contextAnalyzer.analyzeFormStructure(form);
      this.fieldRelationships.set(form, 
        this.contextAnalyzer.detectFieldRelationships(form));
    });
  }

  enhanceForms() {
    this.forms.forEach(form => {
      this.injectSmartFeatures(form);
      this.enablePredictiveCompletion(form);
    });
  }

  injectSmartFeatures(form) {
    // Add UI enhancements and event listeners
    const fields = form.querySelectorAll('input, select, textarea');
    fields.forEach(field => {
      field.addEventListener('input', this.handleFieldInput.bind(this, field));
      field.addEventListener('blur', this.validateField.bind(this, field));
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
    // UI element showing prediction confidence
    const indicator = document.createElement('div');
    indicator.className = 'bilge-confidence-indicator';
    
    // Position relative to the field's viewport coordinates
    const updatePosition = () => {
      const rect = field.getBoundingClientRect();
      indicator.style.left = `${rect.right - 15 + window.scrollX}px`;
      indicator.style.top = `${rect.top + rect.height/2 - 6 + window.scrollY}px`;
    };

    updatePosition();
    this.uiContainer.appendChild(indicator);
    
    // Reposition on scroll/resize
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
  }
}

// Initialize on load
const smartFormEngine = new SmartFormEngine();
smartFormEngine.init();
