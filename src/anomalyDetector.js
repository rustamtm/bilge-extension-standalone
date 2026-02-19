// ANOMALY DETECTOR - Statistical deviation detection
class AnomalyDetector {
  constructor() {
    this.fieldRules = new Map();
    this.loadDefaultRules();
  }

  detect(field) {
    const value = field.value;
    if (!value) return 0; // No anomaly if empty
    
    // 1. Check against field type rules
    const typeScore = this.checkTypeRules(field.type, value);
    
    // 2. Check against pattern rules
    const patternScore = this.checkPatternRules(field, value);
    
    // 3. Check against statistical norms
    const statisticalScore = this.checkStatisticalNorms(field, value);
    
    // Weighted average of detection scores
    return (typeScore * 0.4) + (patternScore * 0.3) + (statisticalScore * 0.3);
  }

  checkTypeRules(type, value) {
    const rules = this.fieldRules.get(type) || [];
    for (const rule of rules) {
      if (!rule.validator(value)) {
        return rule.severity;
      }
    }
    return 0;
  }

  checkPatternRules(field, value) {
    // Example: Email pattern validation
    if (field.type === 'email' || field.name.includes('email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) return 0.8;
    }
    
    // Add more pattern checks as needed
    return 0;
  }

  checkStatisticalNorms(field, value) {
    // Placeholder for statistical analysis
    // Could use ML model in future
    return 0;
  }

  loadDefaultRules() {
    this.fieldRules.set('text', [
      {
        name: 'max-length',
        validator: (v) => v.length <= 255,
        severity: 0.7
      }
    ]);
    
    this.fieldRules.set('email', [
      {
        name: 'valid-format',
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        severity: 0.9
      }
    ]);
    
    this.fieldRules.set('tel', [
      {
        name: 'phone-format',
        validator: (v) => /^[\d\s\(\)\-\+]+$/.test(v),
        severity: 0.6
      },
      {
        name: 'min-length',
        validator: (v) => v.replace(/\D/g, '').length >= 7,
        severity: 0.7
      }
    ]);
  }
}