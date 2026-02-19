// CONTEXT ANALYZER - Understands form relationships
class ContextAnalyzer {
  analyzeFormStructure(form) {
    const structure = {
      fieldCount: form.elements.length,
      groupedFields: this.detectFieldGroups(form),
      commonPatterns: this.findCommonPatterns(form)
    };
    return structure;
  }

  detectFieldRelationships(form) {
    const relationships = new Map();
    const fields = form.elements;
    
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const related = [];
      
      // Detect label relationships
      if (field.labels && field.labels.length > 0) {
        related.push(...Array.from(field.labels).map(label => label.textContent));
      }
      
      // Detect proximity-based relationships
      if (i > 0) {
        const prevField = fields[i-1];
        if (this.areFieldsRelated(field, prevField)) {
          related.push(prevField.name || prevField.id);
        }
      }
      
      relationships.set(field.name || field.id, related);
    }
    
    return relationships;
  }

  areFieldsRelated(field1, field2) {
    // Check visual proximity
    const rect1 = field1.getBoundingClientRect();
    const rect2 = field2.getBoundingClientRect();
    const verticalDistance = Math.abs(rect1.bottom - rect2.top);
    
    // Check semantic similarity
    const nameSimilarity = this.calculateNameSimilarity(
      field1.name || field1.id, 
      field2.name || field2.id
    );
    
    return verticalDistance < 30 && nameSimilarity > 0.6;
  }

  calculateNameSimilarity(name1, name2) {
    // Implementation of similarity algorithm
    // ...
  }
}