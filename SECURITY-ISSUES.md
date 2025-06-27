# Security Issues & Fixes

## Critical Security Vulnerabilities

### 1. Cross-Site Scripting (XSS) Vulnerabilities
**Location**: `popup.js` lines 129-147
**Issue**: Direct DOM manipulation without sanitization
```javascript
// Vulnerable code:
element.innerHTML = unsanitizedContent;
```
**Fix**: Sanitize all text content before DOM insertion
```javascript
function sanitizeText(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

### 2. Overly Broad Permissions
**Location**: `manifest.json` line 14
**Issue**: `<all_urls>` grants excessive access
**Fix**: Restrict to specific domains:
```json
{
  "host_permissions": [
    "https://*.wikipedia.org/*",
    "https://red-heart-d66e.simon-kral99.workers.dev/*"
  ]
}
```

### 3. Unsafe URL Construction
**Location**: `popup.js` lines 138, 398
**Issue**: URLs created without validation
**Fix**: Validate URLs before use:
```javascript
function createSafeUrl(url) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
```

### 4. API Key Exposure Risk
**Location**: `trace-worker/src/index.ts`
**Issue**: Worker logs could expose API responses
**Fix**: Sanitize logs and limit response data logging

### 5. Missing Input Validation
**Location**: `background.js`, `popup.js`
**Issue**: No validation of selected text content
**Fix**: Validate input before processing:
```javascript
function validateSelectedText(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.trim().length < 3) return false;
  if (text.length > 1000) return false;
  return true;
}
```

## Implementation Priority
1. **Immediate**: Fix XSS vulnerabilities
2. **High**: Restrict manifest permissions
3. **High**: Add URL validation
4. **Medium**: Implement input validation
5. **Medium**: Sanitize logging