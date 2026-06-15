// ─── State ───────────────────────────────────────────────────────────────────
let hamperTotals  = {};
let washCycles    = [];
let hamperEntries = [];
let customItems   = [];
let quickCounts   = {};
let mainChart, typeChart, aMonthlyChart, aFreqChart, aTypeChart, aMissingChart;

const DEFAULT_ITEMS = [
  'T-shirt','Boxer','Vest','Socks (pair)','Trousers',
  'Kurta','Shorts','Handkerchief','Sweater','Hoodie',
  'Pyjama','Tracksuit','Polo shirt','Dress shirt',
  'Tank top','Undershirt','Joggers','Jeans','Shalwar'
];
const DEFAULT_QA = ['T-shirt','Boxer','Vest','Socks (pair)','Trousers'];
const ICON_MAP   = {
  'T-shirt':'ti-shirt','Boxer':'ti-layers-subtract','Vest':'ti-shirt-sport',
  'Socks (pair)':'ti-sock','Trousers':'ti-layout-bottombar'
};
const COLORS = ['#1D9E75','#5DCAA5','#9FE1CB','#378ADD','#BA7517','#E24B4A','#9FE1CB'];

function iconFor(n){ return ICON_MAP[n] || 'ti-hanger'; }
function tsDate(ts){ if(!ts) return null; if(ts.toDate) return ts.toDate(); return new Date(ts); }
function fmtDate(ts){ const d=tsDate(ts); return d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—'; }
function fmtTime(ts){ const d=tsDate(ts); return d?d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'—'; }
function fmtItems(items){ return items?.length ? items.map(i=>`${i.name} ×${i.count}`).join(', ') : '—'; }
function totalCount(items){ return items?.reduce((s,i)=>s+(i.count||0),0)||0; }
function monthKey(d){ return d.getFullYear()+'-'+(d.getMonth()+1); }
function sameMonth(d,ref){ return d.getFullYear()===ref.getFullYear()&&d.getMonth()===ref.getMonth(); }

// ─── Toast ───────────────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg){ 
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.display='block';
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>el.style.display='none',2600);
}

// ─── Navigation ──────────────────────────────────────────────────────────────
const PAGE_TITLES = { dashboard:'Dashboard',hamper:'Hamper',washday:'Wash day',history:'History',analytics:'Analytics',settings:'Settings' };

function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('mobile-title').textContent = PAGE_TITLES[page]||page;
  closeSidebar();
  if(page==='dashboard')  renderDashboard();
  if(page==='hamper')     renderHamperPage();
  if(page==='washday')    renderWashDay();
  if(page==='history')    renderHistory();
  if(page==='analytics')  renderAnalytics();
  if(page==='settings')   renderSettings();
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────
let acIndex = -1;

function allItems(){ return [...new Set([...DEFAULT_ITEMS,...customItems])]; }

function acFilter(val){
  const drop = document.getElementById('ac-drop');
  if(!val.trim()){ drop.style.display='none'; return; }
  const matches = allItems().filter(i=>i.toLowerCase().includes(val.toLowerCase())).slice(0,7);
  if(!matches.length){ drop.style.display='none'; return; }
  drop.innerHTML = matches.map((m,i)=>`<div class="ac-opt" data-val="${m}" onmousedown="acPick('${m}')">${m}</div>`).join('');
  drop.style.display = 'block';
  acIndex = -1;
}

function acPick(val){
  document.getElementById('ac-input').value='';
  document.getElementById('ac-drop').style.display='none';
  // Add to quick counts
  quickCounts[val] = (quickCounts[val]||0)+1;
  renderQAList();
}

function closeAC(){ document.getElementById('ac-drop').style.display='none'; }

function acKeydown(e){
  const opts = document.querySelectorAll('#ac-drop .ac-opt');
  if(e.key==='ArrowDown'){ acIndex=Math.min(acIndex+1,opts.length-1); highlightAC(opts); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ acIndex=Math.max(acIndex-1,0); highlightAC(opts); e.preventDefault(); }
  else if(e.key==='Enter'){
    if(acIndex>=0&&opts[acIndex]) acPick(opts[acIndex].dataset.val);
    else { const v=document.getElementById('ac-input').value.trim(); if(v) acPick(v); }
  }
  else if(e.key==='Escape') closeAC();
}
function highlightAC(opts){ opts.forEach((o,i)=>o.classList.toggle('selected',i===acIndex)); }

// ─── Quick Add panel ──────────────────────────────────────────────────────────
function renderQAList(){
  const keys = [...new Set([...DEFAULT_QA,...Object.keys(quickCounts).filter(k=>!DEFAULT_QA.includes(k))])];
  document.getElementById('qa-list').innerHTML = keys.map(name=>`
    <div class="qa-row">
      <span class="qa-name"><i class="ti ${iconFor(name)}"></i>${name}</span>
      <div class="stepper">
        <button class="step-btn" onclick="stepQA('${name}',-1)">−</button>
        <span class="step-val" id="qv-${name.replace(/[^a-z]/gi,'_')}">${quickCounts[name]||0}</span>
        <button class="step-btn" onclick="stepQA('${name}',1)">+</button>
      </div>
    </div>`).join('');
}

function stepQA(name,d){
  quickCounts[name] = Math.max(0,(quickCounts[name]||0)+d);
  const el = document.getElementById('qv-'+name.replace(/[^a-z]/gi,'_'));
  if(el) el.textContent = quickCounts[name];
}

async function commitHamper(mode){
  const items = Object.entries(quickCounts).filter(([,v])=>v>0).map(([name,count])=>({name,count}));
  if(!items.length){ showQAMsg('Select at least one item first','var(--amber)'); return; }
  
  const newTotals = {...hamperTotals};
  items.forEach(({name,count})=>{
    newTotals[name] = Math.max(0,(newTotals[name]||0)+(mode==='add'?count:-count));
  });

  try {
    await db.collection('hamperTotals').doc('default').set({ totals:newTotals, updatedAt:firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('hamperEntries').add({
      items: items.map(i=>({name:i.name, count: mode==='add'?i.count:-i.count})),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showQAMsg(mode==='add'?`Added to hamper`:`Removed from hamper`,'var(--green)');
    quickCounts={};
    renderQAList();
  } catch(e){ showQAMsg('Error — check Firebase config','var(--red)'); console.error(e); }
}

function showQAMsg(msg,color){
  const el=document.getElementById('qa-msg');
  if(!el) return;
  el.textContent=msg; el.style.color=color;
  setTimeout(()=>el.textContent='',2800);
}

// ─── Firebase listeners ───────────────────────────────────────────────────────
function initFirebase(){
  // Hamper totals
  db.collection('hamperTotals').onSnapshot(snap=>{
    hamperTotals = snap.empty ? {} : (snap.docs[0].data().totals||{});
    refreshAll();
  });

  // Hamper entries
  db.collection('hamperEntries').orderBy('createdAt','desc').onSnapshot(snap=>{
    hamperEntries = snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshAll();
  });

  // Wash cycles
  db.collection('washCycles').orderBy('startedAt','desc').onSnapshot(snap=>{
    washCycles = snap.docs.map(d=>({id:d.id,...d.data()}));
    refreshAll();
  });

  // Custom items
  db.collection('userPrefs').onSnapshot(snap=>{
    customItems = snap.empty ? [] : (snap.docs[0].data().customItems||[]);
    renderSettings();
  });
}

function refreshAll(){
  const active = document.querySelector('.page.active');
  if(!active) return;
  const page = active.id.replace('page-','');
  navigate(page);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard(){
  // Date
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const hamperTotal = Object.values(hamperTotals).reduce((s,v)=>s+Math.max(0,v),0);
  const activeCycle = washCycles.find(c=>c.status!=='complete');
  const completed   = washCycles.filter(c=>c.status==='complete');
  const now = new Date();

  const missingThisMonth = completed
    .filter(c=>{ const d=tsDate(c.completedAt); return d&&sameMonth(d,now); })
    .reduce((s,c)=>s+totalCount(c.missing),0);

  // Metrics
  document.getElementById('m-hamper').textContent = hamperTotal;
  document.getElementById('m-hamper').className = 'metric-value'+(hamperTotal>0?' mv-green':'');
  document.getElementById('m-cycle').textContent = activeCycle ? `#${activeCycle.cycleNumber}` : '—';
  document.getElementById('m-cycle').className = 'metric-value'+(activeCycle?' mv-amber':'');
  document.getElementById('m-cycle-sub').textContent = activeCycle ? `Status: ${activeCycle.status}` : 'No active wash';
  document.getElementById('m-missing').textContent = missingThisMonth;
  document.getElementById('m-missing').className = 'metric-value'+(missingThisMonth>0?' mv-red':'');
  document.getElementById('m-total-cycles').textContent = washCycles.length;

  // Hamper badge
  document.getElementById('hamper-badge').textContent = hamperTotal+' items';

  // Quick add
  renderQAList();

  // Hamper contents
  const hc = document.getElementById('hamper-contents');
  const hItems = Object.entries(hamperTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!hItems.length){
    hc.innerHTML='<div class="empty-state"><i class="ti ti-basket"></i><p>Hamper is empty.<br>Add items using the quick add panel.</p></div>';
  } else {
    hc.innerHTML = hItems.map(([name,count])=>`
      <div class="hamper-item">
        <span class="hi-name"><i class="ti ${iconFor(name)}"></i>${name}</span>
        <span class="hi-count">${count}</span>
      </div>`).join('');
    hc.innerHTML += `<div style="margin-top:12px;padding-top:10px;border-top:0.5px solid var(--border);display:flex;justify-content:flex-end">
      <a style="font-size:12px;color:var(--green);cursor:pointer" onclick="navigate('washday')">Start wash →</a></div>`;
  }

  // Active cycle strip
  const strip = document.getElementById('active-cycle-strip');
  if(activeCycle){
    strip.style.display='block';
    document.getElementById('active-cycle-title').textContent = `Machine wash — cycle #${activeCycle.cycleNumber}`;
    document.getElementById('active-cycle-status').textContent = activeCycle.status;
    document.getElementById('active-cycle-grid').innerHTML = (activeCycle.itemsSent||[]).map(item=>{
      const back = (activeCycle.itemsBack||[]).find(b=>b.name===item.name);
      const isDone = back!==undefined;
      const isMissing = isDone && back.count<item.count;
      const cls = isDone?(isMissing?'mc-miss':'mc-ok'):'mc-pend';
      const statusText = isDone?(isMissing?`${item.count-back.count} missing`:'✓ All back'):'Not verified';
      const statusCls = isDone?(isMissing?'miss':'ok'):'pend';
      return `<div class="mc-card ${cls}">
        <div class="mc-name">${item.name}</div>
        <div class="mc-sent">${item.count} <span class="mc-back">${isDone?`→ ${back.count} back`:'→ ?'}</span></div>
        <div class="mc-status ${statusCls}">${statusText}</div>
      </div>`;
    }).join('');
  } else { strip.style.display='none'; }

  // Monthly chart — last 6 months
  const months = getLast6Months();
  const mWashed  = months.map(m=>completed.filter(c=>{ const d=tsDate(c.startedAt); return d&&sameMonth(d,m); }).reduce((s,c)=>s+totalCount(c.itemsSent),0));
  const mMissing = months.map(m=>completed.filter(c=>{ const d=tsDate(c.startedAt); return d&&sameMonth(d,m); }).reduce((s,c)=>s+totalCount(c.missing),0));
  const mCycles  = months.map(m=>completed.filter(c=>{ const d=tsDate(c.startedAt); return d&&sameMonth(d,m); }).length);
  const mLabels  = months.map(m=>m.toLocaleDateString('en-GB',{month:'short'}));

  if(mainChart) mainChart.destroy();
  mainChart = new Chart(document.getElementById('main-chart'),{
    data:{
      labels:mLabels,
      datasets:[
        {type:'bar',label:'Washed',data:mWashed,backgroundColor:'#5DCAA5',borderRadius:3,yAxisID:'y'},
        {type:'bar',label:'Missing',data:mMissing,backgroundColor:'#F09595',borderRadius:3,yAxisID:'y'},
        {type:'line',label:'Cycles',data:mCycles,borderColor:'#378ADD',backgroundColor:'transparent',pointBackgroundColor:'#378ADD',pointRadius:3,tension:.3,yAxisID:'y1'}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
      x:{ticks:{font:{size:10}},grid:{display:false}},
      y:{ticks:{font:{size:10}},grid:{color:'rgba(136,135,128,.1)'},beginAtZero:true},
      y1:{position:'right',ticks:{font:{size:10},stepSize:1},grid:{display:false},beginAtZero:true,max:8}
    }}
  });

  // Type donut this month
  const typeBreakdown={};
  completed.filter(c=>{ const d=tsDate(c.startedAt); return d&&sameMonth(d,now); })
    .forEach(c=>c.itemsSent?.forEach(i=>{typeBreakdown[i.name]=(typeBreakdown[i.name]||0)+i.count;}));
  const typeEntries = Object.entries(typeBreakdown).sort((a,b)=>b[1]-a[1]).slice(0,5);

  if(typeChart) typeChart.destroy();
  if(typeEntries.length){
    typeChart = new Chart(document.getElementById('type-chart'),{
      type:'doughnut',
      data:{labels:typeEntries.map(([n])=>n),datasets:[{data:typeEntries.map(([,v])=>v),backgroundColor:COLORS,borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false}}}
    });
    document.getElementById('type-legend').innerHTML = typeEntries.map(([n,v],i)=>
      `<div style="font-size:11px;display:flex;align-items:center;gap:4px;color:var(--text-muted)"><span style="width:8px;height:8px;border-radius:2px;background:${COLORS[i]};flex-shrink:0"></span>${n} (${v})</div>`
    ).join('');
  } else {
    document.getElementById('type-legend').innerHTML='<p style="font-size:12px;color:var(--text-hint)">No washes this month yet</p>';
  }
}

// ─── Hamper page ──────────────────────────────────────────────────────────────
function renderHamperPage(){
  const total = Object.values(hamperTotals).reduce((s,v)=>s+Math.max(0,v),0);
  document.getElementById('hamper-page-badge').textContent = total+' items total';

  // Breakdown grid
  const hItems = Object.entries(hamperTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const bd = document.getElementById('hamper-breakdown');
  if(!hItems.length){
    bd.innerHTML='<div class="empty-state"><i class="ti ti-basket"></i><p>Hamper is empty</p></div>';
  } else {
    bd.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">${
      hItems.map(([name,count])=>`
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:10px 12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">${name}</div>
          <div style="font-size:22px;font-weight:700;color:var(--green)">${count}</div>
        </div>`).join('')
    }</div>`;
  }

  // Entry log
  document.getElementById('hamper-entry-count').textContent = `(${hamperEntries.length} entries)`;
  const tbody = document.getElementById('hamper-entry-body');
  if(!hamperEntries.length){
    tbody.innerHTML=`<tr><td colspan="5"><div class="empty-state"><i class="ti ti-list"></i><p>No entries yet.<br>Use Quick Add on the Dashboard.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = hamperEntries.map(e=>`
      <tr>
        <td style="font-weight:500;white-space:nowrap">${fmtDate(e.createdAt)}</td>
        <td style="color:var(--text-muted);white-space:nowrap">${fmtTime(e.createdAt)}</td>
        <td style="font-size:12px;color:var(--text-muted)">${e.items?.map(i=>`${i.name} ×${Math.abs(i.count)}`).join(', ')||'—'}</td>
        <td style="font-weight:600;text-align:center">${e.items?.reduce((s,i)=>s+Math.abs(i.count),0)||0}</td>
        <td><button class="btn btn-sm" style="color:var(--text-hint);border:none" onclick="deleteEntry('${e.id}')"><i class="ti ti-trash"></i></button></td>
      </tr>`).join('');
  }
}

async function deleteEntry(id){
  await db.collection('hamperEntries').doc(id).delete();
  toast('Entry deleted');
}

// ─── Wash Day ─────────────────────────────────────────────────────────────────
let machineItems = {};
let verifyItems  = {};

function renderWashDay(){
  const activeCycle = washCycles.find(c=>c.status!=='complete');
  const nextNum     = washCycles.length+1;
  const hamperItems = Object.entries(hamperTotals).filter(([,v])=>v>0);
  const pill        = document.getElementById('washday-status-pill');
  const sub         = document.getElementById('washday-sub');
  const content     = document.getElementById('washday-content');

  if(!activeCycle){
    // Init machine items
    if(!Object.keys(machineItems).length){
      machineItems = Object.fromEntries(hamperItems);
    }
    pill.style.display='none';
    sub.textContent='Move items from hamper to machine';
    content.innerHTML=`
      <div class="card">
        <div class="card-title">Items going into the machine <span class="pill pill-blue">Cycle #${nextNum}</span></div>
        ${hamperItems.length===0
          ? `<div class="empty-state"><i class="ti ti-basket"></i><p>Hamper is empty.<br>Add items from the Dashboard first.</p></div>`
          : `<p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Adjust quantities — these will be deducted from your hamper.</p>
             <table class="data-table">
               <thead><tr><th>Item</th><th>In hamper</th><th>Sending to machine</th></tr></thead>
               <tbody>${hamperItems.map(([name,total])=>`
                 <tr>
                   <td><span style="display:flex;align-items:center;gap:7px"><i class="ti ${iconFor(name)}" style="font-size:16px;color:var(--text-hint)"></i>${name}</span></td>
                   <td style="font-weight:600">${total}</td>
                   <td><div class="stepper">
                     <button class="step-btn" onclick="stepMachine('${name}',-1)">−</button>
                     <span class="step-val" id="mv-${name.replace(/[^a-z]/gi,'_')}">${machineItems[name]||0}</span>
                     <button class="step-btn" onclick="stepMachine('${name}',1)">+</button>
                   </div></td>
                 </tr>`).join('')}
               </tbody>
             </table>
             <div style="margin-top:16px;padding-top:14px;border-top:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
               <span style="font-size:13px;color:var(--text-muted)">Total: <strong id="machine-total">${Object.values(machineItems).reduce((s,v)=>s+v,0)}</strong> items</span>
               <button class="btn btn-green" onclick="startWash()"><i class="ti ti-wash"></i> Start wash cycle</button>
             </div>`
        }
      </div>`;
  } else {
    // Verify mode
    pill.style.display='inline-block';
    pill.textContent = activeCycle.status;
    sub.textContent  = `Active cycle #${activeCycle.cycleNumber} — verify returned items`;

    // Init verify with sent counts as default
    activeCycle.itemsSent?.forEach(i=>{
      if(verifyItems[i.name]===undefined) verifyItems[i.name]=i.count;
    });

    content.innerHTML=`
      <div class="card">
        <div class="card-title">Count what came back — cycle #${activeCycle.cycleNumber}</div>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Enter the exact number of each item after drying.</p>
        <table class="data-table">
          <thead><tr><th>Item</th><th>Sent to wash</th><th>Count returned</th><th>Result</th></tr></thead>
          <tbody>${(activeCycle.itemsSent||[]).map(item=>{
            const ret = verifyItems[item.name]!==undefined ? verifyItems[item.name] : item.count;
            const diff = ret - item.count;
            const resultPill = diff===0
              ? `<span class="pill pill-green">✓ All back</span>`
              : diff<0
                ? `<span class="pill pill-red">${Math.abs(diff)} missing</span>`
                : `<span class="pill pill-amber">+${diff} extra</span>`;
            return `<tr>
              <td><span style="display:flex;align-items:center;gap:7px"><i class="ti ${iconFor(item.name)}" style="font-size:16px;color:var(--text-hint)"></i>${item.name}</span></td>
              <td style="font-weight:600">${item.count}</td>
              <td><input class="verify-input" type="number" min="0" value="${ret}" onchange="setVerify('${item.name}',this.value)" oninput="setVerify('${item.name}',this.value)"></td>
              <td id="vr-${item.name.replace(/[^a-z]/gi,'_')}">${resultPill}</td>
            </tr>`;}).join('')}
          </tbody>
        </table>
        <div style="margin-top:16px;padding-top:14px;border-top:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div id="verify-summary" style="font-size:13px">${getVerifySummary(activeCycle)}</div>
          <button class="btn btn-green" onclick="completeVerification('${activeCycle.id}')"><i class="ti ti-check"></i> Complete &amp; verify</button>
        </div>
      </div>`;
  }
}

function stepMachine(name,d){
  const max = hamperTotals[name]||0;
  machineItems[name] = Math.max(0,Math.min(max,(machineItems[name]||0)+d));
  const el = document.getElementById('mv-'+name.replace(/[^a-z]/gi,'_'));
  if(el) el.textContent = machineItems[name];
  const tot = document.getElementById('machine-total');
  if(tot) tot.textContent = Object.values(machineItems).reduce((s,v)=>s+v,0);
}

function setVerify(name,val){
  verifyItems[name] = Math.max(0,Number(val)||0);
  const activeCycle = washCycles.find(c=>c.status!=='complete');
  if(!activeCycle) return;
  // Update result pill inline
  const item = activeCycle.itemsSent?.find(i=>i.name===name);
  if(!item) return;
  const diff = verifyItems[name]-item.count;
  const pill = diff===0?`<span class="pill pill-green">✓ All back</span>`:diff<0?`<span class="pill pill-red">${Math.abs(diff)} missing</span>`:`<span class="pill pill-amber">+${diff} extra</span>`;
  const el = document.getElementById('vr-'+name.replace(/[^a-z]/gi,'_'));
  if(el) el.innerHTML=pill;
  const sum = document.getElementById('verify-summary');
  if(sum) sum.innerHTML=getVerifySummary(activeCycle);
}

function getVerifySummary(cycle){
  const totalMissing = (cycle.itemsSent||[]).reduce((s,item)=>{
    const ret = verifyItems[item.name]!==undefined?verifyItems[item.name]:item.count;
    return s+Math.max(0,item.count-ret);
  },0);
  return totalMissing>0
    ? `<span style="color:var(--red)"><i class="ti ti-alert-circle"></i> ${totalMissing} item(s) will be marked missing</span>`
    : `<span style="color:var(--green)"><i class="ti ti-circle-check"></i> All items accounted for</span>`;
}

async function startWash(){
  const items = Object.entries(machineItems).filter(([,v])=>v>0).map(([name,count])=>({name,count}));
  if(!items.length){ toast('Select at least one item'); return; }
  const nextNum = washCycles.length+1;
  const newTotals = {...hamperTotals};
  items.forEach(({name,count})=>{ newTotals[name]=Math.max(0,(newTotals[name]||0)-count); });
  try {
    await db.collection('hamperTotals').doc('default').set({totals:newTotals,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    await db.collection('washCycles').add({
      cycleNumber:nextNum, status:'drying',
      itemsSent:items, itemsBack:[], missing:[],
      startedAt:firebase.firestore.FieldValue.serverTimestamp(), completedAt:null
    });
    machineItems={};
    toast('Wash cycle #'+nextNum+' started!');
  } catch(e){ toast('Error — check Firebase config'); console.error(e); }
}

async function completeVerification(cycleId){
  const cycle = washCycles.find(c=>c.id===cycleId);
  if(!cycle) return;
  const itemsBack = (cycle.itemsSent||[]).map(i=>({name:i.name,count:verifyItems[i.name]!==undefined?Number(verifyItems[i.name]):i.count}));
  const missing   = [];
  (cycle.itemsSent||[]).forEach(sent=>{
    const back = itemsBack.find(b=>b.name===sent.name);
    if(back&&back.count<sent.count) missing.push({name:sent.name,count:sent.count-back.count});
  });
  try {
    await db.collection('washCycles').doc(cycleId).update({
      itemsBack, missing, status:'complete',
      completedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    verifyItems={};
    toast(missing.length?`Cycle complete — ${missing.reduce((s,m)=>s+m.count,0)} item(s) missing`:'Cycle complete — all items accounted for!');
  } catch(e){ toast('Error saving'); console.error(e); }
}

// ─── History page ─────────────────────────────────────────────────────────────
function getFilteredCycles(){
  const from = document.getElementById('f-from')?.value;
  const to   = document.getElementById('f-to')?.value;
  return washCycles.filter(c=>{
    const d=tsDate(c.startedAt);
    if(!d) return false;
    if(from&&d<new Date(from)) return false;
    if(to&&d>new Date(to+'T23:59:59')) return false;
    return true;
  });
}

function renderHistory(){
  // Set default dates if empty
  const fFrom=document.getElementById('f-from'), fTo=document.getElementById('f-to');
  if(fFrom&&!fFrom.value){ const d=new Date(); d.setMonth(d.getMonth()-3); fFrom.value=d.toISOString().split('T')[0]; }
  if(fTo&&!fTo.value){ fTo.value=new Date().toISOString().split('T')[0]; }

  const filtered = getFilteredCycles();
  const hamperTotal = Object.values(hamperTotals).reduce((s,v)=>s+Math.max(0,v),0);
  const totalWashed  = filtered.reduce((s,c)=>s+totalCount(c.itemsSent),0);
  const totalMissing = filtered.reduce((s,c)=>s+totalCount(c.missing),0);

  document.getElementById('h-cycles').textContent  = filtered.length;
  document.getElementById('h-washed').textContent  = totalWashed;
  document.getElementById('h-missing').textContent = totalMissing;
  document.getElementById('h-missing').className   = 'metric-value'+(totalMissing>0?' mv-red':'');
  document.getElementById('h-hamper').textContent  = hamperTotal;
  document.getElementById('h-count').textContent   = filtered.length+' record'+(filtered.length!==1?'s':'');

  const tbody = document.getElementById('history-body');
  if(!filtered.length){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><i class="ti ti-history"></i><p>No cycles in this period.<br>Try adjusting the date range.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(c=>{
    const missing = totalCount(c.missing);
    const status = c.status==='complete'?(missing>0?'incomplete':'clear'):c.status;
    const statusPill = status==='clear'?`<span class="pill pill-green">All clear</span>`
      :status==='incomplete'?`<span class="pill pill-red">Missing</span>`
      :status==='drying'?`<span class="pill pill-amber">Drying</span>`
      :`<span class="pill pill-blue">Washing</span>`;
    return `<tr>
      <td style="font-weight:500;white-space:nowrap">${fmtDate(c.startedAt)}</td>
      <td style="color:var(--text-muted);white-space:nowrap">${fmtTime(c.startedAt)}</td>
      <td style="text-align:center"><span class="pill pill-blue">#${c.cycleNumber}</span></td>
      <td style="font-size:11.5px;color:var(--text-muted);max-width:200px">${fmtItems(c.itemsSent)}</td>
      <td style="font-weight:600;text-align:center">${totalCount(c.itemsSent)}</td>
      <td style="text-align:center;font-weight:600;color:${missing>0?'var(--red)':'var(--text-hint)'}">${missing||'—'}</td>
      <td style="font-size:11.5px;color:${missing>0?'var(--red)':'var(--text-hint)'}">${fmtItems(c.missing)}</td>
      <td>${statusPill}</td>
    </tr>`;
  }).join('');
}

// ─── Analytics page ───────────────────────────────────────────────────────────
function renderAnalytics(){
  const completed = washCycles.filter(c=>c.status==='complete');
  const totalWashed  = completed.reduce((s,c)=>s+totalCount(c.itemsSent),0);
  const totalMissing = completed.reduce((s,c)=>s+totalCount(c.missing),0);
  const avgPerCycle  = completed.length ? Math.round(totalWashed/completed.length) : 0;
  const lossRate     = totalWashed ? ((totalMissing/totalWashed)*100).toFixed(1) : '0.0';

  document.getElementById('a-cycles').textContent = completed.length;
  document.getElementById('a-washed').textContent = totalWashed;
  document.getElementById('a-avg').textContent    = avgPerCycle;
  const lossEl = document.getElementById('a-loss');
  lossEl.textContent  = lossRate+'%';
  lossEl.className    = 'metric-value'+(parseFloat(lossRate)>2?' mv-red':' mv-green');

  const months   = getLast6Months();
  const mLabels  = months.map(m=>m.toLocaleDateString('en-GB',{month:'short',year:'2-digit'}));
  const forMonth = m => completed.filter(c=>{ const d=tsDate(c.startedAt); return d&&sameMonth(d,m); });
  const mWashed  = months.map(m=>forMonth(m).reduce((s,c)=>s+totalCount(c.itemsSent),0));
  const mMissing = months.map(m=>forMonth(m).reduce((s,c)=>s+totalCount(c.missing),0));
  const mCycles  = months.map(m=>forMonth(m).length);

  // Monthly bar chart
  if(aMonthlyChart) aMonthlyChart.destroy();
  aMonthlyChart = new Chart(document.getElementById('a-monthly-chart'),{
    type:'bar',
    data:{labels:mLabels,datasets:[
      {label:'Washed',data:mWashed,backgroundColor:'#5DCAA5',borderRadius:4},
      {label:'Missing',data:mMissing,backgroundColor:'#F09595',borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:10}},grid:{display:false}},y:{ticks:{font:{size:10}},grid:{color:'rgba(136,135,128,.1)'},beginAtZero:true}}}
  });

  // Frequency line chart
  if(aFreqChart) aFreqChart.destroy();
  aFreqChart = new Chart(document.getElementById('a-freq-chart'),{
    type:'line',
    data:{labels:mLabels,datasets:[{label:'Cycles',data:mCycles,borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,.08)',pointBackgroundColor:'#1D9E75',pointRadius:4,tension:.35,fill:true}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:10}},grid:{display:false}},y:{ticks:{font:{size:10},stepSize:1},grid:{color:'rgba(136,135,128,.1)'},beginAtZero:true}}}
  });

  // Type breakdown donut
  const typeBreakdown={};
  completed.forEach(c=>c.itemsSent?.forEach(i=>{typeBreakdown[i.name]=(typeBreakdown[i.name]||0)+i.count;}));
  const typeEntries = Object.entries(typeBreakdown).sort((a,b)=>b[1]-a[1]);
  if(aTypeChart) aTypeChart.destroy();
  if(typeEntries.length){
    aTypeChart = new Chart(document.getElementById('a-type-chart'),{
      type:'doughnut',
      data:{labels:typeEntries.map(([n])=>n),datasets:[{data:typeEntries.map(([,v])=>v),backgroundColor:COLORS,borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{display:false}}}
    });
    document.getElementById('a-type-list').innerHTML = typeEntries.map(([name,count],i)=>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--border);font-size:12px">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${COLORS[i%COLORS.length]};flex-shrink:0"></span>${name}</span>
        <span style="font-weight:600">${count} <span style="font-weight:400;color:var(--text-hint)">(${totalWashed?((count/totalWashed)*100).toFixed(0):0}%)</span></span>
      </div>`).join('');
  }

  // Missing items bar
  const missingBreakdown={};
  completed.forEach(c=>c.missing?.forEach(i=>{missingBreakdown[i.name]=(missingBreakdown[i.name]||0)+i.count;}));
  const missingEntries = Object.entries(missingBreakdown).sort((a,b)=>b[1]-a[1]);
  if(aMissingChart) aMissingChart.destroy();
  if(missingEntries.length){
    aMissingChart = new Chart(document.getElementById('a-missing-chart'),{
      type:'bar',
      data:{labels:missingEntries.map(([n])=>n),datasets:[{data:missingEntries.map(([,v])=>v),backgroundColor:'#F09595',borderRadius:4}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{font:{size:9}},grid:{color:'rgba(136,135,128,.1)'},beginAtZero:true},y:{ticks:{font:{size:10}},grid:{display:false}}}}
    });
    document.getElementById('a-missing-list').innerHTML = missingEntries.map(([name,count])=>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--border);font-size:12px">
        <span style="color:var(--text-muted)">${name}</span>
        <span style="font-weight:600;color:var(--red)">${count} lost</span>
      </div>`).join('');
  } else {
    document.getElementById('a-missing-list').innerHTML='<div class="empty-state" style="padding:20px"><i class="ti ti-circle-check" style="color:var(--green)"></i><p>Nothing missing yet!</p></div>';
  }
}

// ─── Settings page ────────────────────────────────────────────────────────────
function renderSettings(){
  // Default items pills
  const dp = document.getElementById('default-items-pills');
  if(dp) dp.innerHTML = DEFAULT_ITEMS.map(item=>
    `<span style="background:var(--gray-100);color:var(--text-muted);padding:3px 9px;border-radius:20px;font-size:11px">${item}</span>`
  ).join('');

  // Custom items
  const cl = document.getElementById('custom-items-list');
  if(cl) cl.innerHTML = customItems.length ? customItems.map(item=>
    `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--green-light);color:var(--green-dark);padding:4px 10px;border-radius:20px;font-size:12px">
      ${item}
      <button onclick="removeCustomItem('${item}')" style="background:none;border:none;cursor:pointer;color:var(--green-dark);font-size:14px;padding:0;line-height:1">×</button>
    </span>`
  ).join('') : '<p style="font-size:12px;color:var(--text-hint)">No custom items yet.</p>';
}

async function addCustomItem(){
  const input = document.getElementById('new-item-input');
  const name  = input.value.trim();
  if(!name) return;
  if(customItems.includes(name)||DEFAULT_ITEMS.includes(name)){ toast('Item already exists'); return; }
  const updated = [...customItems,name];
  await saveCustomItems(updated);
  input.value='';
  toast(`"${name}" added`);
}

async function removeCustomItem(name){
  await saveCustomItems(customItems.filter(i=>i!==name));
  toast(`"${name}" removed`);
}

async function saveCustomItems(items){
  const snap = await db.collection('userPrefs').get();
  if(snap.empty){ await db.collection('userPrefs').add({customItems:items}); }
  else { await snap.docs[0].ref.update({customItems:items}); }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
function doExportPDF(){
  const filtered = getFilteredCycles();
  const hamperTotal = Object.values(hamperTotals).reduce((s,v)=>s+Math.max(0,v),0);
  const stats = {
    hamperTotal,
    totalCycles: filtered.length,
    totalWashed: filtered.reduce((s,c)=>s+totalCount(c.itemsSent),0),
    totalMissing: filtered.reduce((s,c)=>s+totalCount(c.missing),0)
  };
  const from = document.getElementById('f-from')?.value||'—';
  const to   = document.getElementById('f-to')?.value||'—';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm',format:'a4'});
  const W=doc.internal.pageSize.getWidth(), M=15;

  // Header
  doc.setFillColor(29,158,117); doc.rect(0,0,W,14,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('LaundryLog',M,9.5);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Report: ${from} → ${to}`,M+40,9.5);
  doc.text(`Generated: ${new Date().toLocaleString()}`,W-M,9.5,{align:'right'});

  // Summary cards
  let y=22;
  doc.setTextColor(30,30,30); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('Dashboard summary',M,y); y+=5;
  const cards=[['In hamper',stats.hamperTotal+' items'],['Total cycles',stats.totalCycles],['Items washed',stats.totalWashed],['Missing',stats.totalMissing]];
  const cw=(W-2*M-9)/4;
  cards.forEach(([label,val],i)=>{
    const bx=M+i*(cw+3);
    doc.setFillColor(241,239,232); doc.roundedRect(bx,y,cw,16,2,2,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(95,94,90);
    doc.text(String(label),bx+cw/2,y+5.5,{align:'center'});
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text(String(val),bx+cw/2,y+13,{align:'center'});
  });
  y+=24;

  // Hamper contents
  doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
  doc.text('Current hamper contents',M,y); y+=3;
  const hRows=Object.entries(hamperTotals).filter(([,v])=>v>0).map(([n,c])=>[n,c]);
  doc.autoTable({startY:y,head:[['Item','Count']],body:hRows.length?hRows:[['Hamper is empty','']],
    theme:'plain',styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:[29,158,117],textColor:255,fontStyle:'bold',fontSize:7},
    alternateRowStyles:{fillColor:[248,248,246]},margin:{left:M,right:M},columnStyles:{0:{cellWidth:80},1:{cellWidth:40,halign:'center'}}});
  y=doc.lastAutoTable.finalY+8;

  // Wash cycles table
  doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text(`Wash record (${filtered.length} entries)`,M,y); y+=3;
  const rows=filtered.map(c=>[
    fmtDate(c.startedAt), fmtTime(c.startedAt), `#${c.cycleNumber}`,
    fmtItems(c.itemsSent), totalCount(c.itemsSent),
    totalCount(c.missing)||'—', fmtItems(c.missing)||'—',
    c.status==='complete'&&!totalCount(c.missing)?'All clear':c.status==='complete'?'Missing':c.status
  ]);
  doc.autoTable({startY:y,head:[['Date','Time','Cycle','Items sent','Total','Missing','Missing detail','Status']],
    body:rows.length?rows:[['No records','','','','','','','']],
    theme:'striped',styles:{fontSize:7,cellPadding:2.5,overflow:'linebreak'},
    headStyles:{fillColor:[29,158,117],textColor:255,fontStyle:'bold',fontSize:7},
    margin:{left:M,right:M},
    columnStyles:{0:{cellWidth:20},1:{cellWidth:15},2:{cellWidth:10,halign:'center'},3:{cellWidth:52},4:{cellWidth:10,halign:'center'},5:{cellWidth:12,halign:'center'},6:{cellWidth:38},7:{cellWidth:18}}});

  // Page footer
  const total=doc.getNumberOfPages();
  for(let i=1;i<=total;i++){
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160,160,160);
    doc.text(`LaundryLog  ·  Page ${i} of ${total}`,W/2,289,{align:'center'});
  }
  doc.save(`laundrylog-${new Date().toISOString().split('T')[0]}.pdf`);
  toast('PDF exported');
}

function doExportExcel(){
  const filtered    = getFilteredCycles();
  const hamperTotal = Object.values(hamperTotals).reduce((s,v)=>s+Math.max(0,v),0);
  const from = document.getElementById('f-from')?.value||'—';
  const to   = document.getElementById('f-to')?.value||'—';
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData=[
    ['LaundryLog — Wash Report'],[`Period: ${from} to ${to}`],[`Generated: ${new Date().toLocaleString()}`],[],
    ['Metric','Value'],['In hamper now',hamperTotal],
    ['Total cycles',filtered.length],
    ['Items washed',filtered.reduce((s,c)=>s+totalCount(c.itemsSent),0)],
    ['Items missing',filtered.reduce((s,c)=>s+totalCount(c.missing),0)],[],
    ['Current hamper breakdown'],['Item','Count'],
    ...Object.entries(hamperTotals).filter(([,v])=>v>0).map(([n,c])=>[n,c])
  ];
  const ws1=XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols']=[{wch:30},{wch:20}];
  XLSX.utils.book_append_sheet(wb,ws1,'Summary');

  // Wash record sheet
  const header=['Date','Time','Cycle #','Items sent','Total items','Missing count','Missing detail','Status'];
  const rows=filtered.map(c=>[
    fmtDate(c.startedAt),fmtTime(c.startedAt),c.cycleNumber,
    fmtItems(c.itemsSent),totalCount(c.itemsSent),
    totalCount(c.missing)||0,fmtItems(c.missing)||'—',
    c.status==='complete'&&!totalCount(c.missing)?'All clear':c.status==='complete'?'Missing items':c.status
  ]);
  const ws2=XLSX.utils.aoa_to_sheet([header,...rows]);
  ws2['!cols']=[{wch:14},{wch:10},{wch:8},{wch:50},{wch:12},{wch:14},{wch:40},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws2,'Wash Record');

  // Monthly stats sheet
  const monthMap={};
  washCycles.filter(c=>c.status==='complete').forEach(c=>{
    const d=tsDate(c.startedAt); if(!d) return;
    const k=d.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
    if(!monthMap[k]) monthMap[k]={washed:0,missing:0,cycles:0};
    monthMap[k].washed+=totalCount(c.itemsSent);
    monthMap[k].missing+=totalCount(c.missing);
    monthMap[k].cycles+=1;
  });
  const ws3=XLSX.utils.aoa_to_sheet([
    ['Month','Cycles','Items washed','Items missing'],
    ...Object.entries(monthMap).map(([m,v])=>[m,v.cycles,v.washed,v.missing])
  ]);
  ws3['!cols']=[{wch:16},{wch:8},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws3,'Monthly Stats');

  XLSX.writeFile(wb,`laundrylog-${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('Excel exported');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLast6Months(){
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i); months.push(d);
  }
  return months;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  renderQAList();
  navigate('dashboard');
  initFirebase();
});
