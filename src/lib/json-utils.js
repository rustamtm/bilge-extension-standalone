/**
 * Robust JSON extraction from LLM responses.
 * Ported from mac_agent/planner.py pattern.
 */

export function findJsonEndIndex(s) {
  let depth = 0;
  let inString = false;
  let escape = false;
  let started = false;
  
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        depth++;
        started = true;
      } else if (char === '}' || char === ']') {
        depth--;
        if (started && depth === 0) return i + 1;
      }
    }
  }
  return s.length;
}

export function extractJsonPayload(text) {
  if (!text) throw new Error("empty");
  let t = String(text).trim();

  // unwrap first fenced block that looks like JSON
  if (t.includes("```")) {
    const parts = t.split("```");
    for (const part of parts) {
      const c = part.trim();
      // Handle language tags (e.g. ```json)
      let cleaned = c;
      const lines = c.split('\n');
      if (lines.length > 1 && !lines[0].trim().startsWith('{') && !lines[0].trim().startsWith('[')) {
        cleaned = lines.slice(1).join('\n').trim();
      }
      
      if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
        t = cleaned;
        break;
      }
    }
  }

  // fast path
  try {
    return JSON.parse(t);
  } catch (e) {
    // continue to fallback
  }

  // fallback: decode first JSON object/array in string
  const i1 = t.indexOf("{");
  const i2 = t.indexOf("[");
  const starts = [i1, i2].filter(i => i !== -1);
  if (!starts.length) throw new Error("no json start");
  const start = Math.min(...starts);

  // JS has no raw_decode; do a bracket-balance scan
  const s = t.slice(start);
  const end = findJsonEndIndex(s);
  return JSON.parse(s.slice(0, end));
}
