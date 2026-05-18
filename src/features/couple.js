// src/features/couple.js
import { A } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { LL } from '../lib/logger.js'
import { E2E, b64e } from '../lib/crypto.js'

/* ═══ E2E KEY MANAGEMENT ═══ */
async function setupKeys(){
  const uid=A.user.id;
  let privB=await E2E.loadK(uid);
  const{data:p}=await withTO(sb.from('profiles').select('public_key').eq('id',uid).single()).catch(()=>({data:null}));

  if(!privB||!p?.public_key){
    // Première fois sur cet appareil — générer une paire
    LL.log('info','crypto','generating_new_keypair');
    const kp=await E2E.gen();
    await E2E.saveK(uid,kp.priv);
    const{error}=await withTO(sb.from('profiles').update({public_key:kp.pub}).eq('id',uid)).catch(e=>({error:e}));
    if(error){
      LL.log('error','crypto','failed_to_store_public_key',{message:error.message});
      toast('Erreur initialisation clés E2E','error');
      return;
    }
    privB=kp.priv;
    A._myPubKey=kp.pub;
    await E2E.markRotated(uid);
    LL.log('info','crypto','keypair_generated_and_stored');
  } else {
    // Clé existante — vérifier si rotation nécessaire (7 jours)
    A._myPubKey=p.public_key;
    const lastRotation=localStorage.getItem('ll-key-rotation-'+uid);
    if(!lastRotation){
      await E2E.markRotated(uid);
      LL.log('info','crypto','rotation_timestamp_restored');
    } else {
      const needsRotation=await E2E.shouldRotate(uid);
      if(needsRotation){
        LL.log('info','crypto','rotating_identity_key');
        const kp=await E2E.gen();
        await E2E.saveK(uid,kp.priv);
        const{error}=await withTO(sb.from('profiles').update({public_key:kp.pub}).eq('id',uid)).catch(e=>({error:e}));
        if(!error){
          privB=kp.priv;
          A._myPubKey=kp.pub;
          await E2E.markRotated(uid);
          if(A.partner?.id){
            localStorage.removeItem('ll-fp-'+uid+'-'+A.partner.id);
          }
          toast('🔑 Clés de sécurité renouvelées. Revérifiez avec votre partenaire.','info',5000);
          LL.log('info','crypto','keypair_rotated');
        }
      } else {
        LL.log('info','crypto','existing_keypair_loaded');
      }
    }
  }
  A._pk=privB;
}

// ✅ Calcule un fingerprint court d'une clé publique base64
async function computeFingerprint(pubKeyB64){
  try{
    const raw=Uint8Array.from(atob(pubKeyB64),c=>c.charCodeAt(0));
    const hash=await crypto.subtle.digest('SHA-256',raw);
    const hex=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
    // Afficher sous forme lisible : 4 groupes de 4 hex
    return hex.slice(0,4)+':'+hex.slice(4,8)+':'+hex.slice(8,12)+':'+hex.slice(12,16);
  }catch{return 'inconnu';}
}

async function buildKey(){
  if(!A.partner?.public_key||!A._pk){
    A.sharedKey=null;
    A._partnerPubKeyCached=null;
    A._partnerFingerprint=null;
    return;
  }
  try{
    const newPubKey=A.partner.public_key;
    const storageKey='ll-fp-'+A.user.id+'-'+A.partner.id;
    const knownFingerprint=localStorage.getItem(storageKey);
    const newFingerprint=await computeFingerprint(newPubKey);

    if(knownFingerprint&&knownFingerprint!==newFingerprint){
      // ✅ Clé changée : bloquer et demander confirmation explicite
      // Guard: ne toast qu'une fois par fingerprint unique (retry loop appelle buildKey 3×)
      if(!A._keyPendingConfirmation||A._keyPendingConfirmation.fingerprint!==newFingerprint){
        A.sharedKey=null;
        A._keyPendingConfirmation={pubKey:newPubKey,fingerprint:newFingerprint};
        toast(
          '⚠️ La clé de sécurité de '+esc(A.partner.username)+' a changé ('+newFingerprint+'). '+
          'Vérifiez avec votre partenaire avant de confirmer.',
          'error', 0 // 0 = pas de disparition automatique
        );
        A._keyChangeAlert=true;
        if(document.getElementById('ch-ms'))renderMsgs();
      }
      return;
    }

    // Clé OK ou première connexion — stocker le fingerprint
    localStorage.setItem(storageKey,newFingerprint);
    A._partnerFingerprint=newFingerprint;
    A._partnerPubKeyCached=newPubKey;
    A._keyChangeAlert=false;

    const myPr=await E2E.impPriv(A._pk);
    const thPu=await E2E.impPub(newPubKey);
    A.sharedKey=await E2E.deriv(myPr,thPu);
    // Initialiser les clés de session PFS (async, ne bloque pas le chat)
    if(!A._pfsSetupInProgress){setupPFS().catch(e=>LL.log('warn','crypto','pfs_init_failed',{msg:e.message}));}
  }catch(e){
    A.sharedKey=null;
    toast('Erreur dérivation clé E2E — chat désactivé','error');
  }
}

/* ═══ ASYNC CRYPTO INIT (hors spinner) ═══ */
async function _initCryptoAsync(){
  // Warm-up WebCrypto : force l'init du hardware keystore Android avant les vraies ops
  // Évite le blocage du thread V8 sur cold start (bug Android WebView + TEE)
  try{
    await Promise.race([
      crypto.subtle.digest('SHA-256',new Uint8Array(1)),
      new Promise((_,r)=>setTimeout(()=>r(new Error('warmup_timeout')),3000))
    ]);
  }catch(e){
    LL.log('warn','crypto','warmup_failed',{msg:e?.message});
  }

  let attempt=0;
  const MAX=3;
  const DELAYS=[0,2000,5000];

  const tryBuild=async()=>{
    attempt++;
    try{
      await Promise.race([
        buildKey(),
        new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),8000))
      ]);
      if(A.sharedKey){
        LL.log('info','crypto','build_key_success',{attempt});
        await decryptMsgs(); // re-déchiffrer A.raw avec la vraie clé (placeholders effacés)
        if(document.getElementById('p-chat')?.classList.contains('active'))renderMsgs();
        return;
      }
    }catch(e){
      LL.log('warn','crypto','build_key_attempt_failed',{attempt,msg:e?.message});
    }
    if(attempt<MAX){
      setTimeout(tryBuild,DELAYS[attempt]);
    }else{
      LL.log('error','crypto','build_key_all_failed',{});
      toast('Chiffrement indisponible — chat désactivé. Relancez l\'app.','error',0);
    }
  };

  A._cryptoInitPending=true;
  await tryBuild();
  A._cryptoInitPending=false;
}

/* ═══ PFS SESSION KEY MANAGEMENT ═══ */
// Retourne la meilleure clé disponible pour chiffrer
function _activeKey(){return A.pfsKey||A.sharedKey;}
// Version du message selon la clé utilisée (3=PFS, 2=identity)
function _activeVer(){return A.pfsKey?3:2;}

async function setupPFS(){
  if(A._pfsSetupInProgress||!A.couple||!A.user||!A._pk||!A.partner?.public_key)return;
  A._pfsSetupInProgress=true;
  try{
    const eph=await E2E.genSession();
    A._sessionPrivKey=eph.privKey; // CryptoKey non-extractable, en mémoire uniquement
    A._sessionPubKey=eph.pub;
    await sb.from('chat_sessions').upsert({
      couple_id:A.couple.id,user_id:A.user.id,
      session_pub_key:eph.pub,
      expires_at:new Date(Date.now()+86400000).toISOString()
    },{onConflict:'couple_id,user_id'});
    await refreshPFSKey();
    LL.log('info','crypto','pfs_session_published');
  }catch(e){
    LL.log('warn','crypto','pfs_setup_failed',{msg:e.message});
  }finally{
    A._pfsSetupInProgress=false;
  }
}

async function refreshPFSKey(){
  if(!A._sessionPrivKey||!A._pk||!A.partner?.public_key||!A.couple)return;
  try{
    const{data:sessions}=await sb.from('chat_sessions')
      .select('session_pub_key,user_id').eq('couple_id',A.couple.id);
    const partnerSession=sessions?.find(s=>s.user_id!==A.user.id);
    if(!partnerSession){A.pfsKey=null;A._pfsReady=false;LL.log('info','crypto','pfs_waiting_partner');return;}
    const myIdentPriv=await E2E.impPriv(A._pk);
    const theirIdentPub=await E2E.impPub(A.partner.public_key);
    A.pfsKey=await E2E.derivPFS(myIdentPriv,theirIdentPub,A._sessionPrivKey,partnerSession.session_pub_key,A.couple.id);
    A._pfsReady=true;
    LL.log('info','crypto','pfs_ready');
    if(document.getElementById('p-chat')?.classList.contains('active'))renderMsgs();
  }catch(e){
    A.pfsKey=null;A._pfsReady=false;
    LL.log('warn','crypto','pfs_refresh_failed',{msg:e.message});
  }
}

// ✅ L'utilisateur confirme explicitement la nouvelle clé du partenaire
// BUG FIX B14: guard against missing partner
async function confirmPartnerKeyChange(){
  if(!A.partner) return;
  if(!A._keyPendingConfirmation)return;
  if(!A.partner||!A.user){toast('Partenaire introuvable.','error');return;}
  const storageKey='ll-fp-'+A.user.id+'-'+A.partner.id;
  localStorage.setItem(storageKey,A._keyPendingConfirmation.fingerprint);
  A.partner.public_key=A._keyPendingConfirmation.pubKey;
  A._keyPendingConfirmation=null;
  A._keyChangeAlert=false;
  await buildKey();
  toast('Nouvelle clé confirmée. Chat rétabli.','success');
  renderMsgs();
}

async function loadPartner(){
  if(!A.couple)return;
  const pid=A.couple.partner1_id===A.user.id?A.couple.partner2_id:A.couple.partner1_id;
  if(!pid)return;
  const{data}=await withTO(sb.from('profiles').select('*').eq('id',pid).single()).catch(()=>({data:null}));
  A.partner=data;
}

/* ═══ COUPLE SETUP ═══ */
function cpSh(v){['ch','cr','jo','ok'].forEach(x=>{const el=document.getElementById('cp-'+x);if(el)el.style.display=x===v?'block':'none';});}

async function doCreate(){
  const nm=document.getElementById('cc-n').value.trim()||'Notre foyer';
  const btn=document.querySelector('#cp-cr .btn-cp');btn.disabled=true;btn.textContent='Création…';
  const msg=document.getElementById('cc-m');
  try{
    // ✅ Fonction SQL sécurisée : crée le couple ET met à jour couple_id atomiquement
    const{data,error}=await sb.rpc('create_couple_secure',{p_name:nm});
    if(error)throw error;
    if(data?.error){
      const errMap={
        'not_authenticated':'Vous devez être connecté·e.',
        'already_in_couple':'Vous êtes déjà dans un foyer.'
      };
      msg.textContent=errMap[data.error]||data.message||'Erreur inconnue.';
      msg.className='cp-msg err';msg.style.display='block';
      btn.disabled=false;btn.textContent='Créer →';return;
    }
    // Charger le couple complet depuis la base
    const{data:couple}=await sb.from('couples').select('*').eq('id',data.couple_id).single();
    A.couple=couple;
    document.getElementById('inv-cd').textContent=data.invite_code;
    cpSh('ok');
  }catch(e){
    msg.textContent='Erreur: '+e.message;msg.className='cp-msg err';msg.style.display='block';
    btn.disabled=false;btn.textContent='Créer →';
  }
}

async function doJoin(){
  const code=document.getElementById('cj-c').value.trim().toUpperCase();
  if(code.length<6){const m=document.getElementById('cj-m');m.textContent='Code invalide (minimum 6 caractères).';m.className='cp-msg err';m.style.display='block';return;}
  const btn=document.querySelector('#cp-jo .btn-cp');btn.disabled=true;btn.textContent='Vérification…';
  const msg=document.getElementById('cj-m');
  try{
    // ✅ Utilise la fonction SQL sécurisée côté serveur
    const{data,error}=await sb.rpc('join_couple',{p_invite_code:code});
    if(error)throw error;
    if(data?.error){
      const errMap={
        'not_authenticated':'Vous devez être connecté·e.',
        'already_in_couple':'Vous êtes déjà dans un foyer.',
        'invalid_code':'Code invalide ou introuvable.',
        'own_couple':'Vous avez créé ce foyer — partagez le code à votre partenaire.',
        'couple_full':'Ce foyer a déjà deux membres.',
        'code_expired':'Ce code d\'invitation a expiré. Demandez un nouveau code à votre partenaire.',
        'rate_limited':'Trop de tentatives. Réessayez dans 15 minutes.'
      };
      msg.textContent=errMap[data.error]||data.message||'Erreur inconnue.';
      msg.className='cp-msg err';msg.style.display='block';
      btn.disabled=false;btn.textContent='Rejoindre →';return;
    }
    // Recharger le couple depuis la base
    const{data:couple}=await sb.from('couples').select('*').eq('id',data.couple_id).single();
    A.couple=couple;
    await loadPartner();await buildKey();launchApp();
  }catch(e){
    msg.textContent='Erreur: '+e.message;msg.className='cp-msg err';msg.style.display='block';
    btn.disabled=false;btn.textContent='Rejoindre →';
  }
}

export { setupKeys, computeFingerprint, buildKey, _initCryptoAsync, _activeKey, _activeVer, setupPFS, refreshPFSKey, confirmPartnerKeyChange, loadPartner, cpSh, doCreate, doJoin }
