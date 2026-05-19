import { A, MON, DAY } from '../lib/state.js'
import { sb } from '../lib/supabase.js'
import { toast, esc, openM, closeM, fdFR, fd, getMon, showPage } from './boot.js'
import { renderShop } from './shopping.js'

let _mT = { day: null, slot: 2 }
let _editMealId = null


export function selectMealSlot(s){
  _mT.slot=s;
  document.querySelectorAll('.ml-slot-opt').forEach(el=>{
    const isSel=parseInt(el.dataset.slot)===s;
    el.style.border='1.5px solid '+(isSel?'var(--p1m)':'var(--border)');
    el.style.background=isSel?'var(--p1b)':'transparent';
    const lbl=el.querySelector('div:last-child');
    if(lbl)lbl.style.color=isSel?'var(--p1)':'var(--ink)';
  });
}

async function _ensureMealHistory(){
  if(A.mealHistory!==null)return;
  if(!A.couple)return;
  const{data}=await sb.from('meals').select('name,ingredients').eq('couple_id',A.couple.id).order('name');
  const seen=new Set();
  A.mealHistory=(data||[]).filter(m=>{if(seen.has(m.name))return false;seen.add(m.name);return true;});
  _renderMealHistory();
}

function _renderMealHistory(){
  const wrap=document.getElementById('ml-hist');if(!wrap)return;
  const hist=A.mealHistory||[];
  if(!hist.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  wrap.innerHTML='<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Repas précédents</div>'
    +hist.map(m=>'<button class="ml-hc" onclick="pickMealHistory(\''+esc(m.name)+'\',\''+esc((m.ingredients||[]).join(', '))+'\')">'+esc(m.name)+'</button>').join('');
}

export function pickMealHistory(name,ingr){
  const nm=document.getElementById('ml-nm');if(nm)nm.value=name;
  const ig=document.getElementById('ml-ig');if(ig)ig.value=ingr;
}

export function openMealM(day,slot){
  _mT={day,slot:slot??2};_editMealId=null;
  const slotNames=['Petit-déjeuner','Déjeuner','Dîner'];
  const ttl=document.getElementById('mo-ml-t');
  const sub=document.getElementById('mo-ml-sub');
  if(ttl)ttl.textContent=slotNames[_mT.slot];
  if(sub)sub.textContent=fdFR(day);
  ['ml-nm','ml-no'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
  const ig=document.getElementById('ml-ig');if(ig)ig.value='';
  selectMealSlot(_mT.slot);
  _ensureMealHistory();
  openM('mo-ml');
  setTimeout(()=>document.getElementById('ml-nm')?.focus(),150);
}

export async function saveMeal(){
  if(!A.couple||!A.user){toast('Session expirée. Rechargez la page.','error');return;}
  const name=document.getElementById('ml-nm').value.trim();
  if(!name){toast('Indiquez le nom du plat.','error');return;}
  if(!_mT.day){toast('Sélectionnez d\'abord un jour.','error');return;}
  const ingr=document.getElementById('ml-ig').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
  const{data,error}=await sb.from('meals').upsert({
    couple_id:A.couple.id,meal_date:_mT.day,slot:_mT.slot,
    name,ingredients:ingr,
    note:document.getElementById('ml-no').value.trim(),
    created_by:A.user.id
  },{onConflict:'couple_id,meal_date,slot'}).select().single();
  if(error){toast('Erreur: '+error.message,'error');return;}
  if(data){A.meals[data.meal_date+'-'+data.slot]=data;}
  A.mealHistory=null; // invalider le cache pour inclure ce nouveau repas
  closeM('mo-ml');toast('Repas enregistré ! 🍽️','success');
  renderMeals();
}

export function renderMeals(){
  const el=document.getElementById('p-meals');
  const today=new Date();const mon=getMon(today,A.wkOff);
  const wlbl='Sem. du '+mon.getDate()+' '+MON[mon.getMonth()];
  let html='<div class="ml-wr"><div class="wk-nv"><button class="wk-bt" onclick="wkNav(-1)">‹</button><div class="wk-lb">'+wlbl+'</div><button class="wk-bt" onclick="wkNav(1)">›</button></div>';
  for(let d=0;d<7;d++){
    const date=new Date(mon);date.setDate(mon.getDate()+d);
    const key=fd(date);const isTod=key===fd(today);
    const slots=['🌅','☀️','🌙'];let sh='';
    slots.forEach((_,si)=>{
      const mk=key+'-'+si;const meal=A.meals[mk];
      sh+='<div class="ml-s"><div class="ms-lb">'+slots[si]+'</div>';
      if(meal)sh+='<div class="ms-st" onclick="editMeal(\''+meal.id+'\')"><span>'+esc(meal.name)+'</span><button class="ms-xb" onclick="event.stopPropagation();delMeal(\''+meal.id+'\')">✕</button></div>';
      else sh+='<div class="ms-em" onclick="openMealM(\''+key+'\','+si+'\')">+</div>';
      sh+='</div>';
    });
    html+='<div class="ml-dy'+(isTod?' tod':'')+'"><div class="ml-dh"><span class="ml-dn">'+(isTod?'✦ ':'')+DAY[d]+'</span><span class="ml-dd">'+date.getDate()+' '+MON[date.getMonth()]+'</span></div><div class="ml-sl">'+sh+'</div></div>';
  }
  const ingr=getMealIngr(mon);
  if(ingr.length)html+='<button class="gen-btn" onclick="addIngrToShop()">🛒 Ajouter les ingrédients aux courses ('+ingr.length+')</button><div class="ig-pv"><div class="ig-t">Ingrédients de la semaine</div>'+ingr.map(i=>'<div class="ig-it"><div class="ig-dt"></div><span>'+esc(i)+'</span></div>').join('')+'</div>';
  el.innerHTML=html+'</div>';
}
export function editMeal(id){
  const meal=Object.values(A.meals).find(m=>m.id===id);
  if(!meal)return;
  _editMealId=id;
  _mT={day:meal.meal_date,slot:meal.slot};
  const slotNames=['Petit-déjeuner','Déjeuner','Dîner'];
  document.getElementById('mo-ml-t').textContent=slotNames[meal.slot];
  document.getElementById('mo-ml-sub').textContent=fdFR(meal.meal_date);
  document.getElementById('ml-nm').value=meal.name||'';
  document.getElementById('ml-ig').value=(meal.ingredients||[]).join(', ');
  document.getElementById('ml-no').value=meal.note||'';
  selectMealSlot(meal.slot);
  openM('mo-ml');
  setTimeout(()=>document.getElementById('ml-nm').focus(),150);
}
export async function delMeal(id){
  if(!confirm('Supprimer ce repas ?'))return;
  const{error}=await sb.from('meals').delete().eq('id',id);
  if(error){toast('Erreur: '+error.message,'error');return;}
  toast('Repas supprimé.','info');
}
export function wkNav(dir){A.wkOff+=dir;renderMeals();}
export function getMealIngr(mon){
  const ingr=new Set();
  for(let d=0;d<7;d++){const date=new Date(mon);date.setDate(mon.getDate()+d);const key=fd(date);
    for(let s=0;s<3;s++){const m=A.meals[key+'-'+s];if(m?.ingredients)m.ingredients.forEach(i=>ingr.add(i));}}
  return[...ingr];
}
export async function addIngrToShop(){
  if(!A.couple||!A.user){toast('Session expirée. Rechargez la page.','error');return;}
  const mon=getMon(new Date(),A.wkOff);const ingr=getMealIngr(mon);
  if(!ingr.length){toast('Aucun ingrédient dans les repas de la semaine.','info');return;}
  const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const existing=new Set(A.shop.map(i=>norm(i.name)));
  const toAdd=ingr.filter(n=>!existing.has(norm(n)));
  if(!toAdd.length){toast('Tous les ingrédients sont déjà dans la liste !','info');return;}
  const{data,error}=await sb.from('shopping_items')
    .insert(toAdd.map(name=>({name,qty:'1',category:'epicerie',couple_id:A.couple.id,added_by:A.user.id})))
    .select();
  if(error){toast('Erreur: '+error.message,'error');return;}
  if(data)data.forEach(item=>{if(!A.shop.find(x=>x.id===item.id))A.shop.push(item);});
  renderShop();
  toast(toAdd.length+' ingrédient'+(toAdd.length>1?'s':'')+' ajouté'+(toAdd.length>1?'s':'')+' !','success');
  showPage('shop',document.getElementById('n-sh'));
}

