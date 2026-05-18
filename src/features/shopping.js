import { A, SCATS, sanitizeColor } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { toast, esc, openM, closeM } from './boot.js'

let _editShopId = null

export function renderShop(){
  const el=document.getElementById('p-shop');
  const tot=A.shop.length,done=A.shop.filter(i=>i.is_checked).length;
  const pct=tot?Math.round(done/tot*100):0;
  el.innerHTML='<div class="sh-wr">'
    +'<div class="sh-ar"><input class="sh-in" id="sh-in" type="text" placeholder="Ajouter un article…" onkeydown="if(event.key===\'Enter\')addShop()"><input class="sh-qt" id="sh-qt" type="text" placeholder="Qté"><select class="sh-ct" id="sh-ct">'+Object.entries(SCATS).map(([k,v])=>'<option value="'+k+'">'+v.i+'</option>').join('')+'</select><button class="btn-sm" onclick="addShop()">+</button></div>'
    +(tot?'<div class="sh-prog"><div class="sh-pct">'+pct+'%</div><div class="sh-inf"><div class="sh-lb">'+done+' / '+tot+' articles</div><div class="sh-bw"><div class="sh-bf" style="width:'+pct+'%"></div></div></div>'+(done?'<button class="btn-cl" onclick="clearDone()">Effacer</button>':'')+'</div>':'')
    +'<div id="sh-items"></div></div>';
  renderShopItems();
}
export function renderShopItems(){
  const wrap=document.getElementById('sh-items');if(!wrap)return;
  if(!A.shop.length){wrap.innerHTML='<div class="empty"><div class="ei">🛒</div><p>Liste vide. Ajoutez vos articles !</p></div>';return;}
  const grps={};A.shop.forEach(i=>{if(!grps[i.category])grps[i.category]=[];grps[i.category].push(i);});
  wrap.innerHTML='';
  Object.entries(grps).forEach(([cat,items])=>{
    const c=SCATS[cat]||SCATS.autre;
    const sec=document.createElement('div');sec.className='sh-sec';
    const nd=items.filter(i=>!i.is_checked).length;
    sec.innerHTML='<div class="sh-sh"><span>'+c.i+'</span><span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);flex:1">'+c.l+'</span><span style="font-size:10px;font-weight:700;background:var(--border);color:var(--muted);border-radius:100px;padding:1px 7px">'+nd+'/'+items.length+'</span></div>';
    items.forEach(item=>{
      const me=A.me;const byCol=item.added_by===me?.id?sanitizeColor(me?.avatar_color):sanitizeColor(A.partner?.avatar_color);
      const byN=(item.added_by===me?.id?me?.username:A.partner?.username)||'?';
      const d=document.createElement('div');d.className='sh-it'+(item.is_checked?' ck':'');
      d.innerHTML='<div class="si-ck'+(item.is_checked?' chk':'')+'" onclick="togShop(\''+item.id+'\')">'+(item.is_checked?'✓':'')+'</div>'
        +'<span class="si-nm" onclick="editShop(\''+item.id+'\')" style="cursor:pointer">'+esc(item.name)+'</span>'
        +(item.qty&&item.qty!=='1'?'<span class="si-qt">'+esc(item.qty)+'</span>':'')
        +'<span class="si-by" style="background:'+byCol+'22;color:'+byCol+'">'+byN[0]+'</span>'
        +'<button class="si-dl" onclick="editShop(\''+item.id+'\')" title="Modifier"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
        +'<button class="si-dl" onclick="delShop(\''+item.id+'\')" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>';
      sec.appendChild(d);
    });
    wrap.appendChild(sec);
  });
}
export function openShopModal(itemId){
  _editShopId=itemId||null;
  // Hydrater le select catégorie
  const ct=document.getElementById('sh-mo-ct');
  if(ct&&!ct.options.length){
    ct.innerHTML=Object.entries(SCATS).map(([k,v])=>'<option value="'+k+'">'+v.i+'</option>').join('');
  }
  if(itemId){
    const it=A.shop.find(x=>x.id===itemId);
    if(!it){toast('Article introuvable','error');return;}
    document.getElementById('mo-sh-t').textContent="Modifier l'article";
    document.getElementById('sh-mo-nm').value=it.name||'';
    document.getElementById('sh-mo-qt').value=it.qty||'1';
    if(ct)ct.value=it.category||'autre';
  } else {
    document.getElementById('mo-sh-t').textContent='Ajouter un article';
    document.getElementById('sh-mo-nm').value='';
    document.getElementById('sh-mo-qt').value='1';
    if(ct)ct.value='epicerie';
  }
  openM('mo-sh');
  setTimeout(()=>document.getElementById('sh-mo-nm')?.focus(),120);
}

export async function saveShopItem(){
  const nm=document.getElementById('sh-mo-nm').value.trim();
  if(!nm){toast('Nom obligatoire','error');return;}
  const qt=document.getElementById('sh-mo-qt').value.trim()||'1';
  const ct=document.getElementById('sh-mo-ct').value||'autre';
  if(_editShopId){
    const{error}=await sb.from('shopping_items').update({name:nm,qty:qt,category:ct}).eq('id',_editShopId);
    if(error){toast('Erreur: '+error.message,'error');return;}
    const i=A.shop.findIndex(x=>x.id===_editShopId);
    if(i!==-1)A.shop[i]={...A.shop[i],name:nm,qty:qt,category:ct};
    toast('Article modifié ! ✏️','success');
  } else {
    const{data,error}=await sb.from('shopping_items').insert({
      name:nm,qty:qt,category:ct,couple_id:A.couple.id,added_by:A.user.id
    }).select().single();
    if(error){toast('Erreur: '+error.message,'error');return;}
    if(data&&!A.shop.find(x=>x.id===data.id))A.shop.push(data);
    toast('Article ajouté ! 🛒','success');
  }
  closeM('mo-sh');
  _editShopId=null;
  renderShop();
}

// addShop conservé pour la barre rapide en haut de la liste (touche Entrée)
export async function addShop(){
  if(!A.couple||!A.user){toast('Session expirée. Rechargez la page.','error');return;}
  const inp=document.getElementById('sh-in');if(!inp)return;
  const name=inp.value.trim();if(!name){openShopModal();return;}
  const qty=document.getElementById('sh-qt')?.value.trim()||'1';
  const ct=document.getElementById('sh-ct')?.value||'epicerie';
  const{data,error}=await sb.from('shopping_items').insert({
    name,qty,category:ct,couple_id:A.couple.id,added_by:A.user.id
  }).select().single();
  if(error){toast('Erreur: '+error.message,'error');return;}
  if(data&&!A.shop.find(x=>x.id===data.id))A.shop.push(data);
  inp.value='';if(document.getElementById('sh-qt'))document.getElementById('sh-qt').value='';
  renderShop();
  setTimeout(()=>{const i=document.getElementById('sh-in');if(i)i.focus();},50);
}
export async function togShop(id){const i=A.shop.find(x=>x.id===id);if(i)await sb.from('shopping_items').update({is_checked:!i.is_checked}).eq('id',id);}
export async function delShop(id){if(!confirm('Supprimer cet article ?'))return;await sb.from('shopping_items').delete().eq('id',id);}
export async function clearDone(){const ids=A.shop.filter(i=>i.is_checked).map(i=>i.id);if(ids.length)await sb.from('shopping_items').delete().in('id',ids);}


export function editShop(id) {
  openShopModal(id)
}
