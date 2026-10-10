/** Shared-key admission limits. Application safeguards, not provider quotas. */
const fs = require('fs');

function positiveLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function estimateInput(payload) {
  const textTokens = text => {
    const value = String(text || '');
    const hindi = (value.match(/[\u0900-\u097F]/g) || []).length;
    return Math.ceil((value.length-hindi)/4+hindi/1.5);
  };
  let tokens = 0;
  for (const content of [...(payload.contents || []), ...(payload.systemInstruction ? [payload.systemInstruction] : [])]) {
    for (const part of content.parts || []) {
      tokens += textTokens(part.text);
      if (part.inlineData) {
        const resolution = String(part.mediaResolution?.level || payload.generationConfig?.mediaResolution || '').toLowerCase();
        tokens += /ultra_high/.test(resolution) ? 2240 : /low/.test(resolution) ? 280 : /medium/.test(resolution) ? 560 : 1120;
      }
    }
  }
  return tokens;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.contents) || !payload.contents.length || payload.contents.length > 50) return 'A generation request needs 1–50 content messages.';
  if (Object.keys(payload).some(key => !['contents','systemInstruction','generationConfig','safetySettings'].includes(key))) return 'Unsupported generation request field.';
  for (const content of payload.contents) {
    if (!content || !Array.isArray(content.parts) || !content.parts.length || content.parts.length > 20 || (content.role && !['user','model'].includes(content.role))) return 'Invalid content message.';
    for (const part of content.parts) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return 'Invalid content part.';
      if (Object.keys(part).some(key => !['text','inlineData','mediaResolution'].includes(key)) || (part.text != null && part.inlineData != null)) return 'Only separate text and inline image parts are enabled for this shared proxy.';
      if (typeof part.text === 'string' && part.text.length && part.mediaResolution == null) continue;
      if (part.inlineData && !Array.isArray(part.inlineData) && Object.keys(part.inlineData).every(key => ['mimeType','data'].includes(key)) && /^image\/(png|jpeg|webp|heic|heif)$/.test(part.inlineData.mimeType) && typeof part.inlineData.data === 'string' && part.inlineData.data.length) continue;
      return 'Only text and inline images are enabled for this shared proxy.';
    }
  }
  if (payload.systemInstruction != null && (!payload.systemInstruction || !Array.isArray(payload.systemInstruction.parts) || !payload.systemInstruction.parts.length || payload.systemInstruction.parts.some(part => !part || typeof part.text !== 'string' || Object.keys(part).some(key => key !== 'text')))) return 'System instructions must contain text parts.';
  // Reject tool/URI requests that can spend extra credits outside this app's
  // text/OCR contract. The browser's supported sampling settings are preserved.
  if (payload.tools || payload.cachedContent || payload.toolConfig) return 'Tools and external cached content are not enabled for this shared proxy.';
  const config = payload.generationConfig || {};
  if (typeof config !== 'object' || Array.isArray(config)) return 'Invalid generation configuration.';
  if (config.candidateCount != null && config.candidateCount !== 1) return 'Only one response candidate is enabled.';
  if (config.maxOutputTokens != null && (!Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 8192)) return 'Output limit must be between 1 and 8192 tokens.';
  if (config.responseModalities && (!Array.isArray(config.responseModalities) || config.responseModalities.some(item => item !== 'TEXT'))) return 'Only text output is enabled.';
  const thinking = config.thinkingConfig;
  if (thinking != null && (typeof thinking !== 'object' || Array.isArray(thinking))) return 'Invalid thinking configuration.';
  if (thinking && (Object.keys(thinking).some(key=>!['thinkingBudget','thinkingLevel','includeThoughts'].includes(key)) ||
      (thinking.thinkingBudget != null && (!Number.isInteger(thinking.thinkingBudget) || thinking.thinkingBudget<0 || thinking.thinkingBudget>1024)) ||
      (thinking.thinkingLevel != null && !['minimal','low','medium','high'].includes(thinking.thinkingLevel)) ||
      (thinking.thinkingBudget != null && thinking.thinkingLevel != null) ||
      (thinking.includeThoughts != null && thinking.includeThoughts!==false))) return 'Use a valid Gemini thinking budget or thinking level.';
  return null;
}

function isProviderDailyQuota(status, body) {
  if (status !== 429) return false;
  let error;
  try { error = JSON.parse(body)?.error; } catch { return false; }
  if (!error || typeof error !== 'object') return false;
  const violations = Array.isArray(error.details) ? error.details.flatMap(detail => Array.isArray(detail?.violations) ? detail.violations : []) : [];
  return violations.some(item => /per[_\s-]?day|\/day|daily/i.test(String(item?.quotaId || ''))) ||
    /\bdaily\b|\bper day\b/i.test(String(error.message || ''));
}

class ProxyBudget {
  constructor({rpm=5,tpm=12000,dailyRequests=100,dailyTokens=500000,strictInputLimit=false,file=null,now=Date.now}={}) {
    this.limits = {rpm,tpm,dailyRequests,dailyTokens};
    this.file = file;
    this.strictInputLimit = strictInputLimit;
    this.now = now;
    this.history = [];
    this.daily = null;
    this.storageError = false;
    if (file) {
      try {
        const saved = JSON.parse(fs.readFileSync(file,'utf8'));
        if (!saved || typeof saved.day !== 'string' || !Number.isSafeInteger(saved.requests) || saved.requests < 0 || !Number.isFinite(saved.tokens) || saved.tokens < 0) throw new Error('Invalid budget state');
        this.daily = saved;
        this.history = Array.isArray(saved.history) ? saved.history.filter(item => Number.isFinite(item.at) && Number.isFinite(item.tokens) && item.tokens >= 0) : [];
      } catch(error) { if (error.code !== 'ENOENT') this.storageError = true; }
    }
  }

  currentDay() {
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(this.now());
  }

  persist() {
    if (!this.file) return true;
    try {
      fs.writeFileSync(this.file+'.tmp',JSON.stringify({...this.daily,history:this.history}),{mode:0o600});
      fs.renameSync(this.file+'.tmp',this.file);
      return true;
    } catch {
      this.storageError = true;
      return false;
    }
  }

  markProviderDailyExhausted(requestDay) {
    // A response to yesterday's request must not block today's allowance.
    const day = this.currentDay();
    if (requestDay !== day) return;
    this.daily = {...(this.daily?.day === day ? this.daily : {day,requests:0,tokens:0}),providerExhausted:true};
    this.persist();
  }

  reserve(inputTokens, outputLimit) {
    if (this.storageError) return {status:503,code:'AI_BUDGET_STORAGE',message:'Shared AI budget storage is unavailable. No generation request was sent.',retryable:false};
    const now = this.now();
    if (this.strictInputLimit && inputTokens > this.limits.tpm) return {status:400,code:'AI_INPUT_BUDGET',message:'This request exceeds the configured project input limit. Choose a smaller source range.',retryable:false};
    const day = this.currentDay();
    const daily = this.daily?.day === day ? this.daily : {day,requests:0,tokens:0};
    if (daily.providerExhausted === true) return {status:429,code:'AI_DAILY_QUOTA',message:'Gemini reported an exhausted daily allowance for this project. Resume after midnight Pacific time.',retryable:false};
    // Include output reservations in the daily safety guard; these are an
    // intentionally conservative bound, not a displayed bill or token actual.
    const tokens = inputTokens + outputLimit;
    if (daily.requests >= this.limits.dailyRequests || daily.tokens+tokens > this.limits.dailyTokens) return {status:429,code:'AI_DAILY_QUOTA',message:'The application daily shared AI budget is exhausted. Resume after midnight Pacific time.',retryable:false};
    const history = this.history.filter(item => item.at > now-60000);
    const used = history.reduce((sum,item)=>sum+item.tokens,0);
    // A larger non-quiz request uses an empty minute, retaining existing study
    // feature sizes. Set TPM to the actual project limit before shared hosting.
    if (history.length >= this.limits.rpm || (history.length && used+inputTokens > this.limits.tpm)) return {status:429,code:'AI_RATE_LIMIT',message:'The application shared AI minute budget is busy. Your draft is saved; retry after the cooldown.',retryable:true,retryAfter:Math.max(1,Math.ceil((history[0].at+60050-now)/1000))};
    this.daily = {...daily,requests:daily.requests+1,tokens:daily.tokens+tokens};
    this.history = [...history,{at:now,tokens:inputTokens}];
    if (!this.persist()) return {status:503,code:'AI_BUDGET_STORAGE',message:'Shared AI budget could not be saved. No generation request was sent.',retryable:false};
    return null;
  }
}

module.exports = {ProxyBudget,positiveLimit,estimateInput,validatePayload,isProviderDailyQuota};
