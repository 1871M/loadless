import './styles/variables.css'
import './styles/components.css'
import './styles/pages.css'
import { LL } from './lib/logger.js'
import { t, applyLang, TRANS } from './lib/i18n.js'
import { A, CATS, SCATS, FREQ, MON, DAY, sanitizeColor, ALLOWED_COLORS } from './lib/state.js'
import { E2E, b64e } from './lib/crypto.js'
import { sb, OSID, auditLog } from './lib/supabase.js'
import {
  toast, showSc, hideL, loadStep, showPage, isP, openM, closeM, cMO,
  launchApp, loadAll, loadMeals, loadMoreMsgs, loadMoreTx, decryptMsgs,
  setupRT, openDrawer, closeDrawer, toggleDrawer,
  esc, fd, fdFR, fmtE, cap, getMon, copyCode, updatePill, trapFocus,
  quickAdd, initSkeletons, bootApp
} from './features/boot.js'
import { authTab, doLogin, doRegister, doForgot, withTO, onAuth, _refreshProfileAndCouple } from './features/auth.js'
import { setupKeys, buildKey, confirmPartnerKeyChange, loadPartner, cpSh, doCreate, doJoin, _initCryptoAsync, setupPFS, refreshPFSKey, computeFingerprint, _activeKey, _activeVer } from './features/couple.js'
import { renderHome, getSugs } from './features/home.js'
import { renderTasks, renderTL, buildTC, setF, _patchTask, claim, release, delT, openTaskModal, editTask, saveTask, onPsTg, setPrio, updPU, sePositionner, seRetirer, togT } from './features/tasks.js'
import { renderShop, renderShopItems, openShopModal, saveShopItem, addShop, togShop, delShop, clearDone, editShop } from './features/shopping.js'
import { renderBudget, _reloadTxs, changeBudgetMonth, openTx, saveTx, delTx, editAccount, saveAccount, deleteAccountConfirm, detectSubscriptions, renderDetectedSubs, toggleSubsList } from './features/budget.js'
import { renderMeals, selectMealSlot, openMealM, saveMeal, editMeal, delMeal, wkNav, getMealIngr, addIngrToShop } from './features/meals.js'
import { renderEquity, calcEquity, buildEqPerson, saveAvail, showEquityHistory } from './features/equity.js'
import { renderCalendar, openCalModal, editCalEvent, saveCalEvent, delCalEvent, loadCalEvents, calSelectDate, calNav, selectCalColor } from './features/calendar.js'
import {
  renderMsgs, chSdPressStart, chSdPressEnd, sendMsg, chKey, chResize,
  sendMediaMsg, openAttachMenu, closeAttachMenu, pickMedia, pickFile, handleMediaPick, handleFilePick,
  micPressStart, micPressMove, micPressEnd, micPressCancel, stopAndSendRecording, cancelRecording,
  updBadge, setEphDur, togEph, setEphSetting, applyEphCustom
} from './features/chat.js'
import {
  renderSettings, doSignOut, delAccount, saveProfile, setPref, applyPrefs,
  openProfileEdit, pickProfilePhoto, handleProfilePhotoPick, showHelpModal,
  saveNotifPref, rotateInviteCode, showFingerprint, regenerateMyKey
} from './features/settings.js'

const BackupManager = {
  async exportBackup() {
    const pwd = await BackupManager._promptPwd('Choisissez un mot de passe pour chiffrer la sauvegarde :', 'Exporter')
    if (!pwd) return
    try {
      if (typeof argon2 === 'undefined') throw new Error('argon2 non chargé — rechargez la page.')
      const payload = { v: 2, date: new Date().toISOString(), tasks: A.tasks || [], shop: A.shop || [], accounts: A.accounts || [], txs: A.txs || [], calEvents: A.calEvents || [], meals: A.meals || {} }
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const result = await argon2.hash({ pass: pwd, salt, type: argon2.ArgonType.Argon2id, mem: 65536, time: 3, hashLen: 32, parallelism: 1, wasmPath: '/assets/lib/argon2.wasm' })
      const key = await crypto.subtle.importKey('raw', result.hash, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
      const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)))
      const file = JSON.stringify({ v: 2, kdf: 'argon2id', mem: 65536, time: 3, salt: b64e(salt), iv: b64e(iv), data: b64e(new Uint8Array(enc)) })
      const blob = new Blob([file], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'loadless-backup-' + new Date().toISOString().slice(0, 10) + '.llbk'; a.click(); URL.revokeObjectURL(url)
      LL.auditLog?.('export_backup')
      toast('Sauvegarde téléchargée !', 'success')
    } catch (e) { toast('Erreur export : ' + e.message, 'error') }
  },
  async importBackup() {
    const file = await new Promise(resolve => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.llbk,application/json'; inp.onchange = () => resolve(inp.files[0] || null); inp.click() })
    if (!file) return
    let envelope
    try { envelope = JSON.parse(await file.text()) } catch { toast('Fichier invalide.', 'error'); return }
    if (![1, 2].includes(envelope.v) || !envelope.salt || !envelope.iv || !envelope.data) { toast('Format non reconnu.', 'error'); return }
    const pwd = await BackupManager._promptPwd('Mot de passe de la sauvegarde :', 'Déchiffrer')
    if (!pwd) return
    let payload
    try {
      const salt = Uint8Array.from(atob(envelope.salt), c => c.charCodeAt(0))
      const iv = Uint8Array.from(atob(envelope.iv), c => c.charCodeAt(0))
      const ct = Uint8Array.from(atob(envelope.data), c => c.charCodeAt(0))
      let key
      if (envelope.v === 2) {
        if (typeof argon2 === 'undefined') throw new Error('argon2 non chargé — rechargez la page.')
        const result = await argon2.hash({ pass: pwd, salt, type: argon2.ArgonType.Argon2id, mem: envelope.mem || 65536, time: envelope.time || 3, hashLen: 32, parallelism: 1, wasmPath: '/assets/lib/argon2.wasm' })
        key = await crypto.subtle.importKey('raw', result.hash, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
      } else {
        const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), { name: 'PBKDF2' }, false, ['deriveKey'])
        key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
      }
      payload = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)))
    } catch { toast('Mot de passe incorrect ou fichier corrompu.', 'error'); return }
    const counts = [(payload.tasks || []).length + ' tâches', (payload.shop || []).length + ' articles', (payload.accounts || []).length + ' comptes', (payload.txs || []).length + ' transactions', (payload.calEvents || []).length + ' événements'].join(', ')
    if (!confirm('Restaurer : ' + counts + ' ?\n\nLes données existantes seront fusionnées (upsert par id).')) return
    const cid = A.couple.id
    const tables = [
      { tbl: 'tasks', d: (payload.tasks || []).map(r => ({ ...r, couple_id: cid })) },
      { tbl: 'shopping_items', d: (payload.shop || []).map(r => ({ ...r, couple_id: cid })) },
      { tbl: 'accounts', d: (payload.accounts || []).map(r => ({ ...r, couple_id: cid })) },
      { tbl: 'transactions', d: (payload.txs || []).map(r => ({ ...r, couple_id: cid })) },
      { tbl: 'calendar_events', d: (payload.calEvents || []).map(r => ({ ...r, couple_id: cid })) },
      { tbl: 'meals', d: Object.values(payload.meals || {}).map(m => ({ ...m, couple_id: cid })) },
    ]
    let errs = 0
    for (const { tbl, d } of tables) {
      if (!d.length) continue
      const { error } = await sb.from(tbl).upsert(d, { onConflict: 'id' })
      if (error) { errs++; LL.log('error', 'backup', 'import_' + tbl, { msg: error.message }) }
    }
    toast(errs ? 'Restauration partielle (' + errs + ' erreur(s)).' : 'Restauration réussie !', errs ? 'error' : 'success')
    if (!errs) await launchApp()
  },
  _promptPwd(msg, btnLabel) {
    return new Promise(resolve => {
      const ov = document.createElement('div')
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)'
      const box = document.createElement('div')
      box.style.cssText = 'background:var(--surface);border-radius:20px;padding:24px;width:100%;max-width:360px;box-shadow:var(--sh-lg)'
      const title = document.createElement('div'); title.style.cssText = 'font-family:Lora,serif;font-size:18px;font-weight:700;margin-bottom:8px'; title.textContent = '\u{1F510} Sauvegarde'
      const sub = document.createElement('div'); sub.style.cssText = 'font-size:13px;color:var(--muted);margin-bottom:16px'; sub.textContent = msg
      const inp = document.createElement('input'); inp.type = 'password'; inp.placeholder = 'Mot de passe…'; inp.setAttribute('autocomplete', 'new-password'); inp.style.cssText = 'width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box'
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:16px'
      const bCx = document.createElement('button'); bCx.style.cssText = 'flex:1;padding:10px;border:1.5px solid var(--border);border-radius:10px;background:none;cursor:pointer;font-size:13px'; bCx.textContent = 'Annuler'
      const bOk = document.createElement('button'); bOk.style.cssText = 'flex:1;padding:10px;background:var(--p1);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700'; bOk.textContent = btnLabel
      row.appendChild(bCx); row.appendChild(bOk); box.appendChild(title); box.appendChild(sub); box.appendChild(inp); box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov)
      bCx.onclick = () => { ov.remove(); resolve(null) }
      bOk.onclick = () => { const v = inp.value; ov.remove(); resolve(v || null) }
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value; ov.remove(); resolve(v || null) } })
      setTimeout(() => inp.focus(), 50)
    })
  }
}

Object.assign(window, {
  LL, t, applyLang, TRANS, A, CATS, SCATS, FREQ, MON, DAY, sanitizeColor, ALLOWED_COLORS,
  E2E, b64e, sb, OSID, auditLog,
  toast, showSc, hideL, loadStep, showPage, isP, openM, closeM, cMO,
  launchApp, loadAll, loadMeals, loadMoreMsgs, loadMoreTx, decryptMsgs,
  setupRT, openDrawer, closeDrawer, toggleDrawer,
  esc, fd, fdFR, fmtE, cap, getMon, copyCode, updatePill, trapFocus, quickAdd, initSkeletons,
  authTab, doLogin, doRegister, doForgot, withTO, onAuth, _refreshProfileAndCouple,
  setupKeys, buildKey, confirmPartnerKeyChange, loadPartner, cpSh, doCreate, doJoin,
  _initCryptoAsync, setupPFS, refreshPFSKey, computeFingerprint, _activeKey, _activeVer,
  renderHome, getSugs,
  renderTasks, renderTL, buildTC, setF, _patchTask, claim, release, delT, openTaskModal,
  editTask, saveTask, onPsTg, setPrio, updPU, sePositionner, seRetirer, togT,
  renderShop, renderShopItems, openShopModal, saveShopItem, addShop, togShop, delShop, clearDone, editShop,
  renderBudget, _reloadTxs, changeBudgetMonth, openTx, saveTx, delTx, editAccount, saveAccount,
  deleteAccountConfirm, detectSubscriptions, renderDetectedSubs, toggleSubsList,
  renderMeals, selectMealSlot, openMealM, saveMeal, editMeal, delMeal, wkNav, getMealIngr, addIngrToShop,
  renderEquity, calcEquity, buildEqPerson, saveAvail, showEquityHistory,
  renderCalendar, openCalModal, editCalEvent, saveCalEvent, delCalEvent, loadCalEvents,
  calSelectDate, calNav, selectCalColor,
  renderMsgs, chSdPressStart, chSdPressEnd, sendMsg, chKey, chResize,
  sendMediaMsg, openAttachMenu, closeAttachMenu, pickMedia, pickFile, handleMediaPick, handleFilePick,
  micPressStart, micPressMove, micPressEnd, micPressCancel, stopAndSendRecording, cancelRecording,
  updBadge, setEphDur, togEph, setEphSetting, applyEphCustom,
  renderSettings, doSignOut, delAccount, saveProfile, setPref, applyPrefs,
  openProfileEdit, pickProfilePhoto, handleProfilePhotoPick, showHelpModal,
  saveNotifPref, rotateInviteCode, showFingerprint, regenerateMyKey,
  BackupManager,
})

bootApp()

;(async () => {
  loadStep('Initialisation…')

  try {
    const prefs = JSON.parse(localStorage.getItem('ll-prefs') || '{}')
    document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion === true)
    document.documentElement.classList.add('high-contrast')
    document.documentElement.classList.toggle('large-text', prefs.largeText === true)
  } catch {}
  applyLang()
  initSkeletons()

  const _urlTab = new URLSearchParams(location.search).get('tab')
  if (_urlTab) {
    history.replaceState({}, '', '/')
    sessionStorage.setItem('ll-open-tab', _urlTab)
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Mise à jour disponible. Rechargez la page pour en profiter.', 'info', 8000)
          }
        })
      })
    } catch (e) { console.warn('SW registration failed:', e) }
  }

  window.addEventListener('offline', () => {
    toast('Connexion perdue — mode hors-ligne', 'error', 0)
    let bar = document.getElementById('offline-bar')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = 'offline-bar'
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#7F1D1D;color:#fff;text-align:center;padding:8px;font-size:12px;font-weight:700;z-index:9999;animation:toastIn .3s ease'
      bar.textContent = '\u{1F4E1} Hors ligne — vos données sont protégées'
      document.body.appendChild(bar)
    }
  })
  window.addEventListener('online', () => {
    document.getElementById('offline-bar')?.remove()
    toast('Connexion rétablie — synchronisation…', 'success', 3000)
    if (A.couple) {
      setTimeout(async () => {
        try { await loadAll(); if (isP('tasks')) renderTasks(); if (isP('budget')) renderBudget(); if (isP('chat')) renderMsgs() }
        catch {}
      }, 1000)
    }
  })

  try { A.avail = JSON.parse(localStorage.getItem('ll-av') || '{}') } catch {}

  loadStep('Connexion…')
  let _fastUser = null
  try {
    const _raw = localStorage.getItem('sb-lalpmkyxzapiheadvckp-auth-token')
    if (_raw) { const _p = JSON.parse(_raw); _fastUser = _p?.user || null }
  } catch {}

  const _hasCacheFull = _fastUser &&
    localStorage.getItem('ll-cache-me-' + _fastUser.id) &&
    localStorage.getItem('ll-cache-couple-' + _fastUser.id)

  if (_hasCacheFull) {
    try { await onAuth(_fastUser) } catch (e) { LL.log('error', 'boot', 'onauth_crashed', { msg: e?.message || String(e) }); showSc('s-auth'); hideL() }
    ;(async () => {
      try {
        const { data } = await sb.auth.getSession()
        if (!data?.session) await sb.auth.signOut()
      } catch (e) { LL.log('warn', 'boot', 'bg_session_check_failed', { msg: e?.message }) }
    })()
  } else {
    let session
    try {
      const _gstTm = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      const { data } = await Promise.race([sb.auth.getSession(), _gstTm])
      session = data?.session
    } catch (e) {
      showSc('s-auth'); hideL()
      toast('Connexion lente. Vérifiez votre réseau et réessayez.', 'error', 6000)
      return
    }
    try {
      if (session?.user) { await onAuth(session.user) }
      else { showSc('s-auth'); hideL() }
    } catch (e) {
      LL.log('error', 'boot', 'onauth_crashed', { msg: e?.message || String(e) })
      showSc('s-auth'); hideL()
      toast('Erreur au démarrage. Réessayez.', 'error', 6000)
    }
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === 'SIGNED_IN' && session && !A.user) {
        await onAuth(session.user)
      } else if (event === 'SIGNED_OUT') {
        if (A.user) { localStorage.removeItem('ll-cache-me-' + A.user.id); localStorage.removeItem('ll-cache-couple-' + A.user.id) }
        A.user = null; A.me = null; A.couple = null; A.partner = null
        A._pk = null; A.sharedKey = null; A.pfsKey = null
        A._sessionPrivKey = null; A._sessionPubKey = null; A._myPubKey = null
        A._pfsReady = false; A._pfsSetupInProgress = false; A._cryptoInitPending = false
        showSc('s-auth'); hideL()
      } else if (event === 'PASSWORD_RECOVERY') {
        showSc('s-auth'); authTab('login'); hideL()
        toast('Définissez un nouveau mot de passe.', 'info')
      } else if (event === 'TOKEN_REFRESHED') {
        // session renewed silently
      } else if (event === 'USER_UPDATED') {
        if (A.me) await onAuth(session.user)
      }
    } catch (e) {
      LL.log('error', 'boot', 'auth_state_change_crashed', { msg: e?.message || String(e) })
      showSc('s-auth'); hideL()
    }
  })

  // Safety net : si le loader est toujours visible après 15s → force écran auth
  setTimeout(()=>{
    const l=document.getElementById('loader');
    if(l&&l.style.display!=='none'){
      LL.log('warn','boot','loader_timeout_safety');
      hideL();showSc('s-auth');
      toast('Délai de connexion dépassé. Réessayez.','error',5000);
    }
  },15000);
})()
