/* Constants */
const BE_TZ = 'Europe/Brussels'; // vaste tijdzone
const WEEK_TARGET_MIN = 40 * 60;  // 40 uur

/* Utilities */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* Elements */
const form = $('#time-form');
const workHoursEl = $('#work-hours');
const startTimeEl = $('#start-time');
const errorsEl = $('#errors');
const endTimeOut = $('#end-time');
const timeLeftOut = $('#time-left');
const weekTotalOut = $('#week-total');
const statusLive = $('#status');
const nowBtn = $('#now-btn');
const addCoffeeBtn = $('#add-coffee');
const addLunchBtn = $('#add-lunch');
const addCustomBtn = $('#add-custom');
const breaksContainer = $('#breaks');
const breakTpl = $('#break-row');
const resetBtn = $('#reset-btn');
const persistCb = $('#persist');

/* Accessibility helpers */
function announcePolite(msg){
  statusLive.textContent = msg;
}
function showError(msg){
  errorsEl.textContent = msg;
  errorsEl.style.display = 'block';
}
function clearError(){
  errorsEl.textContent = '';
  errorsEl.style.display = 'none';
}

/* Time helpers */
function parseTimeToMinutes(t){
  // t is "HH:MM" in 24h
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins){
  const m = ((mins % 1440) + 1440) % 1440; // wrap around day
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
function formatInBE(hours, minutes){
  // Formats a time HH:MM in BE timezone for consistency if needed later
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  const fmt = new Intl.DateTimeFormat('nl-BE', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone: BE_TZ });
  return fmt.format(dt);
}
function sumBreaks(){
  let before = 0, after = 0;
  $$('.break-row', breaksContainer).forEach(row=>{
    const pos = $('.break-position', row).value;
    const mins = Number($('.break-mins', row).value) || 0;
    if(pos === 'before') before += mins;
    else after += mins;
  });
  return { before, after };
}

/* Week helpers:
   - Voor nu tonen we target 40:00 en berekende dagduur, en geven we resterend naar weekdoel op basis van vandaag.
   - Uitbreiding (later): meerdere dagen opslaan en optellen in localStorage.
*/
function computeWeekTotals(dayMinutes){
  // Simpele weergave: resterend t.o.v. 40u na deze dag
  const remaining = Math.max(0, WEEK_TARGET_MIN - dayMinutes);
  const h = Math.floor(remaining/60), m = remaining % 60;
  weekTotalOut.value = `${String(Math.floor(WEEK_TARGET_MIN/60)).padStart(2,'0')}:${String(WEEK_TARGET_MIN%60).padStart(2,'0')}`;
  return { remainingText: `${h}u ${String(m).padStart(2,'0')}m` };
}

/* Core calculation:
   End time = (start + breaks_before) + work + breaks_after
   Time left = end - now
*/
function compute(){
  clearError();

  const workHours = Number(workHoursEl.value);
  const startVal = startTimeEl.value;

  if(!startVal || !isFinite(workHours) || workHours <= 0){
    showError('Vul een geldige starttijd en werkduur in.');
    return;
  }

  const { before, after } = sumBreaks();
  const startMin = parseTimeToMinutes(startVal);
  const workMin = Math.round(workHours * 60);
  const endMin = startMin + before + workMin + after;

  endTimeOut.value = minutesToTime(endMin);

  // Resterend t.o.v. lokale klok, geformatteerd in 24u
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  let left = endMin - nowMin;
  const sign = left >= 0 ? 1 : -1;
  left = Math.abs(left);
  const h = Math.floor(left/60);
  const m = left%60;
  const leftText = `${sign<0?'-':''}${h}u ${String(m).padStart(2,'0')}m`;
  timeLeftOut.value = leftText;

  // Week target feedback (eenvoudige variant op basis van dag)
  const { remainingText } = computeWeekTotals(workMin);

  announcePolite(`Eindtijd ${minutesToTime(endMin)}. Resterend vandaag ${leftText}. Weekdoel resterend ${remainingText}.`);
}

/* Break rows */
function addBreak(preset){
  const node = breakTpl.content.firstElementChild.cloneNode(true);
  if(preset === 'coffee'){
    $('.break-type', node).value = 'coffee';
    $('.break-mins', node).value = 15;
  } else if(preset === 'lunch'){
    $('.break-type', node).value = 'lunch';
    $('.break-mins', node).value = 30;
  }
  $('.remove-break', node).addEventListener('click', ()=>{
    node.remove();
    compute();
    saveIfNeeded();
  });
  ['change','input'].forEach(ev=>{
    node.addEventListener(ev, ()=>{
      compute();
      saveIfNeeded();
    });
  });
  breaksContainer.appendChild(node);
  compute();
}

/* Persist */
const STORAGE_KEY = 'worktime_planner_v1';
function saveIfNeeded(){
  if(!persistCb.checked) return;
  const data = {
    workHours: workHoursEl.value,
    startTime: startTimeEl.value,
    breaks: $$('.break-row', breaksContainer).map(row=>({
      type: $('.break-type', row).value,
      pos: $('.break-position', row).value,
      mins: $('.break-mins', row).value
    }))
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function loadIfAny(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    if(data.workHours) workHoursEl.value = data.workHours;
    if(data.startTime) startTimeEl.value = data.startTime;
    if(Array.isArray(data.breaks)){
      data.breaks.forEach(b=>{
        addBreak();
        const row = $$('.break-row', breaksContainer).slice(-1)[0];
        $('.break-type', row).value = b.type || 'other';
        $('.break-position', row).value = b.pos || 'after';
        $('.break-mins', row).value = b.mins || 15;
      });
    }
    announcePolite('Instellingen geladen.');
  }catch(e){}
}

/* Events */
['input','change'].forEach(ev=>{
  workHoursEl.addEventListener(ev, ()=>{ compute(); saveIfNeeded(); });
  startTimeEl.addEventListener(ev, ()=>{ compute(); saveIfNeeded(); });
});
nowBtn.addEventListener('click', ()=>{
  const now = new Date();
  startTimeEl.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  compute();
  saveIfNeeded();
});
addCoffeeBtn.addEventListener('click', ()=>{ addBreak('coffee'); });
addLunchBtn.addEventListener('click', ()=>{ addBreak('lunch'); });
addCustomBtn.addEventListener('click', ()=>{ addBreak('other'); });

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  compute();
});
resetBtn.addEventListener('click', ()=>{
  breaksContainer.innerHTML = '';
  clearError();
  endTimeOut.value = '—:—';
  timeLeftOut.value = '—';
  announcePolite('Formulier is gereset.');
});

persistCb.addEventListener('change', ()=>{
  if(!persistCb.checked) { localStorage.removeItem(STORAGE_KEY); }
  else saveIfNeeded();
});

/* Init */
window.addEventListener('DOMContentLoaded', ()=>{
  loadIfAny();
  if(!startTimeEl.value) startTimeEl.focus();
  compute();
});
