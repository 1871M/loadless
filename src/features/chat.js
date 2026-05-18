import { A, sanitizeColor } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { E2E, b64e } from '../lib/crypto.js'
import { LL } from '../lib/logger.js'
import { toast, esc, openM, closeM, isP } from './boot.js'
import { _activeKey, _activeVer } from './couple.js'

let _eph=false;
let _ephPressTimer=null;
export function chSdPressStart(e){_ephPressTimer=setTimeout(()=>{_ephPressTimer=null;togEph();},600);}
export function chSdPressEnd(e){if(_ephPressTimer){clearTimeout(_ephPressTimer);_ephPressTimer=null;}}
export function renderMsgs(){
  const wrap=document.getElementById('ch-ms');if(!wrap)return;
  // ✅ Marquer que l'utilisateur a vu les messages maintenant
  if(A.couple&&A.user){
    const seenKey='ll-seen-'+A.couple.id+'-'+A.user.id;
    localStorage.setItem(seenKey,new Date().toISOString());
    // Lire quand le partenaire a vu pour la dernière fois
    if(A.partner){
      const partnerKey='ll-seen-'+A.couple.id+'-'+A.partner.id;
      A._partnerSeenAt=localStorage.getItem(partnerKey)||null;
    }
  }

  // ✅ Alerte changement de clé partenaire — demande confirmation explicite
  if(A._keyChangeAlert&&A._keyPendingConfirmation){
    wrap.innerHTML='<div class="empty"><div class="ei">⚠️</div>'
      +'<p style="margin-bottom:12px"><strong>Clé de sécurité modifiée</strong><br>'
      +'<small style="color:var(--muted)">La clé de '+esc(A.partner?.username||'votre partenaire')+' a changé.<br>'
      +'Nouveau fingerprint :<br><code style="font-size:11px;background:var(--bg);padding:3px 7px;border-radius:5px">'+esc(A._keyPendingConfirmation.fingerprint||'')+'</code></small></p>'
      +'<p style="font-size:12px;color:var(--muted);margin-bottom:14px">Vérifiez ce code avec votre partenaire avant de confirmer.</p>'
      +'<button onclick="confirmPartnerKeyChange()" style="background:var(--p1);color:#fff;border:none;border-radius:11px;padding:11px 20px;font-family:Outfit,sans-serif;font-size:13px;font-weight:700;cursor:pointer">Confirmer la nouvelle clé</button>'
      +'</div>';
    return;
  }

  // ✅ Chat désactivé : raison claire (ou init en cours)
  if(!A.sharedKey){
    const initPending=A._cryptoInitPending;
    const title=initPending?'Chiffrement en cours…':'Chat désactivé';
    const reason=initPending
      ? 'Patientez quelques secondes.'
      : !A.partner
        ? 'Invitez votre partenaire pour activer le chat chiffré.'
        : 'En attente de la clé de votre partenaire. Il·elle doit se connecter au moins une fois.';
    wrap.innerHTML='<div class="empty"><div class="ei">🔐</div><p>'+title+'<br><small style="color:var(--muted)">'+reason+'</small></p></div>';
    return;
  }

  if(!A.msgs.length){
    // ✅ Wording honnête sur le chiffrement (point 8)
    const fp=A._partnerFingerprint?'<br><small style="color:var(--faint);font-size:10px">Fingerprint partenaire : '+esc(A._partnerFingerprint)+'</small>':'';
    wrap.innerHTML='<div class="empty"><div class="ei">💬</div><p>Messages chiffrés de bout en bout sur cet appareil.<br><small style="color:var(--muted)">Vérifiez la clé de votre partenaire pour une sécurité maximale.</small>'+fp+'</p></div>';
    return;
  }
  let lastDay='';wrap.innerHTML='';
  A.msgs.forEach(msg=>{
    const d=new Date(msg.created_at);
    const day=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    if(day!==lastDay){lastDay=day;const sep=document.createElement('div');sep.className='ch-sp';sep.textContent=day;wrap.appendChild(sep);}
    const isMe=msg.sender_id===A.user.id;
    const sender=isMe?A.me:A.partner;const col=sanitizeColor(sender?.avatar_color);
    const div=document.createElement('div');div.className='msg '+(isMe?'mine':'theirs');
    const time=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    // ✅ Confirmation de lecture : ✓ = envoyé, ✓✓ = vu (partenaire a ouvert le chat)
    const readStatus=isMe?(A._partnerSeenAt&&new Date(A._partnerSeenAt)>new Date(msg.created_at)?'<span style="color:rgba(255,255,255,.9);font-size:10px" title="Lu">✓✓</span>':'<span style="color:rgba(255,255,255,.5);font-size:10px" title="Envoyé">✓</span>'):'';
    const _bbs='background:'+col+';box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)';
    const msgContent=msg.media_type?_renderMediaBubble(msg,isMe,col)
      :msg._pfs_expired?('<div class="msg-bb" style="'+(isMe?_bbs:'')+'"><span style="color:var(--muted);font-style:italic;font-size:12px">🔒 Session E2E expirée</span></div>')
      :('<div class="msg-bb" style="'+(isMe?_bbs:'')+'">'+esc(msg.txt||'')+'</div>');
    div.innerHTML='<div class="msg-av" style="background:'+col+'22;color:'+col+'">'+(sender?.username||'?')[0].toUpperCase()+'</div>'
      +'<div>'+(!isMe?'<div class="msg-sn">'+esc(sender?.username||'')+'</div>':'')
      +msgContent
      +'<div class="msg-mt"><span>'+time+'</span><span class="e2e">🔒 chiffré</span>'+readStatus+(msg.expires_at?'<span style="color:var(--orange);font-size:9px">⏱</span>':'')+'</div></div>';
    wrap.appendChild(div);
  });
  // ✅ Bouton "charger plus" si messages supplémentaires disponibles
  if(A.msgHasMore){
    const btn=document.createElement('button');
    btn.style.cssText='display:block;margin:8px auto;background:none;border:1.5px solid var(--border);border-radius:9px;padding:7px 16px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;font-family:Outfit,sans-serif';
    btn.textContent='Charger les messages précédents';
    btn.onclick=async()=>{btn.textContent='Chargement…';btn.disabled=true;await loadMoreMsgs();renderMsgs();};
    wrap.insertBefore(btn,wrap.firstChild);
  }
  setTimeout(()=>{const w=document.getElementById('ch-ms');if(w)w.scrollTop=w.scrollHeight;},50);
}
export async function sendMsg(){
  const inp=document.getElementById('ch-in');
  const text=inp.value.trim();
  if(!text)return;

  // ✅ Bloquer si pas de clé partagée — jamais de texte clair en base
  if(!A.sharedKey){
    if(!A.partner){
      toast('Invitez d\'abord votre partenaire pour activer le chat chiffré.','error',5000);
    } else if(A._cryptoInitPending){
      toast('Chiffrement en cours d\'initialisation, patientez…','info',3000);
    } else {
      toast('Clé de chiffrement manquante. Votre partenaire doit se connecter au moins une fois.','error',5000);
    }
    return;
  }

  let enc;
  try{
    enc=await E2E.enc(text,_activeKey());
  }catch(e){
    toast('Échec du chiffrement — message non envoyé.','error');
    return;
  }

  // ✅ Triple vérification avant envoi
  if(!enc?.ct||!enc?.iv||enc.ct.length<10||enc.iv.length<5){
    LL.log('error','crypto','send_failed_invalid_ciphertext');
    toast('Erreur de chiffrement — message non envoyé.','error');
    return;
  }
  // ✅ Vérifier que le ciphertext est bien du base64 valide
  try{atob(enc.ct);atob(enc.iv);}catch{
    LL.log('error','crypto','send_failed_invalid_base64');
    toast('Erreur de chiffrement — message non envoyé.','error');
    return;
  }

  const payload={
    couple_id:A.couple.id,
    sender_id:A.user.id,
    ciphertext:enc.ct,
    iv:enc.iv,
    version:_activeVer()
  };
  if(_eph)payload.expires_at=new Date(Date.now()+_ephDur).toISOString();

  const{error}=await sb.from('messages').insert(payload);
  if(error){
    if(error.code==='42501')toast('Accès refusé — vérifiez votre session.','error');
    else toast('Erreur envoi: '+error.message,'error');
    return;
  }
  inp.value='';inp.style.height='auto';
}
export function chKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
export function chResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,110)+'px';}


const _MAX_MEDIA_CACHE=50;
const _mediaCache=new Map(); // LRU — voir _addToMediaCache
const _audioPlayers=new Map();
const _msgMeta=new Map(); // msgId → {url, iv, name, type}

// LRU cache avec révocation automatique des blob URLs (prévient fuite mémoire)
export function _addToMediaCache(key,url){
  if(_mediaCache.size>=_MAX_MEDIA_CACHE){
    const oldKey=_mediaCache.keys().next().value;
    URL.revokeObjectURL(_mediaCache.get(oldKey));
    _mediaCache.delete(oldKey);
  }
  _mediaCache.set(key,url);
}

// Chiffrement fichier ArrayBuffer → {iv, encrypted}
export async function _encFile(buffer){
  const key=_activeKey();
  if(!key)throw new Error('Chiffrement non disponible — réessayez dans un instant');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const enc=await crypto.subtle.encrypt({name:'AES-GCM',iv,tagLength:128},key,buffer);
  return{iv:b64e(iv),encrypted:new Uint8Array(enc)};
}

// Déchiffrement fichier (essaie PFS puis identity key si v=3)
export async function _decFile(encBuffer,ivB64,version){
  const iv=Uint8Array.from(atob(ivB64),c=>c.charCodeAt(0));
  const key=version===3?(A.pfsKey||A.sharedKey):A.sharedKey;
  if(!key)return null;
  try{
    return await crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},key,encBuffer);
  }catch{
    if(version===3&&A.sharedKey&&A.pfsKey){
      return crypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},A.sharedKey,encBuffer);
    }
    throw new Error('Déchiffrement fichier échoué');
  }
}

// Upload vers R2 via presigned URL (Supabase Edge Function)
export async function _uploadMedia(file){
  const{data,error}=await sb.functions.invoke('get-upload-url',{body:{mediaType:file.type}});
  if(error||!data?.uploadUrl)throw new Error(error?.message||'Erreur presigned URL');
  const buffer=await file.arrayBuffer();
  const{iv,encrypted}=await _encFile(buffer);
  const res=await fetch(data.uploadUrl,{method:'PUT',body:encrypted,headers:{'Content-Type':'application/octet-stream'}});
  if(!res.ok)throw new Error('Erreur upload R2: '+res.status);
  return{key:data.key,iv};
}

// Download + déchiffrement depuis R2
export async function _downloadMedia(mediaUrl,iv,version){
  if(_mediaCache.has(mediaUrl))return _mediaCache.get(mediaUrl);
  const{data,error}=await sb.functions.invoke('get-download-url',{body:{key:mediaUrl}});
  if(error||!data?.downloadUrl)return null;
  const res=await fetch(data.downloadUrl);
  if(!res.ok)return null;
  const encBuffer=await res.arrayBuffer();
  const plain=await _decFile(encBuffer,iv,version||2);
  const url=URL.createObjectURL(new Blob([plain]));
  _addToMediaCache(mediaUrl,url);
  return url;
}

// Compression image (canvas → JPEG)
export async function _compressImage(file,maxPx=1920,quality=0.82){
  return new Promise(resolve=>{
    const img=new Image();
    const u=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(u);
      let w=img.width,h=img.height;
      if(w>maxPx||h>maxPx){const r=Math.min(maxPx/w,maxPx/h);w=Math.round(w*r);h=Math.round(h*r);}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      c.toBlob(b=>resolve(b||file),'image/jpeg',quality);
    };
    img.onerror=()=>{URL.revokeObjectURL(u);resolve(file);};
    img.src=u;
  });
}

// Envoi message media
export async function sendMediaMsg(file,mediaType,mediaDuration){
  if(!A.sharedKey){toast('Chat chiffré non disponible.','error');return;}
  if(!A.couple||!A.user){toast('Session expirée.','error');return;}
  const MAX=100*1024*1024;
  if(file.size>MAX){toast('Fichier trop grand (max 100MB).','error');return;}
  let upload=file;
  if(mediaType==='image')upload=await _compressImage(file);
  const tmpId='tmp-'+Date.now();
  const ver=_activeVer();
  const optimistic={id:tmpId,couple_id:A.couple.id,sender_id:A.user.id,ciphertext:'[MEDIA_ENCRYPTED]',iv:'',version:ver,
    media_type:mediaType,media_name:file.name,media_size:upload.size,media_duration:mediaDuration||null,media_url:null,
    created_at:new Date().toISOString(),_uploading:true,txt:null};
  A.msgs.push(optimistic);renderMsgs();
  try{
    const{key,iv:fileIv}=await _uploadMedia(upload);
    let payload;
    if(ver===3){
      // v=3 : métadonnées chiffrées dans ciphertext — rien en clair en DB
      const metaJson=JSON.stringify({_m:1,t:mediaType,n:file.name,s:upload.size,d:mediaDuration||0,fiv:fileIv});
      const enc=await E2E.enc(metaJson,_activeKey());
      if(!enc){throw new Error('Chiffrement métadonnées échoué');}
      payload={couple_id:A.couple.id,sender_id:A.user.id,ciphertext:enc.ct,iv:enc.iv,version:3,
        media_url:key,media_type:null,media_name:null,media_size:null,media_duration:null};
    }else{
      payload={couple_id:A.couple.id,sender_id:A.user.id,ciphertext:'[MEDIA_ENCRYPTED]',iv:fileIv,version:2,
        media_url:key,media_type:mediaType,media_name:file.name,media_size:upload.size,media_duration:mediaDuration||null};
    }
    if(_eph)payload.expires_at=new Date(Date.now()+_ephDur).toISOString();
    const{error}=await sb.from('messages').insert(payload);
    if(error)throw new Error(error.message);
    A.msgs=A.msgs.filter(m=>m.id!==tmpId);renderMsgs();
  }catch(e){
    A.msgs=A.msgs.filter(m=>m.id!==tmpId);renderMsgs();
    const msg=e.message||'erreur inconnue';
    LL.log('error','media','send_failed',{msg});
    toast('Envoi échoué: '+msg,'error',7000);
  }
}

// Rendu bulle media
export function _renderMediaBubble(msg,isMe,col){
  const id=msg.id,url=msg.media_url||'',iv=msg._fileIv||msg.iv||'',up=msg._uploading;
  const cs=isMe?'box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)':'';
  // Stocker metadata pour éviter escaping de noms de fichiers dans onclick
  if(url)_msgMeta.set(id,{url,iv,name:msg.media_name||'fichier',type:msg.media_type,version:msg.version||2});
  if(msg.media_type==='audio'){
    const secs=msg.media_duration||0;
    const dur=Math.floor(secs/60)+':'+(secs%60+'').padStart(2,'0');
    return '<div class="msg-audio'+(up?' msg-sending':'')+'">'+
      '<button class="msg-audio-btn" onclick="_playAudioById(\''+id+'\')" id="abtn-'+id+'">▶</button>'+
      '<div class="msg-audio-track">'+
        '<div class="msg-audio-bar" onclick="_seekAudio(event,\''+id+'\')"><div class="msg-audio-prog" id="apr-'+id+'"></div></div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between">'+
          '<span class="msg-audio-dur" id="adur-'+id+'">'+dur+'</span>'+
          '<button class="msg-audio-spd" id="aspd-'+id+'" onclick="_cycleSpeed(\''+id+'\')">1x</button>'+
        '</div>'+
      '</div></div>';
  }
  if(msg.media_type==='image'||msg.media_type==='video'){
    const t=msg.media_type;
    const cached=url&&_mediaCache.has(url)?_mediaCache.get(url):null;
    const ph=t==='video'?'🎬':'🖼';
    const inner=cached?(t==='image'?'<img src="'+cached+'" alt="" loading="lazy">':'<video src="'+cached+'" playsinline muted>')
      :'<div class="msg-img-ph" id="mimg-'+id+'">'+(up?'📤':ph)+'</div>';
    if(!cached&&url&&!up)setTimeout(()=>_loadImgThumb(id,url,iv,t,msg.version||2),50);
    return '<div class="msg-img-wrap'+(up?' msg-sending':'')+'"'+(up?'':' onclick="_viewMediaById(\''+id+'\')"')+' style="'+(isMe?'background:'+col:'background:var(--surface)')+'">'+inner+'</div>';
  }
  // fichier
  const ext=(msg.media_name||'').split('.').pop().toLowerCase();
  const icon=['pdf'].includes(ext)?'📕':['doc','docx'].includes(ext)?'📘':['xls','xlsx'].includes(ext)?'📗':['zip','rar','7z'].includes(ext)?'📦':'📄';
  const sz=msg.media_size?(msg.media_size>1024*1024?(msg.media_size/1024/1024).toFixed(1)+'MB':Math.round(msg.media_size/1024)+'KB'):'';
  return '<div class="msg-file'+(up?' msg-sending':'')+'"'+(up?'':' onclick="_dlFileById(\''+id+'\')"')+' style="'+(isMe?'background:'+col+';'+cs:'')+'">'+
    '<span class="msg-file-icon">'+icon+'</span>'+
    '<div class="msg-file-info"><div class="msg-file-name">'+esc(msg.media_name||'Fichier')+'</div><div class="msg-file-size">'+sz+'</div></div>'+
    '<span style="font-size:18px">'+(up?'⏳':'⬇️')+'</span></div>';
}

// Charger thumbnail image/vidéo après rendu
export async function _loadImgThumb(msgId,mediaUrl,iv,type,version){
  const ph=document.getElementById('mimg-'+msgId);if(!ph)return;
  ph.textContent='⏳';
  const objUrl=await _downloadMedia(mediaUrl,iv,version||2);
  if(!objUrl){ph.textContent=type==='video'?'🎬':'🖼';return;}
  const wrap=ph.parentElement;if(!wrap)return;
  if(type==='image'){const img=document.createElement('img');img.src=objUrl;img.alt='';img.loading='lazy';wrap.replaceChild(img,ph);}
  else{const v=document.createElement('video');v.src=objUrl;v.playsinline=true;v.muted=true;wrap.replaceChild(v,ph);}
}

// Lecteur audio (lookup metadata par ID — évite escaping de paramètres)
export async function _playAudioById(msgId){
  const meta=_msgMeta.get(msgId);if(!meta)return;
  const btn=document.getElementById('abtn-'+msgId);
  const prog=document.getElementById('apr-'+msgId);
  const dur=document.getElementById('adur-'+msgId);
  if(_audioPlayers.has(msgId)){
    const a=_audioPlayers.get(msgId);
    if(a.paused){a.play();}else{a.pause();}
    return;
  }
  if(btn)btn.textContent='⏳';
  const objUrl=await _downloadMedia(meta.url,meta.iv,meta.version||2);
  if(!objUrl){toast('Erreur chargement audio.','error');if(btn)btn.textContent='▶';return;}
  const audio=new Audio(objUrl);
  _audioPlayers.set(msgId,audio);
  audio.ontimeupdate=()=>{
    if(!audio.duration)return;
    const p=(audio.currentTime/audio.duration)*100;
    if(prog)prog.style.width=p+'%';
    const rem=Math.ceil(audio.duration-audio.currentTime);
    if(dur)dur.textContent=Math.floor(rem/60)+':'+(rem%60+'').padStart(2,'0');
  };
  audio.onended=()=>{if(btn)btn.textContent='▶';if(prog)prog.style.width='0%';};
  audio.onplay=()=>{if(btn)btn.textContent='⏸';};
  audio.onpause=()=>{if(btn)btn.textContent='▶';};
  audio.play();
}
export function _seekAudio(e,msgId){
  const a=_audioPlayers.get(msgId);if(!a||!a.duration)return;
  const bar=e.currentTarget;const r=bar.getBoundingClientRect();
  a.currentTime=((e.clientX-r.left)/r.width)*a.duration;
}
const _SPD=[0.5,1,1.15,1.3,1.5,1.75,2];
const _msgSpd=new Map();
export function _cycleSpeed(msgId){
  const cur=_msgSpd.get(msgId)||1;
  const idx=_SPD.indexOf(cur);
  const next=_SPD[(idx+1)%_SPD.length];
  _msgSpd.set(msgId,next);
  const btn=document.getElementById('aspd-'+msgId);
  if(btn)btn.textContent=next+'x';
  const a=_audioPlayers.get(msgId);
  if(a)a.playbackRate=next;
}
export function _cycleVideoSpeed(v,btn){
  const cur=parseFloat(btn.textContent)||1;
  const idx=_SPD.indexOf(cur);
  const next=_SPD[(idx+1)%_SPD.length];
  btn.textContent=next+'x';
  v.playbackRate=next;
}

// Plein écran image/vidéo
export async function _viewMediaById(msgId){
  const meta=_msgMeta.get(msgId);if(!meta)return;
  const objUrl=await _downloadMedia(meta.url,meta.iv,meta.version||2);
  if(!objUrl){toast('Erreur chargement.','error');return;}
  const ov=document.createElement('div');ov.className='ch-fullscreen-ov';
  ov.onclick=(e)=>{if(e.target===ov)document.body.removeChild(ov);};
  if(meta.type==='image'){
    const img=document.createElement('img');img.src=objUrl;img.style.cssText='max-width:95vw;max-height:90vh;object-fit:contain;border-radius:8px;cursor:default;';ov.appendChild(img);
  } else {
    const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:10px;';
    const v=document.createElement('video');v.src=objUrl;v.controls=true;v.autoplay=true;v.style.cssText='max-width:95vw;max-height:80vh;border-radius:8px;cursor:default;';
    const spdBtn=document.createElement('button');spdBtn.className='ch-spd-btn';spdBtn.textContent='1x';
    spdBtn.onclick=(e)=>{e.stopPropagation();_cycleVideoSpeed(v,spdBtn);};
    wrap.appendChild(v);wrap.appendChild(spdBtn);ov.appendChild(wrap);
  }
  document.body.appendChild(ov);
}

// Télécharger fichier
export async function _dlFileById(msgId){
  const meta=_msgMeta.get(msgId);if(!meta)return;
  const objUrl=await _downloadMedia(meta.url,meta.iv,meta.version||2);
  if(!objUrl){toast('Erreur téléchargement.','error');return;}
  const a=document.createElement('a');a.href=objUrl;a.download=meta.name;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

// Menu pièce jointe
export function openAttachMenu(){
  const m=document.getElementById('ch-att-menu');if(!m)return;
  m.classList.toggle('on');
}
export function closeAttachMenu(){document.getElementById('ch-att-menu')?.classList.remove('on');}
export function pickMedia(){closeAttachMenu();document.getElementById('ch-fi-media')?.click();}
export function pickFile(){closeAttachMenu();document.getElementById('ch-fi-file')?.click();}
export async function handleMediaPick(input){
  const file=input.files?.[0];if(!file)return;input.value='';
  const isVid=file.type.startsWith('video/');
  if(isVid&&file.size>100*1024*1024){toast('Vidéo trop grande (max 100MB).','error');return;}
  _showMediaPreview(file,isVid?'video':'image');
}
export async function handleFilePick(input){
  const file=input.files?.[0];if(!file)return;input.value='';
  if(file.size>100*1024*1024){toast('Fichier trop grand (max 100MB).','error');return;}
  _showMediaPreview(file,'file');
}
export function _showMediaPreview(file,mediaType){
  const ov=document.createElement('div');ov.className='ch-preview-ov';
  const objUrl=URL.createObjectURL(file);
  let mediaEl;
  if(mediaType==='image'){
    mediaEl=document.createElement('img');mediaEl.src=objUrl;mediaEl.className='ch-preview-media';
  } else if(mediaType==='video'){
    mediaEl=document.createElement('video');mediaEl.src=objUrl;mediaEl.className='ch-preview-media';mediaEl.controls=true;
  } else {
    mediaEl=document.createElement('div');
    const sz=file.size>1024*1024?(file.size/1024/1024).toFixed(1)+'MB':Math.round(file.size/1024)+'KB';
    mediaEl.style.cssText='color:#fff;text-align:center;padding:20px';
    mediaEl.innerHTML='<div style="font-size:48px">📄</div><div style="font-size:16px;font-weight:700;margin-top:10px">'+esc(file.name)+'</div><div style="font-size:13px;opacity:.7;margin-top:4px">'+sz+'</div>';
  }
  const btns=document.createElement('div');btns.className='ch-preview-btns';
  const cancelBtn=document.createElement('button');cancelBtn.className='ch-preview-btn cancel';cancelBtn.textContent='Annuler';
  const sendBtn=document.createElement('button');sendBtn.className='ch-preview-btn send';sendBtn.textContent='Envoyer';
  cancelBtn.onclick=()=>{URL.revokeObjectURL(objUrl);document.body.removeChild(ov);};
  sendBtn.onclick=async()=>{
    URL.revokeObjectURL(objUrl);document.body.removeChild(ov);
    await sendMediaMsg(file,mediaType);
  };
  btns.appendChild(cancelBtn);btns.appendChild(sendBtn);
  ov.appendChild(mediaEl);ov.appendChild(btns);
  document.body.appendChild(ov);
}

// Enregistrement vocal
let _isRecording=false,_mediaRecorder=null,_recChunks=[],_recTimerInterval=null;
let _recSeconds=0,_recStartX=0,_recCancelled=false;
const _MAX_REC_SECS=300;

export function micPressStart(e){
  if(!A.sharedKey){toast('Chat chiffré non disponible.','error');return;}
  e.preventDefault();
  _recStartX=e.clientX||e.touches?.[0]?.clientX||0;
  _recCancelled=false;
  try{document.getElementById('ch-mic-btn')?.setPointerCapture(e.pointerId);}catch(_){}
  startRecording();
}
export function micPressMove(e){
  if(!_isRecording)return;
  const dx=(e.clientX||0)-_recStartX;
  const h=document.getElementById('ch-rec-hint');
  if(h)h.style.color=dx<-40?'var(--red,#ef4444)':'var(--muted)';
}
export function micPressEnd(e){
  if(!_isRecording)return;
  const dx=(e.clientX||0)-_recStartX;
  if(dx<-60){cancelRecording();return;}
  stopAndSendRecording();
}
export function micPressCancel(){cancelRecording();}

export async function startRecording(){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _recChunks=[];_recSeconds=0;_isRecording=true;
    const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
    _mediaRecorder=new MediaRecorder(stream,{mimeType:mime});
    _mediaRecorder.ondataavailable=e=>{if(e.data.size>0)_recChunks.push(e.data);};
    _mediaRecorder.start(100);
    document.getElementById('ch-rec-bar')?.classList.add('on');
    document.getElementById('ch-mic-btn')?.classList.add('rec');
    _recTimerInterval=setInterval(()=>{
      _recSeconds++;
      const t=document.getElementById('ch-rec-time');
      if(t)t.textContent=Math.floor(_recSeconds/60)+':'+((_recSeconds%60)+'').padStart(2,'0');
      if(_recSeconds>=_MAX_REC_SECS)stopAndSendRecording();
    },1000);
  }catch(e){_isRecording=false;toast('Microphone inaccessible: '+e.message,'error');}
}

export function _stopRecCleanup(){
  clearInterval(_recTimerInterval);_isRecording=false;
  _mediaRecorder?.stream?.getTracks().forEach(t=>t.stop());_mediaRecorder=null;
  document.getElementById('ch-rec-bar')?.classList.remove('on');
  document.getElementById('ch-mic-btn')?.classList.remove('rec');
  const h=document.getElementById('ch-rec-hint');if(h)h.style.color='var(--muted)';
}

export function cancelRecording(){
  if(!_isRecording)return;
  _recCancelled=true;
  if(_mediaRecorder?.state!=='inactive')_mediaRecorder.stop();
  _stopRecCleanup();_recChunks=[];
  toast('Enregistrement annulé.','info');
}

export function stopAndSendRecording(){
  if(!_isRecording||!_mediaRecorder)return;
  const secs=_recSeconds;
  _mediaRecorder.onstop=async()=>{
    if(_recCancelled)return;
    const blob=new Blob(_recChunks,{type:'audio/webm'});_recChunks=[];
    if(blob.size<200){toast('Enregistrement trop court.','info');return;}
    const file=new File([blob],'voice-'+Date.now()+'.webm',{type:'audio/webm'});
    await sendMediaMsg(file,'audio',secs);
  };
  if(_mediaRecorder.state!=='inactive')_mediaRecorder.stop();
  _stopRecCleanup();
}

// Fermer menu pièce jointe au clic extérieur
document.addEventListener('click',e=>{
  if(!e.target.closest('#ch-att-menu')&&!e.target.closest('#ch-att-btn'))closeAttachMenu();
});
export function updBadge(){
  const b=document.getElementById('ch-bd');if(b){b.style.display=A.unread>0?'block':'none';b.textContent=A.unread>0?A.unread:'';}
  const nb=document.getElementById('nd-ch-bd');if(nb){nb.className='nd-badge'+(A.unread>0?' show':'');nb.textContent=A.unread>0?A.unread:'';}
}


let _ephDur=86400000;
export function setEphDur(v){
  if(v==='custom'){
    const sel=document.getElementById('eph-dur');
    const d=prompt('Durée personnalisée (en minutes) :');
    const ms=d&&!isNaN(parseInt(d))?parseInt(d)*60000:86400000;
    _ephDur=ms;
    const opt=document.createElement('option');opt.value=ms;opt.textContent='Perso. '+Math.round(ms/60000)+'min';opt.selected=true;
    sel.insertBefore(opt,sel.lastElementChild);sel.value=ms;
    return;
  }
  _ephDur=parseInt(v)||86400000;
}
export function togEph(){
  A.eph=!A.eph;
  _eph=A.eph;
  document.getElementById('ch-et')?.classList.toggle('on',A.eph);
  document.getElementById('ch-eb').style.display=A.eph?'flex':'none';
  const btn=document.getElementById('ch-sd-btn');
  if(btn)btn.style.background=_eph?'var(--gold)':'var(--p1d)';
}
export function setEphSetting(v){
  const prefs=JSON.parse(localStorage.getItem('ll-prefs')||'{}');
  const customDiv=document.getElementById('st-eph-custom');
  if(v==='off'){
    prefs.ephDur='off';
    _eph=false;A.eph=false;
    if(customDiv)customDiv.style.display='none';
    toast('Messages éphémères désactivés','info',1500);
  } else if(v==='custom'){
    if(customDiv)customDiv.style.display='block';
    return;
  } else {
    prefs.ephDur=v;
    _eph=true;A.eph=true;
    _ephDur=parseInt(v);
    if(customDiv)customDiv.style.display='none';
    toast('Messages éphémères activés ✓','success',1500);
  }
  localStorage.setItem('ll-prefs',JSON.stringify(prefs));
  const chEb=document.getElementById('ch-eb');
  if(chEb)chEb.style.display=_eph?'flex':'none';
  const btn=document.getElementById('ch-sd-btn');
  if(btn)btn.style.background=_eph?'var(--gold)':'var(--p1d)';
  const chEt=document.getElementById('ch-et');
  if(chEt)chEt.classList.toggle('on',A.eph);
}
export function applyEphCustom(val){
  const hours=parseFloat(val);
  if(!hours||hours<=0)return;
  const ms=Math.round(hours*3600000);
  _eph=true;A.eph=true;_ephDur=ms;
  const prefs=JSON.parse(localStorage.getItem('ll-prefs')||'{}');
  prefs.ephDur=String(ms);
  localStorage.setItem('ll-prefs',JSON.stringify(prefs));
  const chEb=document.getElementById('ch-eb');
  if(chEb)chEb.style.display='flex';
  const btn=document.getElementById('ch-sd-btn');
  if(btn)btn.style.background='var(--gold)';
  const chEt=document.getElementById('ch-et');
  if(chEt)chEt.classList.add('on');
  toast('Durée personnalisée appliquée ✓','success',1500);
}
