import { LL } from './logger.js';

// b64e is referenced within E2E methods so must come first
export function b64e(buf){return btoa(String.fromCharCode(...(buf instanceof Uint8Array?buf:new Uint8Array(buf))));}

/* ═══ CRYPTO E2E (WebCrypto) ═══ */
// ══════════════════════════════════════════════════════════
//  E2E — Chiffrement bout en bout avec Perfect Forward Secrecy
//
//  Architecture :
//  - Clé identité ECDH P-256 (long terme, stockée IndexedDB)
//  - Clé de session éphémère ECDH P-256 (par session, en mémoire)
//  - Dérivation : HKDF sur le secret ECDH → AES-GCM 256 bits
//  - Chaque message a un IV aléatoire 96 bits
//  - La clé de session change à chaque reconnexion → PFS
//  - Un message intercepté d'une session passée ne peut pas
//    être déchiffré même si la clé identité est compromise
// ══════════════════════════════════════════════════════════
export const E2E={

  // ── Génération de paire de clés identité (long terme) ─────
  async gen(){
    const kp=await crypto.subtle.generateKey(
      {name:'ECDH',namedCurve:'P-256'},true,['deriveKey']
    );
    const pu=await crypto.subtle.exportKey('spki',kp.publicKey);
    const pr=await crypto.subtle.exportKey('pkcs8',kp.privateKey);
    return{pub:b64e(pu),priv:b64e(pr)};
  },

  // ── Génération de clé de session éphémère (PFS) ───────────
  // privKey = non-extractable → jamais sérialisable, en mémoire uniquement
  async genSession(){
    const kp=await crypto.subtle.generateKey(
      {name:'ECDH',namedCurve:'P-256'},false,['deriveKey','deriveBits']
    );
    const pu=await crypto.subtle.exportKey('spki',kp.publicKey);
    return{pub:b64e(pu),privKey:kp.privateKey,pubB64:b64e(pu)};
  },

  // ── Import clé publique ───────────────────────────────────
  async impPub(s){
    const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    return crypto.subtle.importKey('spki',b,{name:'ECDH',namedCurve:'P-256'},false,[]);
  },

  // ── Import clé privée ─────────────────────────────────────
  async impPriv(s){
    const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    return crypto.subtle.importKey('pkcs8',b,{name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
  },

  // ── Dérivation ECDH → AES-GCM (legacy — v≤2 backward compat) ─
  async deriv(myPrivKey,theirPubKey){
    return crypto.subtle.deriveKey(
      {name:'ECDH',public:theirPubKey},myPrivKey,
      {name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  },

  // ── Dérivation ECDH → HKDF → AES-GCM (identity component pour PFS) ─
  async derivHKDF(myPrivKey,theirPubKey){
    const bits=await crypto.subtle.deriveBits({name:'ECDH',public:theirPubKey},myPrivKey,256);
    const hk=await crypto.subtle.importKey('raw',bits,{name:'HKDF'},false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'HKDF',hash:'SHA-256',
       salt:new Uint8Array(32), // fixed zero salt for identity component
       info:new TextEncoder().encode('loadless-identity-v2')},
      hk,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  },

  // ── Dérivation PFS = HKDF(ECDH_identity || ECDH_session) ─────────
  // Forward secrecy : compromission clé identité seule insuffisante pour déchiffrer
  // car la clé session (en mémoire uniquement) est nécessaire
  async derivPFS(myIdentPriv,theirIdentPub,mySessionPriv,theirSessionPubB64,coupleId){
    const identBits=await crypto.subtle.deriveBits({name:'ECDH',public:theirIdentPub},myIdentPriv,256);
    const theirSessPub=await this.impPub(theirSessionPubB64);
    const sessBits=await crypto.subtle.deriveBits({name:'ECDH',public:theirSessPub},mySessionPriv,256);
    const combined=new Uint8Array(64);
    combined.set(new Uint8Array(identBits),0);
    combined.set(new Uint8Array(sessBits),32);
    const hk=await crypto.subtle.importKey('raw',combined,{name:'HKDF'},false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'HKDF',hash:'SHA-256',
       salt:new TextEncoder().encode(coupleId), // couple-specific salt
       info:new TextEncoder().encode('loadless-pfs-v1')},
      hk,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  },

  // ── Chiffrement AES-GCM 256 bits ─────────────────────────
  // IV aléatoire 96 bits + authentification intégrée
  async enc(txt,key){
    const iv=crypto.getRandomValues(new Uint8Array(12)); // 96 bits NIST recommandé
    const buf=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,tagLength:128}, // tag 128 bits = max sécurité
      key,
      new TextEncoder().encode(txt)
    );
    return{iv:b64e(iv),ct:b64e(new Uint8Array(buf)),v:2};
  },

  // ── Déchiffrement avec vérification d'authenticité ────────
  async dec(pl,key){
    try{
      if(!pl?.iv||!pl?.ct)return null;
      const iv=Uint8Array.from(atob(pl.iv),c=>c.charCodeAt(0));
      const ct=Uint8Array.from(atob(pl.ct),c=>c.charCodeAt(0));
      const plain=await crypto.subtle.decrypt(
        {name:'AES-GCM',iv,tagLength:128},
        key,ct
      );
      return new TextDecoder().decode(plain);
    }catch(e){
      // Échec = message corrompu ou clé incorrecte
      LL.log('warn','crypto','decrypt_failed',{reason:e.name});
      return null;
    }
  },

  // ── Stockage sécurisé clé privée (IndexedDB) ─────────────
  async saveK(uid,s){
    const idb=new Promise((r,j)=>{
      const rq=indexedDB.open('ll-k',2);
      rq.onupgradeneeded=e=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains('k'))db.createObjectStore('k');
        if(!db.objectStoreNames.contains('session'))db.createObjectStore('session');
      };
      rq.onsuccess=e=>{
        try{
          const tx=e.target.result.transaction('k','readwrite');
          tx.objectStore('k').put(s,uid);
          tx.oncomplete=()=>r(true);
          tx.onerror=()=>{LL.log('warn','crypto','idb_write_failed',{});r(false);};
        }catch(err){LL.log('warn','crypto','idb_tx_failed',{msg:err.message});r(false);}
      };
      rq.onerror=()=>{LL.log('warn','crypto','idb_open_failed',{});r(false);};
    });
    return Promise.race([idb,new Promise((_,j)=>setTimeout(()=>j(new Error('idb_timeout')),4000))]);
  },

  // ── Chargement clé privée ─────────────────────────────────
  async loadK(uid){
    const idb=new Promise((r,j)=>{
      const rq=indexedDB.open('ll-k',2);
      rq.onupgradeneeded=e=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains('k'))db.createObjectStore('k');
        if(!db.objectStoreNames.contains('session'))db.createObjectStore('session');
      };
      rq.onsuccess=e=>{
        const tx=e.target.result.transaction('k','readonly');
        const q=tx.objectStore('k').get(uid);
        q.onsuccess=()=>r(q.result||null);
        q.onerror=()=>r(null);
      };
      rq.onerror=()=>r(null);
    });
    return Promise.race([idb,new Promise((_,j)=>setTimeout(()=>j(new Error('idb_timeout')),4000))]);
  },

  // ── Rotation des clés (toutes les 7 jours) ────────────────
  async shouldRotate(uid){
    const lastRotation=localStorage.getItem('ll-key-rotation-'+uid);
    if(!lastRotation)return true;
    const daysSince=(Date.now()-parseInt(lastRotation))/(1000*60*60*24);
    return daysSince>7;
  },

  async markRotated(uid){
    localStorage.setItem('ll-key-rotation-'+uid,Date.now().toString());
  },

  // encryptLocal / decryptLocal supprimés — secret hardcodé = sécurité illusoire
  // Données localStorage non sensibles (préférences uniquement, pas de clés crypto)
  encryptLocal:async()=>null,
  decryptLocal:async()=>null
};
