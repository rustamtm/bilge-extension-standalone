// LEARNING MODULE - Continuous improvement
class LearningModule {
  constructor() {
    this.correctionLog = [];
    this.acceptanceRates = new Map();
  }

  recordCorrection(field, originalValue, correctedValue, accepted) {
    this.correctionLog.push({
      timestamp: Date.now(),
      field: field.name || field.id,
      form: field.form?.id || '',
      originalValue,
      correctedValue,
      accepted,
      context: {
        fieldType: field.type,
        placeholder: field.placeholder,
        nearbyFields: Array.from(field.form?.elements || [])
          .filter(f => f !== field)
          .map(f => f.name || f.id)
      }
    });
    
    this.updateAcceptanceRate(field, accepted);
    this.analyzePatterns();
  }

  updateAcceptanceRate(field, accepted) {
    const fieldId = field.name || field.id;
    if (!this.acceptanceRates.has(fieldId)) {
      this.acceptanceRates.set(fieldId, { accepted: 0, total: 0 });
    }
    
    const stats = this.acceptanceRates.get(fieldId);
    stats.total++;
    if (accepted) stats.accepted++;
  }

  analyzePatterns() {
    // Analyze correction patterns periodically
    // This would typically send data to a backend for analysis
    // For now, we'll just log insights
    const insights = {
      mostCorrectedFields: this.findMostCorrectedFields(),
      leastAcceptedCorrections: this.findLeastAcceptedCorrections(),
      commonPatterns: this.findCommonCorrectionPatterns()
    };
    
    console.log('[Bilge Learning] New insights:', insights);
    return insights;
  }

  findMostCorrectedFields() {
    const correctionCounts = new Map();
    this.correctionLog.forEach(entry => {
      const key = entry.field;
      correctionCounts.set(key, (correctionCounts.get(key) || 0) + 1);
    });
    
    return Array.from(correctionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }

  // ... other analysis methods
}