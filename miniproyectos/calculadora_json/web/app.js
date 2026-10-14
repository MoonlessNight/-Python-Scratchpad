const $ = (id) => document.getElementById(id);
let state = {history:[], variables:{}, settings:{}};
let toastTimer, tutorialIndex = 0;
const tutorialSteps = [
 {target:'calculator', title:'Tu espacio de cálculo', text:'Escribe una operación aquí, o combina el teclado visual con el teclado de tu dispositivo. Prueba (12 + 8) * 3.'},
 {target:'expression', title:'Expresiones y sugerencias', text:'Al escribir, verás funciones y variables sugeridas. Pulsa Enter para calcular. Se admiten paréntesis, potencias y funciones matemáticas.'},
 {target:'variablesPanel', title:'Guarda una variable', text:'Escribe un nombre y una expresión, por ejemplo subtotal y 120 * 4. Luego podrás usar subtotal * 1.19 en otra operación.'},
 {target:'historyPanel', title:'Vuelve a tus operaciones', text:'El historial permite cargar una expresión, editar su texto o borrar una entrada. Puedes desactivarlo en Personalización.'},
 {target:'settingsPanel', title:'Hazla tuya', text:'Escoge tema y fuente, añade fondo o sonido y desactiva historial o variables cuando no los necesites.'}
];
async function api(path, data) {
 const res = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const out = await res.json();
 if(!res.ok) throw new Error(out.error || 'No se pudo completar la acción.');
 return out;
}
async function loadState(){
 const r=await fetch('/api/state',{cache:'no-store'}); state=await r.json(); renderAll(); applySettings();
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function playSound(){
 if(!state.settings.sounds_enabled)return;
 const url=state.settings.sound_url;
 try{
  if(url){let a=new Audio(url);a.volume=.18;a.play().catch(()=>{});}
  else {const ctx=new (window.AudioContext||window.webkitAudioContext)();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=660;gain.gain.setValueAtTime(.045,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.08);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.08);}
 }catch(_){}
}
function applySettings(){
 const s=state.settings||{};
 let theme=s.theme||'system';
 if(theme==='system')theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 document.body.dataset.theme=theme;document.body.dataset.font=s.font||'system';
 document.body.style.backgroundImage=s.background?`linear-gradient(#0000,#0000),url("${s.background.replace(/["\\]/g,'')}")`:'';
 document.body.style.backgroundSize=s.background?'cover':'';document.body.style.backgroundAttachment=s.background?'fixed':'';
 $('themeSelect').value=s.theme||'system';$('fontSelect').value=s.font||'system';
 $('backgroundUrl').value=s.background||'';$('soundUrl').value=s.sound_url||'';
 $('soundsToggle').checked=!!s.sounds_enabled;$('historyToggle').checked=!!s.history_enabled;$('variablesToggle').checked=!!s.variables_enabled;
 $('historyPanel').classList.toggle('hidden',!s.history_enabled);
 $('variablesPanel').classList.toggle('hidden',!s.variables_enabled);
}
function renderAll(){renderHistory();renderVariables();$('modeLabel').textContent='LISTA';}
function renderHistory(){
 const box=$('historyList');box.innerHTML='';
 if(!state.settings.history_enabled){box.textContent='Historial desactivado.';box.className='history-list empty-note';return}
 if(!state.history.length){box.textContent='Aún no has calculado nada.';box.className='history-list empty-note';return}
 box.className='history-list';
 [...state.history].reverse().forEach(item=>{
  const el=document.createElement('article');el.className='history-item';
  const expr=document.createElement('div');expr.className='history-expression';expr.textContent=item.expression;
  const result=document.createElement('div');result.className='history-result';result.textContent='= '+fmt(item.result);
  const time=document.createElement('div');time.className='history-time';time.textContent=new Date(item.created_at).toLocaleString();
  const actions=document.createElement('div');actions.className='history-actions';
  actions.append(makeMini('↩','Cargar expresión',()=>{$('expression').value=item.expression;$('expression').focus();suggestions()}));
  actions.append(makeMini('✎','Editar expresión',async()=>{const next=prompt('Edita la expresión guardada:',item.expression);if(next===null)return;try{await api('/api/history',{action:'edit',id:item.id,expression:next});await loadState();toast('Expresión actualizada.')}catch(e){toast(e.message)}}));
  actions.append(makeMini('×','Eliminar entrada',async()=>{try{await api('/api/history',{action:'delete',id:item.id});await loadState();toast('Entrada eliminada.')}catch(e){toast(e.message)}}));
  el.append(expr,actions,result,time);box.append(el);
 });
}
function renderVariables(){
 const box=$('variablesList');box.innerHTML='';const vars=state.variables||{};
 $('variableCount').textContent=Object.keys(vars).length+' guardadas';
 if(!state.settings.variables_enabled){box.textContent='Variables desactivadas.';box.className='variables-list empty-note';return}
 if(!Object.keys(vars).length){box.textContent='Todavía no hay variables.';box.className='variables-list empty-note';return}
 box.className='variables-list';
 Object.entries(vars).forEach(([name,value])=>{
  const row=document.createElement('div');row.className='variable-item';
  const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('small');small.textContent='Disponible en expresiones';left.append(strong,small);
  const right=document.createElement('div');right.style.display='flex';right.style.alignItems='center';right.style.gap='8px';
  const val=document.createElement('span');val.className='variable-value';val.textContent=fmt(value);
  const edit=makeMini('✎','Editar variable',()=>{$('variableName').value=name;$('variableExpression').value=String(value);$('variableExpression').focus()});
  const del=makeMini('×','Eliminar variable',async()=>{try{const r=await api('/api/variable',{name,delete:true});state.variables=r.variables;renderVariables();toast('Variable eliminada.')}catch(e){toast(e.message)}});
  right.append(val,edit,del);row.append(left,right);box.append(row);
 });
}
function makeMini(label,title,fn){const b=document.createElement('button');b.className='mini-btn';b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.addEventListener('click',fn);return b}
function fmt(value){if(typeof value==='number')return Number(value.toPrecision(12)).toString();return String(value)}
async function calculate(){
 const expression=$('expression').value.trim();if(!expression)return toast('Escribe una expresión primero.');
 try{const r=await api('/api/calculate',{expression});$('result').textContent=fmt(r.entry.result);$('modeLabel').textContent='CALCULADO';playSound();await loadState();toast('Operación completada.')}
 catch(e){$('modeLabel').textContent='REVISAR';toast(e.message)}
}
function suggestions(){
 const input=$('expression'), box=$('suggestions'), text=input.value, pos=input.selectionStart||text.length;
 const left=text.slice(0,pos), match=left.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
 const token=match?match[0].toLowerCase():'';
 const choices=['sqrt(','abs(','round(','floor(','ceil(','sin(','cos(','tan(','log(','log10(','exp(','min(','max(','pi','e',...Object.keys(state.variables||{})].filter(x=>!token||x.toLowerCase().startsWith(token)).slice(0,8);
 box.innerHTML='';
 if(!token||!choices.length){box.classList.remove('active');return}
 choices.forEach(choice=>{const b=document.createElement('button');b.className='suggestion';b.textContent=choice;b.setAttribute('role','option');b.onclick=()=>{const start=match?pos-match[0].length:pos;input.setRangeText(choice,text.slice(start,pos)===token?start:pos,pos,'end');input.focus();box.classList.remove('active')};box.append(b)});
 box.classList.add('active');
}
function insert(value){
 const input=$('expression');const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;
 input.setRangeText(value,start,end,'end');input.focus();suggestions();
}
$('expression').addEventListener('input',suggestions);
$('expression').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();calculate()}if(e.key==='Escape'){$('expression').value='';$('result').textContent='0';$('suggestions').classList.remove('active')}});
document.querySelectorAll('[data-insert]').forEach(b=>b.addEventListener('click',()=>insert(b.dataset.insert)));
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.action==='calculate')calculate();if(b.dataset.action==='clear'){$('expression').value='';$('result').textContent='0';$('expression').focus()}if(b.dataset.action==='backspace'){const i=$('expression'),s=i.selectionStart,e=i.selectionEnd;if(s!==e)i.setRangeText('',s,e,'end');else if(s>0)i.setRangeText('',s-1,s,'end');i.focus()}}));
$('saveVariable').addEventListener('click',async()=>{const name=$('variableName').value.trim(),expression=$('variableExpression').value.trim();try{const r=await api('/api/variable',{name,expression});state.variables=r.variables;$('variableName').value='';$('variableExpression').value='';renderVariables();toast('Variable guardada.')}catch(e){toast(e.message)}});
$('clearHistory').addEventListener('click',async()=>{if(!confirm('¿Eliminar todo el historial?'))return;try{await api('/api/history',{action:'clear'});await loadState();toast('Historial limpiado.')}catch(e){toast(e.message)}});
$('copyResult').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('result').textContent);toast('Resultado copiado.')}catch(_){toast('El navegador no permitió copiar el resultado.')}});
$('saveSettings').addEventListener('click',async()=>{
 const data={theme:$('themeSelect').value,font:$('fontSelect').value,background:$('backgroundUrl').value.trim(),sound_url:$('soundUrl').value.trim(),sounds_enabled:$('soundsToggle').checked,history_enabled:$('historyToggle').checked,variables_enabled:$('variablesToggle').checked};
 try{const r=await api('/api/settings',data);state.settings=r.settings;applySettings();await loadState();toast('Preferencias guardadas.')}catch(e){toast(e.message)}
});
$('guideBtn').onclick=()=>$('guideModal').classList.remove('hidden');
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$ (b.dataset.close).classList.add('hidden')));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('guideModal').classList.add('hidden');stopTutorial()}});
function startTutorial(){tutorialIndex=0;$('tutorialOverlay').classList.remove('hidden');showTutorialStep()}
function showTutorialStep(){
 document.querySelectorAll('.spotlight').forEach(x=>x.classList.remove('spotlight'));
 const step=tutorialSteps[tutorialIndex];const target=$(step.target);
 $('tutorialStep').textContent=`PASO ${tutorialIndex+1} DE ${tutorialSteps.length}`;$('tutorialHeading').textContent=step.title;$('tutorialText').textContent=step.text;
 if(target){target.classList.add('spotlight');target.scrollIntoView({behavior:'smooth',block:'center'})}
 $('tutorialNext').textContent=tutorialIndex===tutorialSteps.length-1?'Finalizar ✓':'Siguiente →';
}
function stopTutorial(){$('tutorialOverlay').classList.add('hidden');document.querySelectorAll('.spotlight').forEach(x=>x.classList.remove('spotlight'))}
$('tutorialBtn').onclick=startTutorial;$('tutorialSkip').onclick=stopTutorial;
$('tutorialNext').onclick=()=>{if(tutorialIndex<tutorialSteps.length-1){tutorialIndex++;showTutorialStep()}else{stopTutorial();toast('Tutorial completado.')}} ;
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='system')applySettings()});
loadState().catch(()=>toast('No se pudo conectar con el servidor. Ejecuta server.py.'));
