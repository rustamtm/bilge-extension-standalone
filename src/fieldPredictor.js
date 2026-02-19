// FIELD PREDICTOR - Predictive completion engine
class FieldPredictor {
  constructor() {
    this.patterns = new Map();
    this.userHistory = new Map();
  }

  predict(field) {
    const context = this.analyzeContext(field);
    const prediction = {
      value: '',
      confidence: 0,
      source: 'heuristic'
    };

    // 1. Check user history patterns
    if (this.userHistory.has(field.name)) {
      const history = this.userHistory.get(field.name);
      prediction.value = history.mostCommonValue;
      prediction.confidence = history.confidence;
      prediction.source = 'history';
    }
    
    // 2. Check field patterns
    else if (this.patterns.has(field.type)) {
      const pattern = this.patterns.get(field.type);
      prediction.value = pattern.generate(field);
      prediction.confidence = pattern.confidence;
      prediction.source = 'pattern';
    }
    
    // 3. Cross-field prediction
    else if (field.form) {
      const relatedValue = this.predictFromRelatedFields(field);
      if (relatedValue) {
        prediction.value = relatedValue.value;
        prediction.confidence = relatedValue.confidence;
        prediction.source = 'cross-field';
      }
    }

    return prediction;
  }

  analyzeContext(field) {
    return {
      formId: field.form?.id || '',
      fieldType: field.type,
      fieldName: field.name,
      placeholder: field.placeholder,
      label: field.labels?.[0]?.textContent || '',
      nearbyFields: this.getNearbyFields(field)
    };
  }

  getNearbyFields(field, radius=3) {
    const form = field.form;
    if (!form) return [];
    
    const fields = Array.from(form.elements);
    const index = fields.indexOf(field);
    const start = Math.max(0, index - radius);
    const end = Math.min(fields.length, index + radius + 1);
    
    return fields.slice(start, end).filter(f => f !== field);
  }

  predictFromRelatedFields(field) {
    // Implementation for cross-field prediction
    // Example: email -> username, first name -> last name
    return null;
  }

  recordUserInput(field, value) {
    if (!field.name) return;
    
    if (!this.userHistory.has(field.name)) {
      this.userHistory.set(field.name, {
        values: [],
        timestamps: [],
        mostCommonValue: '',
        confidence: 0
      });
    }
    
    const history = this.userHistory.get(field.name);
    history.values.push(value);
    history.timestamps.push(Date.now());
    
    // Update most common value
    const valueCounts = new Map();
    history.values.forEach(v => {
      valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
    });
    
    let maxCount = 0;
    let commonValue = '';
    valueCounts.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        commonValue = value;
      }
    });
    
    history.mostCommonValue = commonValue;
    history.confidence = maxCount / history.values.length;
  }
}