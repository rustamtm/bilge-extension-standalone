// AUTO-CORRECTOR - Self-healing corrections
class AutoCorrector {
  constructor() {
    this.correctionStrategies = new Map();
    this.loadDefaultStrategies();
  }

  applySuggestion(field, value) {
    if (this.shouldApplyAutoCorrection(field)) {
      field.value = value;
      this.showConfirmation(field, 'auto-applied');
    } else {
      this.showSuggestion(field, value);
    }
  }

  correctField(field) {
    const context = this.analyzeContext(field);
    const correction = this.findBestCorrection(field, context);
    
    if (correction) {
      field.value = correction.value;
      this.showConfirmation(field, 'corrected');
      return true;
    }
    
    return false;
  }

  findBestCorrection(field, context) {
    const strategies = this.correctionStrategies.get(field.type) || [];
    for (const strategy of strategies) {
      const correction = strategy.correct(field.value, context);
      if (correction) return correction;
    }
    return null;
  }

  shouldApplyAutoCorrection(field) {
    // High confidence corrections for non-critical fields
    return !field.dataset.bilgeCritical && 
           !['password', 'ssn', 'credit-card'].some(t => field.type.includes(t));
  }

  showSuggestion(field, suggestion) {
    const tooltip = document.createElement('div');
    tooltip.className = 'bilge-suggestion';
    tooltip.textContent = `Suggest: ${suggestion}`;
    tooltip.addEventListener('click', () => {
      field.value = suggestion;
      tooltip.remove();
    });
    
    field.parentNode.appendChild(tooltip);
  }

  showConfirmation(field, actionType) {
    const badge = document.createElement('div');
    badge.className = `bilge-confirmation bilge-${actionType}`;
    badge.textContent = actionType === 'auto-applied' ? '✓ Auto-filled' : '✓ Corrected';
    
    field.parentNode.appendChild(badge);
    setTimeout(() => badge.remove(), 3000);
  }

  loadDefaultStrategies() {
    // Email correction strategies
    this.correctionStrategies.set('email', [
      {
        name: 'domain-correction',
        correct: (value) => {
          const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
          const [user, domain] = value.split('@');
          
          if (domain && !commonDomains.includes(domain.toLowerCase())) {
            for (const common of commonDomains) {
              if (domain.toLowerCase().includes(common.split('.')[0])) {
                return { value: `${user}@${common}`, confidence: 0.8 };
              }
            }
          }
          return null;
        }
      }
    ]);
    
    // Phone number correction strategies
    this.correctionStrategies.set('tel', [
      {
        name: 'format-standardization',
        correct: (value) => {
          const digits = value.replace(/\D/g, '');
          if (digits.length === 10) {
            return { 
              value: `(${digits.substring(0,3)}) ${digits.substring(3,6)}-${digits.substring(6)}`,
              confidence: 0.9
            };
          }
          return null;
        }
      }
    ]);
  }
}