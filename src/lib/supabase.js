import { LL, sanitizePayload } from './logger.js';
import { A } from './state.js';

const SURL = 'https://lalpmkyxzapiheadvckp.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhbHBta3l4emFwaWhlYWR2Y2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzY5MTAsImV4cCI6MjA5MzQxMjkxMH0.18_Frxi23QLbtL1qQgV1MJ7MoU7751rJeCgnIkD35bI';
export const OSID = '0da139d7-cee4-4b49-a4cb-37a4d3fae0dc';

// supabase.min.js loaded via <script> in index.html → window.supabase global
export const sb = window.supabase.createClient(SURL, SKEY);

export function auditLog(action, detail = {}) {
  const sanitized = sanitizePayload(detail);
  LL.log('info', 'audit', action, { ts: new Date().toISOString(), action, detail: sanitized });
  if (A.user) {
    (async()=>{try{await sb.rpc('log_audit_event',{p_action:action,p_detail:sanitized});}catch{}})();
  }
}

// Wire auditLog into LL so other modules calling LL.auditLog() work
LL.auditLog = auditLog;
