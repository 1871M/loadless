// Logger structuré LoadLess

const MAX_EVENTS = 200; // max en mémoire, FIFO
const events = [];
const SENSITIVE = ['password','ciphertext','iv','_pk','key','token','email','secret'];

export function sanitizePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.some(s => k.toLowerCase().includes(s))) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 50) + '…[truncated]';
    } else if (typeof v === 'object') {
      out[k] = sanitizePayload(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function log(level, module, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,   // 'info' | 'warn' | 'error'
    module,  // 'auth' | 'realtime' | 'crypto' | 'rpc' | 'ui'
    event,   // description courte
    data: sanitizePayload(data)
  };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();

  // Console uniquement en développement (localhost)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[LL:${module}] ${event}`, entry.data);
  }
  // En prod : seulement les erreurs en console
  else if (level === 'error') {
    console.error(`[LL:${module}] ${event}`); // pas de data en prod
  }
}

function getEvents(level = null) {
  return level ? events.filter(e => e.level === level) : [...events];
}

function exportLogs() {
  // Utile pour le debug — retourne une copie nettoyée
  return JSON.stringify(getEvents(), null, 2);
}

export const LL = { log, getEvents, exportLogs, auditLog: null };

// Keep window error listeners
window.addEventListener('error', e => {
  log('error', 'global', 'uncaught_error', {
    message: e.message,
    filename: e.filename?.split('/').pop(), // juste le nom du fichier
    lineno: e.lineno
  });
});
window.addEventListener('unhandledrejection', e => {
  log('error', 'global', 'unhandled_promise', {
    reason: String(e.reason).slice(0, 100)
  });
});
