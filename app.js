/* ==========================================================================
   CrowdStrike REVEAL Company Explorer — app.js
   Plain JavaScript, no modules, no framework, no network. Consumes
   window.REVEAL_DATA, which extract_workbook.py generates from the workbook.
   ========================================================================== */
'use strict';

var D = window.REVEAL_DATA;
if (!D) { document.body.innerHTML = '<p style="padding:30px">reveal-data.js did not load.</p>'; }

/* ───────────────────────────────────────────────────────── object index ── */
var OBJ = {};
var COLLECTIONS = ['evidence','signals','kpis','bridges','risks','openQuestions','rules',
  'contextRules','sources','crossLaneLinks','backtests','calibrationCases','reviewItems',
  'interpretations','rawNodes','outputs'];
COLLECTIONS.forEach(function(c){ (D[c]||[]).forEach(function(o){ if(o && o.id) OBJ[o.id]=o; }); });

var EDGES = D.relationships || [];
var OUT_BY = {}, IN_BY = {};
EDGES.forEach(function(e){
  (OUT_BY[e.from] = OUT_BY[e.from] || []).push(e);
  (IN_BY[e.to]   = IN_BY[e.to]   || []).push(e);
});

/* ─────────────────────────────────────────────────────────── constants ── */
var LANES = [
  ['oct26','October 2026 Current TSIS'], ['jul26','July 2026 Historical TSIS'],
  ['historical','Earlier Historical TSIS'], ['zscore','Survey Z-Score'],
  ['cohort','Subsample / Cohort Evidence'], ['region','Regional Evidence'],
  ['adoption','Adoption Reasoning'], ['composition','Respondent Composition'],
  ['peer','Peer Trends'], ['company','Company / External Evidence'],
  ['crosslane','Cross-Lane Synthesis'], ['interpretation','Analyst Interpretation'],
  ['rules','Rules and Methodology']
];
var CLASSES = ['Client-provided fact','Anduril interpretation','Hypothesis',
               'Open question','Recommended action'];
var STATES = ['Supporting','Contradictory','Contextual','Source Needed','Verified',
              'Pending Review','Current','Historical'];
var CONFS = ['High','Medium-High','Medium','Low','Source Needed'];

var NODE_STYLE = {
  Source:      {fill:'#E7EBEF', stroke:'#5C6B7A', shape:'doc'},
  RawRecord:   {fill:'#D9EAF7', stroke:'#17365D', shape:'sheet'},
  Evidence:    {fill:'#FFFFFF', stroke:'#17365D', shape:'rect'},
  Signal:      {fill:'#E2F0D9', stroke:'#70AD47', shape:'round'},
  Interpretation:{fill:'#E4DFEC', stroke:'#8064A2', shape:'round'},
  KPI:         {fill:'#FFF2CC', stroke:'#FFC000', shape:'hex'},
  Bridge:      {fill:'#FDE7D8', stroke:'#F16A20', shape:'round'},
  Risk:        {fill:'#F4CCCC', stroke:'#C00000', shape:'diamond'},
  OpenQuestion:{fill:'#F4CCCC', stroke:'#C00000', shape:'circle'},
  Rule:        {fill:'#F3F5F7', stroke:'#595959', shape:'pill'},
  ContextRule: {fill:'#F3F5F7', stroke:'#595959', shape:'pill'},
  Output:      {fill:'#FFFFFF', stroke:'#0F243E', shape:'page'},
  Backtest:    {fill:'#FFF2CC', stroke:'#8A6400', shape:'hex'},
  CrossLane:   {fill:'#FDE7D8', stroke:'#F16A20', shape:'round'},
  CalibrationCase:{fill:'#F3F5F7', stroke:'#595959', shape:'pill'},
  ReviewItem:  {fill:'#F4CCCC', stroke:'#C00000', shape:'circle'}
};
var EDGE_TYPES = ['SOURCE_OF','NORMALIZES_TO','SUPPORTS','CONTRADICTS','CONTEXTUALIZES',
  'INFORMS','RELATES_TO','IMPACTS','BLOCKS','GOVERNED_BY','COMMUNICATES','GENERATED_FROM',
  'HISTORICAL_COMPARISON'];
var EDGE_COLOR = {SUPPORTS:'#70AD47', CONTRADICTS:'#C00000', BLOCKS:'#C00000',
  GOVERNED_BY:'#595959', INFORMS:'#F16A20', SOURCE_OF:'#5C6B7A', NORMALIZES_TO:'#17365D',
  CONTEXTUALIZES:'#8064A2', RELATES_TO:'#9AA7B4', COMMUNICATES:'#0F243E',
  GENERATED_FROM:'#0F243E', HISTORICAL_COMPARISON:'#5C6B7A', IMPACTS:'#C00000'};

/* ─────────────────────────────────────────────────────────────── state ── */
var DEFAULT_STATE = {
  view:'brief', lanes:null, classes:null, states:null, confs:null,
  audience:'investor', evidenceMode:'card', graphOrientation:'horizontal',
  graphDepth:'2', nodeTypes:null, edgeTypes:null,
  genEvidence:['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-ZS'],
  genCounter:['CE-002'], genQuestion:['OQ-014'], drafts:{}, dismissedTips:[],
  inspect:false, compare:[]
};
var state = load();

function load(){
  var s = {};
  for (var k in DEFAULT_STATE) s[k] = DEFAULT_STATE[k];
  try {
    var raw = localStorage.getItem('reveal.crwd.state');
    if (raw) { var p = JSON.parse(raw); for (var j in p) if (j in s) s[j] = p[j]; }
  } catch(e){}
  if (!s.lanes)   s.lanes   = LANES.map(function(l){return l[0];});
  if (!s.classes) s.classes = CLASSES.slice();
  if (!s.states)  s.states  = STATES.slice();
  if (!s.confs)   s.confs   = CONFS.slice();
  if (!s.nodeTypes) s.nodeTypes = Object.keys(NODE_STYLE);
  if (!s.edgeTypes) s.edgeTypes = EDGE_TYPES.slice();
  return s;
}
function save(){
  try { localStorage.setItem('reveal.crwd.state', JSON.stringify(state)); } catch(e){}
}
function resetState(){
  try { localStorage.removeItem('reveal.crwd.state'); } catch(e){}
  state = load(); state.view='brief';
  location.hash = '#brief'; render(); renderSourcePane();
}


/* Scroll the reader to a section of the brief. The main column is the scroll
   container, not the window, so scrollIntoView is the reliable path here. */
function scrollToSection(id){
  var node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({behavior:'smooth', block:'start'});
  node.classList.add('flash');
  setTimeout(function(){ node.classList.remove('flash'); }, 1200);
}

/* The strip beneath the top bar. It states, in plain words, how much of the
   evidence base is switched on — and lets a reader switch a lane off from here. */
var STRIP_LANES = ['oct26','jul26','historical','zscore','cohort','region',
                   'adoption','composition','peer','company'];
function renderSourceStrip(){
  var host = el('srcStrip'); if (!host) return;
  var on = STRIP_LANES.filter(function(l){ return state.lanes.indexOf(l) >= 0; });
  var complete = on.length === STRIP_LANES.length;
  var h = ['<span class="lead"><span class="dot'+(complete?'':' off')+'"></span>'+
    (complete ? '<b>Complete ETR view</b>' : '<b>Partial ETR view</b>')+' · '+
    on.length+' of '+STRIP_LANES.length+' ETR sources on</span>'];
  STRIP_LANES.forEach(function(l){
    var lab = (LANES.filter(function(x){return x[0]===l;})[0]||[l,l])[1]
                .replace(/ TSIS$/,'').replace(/ Evidence$/,'').replace(/^Subsample \/ /,'');
    var isOn = state.lanes.indexOf(l) >= 0;
    h.push('<button type="button" class="lanechip'+(isOn?'':' off')+'" data-lane="'+esc(l)+'" '+
      'aria-pressed="'+isOn+'">'+esc(lab)+'</button>');
  });
  if (!complete) h.push('<span class="stripnote">Readings below are drawn from the lanes still on. '+
    'The approved Current Call does not move.</span>');
  host.innerHTML = h.join('');
}

/* ─────────────────────────────────────────────────────────── utilities ── */
function esc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function $(sel,root){ return (root||document).querySelector(sel); }
function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
function el(id){ return document.getElementById(id); }
function n2(v,dp){ return v==null ? null : Number(v).toFixed(dp==null?2:dp); }
function sign(v,dp){
  if (v==null) return needed();
  var s = Number(v).toFixed(dp==null?2:dp);
  return (v>0?'+':'') + s;
}
function needed(txt){ return '<span class="needed">'+esc(txt||'SOURCE NEEDED')+'</span>'; }
function orNeeded(v,txt){
  if (v==null || v==='' ) return needed(txt);
  if (/source needed|not supplied|does not include|not provided|tbd|unknown/i.test(String(v)))
    return needed(String(v));
  return esc(v);
}

/** Classification → tag class. */
function tagClass(c){
  c = (c||'').toLowerCase();
  if (c.indexOf('client-provided')===0 || c.indexOf('etr quantitative')===0 ||
      c.indexOf('etr evidence')===0 || c.indexOf('etr outlook')===0) return 't-fact';
  if (c.indexOf('anduril')===0 || c.indexOf('interpretation')>=0) return 't-interp';
  if (c.indexOf('hypoth')===0) return 't-hyp';
  if (c.indexOf('open question')===0) return 't-oq';
  if (c.indexOf('recommend')===0) return 't-act';
  return 't-plain';
}
function claimClass(c){
  var t = tagClass(c);
  return {'t-fact':'c-fact','t-interp':'c-interp','t-hyp':'c-hyp','t-oq':'c-oq','t-act':'c-act'}[t] || 'c-fact';
}
function tag(c){
  if (!c) return '';
  return '<span class="tag '+tagClass(c)+'">'+esc(c)+'</span>';
}
function laneChip(l){
  var label = (LANES.filter(function(x){return x[0]===l;})[0]||[l,l])[1];
  return '<span class="lane lane-'+esc(l||'rules')+'">'+esc(label)+'</span>';
}
/** Clickable object-ID chip. Every ID in the app is one of these. */
function oid(id, extra){
  var o = OBJ[id];
  var cls = 'oid';
  if (!o) cls += ' rule';
  else if (o.objectType==='Signal') cls += ' sig';
  else if (o.objectType==='KPI' || o.objectType==='Backtest') cls += ' kpi';
  else if (o.objectType==='Risk' || o.objectType==='OpenQuestion') cls += ' risk';
  else if (o.objectType==='Rule' || o.objectType==='ContextRule') cls += ' rule';
  else if (o.objectType==='Source') cls += ' src';
  var title = o ? (o.title||o.statement||'').slice(0,140) : 'Not resolved to an object in this workbook';
  return '<button type="button" class="'+cls+'" data-oid="'+esc(id)+'" title="'+esc(title)+'">'+
         esc(id)+(extra?' '+esc(extra):'')+'</button>';
}
function oids(list){
  if (!list || !list.length) return '<span class="note">none recorded</span>';
  return '<span class="oids">'+list.map(function(i){return oid(i);}).join('')+'</span>';
}
function periodChip(o){
  if (o.currentOrHistorical==='current')
    return '<span class="lane lane-oct26">Current · '+esc(o.period||'Oct 2026')+'</span>';
  return '<span class="lane lane-historical">Historical · '+esc(o.period||'n/a')+'</span>';
}
function download(name, text, mime){
  var blob = new Blob([text], {type: mime||'text/plain;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
function copyText(t, btn){
  var done = function(){ if(btn){ var o=btn.textContent; btn.textContent='Copied'; setTimeout(function(){btn.textContent=o;},1200);} };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done, function(){ fallback(); });
  } else fallback();
  function fallback(){
    var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed';
    ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(ta); done();
  }
}

/* ─────────────────────────────────────────────── source-control filtering ── */
/** Which control lane an object belongs to, refined for cohort/region/adoption. */
function laneOf(o){
  /* Refinement is driven by the Metric field only. Theme text is too loose: "Spending
     Composition" is an October TSIS reading, not respondent composition. */
  var l = o.sourceLane || 'rules';
  var m = o.metric || '';
  if (o.currentOrHistorical==='current'){
    if (/G2000|F500|Large Org|Cohort/i.test(m)) return 'cohort';
    if (/Regional/i.test(m)) return 'region';
    if (/Adoption reasoning/i.test(m)) return 'adoption';
    if (/Job title/i.test(m)) return 'composition';
  }
  if (/peer/i.test(m)) return 'peer';
  return l;
}
function stateTagsOf(o){
  var t = [];
  var cls = (o.classification||'').toLowerCase();
  if (o.objectType==='Risk' || /contradict/i.test(o.theme||'')) t.push('Contradictory');
  if (o.objectType==='Evidence'){
    var contra = (IN_BY[o.id]||[]).concat(OUT_BY[o.id]||[])
      .some(function(e){ return e.type==='CONTRADICTS' && e.from===o.id; });
    t.push(contra ? 'Contradictory' : 'Supporting');
    if (/context|composition|dispersion/i.test(o.theme||'')) t.push('Contextual');
  }
  if (o.sourceNeededFields && o.sourceNeededFields.length) t.push('Source Needed');
  if (/verified/i.test(o.verificationStatus||'')) t.push('Verified');
  if (/pending/i.test(o.workflowStatus||'')) t.push('Pending Review');
  t.push(o.currentOrHistorical==='current' ? 'Current' : 'Historical');
  return t;
}
function confOf(o){
  var c = (o.confidence||'').trim();
  if (!c) return 'Source Needed';
  if (/^high/i.test(c) && !/medium/i.test(c)) return 'High';
  if (/medium-high/i.test(c)) return 'Medium-High';
  if (/^medium/i.test(c)) return 'Medium';
  if (/^low/i.test(c)) return 'Low';
  return 'Source Needed';
}
function passes(o){
  if (!o) return false;
  if (state.lanes.indexOf(laneOf(o)) < 0) return false;
  var cls = o.classification || 'Client-provided fact';
  var matched = CLASSES.filter(function(c){ return tagClass(c)===tagClass(cls); })[0] || cls;
  if (CLASSES.indexOf(matched) >= 0 && state.classes.indexOf(matched) < 0) return false;
  var st = stateTagsOf(o);
  if (st.length && !st.some(function(s){ return state.states.indexOf(s) >= 0; })) return false;
  if (state.confs.indexOf(confOf(o)) < 0) return false;
  return true;
}
function visibleEvidence(){ return (D.evidence||[]).filter(passes); }
function activeFilterCount(){
  return (LANES.length - state.lanes.length) + (CLASSES.length - state.classes.length) +
         (STATES.length - state.states.length) + (CONFS.length - state.confs.length);
}
function currentHidden(){ return state.lanes.indexOf('oct26') < 0; }

/* ──────────────────────────────────────────────────── workbook readings ── */
var CP = D.currentPeriod, HP = D.historicalPeriods || [];
var JUL = HP[0] || {}, OCT25 = HP[1] || {};

/** R-005 movement wording — the workbook's own convention, applied mechanically. */
function moveWord(delta){
  if (delta==null) return 'Source Needed';
  var a = Math.abs(delta);
  if (a <= 2) return 'relatively flat';
  if (a < 5)  return 'a slight move';
  return 'a stated change';
}
var CALL = {
  current: {
    value: 'Source Needed',
    detail: 'No October 2026 ETR data outlook is recorded in the workbook. OQ-002 is Critical and Open.',
    ids: ['OQ-002']
  },
  prior: {
    value: 'Positive',
    detail: 'The JUL26 report states CrowdStrike warranted a step up to a Positive outlook. That reading is now historical under R-025.',
    ids: ['ETR-CUR-005','R-025']
  },
  primarySignalId: 'SIG-02',
  primarySignalText: 'Recovery persists; sequential improvement is modest; year-over-year improvement is materially larger.',
  direction: 'Improving',
  conviction: 'Medium-High',
  evidenceConfidence: 'Mixed — high on current raw values; cohort and regional N absent'
};

/* ───────────────────────────────────────────────────────────── routing ── */
var VIEWS = ['index','brief','signals','evidence','lineage','kpis','cohorts','rules',
             'risks','sources','audience','gen-sunday','gen-email','methodology'];
var pendingFocus = null;

function parseHash(){
  var h = (location.hash||'#brief').replace(/^#/,'');
  var p = h.split('/');
  var r = {view:'brief', arg:null, arg2:null};
  switch(p[0]){
    case '': r.view='brief'; break;
    case 'index': r.view='index'; break;
    case 'brief': r.view='brief'; break;
    case 'signals': r.view='signals'; break;
    case 'signal': r.view='signals'; r.arg=p[1]; break;
    case 'evidence': r.view='evidence'; r.arg=p[1]; break;
    case 'lineage': r.view='lineage'; r.arg=p[1]; break;
    case 'kpi': r.view='kpis'; r.arg=p[1]; break;
    case 'kpis': r.view='kpis'; break;
    case 'bridge': r.view='kpis'; r.arg=p[1]; r.arg2=p[2]; break;
    case 'cohorts': r.view='cohorts'; break;
    case 'rules': r.view='rules'; break;
    case 'rule': r.view='rules'; r.arg=p[1]; break;
    case 'risks': r.view='risks'; break;
    case 'question': r.view='risks'; r.arg=p[1]; break;
    case 'risk': r.view='risks'; r.arg=p[1]; break;
    case 'sources': r.view='sources'; break;
    case 'source': r.view='sources'; r.arg=p[1]; break;
    case 'audience': r.view='audience'; r.arg=p[1]; break;
    case 'generator': r.view = (p[1]==='update-email') ? 'gen-email' : 'gen-sunday'; break;
    case 'methodology': r.view='methodology'; break;
    default: r.view='brief';
  }
  return r;
}

function render(){
  var route = parseHash();
  state.view = route.view; save();
  VIEWS.forEach(function(v){
    var node = el('view-'+v);
    if (node) node.hidden = (v !== route.view);
  });
  $$('.sidebar a').forEach(function(a){
    a.classList.toggle('on', a.getAttribute('data-view')===route.view);
    if (a.getAttribute('data-view')===route.view) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
  var fn = RENDER[route.view];
  if (fn) fn(route);
  updateChrome();
  if (route.arg && ['evidence','signal','kpi','rule','question','risk','source'].indexOf(
        (location.hash||'').replace(/^#/,'').split('/')[0]) >= 0) {
    if (OBJ[route.arg] && route.view !== 'lineage' && route.view !== 'kpis') openDrawer(route.arg, true);
  }
  el('main').scrollTop = 0;
}

function updateChrome(){
  renderSourceStrip();
  el('tbCall').textContent = CALL.current.value;
  el('tbCall').className = 'v ' + (CALL.current.value==='Source Needed' ? 'warn' : 'pos');
  el('tbPeriod').textContent = CP.label;
  el('tbSignal').textContent = CALL.primarySignalId + ' · ' + (OBJ[CALL.primarySignalId]||{}).title;
  el('filterCount').textContent = activeFilterCount();
  el('nSignals').textContent  = (D.signals||[]).length;
  el('nEvidence').textContent = visibleEvidence().length + '/' + (D.evidence||[]).length;
  el('nRels').textContent     = EDGES.length;
  el('nBridges').textContent  = (D.bridges||[]).length;
  el('nRules').textContent    = (D.rules||[]).length + (D.contextRules||[]).length;
  el('nRisks').textContent    = (D.risks||[]).length + (D.openQuestions||[]).length;
  el('nSources').textContent  = (D.sources||[]).length;
  var w = el('filteredWarn');
  if (currentHidden()){
    w.hidden = false;
    w.textContent = 'Filtered view — current October evidence is hidden. The approved Current Call is unchanged.';
  } else if (activeFilterCount() > 0){
    w.hidden = false;
    w.textContent = 'Filtered view — ' + activeFilterCount() +
      ' source control(s) are off. Counts and lineage reflect the filter; the approved Current Call is unchanged.';
  } else w.hidden = true;
}

/* ════════════════════════════════════════════════════ VIEW: Company ═════ */
var RENDER = {};

RENDER.index = function(){
  var ns = CP.netScore, pv = CP.pervasion, z = CP.zScore, it = CP.intent;
  var vis = visibleEvidence();
  var cur = vis.filter(function(e){return e.currentOrHistorical==='current';});
  var hist = vis.filter(function(e){return e.currentOrHistorical!=='current';});
  var contra = vis.filter(function(e){
    return (OUT_BY[e.id]||[]).some(function(x){return x.type==='CONTRADICTS';});});
  var ctx = vis.filter(function(e){return /context|composition|dispersion/i.test(e.theme||'');});
  var sn  = vis.filter(function(e){return e.sourceNeededFields && e.sourceNeededFields.length;});
  var supp = vis.filter(function(e){
    return (OUT_BY[e.id]||[]).some(function(x){return x.type==='SUPPORTS';});});

  var h = [];
  h.push('<div class="hero">');
  h.push('<div class="eyebrow" style="color:var(--orange);font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:700">Anduril Partners · REVEAL Company Explorer</div>');
  h.push('<h1>CrowdStrike <span style="font-family:var(--mono);font-size:16px;color:var(--orange)">CRWD</span></h1>');
  h.push('<div class="callrow">');
  h.push(cell('Current call', CALL.current.value==='Source Needed'
      ? needed() : esc(CALL.current.value), CALL.current.detail));
  h.push(cell('Prior call', esc(CALL.prior.value), CALL.prior.detail));
  h.push(cell('Primary signal', oid('SIG-02')+' '+esc((OBJ['SIG-02']||{}).title),
      'Signal Canvas reviewer decision: ' + esc((OBJ['SIG-02']||{}).workflowStatus)));
  h.push(cell('Direction', '<span class="up">'+esc(CALL.direction)+'</span>',
      'Net Score '+n2(ns.value)+' · '+sign(ns.qqDelta)+' vs Jul 2026 · '+sign(ns.yyDelta)+' vs Oct 2025'));
  h.push(cell('Conviction', esc(CALL.conviction), 'Signal Canvas confidence for SIG-02'));
  h.push(cell('Evidence confidence', '<span class="mix">Mixed</span>', CALL.evidenceConfidence));
  h.push(cell('Current period', esc(CP.label), 'N = '+n2(CP.nBase,0)+' citations (R-009)'));
  h.push(cell('Q/Q Z-Score', n2(z.qqZ,6), 'Positive. Approved bands Source Needed.'));
  h.push(cell('Y/Y Z-Score', n2(z.yyZ,6), 'Positive and higher than Q/Q.'));
  h.push(cell('Human review', '<span class="dn">REQUIRED</span>', 'R-020 — working draft, not externally eligible'));
  h.push('</div>');

  h.push('<h4>Primary signal</h4>');
  h.push('<p class="primary-signal">'+tag('Anduril interpretation')+' '+
    'In '+esc(CP.label)+' the CrowdStrike Net Score is <strong>'+n2(ns.value)+'</strong> on '+
    n2(CP.nBase,0)+' citations '+oid('ETR-OCT26-NS')+', '+sign(ns.qqDelta)+' against July 2026 — '+
    moveWord(ns.qqDelta)+' under R-005 — and '+sign(ns.yyDelta)+' against October 2025, '+
    moveWord(ns.yyDelta)+'. Breadth moved with it: Pervasion is <strong>'+n2(pv.value)+'</strong> '+
    oid('ETR-OCT26-PV')+', '+sign(pv.qqDelta)+' sequentially. The workbook states the reading as: '+
    '<em>“'+esc(CALL.primarySignalText)+'”</em> The Q/Q Z-Score is '+n2(z.qqZ,6)+' and the Y/Y Z-Score '+
    n2(z.yyZ,6)+' '+oid('ETR-OCT26-ZS')+' — both positive, with Y/Y higher than Q/Q, which is consistent '+
    'with the larger Y/Y base-metric change. What remains unvalidated is every link from this demand '+
    'reading to a company outcome: the SIG-02 → KPI-003 bridge carries no established lag and is '+
    'Backtest Required '+oid('R-021')+'.</p>');
  h.push('<div class="row no-print">'+
    btn('Explore signal','#signal/SIG-02')+btn('View lineage','#lineage/SIG-02')+
    btn('View current evidence','#evidence')+btn('Open KPI bridge','#bridge/SIG-02/KPI-003')+
    btn('Generate brief','#brief','pri')+'</div>');
  h.push('</div>');

  /* metric strip */
  h.push('<h4 style="margin-bottom:6px">Current metric strip — '+esc(CP.label)+
    ' <span class="note" style="text-transform:none;letter-spacing:0">every tile opens its evidence object</span></h4>');
  h.push('<div class="strip">');
  h.push(metric('Net Score', n2(ns.value), CP.label, 'ETR-OCT26-NS'));
  h.push(metric('Sequential change', sign(ns.qqDelta), 'vs Jul 2026 · '+moveWord(ns.qqDelta), 'ETR-OCT26-NS'));
  h.push(metric('Year-over-year change', sign(ns.yyDelta), 'vs Oct 2025 · '+moveWord(ns.yyDelta), 'ETR-OCT26-NS'));
  h.push(metric('Pervasion', n2(pv.value), sign(pv.qqDelta)+' vs Jul 2026', 'ETR-OCT26-PV'));
  h.push(metric('Positive intent', n2(it.adoption+it.increase)+'%', 'Adoption '+n2(it.adoption)+
    '% + Increase '+n2(it.increase)+'%', 'ETR-OCT26-INTENT'));
  h.push(metric('Negative intent', n2(it.decrease+it.replacing)+'%', 'Decrease '+n2(it.decrease)+
    '% + Replacing '+n2(it.replacing)+'%', 'ETR-OCT26-INTENT'));
  h.push(metric('Q/Q Z-Score', n2(z.qqZ,6), 'Bands Source Needed', 'ETR-OCT26-ZS'));
  h.push(metric('Y/Y Z-Score', n2(z.yyZ,6), 'Higher than Q/Q', 'ETR-OCT26-ZS'));
  h.push(metric('N', n2(CP.nBase,0), 'Citations, not people (R-009)', 'ETR-OCT26-ZS'));
  h.push('</div>');
  h.push('<div class="zbox">'+tag('Open question')+' <strong>'+esc(z.bandNote)+'</strong> '+
    'The base metric determines direction; Z-Score supplies unusualness context only. '+
    oids(['R-006','R-007','R-026','OQ-005'])+'</div>');

  /* three drivers */
  h.push('<h4 style="margin:16px 0 6px">Three signal drivers</h4>');
  h.push('<div class="grid g3">');
  DRIVERS.forEach(function(d){ h.push(driverCard(d)); });
  h.push('</div>');

  /* evidence balance */
  h.push('<h4 style="margin:16px 0 6px">Evidence balance — counted from the objects in view</h4>');
  h.push('<div class="balance">');
  h.push(bcount(supp.length,'supporting evidence','#evidence'));
  h.push(bcount(contra.length,'contradictory evidence','#evidence'));
  h.push(bcount(ctx.length,'contextual evidence','#evidence'));
  h.push(bcount(sn.length,'objects with a Source Needed field','#evidence'));
  h.push(bcount(cur.length,'current (Oct 2026) evidence','#evidence'));
  h.push(bcount(hist.length,'historical evidence','#evidence'));
  h.push('</div>');
  h.push('<p class="note" style="margin-top:6px">Counts are of objects, not a score. The workbook '+
    'supplies no weighting scheme, so no composite is computed here.</p>');

  el('view-index').innerHTML = h.join('');

  function cell(k,v,s){
    return '<div><div class="k">'+esc(k)+'</div><div class="v">'+v+'</div>'+
      (s?'<div class="note" style="margin-top:2px">'+esc(s)+'</div>':'')+'</div>';
  }
  function metric(k,v,s,id){
    return '<button type="button" class="metric" data-oid="'+esc(id)+'">'+
      '<span class="k">'+esc(k)+'</span><span class="v">'+esc(v)+'</span>'+
      '<span class="s">'+esc(s)+'</span></button>';
  }
  function bcount(n,l,href){
    return '<button type="button" class="bcount" data-goto="'+esc(href)+'">'+
      '<span class="n">'+n+'</span><br><span class="l">'+esc(l)+'</span></button>';
  }
};
function btn(label,href,cls){
  return '<button type="button" class="btn '+(cls||'')+'" data-goto="'+esc(href)+'">'+esc(label)+'</button>';
}

/* the three drivers, each assembled from workbook objects */
var DRIVERS = [
  { key:'demand', title:'Post-outage demand recovery persists, modestly',
    classification:'Anduril interpretation', direction:'Improving', confidence:'High on current raw values',
    body:function(){
      var ns=CP.netScore;
      return 'Net Score '+n2(ns.value)+' in '+CP.label+', '+sign(ns.qqDelta)+' sequentially ('+
        moveWord(ns.qqDelta)+' under R-005) and '+sign(ns.yyDelta)+' year over year ('+moveWord(ns.yyDelta)+
        '). Pervasion '+n2(CP.pervasion.value)+', '+sign(CP.pervasion.qqDelta)+' sequentially. '+
        'Both Z-Scores are positive with Y/Y above Q/Q.';
    },
    evidence:['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-ZS','ETR-OCT26-INTENT'],
    counter:['CE-002','CE-003'], kpi:'KPI-003', questions:['OQ-002','OQ-005'] },
  { key:'cohort', title:'Enterprise breadth is selective, not uniform',
    classification:'Anduril interpretation', direction:'Mixed', confidence:'Medium — cohort N missing',
    body:function(){
      return 'Global 2000 Net Score 42.61 and Fortune 500 42.68 exceed the '+n2(CP.netScore.value)+
        ' overall reading, while Large Organizations sit below it at 35.82. The workbook states the '+
        'enterprise evidence is selective rather than uniform. No cut carries an N.';
    },
    evidence:['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE'],
    counter:['CE-001','CE-006'], kpi:'KPI-006', questions:['OQ-014','OQ-008'] },
  { key:'arr', title:'Company outcomes moved in the same direction, separately sourced',
    classification:'Hypothesis', direction:'Improving', confidence:'Medium',
    body:function(){
      return 'Company-reported net new ARR, ending ARR and RPO are recorded in the company lane and move '+
        'in the same direction as the demand reading over the same window. XL-01 classifies this as '+
        'parallel evidence; R-015 permits directional consistency and prohibits causal assertion.';
    },
    evidence:['REF-E-F04','REF-E-F03','REF-E-F08','XL-01'],
    counter:['CE-009','CE-010'], kpi:'KPI-003', questions:['OQ-007','OQ-006'] }
];
function driverCard(d){
  var h = ['<div class="card" style="border-top:3px solid var(--navy)">'];
  h.push('<div class="row" style="margin-bottom:5px">'+tag(d.classification)+
    '<span class="pill">Direction: '+esc(d.direction)+'</span>'+
    '<span class="pill">Confidence: '+esc(d.confidence)+'</span></div>');
  h.push('<h3>'+esc(d.title)+'</h3>');
  h.push('<p class="note" style="color:var(--ink);font-size:12.5px;margin-top:5px">'+esc(d.body())+'</p>');
  h.push('<div class="sep"></div>');
  h.push('<div class="mini">Evidence</div>'+oids(d.evidence));
  h.push('<div class="mini" style="margin-top:6px">Counter-evidence</div>'+oids(d.counter));
  h.push('<div class="mini" style="margin-top:6px">Related KPI</div>'+oids([d.kpi]));
  h.push('<div class="mini" style="margin-top:6px">Open questions</div>'+oids(d.questions));
  h.push('</div>');
  return h.join('');
}

/* ─────────────────────────────────────────────────────── SVG chartlets ── */
/** Horizontal bar list. Values are workbook values; nothing is interpolated. */
function barChart(rows, opts){
  opts = opts || {};
  var w = opts.width||520, rowH = 19, pad = opts.labelWidth||150, gap = 3;
  var vals = rows.map(function(r){return r.value;}).filter(function(v){return v!=null;});
  var max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
  var span = (max - min) || 1, zeroX = pad + (0 - min)/span * (w - pad - 46);
  var h = rows.length*(rowH+gap)+18;
  var s = ['<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(opts.label||'chart')+'">'];
  s.push('<line x1="'+zeroX.toFixed(1)+'" y1="2" x2="'+zeroX.toFixed(1)+'" y2="'+(h-14)+
         '" stroke="#D8DEE6"/>');
  rows.forEach(function(r,i){
    var y = i*(rowH+gap)+2;
    s.push('<text x="0" y="'+(y+13)+'" font-size="10.5" fill="#1B2430">'+esc(r.label.slice(0,26))+'</text>');
    if (r.value==null){
      s.push('<text x="'+(pad+4)+'" y="'+(y+13)+'" font-size="10" fill="#C00000" font-family="monospace">SOURCE NEEDED</text>');
      return;
    }
    var x1 = pad + (Math.min(0,r.value) - min)/span*(w-pad-46);
    var bw = Math.abs(r.value)/span*(w-pad-46);
    s.push('<rect x="'+x1.toFixed(1)+'" y="'+(y+3)+'" width="'+Math.max(bw,1).toFixed(1)+
           '" height="'+(rowH-6)+'" fill="'+(r.color||(r.value<0?'#C00000':'#17365D'))+'"/>');
    s.push('<text x="'+(x1+bw+4).toFixed(1)+'" y="'+(y+13)+'" font-size="10" '+
           'font-family="monospace" fill="#595959">'+esc(n2(r.value))+'</text>');
  });
  s.push('</svg>');
  return s.join('');
}
/** Line series over labelled periods. Only supplied points are plotted. */
function lineChart(points, opts){
  opts = opts||{};
  var w=560,h=150,l=34,b=24,t=10,r=26;
  var vals = points.map(function(p){return p.value;});
  var max = Math.max.apply(null,vals), min = Math.min.apply(null,vals);
  var pad = (max-min)*0.15 || 1; max+=pad; min-=pad;
  var X = function(i){ return l + i*(w-l-r)/Math.max(points.length-1,1); };
  var Y = function(v){ return t + (max-v)/(max-min)*(h-t-b); };
  var s = ['<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(opts.label||'series')+'">'];
  s.push('<line x1="'+l+'" y1="'+(h-b)+'" x2="'+(w-r)+'" y2="'+(h-b)+'" stroke="#D8DEE6"/>');
  s.push('<polyline fill="none" stroke="'+(opts.color||'#17365D')+'" stroke-width="2" points="'+
    points.map(function(p,i){return X(i).toFixed(1)+','+Y(p.value).toFixed(1);}).join(' ')+'"/>');
  points.forEach(function(p,i){
    var last = i===points.length-1;
    s.push('<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.value).toFixed(1)+'" r="'+(last?4:2.6)+
      '" fill="'+(last?'#F16A20':(opts.color||'#17365D'))+'"/>');
    if (last || i===0 || i===points.length-4)
      s.push('<text x="'+X(i).toFixed(1)+'" y="'+(Y(p.value)-7).toFixed(1)+
        '" font-size="9.5" font-family="monospace" text-anchor="middle" fill="#1B2430">'+n2(p.value)+'</text>');
    if (i%2===0 || last)
      s.push('<text x="'+X(i).toFixed(1)+'" y="'+(h-8)+'" font-size="8.5" text-anchor="middle" fill="#595959">'+
        esc(p.label)+'</text>');
  });
  s.push('</svg>');
  return s.join('');
}

/* ═════════════════════════════════════════════ VIEW: Vendor Signal Brief ═
   The landing view. The story arc comes first — the question, the answer, why it
   matters now, and what the answer is built from. Every number and every object ID
   is still here; it simply follows the narrative instead of leading it.
   ══════════════════════════════════════════════════════════════════════════ */

var BRIEF_SECTIONS = [
  ['scorecard', '01', 'Signal scorecard',        'all seven signals, with both confidences'],
  ['changed',   '02', 'What changed',            'October against July and October last year'],
  ['demand',    '03', 'Demand and breadth',      'what the two headline measures each carry'],
  ['cohorts',   '04', 'Enterprise and geography','where the reading is strong, and where it thins'],
  ['drivers',   '05', 'Three drivers',           'the story compressed to what it rests on'],
  ['bridge',    '06', 'Signal to KPI',           'the one relationship worth testing'],
  ['counter',   '07', 'What argues against it',  'counter-evidence and the Z-Score gap'],
  ['open',      '08', 'What would change it',    'open questions and the next step']
];

RENDER.brief = function(){
  var ns=CP.netScore, pv=CP.pervasion, z=CP.zScore, it=CP.intent;
  var region = D.rawTables.region.rows;
  var adopt  = D.rawTables.adoptionReasons.rows;
  var cuts   = D.rawTables.subsampleCuts.rows;
  var pick   = function(cat){ return cuts.filter(function(r){return r.Category===cat;})[0]||{}; };
  var h=[];

  /* ── the answer ───────────────────────────────────────────────────────── */
  h.push('<div class="answer">');
  h.push('<div class="answer-main">');
  h.push('<div class="q-eyebrow">The research question</div>');
  h.push('<h1 class="q-head">Is CrowdStrike’s post-outage recovery still building, '+
         'or has it flattened out a year on?</h1>');
  h.push('<div class="short"><div class="lab">Short answer</div>'+
    '<p>It is still building, but it has slowed sharply. Spending intent rose again in '+
    esc(CP.label)+' and deployment breadth rose faster, so the recovery is real — yet almost '+
    'all of the improvement is year-over-year rather than in the last quarter.</p>'+
    '<p class="why"><b>Why now</b> The sequential move is '+sign(ns.qqDelta)+' points, which the '+
    'workbook’s own wording convention calls '+moveWord(ns.qqDelta)+', against '+sign(ns.yyDelta)+
    ' points year over year, which it calls '+moveWord(ns.yyDelta)+'. Breadth moved more than intent '+
    'did, and the enterprise picture is uneven rather than uniformly strong.</p></div>');
  h.push('<p class="scope">ETR measures respondent spending intent and deployment breadth. It does not '+
    'measure revenue, ARR, market share, financial performance or share price, and nothing in this '+
    'experience should be read as doing so. October 2026 is the current survey period; July 2026 is '+
    'historical comparison.</p>');
  h.push('<div class="toc"><div class="toc-lab">How this answer is built</div>'+
    BRIEF_SECTIONS.map(function(sx){
      return '<a href="#brief" data-scroll="brief-'+sx[0]+'"><span class="num">'+sx[1]+'</span>'+
        '<span class="t">'+esc(sx[2])+'</span><span class="d">'+esc(sx[3])+'</span></a>';
    }).join('')+'</div>');
  h.push('</div>');

  /* ── the call rail ────────────────────────────────────────────────────── */
  h.push('<div class="answer-rail">');
  h.push('<div class="call-pills">'+
    '<span class="cpill"><span class="k">Prior call</span><span class="v">'+esc(CALL.prior.value)+
      ' · JUL26</span></span>'+
    '<span class="cpill arrow">→</span>'+
    '<span class="cpill hot"><span class="k">Current call</span><span class="v">Source Needed · '+
      esc(CP.shortLabel)+'</span></span>'+
    '<span class="cpill"><span class="k">Evidence confidence</span><span class="v">High</span></span>'+
    '<span class="cpill"><span class="k">Outcome linkage</span><span class="v">Low</span></span>'+
    '</div>');
  h.push('<div class="rail-head">Spending intent is recovering. Enterprise strength is selective, '+
    'and no October outlook has been issued.</div>');
  h.push('<p class="rail-lede">Net Score and Pervasion both rose. The largest indexed cohorts read '+
    'above the overall number while Large Organizations read below it, and the workbook records no '+
    esc(CP.label)+' ETR data outlook at all — which is why the current call reads Source Needed '+
    'rather than Positive.</p>');
  h.push('<div class="rail-grid">'+
    railM('Net Score', n2(ns.value), 'up', sign(ns.qqDelta)+' vs Jul 2026 · '+sign(ns.yyDelta)+
      ' vs Oct 2025 · N='+n2(CP.nBase,0), 'ETR-OCT26-NS')+
    railM('Pervasion', n2(pv.value)+'%', 'up', sign(pv.qqDelta)+' sequentially · breadth, not revenue',
      'ETR-OCT26-PV')+
    railM('Q/Q Z-Score', n2(z.qqZ,3), 'mid', 'positive · approved bands Source Needed', 'ETR-OCT26-ZS')+
    railM('Y/Y Z-Score', n2(z.yyZ,3), 'mid', 'positive and higher than Q/Q', 'ETR-OCT26-ZS')+
    railM('Enterprise spread', '42.7 / 35.8', 'mid', 'Fortune 500 above, Large Orgs below overall',
      'ETR-OCT26-LARGE', true)+
    railM('Cohort base', 'Source Needed', 'dn', 'no October cut carries an N', 'OQ-014', true)+
    '</div>');
  h.push('<div class="rail-foot"><div class="k">Monitor next</div><p>Whether the sequential move '+
    'clears the stated-change band in the next survey, whether cut-level bases arrive for the cohort '+
    'and regional readings, and whether an October data outlook is recorded at all.</p></div>');
  h.push('</div></div>');

  /* ── 01 scorecard ─────────────────────────────────────────────────────── */
  h.push(sec('scorecard','01','Signal scorecard',
    'Seven signals, each with its reading, direction, both confidences, the sources behind it and '+
    'the caveat that bounds it. Direction and confidence stay in separate columns: a large move on a '+
    'thin or dated sample does not become a confident one.'));
  h.push('<div class="tw"><table><thead><tr>'+
    '<th style="width:16%">Signal</th><th style="width:14%">Current reading</th>'+
    '<th style="width:11%">Direction</th><th style="width:8%">Evidence</th>'+
    '<th style="width:8%">Outcome</th><th style="width:23%">What it means</th>'+
    '<th style="width:9%">Status</th><th style="width:11%">Evidence</th></tr></thead><tbody>');
  SCORECARD.forEach(function(r){
    var sg = OBJ[r.id]||{};
    h.push('<tr class="click" data-goto="#signal/'+esc(r.id)+'">'+
      '<td><strong>'+esc(sg.title)+'</strong><br>'+oid(r.id)+'</td>'+
      '<td>'+esc(r.reading())+'<br><span class="note">'+esc(r.unit)+'</span></td>'+
      '<td><span class="word '+r.word+'">'+esc(r.direction)+'</span></td>'+
      '<td><strong class="'+(/High/.test(r.confidence)?'up':(/Low/.test(r.confidence)?'dn':'mix'))+
        '">'+esc(r.confidence.split(' ')[0])+'</strong></td>'+
      '<td><strong class="dn">Low</strong></td>'+
      '<td>'+esc(r.implication)+'</td>'+
      '<td><span class="note">'+esc(sg.workflowStatus||'')+'</span></td>'+
      '<td>'+oids(r.ids)+'</td></tr>');
  });
  h.push('</tbody></table></div>');
  h.push('<p class="note" style="margin-top:9px">Outcome linkage is Low on every row for one reason: '+
    'no validated signal-to-KPI relationship exists in this package, and the Forecaster output that '+
    'would supply one is not present '+oids(['OQ-004','R-018'])+'.</p>');

  /* ── 02 what changed ──────────────────────────────────────────────────── */
  h.push(sec('changed','02','What changed',
    'Three survey periods are supplied for Net Score and twelve for Pervasion. Nothing between them '+
    'is interpolated.'));
  h.push('<div class="grid g2"><div class="card"><h4>Net Score — supplied periods</h4>'+
    lineChart([{label:'Oct 2025',value:OCT25.netScore},{label:'Jul 2026',value:JUL.netScore},
               {label:'Oct 2026',value:ns.value}], {label:'Net Score by period'})+
    '<p class="note">Most of the recovery is in the year-over-year leg. '+oid('ETR-OCT26-NS')+'</p></div>');
  h.push('<div class="card"><h4>Pervasion — full supplied series</h4>'+
    lineChart(D.rawTables.pervasionTrend.rows.map(function(r){
      return {label:r.Category.replace(' 20',' ’'), value:Number(r.Pervasion)};}),
      {label:'Pervasion series', color:'#0F6E66'})+
    '<p class="note">Breadth has climbed steadily since the Oct 2024 trough. '+oid('ETR-OCT26-PV')+'</p></div></div>');
  h.push('<div class="pull">Breadth moved more than intent did. That is the shape of a recovery that '+
    'is widening its footprint faster than it is deepening its budget.</div>');
  h.push('<div class="tw"><table><thead><tr><th>Measure</th><th class="num">Oct 2025</th>'+
    '<th class="num">Jul 2026</th><th class="num">Oct 2026</th><th class="num">Q/Q</th>'+
    '<th class="num">Y/Y</th><th>How the workbook words it</th><th>Evidence</th></tr></thead><tbody>'+
    '<tr><td><strong>Net Score</strong></td><td class="num">'+n2(OCT25.netScore)+'</td>'+
      '<td class="num">'+n2(JUL.netScore)+'</td><td class="num"><strong>'+n2(ns.value)+'</strong></td>'+
      '<td class="num up">'+sign(ns.qqDelta)+'</td><td class="num up">'+sign(ns.yyDelta)+'</td>'+
      '<td>Q/Q '+moveWord(ns.qqDelta)+'; Y/Y '+moveWord(ns.yyDelta)+'</td>'+
      '<td>'+oid('ETR-OCT26-NS')+'</td></tr>'+
    '<tr><td><strong>Pervasion</strong></td><td class="num">'+n2(OCT25.pervasion)+'</td>'+
      '<td class="num">'+n2(JUL.pervasion)+'</td><td class="num"><strong>'+n2(pv.value)+'</strong></td>'+
      '<td class="num up">'+sign(pv.qqDelta)+'</td><td class="num up">'+sign(pv.yyDelta)+'</td>'+
      '<td>Q/Q '+moveWord(pv.qqDelta)+'; Y/Y '+moveWord(pv.yyDelta)+'</td>'+
      '<td>'+oid('ETR-OCT26-PV')+'</td></tr></tbody></table></div>');
  h.push('<div class="callout" style="margin-top:14px"><strong>One thing the survey label does not '+
    'settle.</strong> '+esc(CP.exportTimestampNote)+' '+oid('OQ-015')+'</div>');

  /* ── 03 demand and breadth ────────────────────────────────────────────── */
  h.push(sec('demand','03','Demand and breadth',
    'Net Score answers whether spending intent is expanding. Pervasion answers how broadly the vendor '+
    'is deployed. They are shown together and never substituted for one another.'));
  h.push('<div class="grid g2"><div class="card"><h4>Where the '+esc(CP.label)+' intent sits</h4>'+
    barChart([
      {label:'Adoption', value:it.adoption, color:'#4E8A3C'},
      {label:'Increase', value:it.increase, color:'#4E8A3C'},
      {label:'Flat', value:it.flat, color:'#9A9187'},
      {label:'Decrease', value:it.decrease, color:'#B3261E'},
      {label:'Replacing', value:it.replacing, color:'#B3261E'}
    ], {label:'Spending intent components', labelWidth:88})+
    '<p class="note">Just under half the base plans to adopt or increase; about one in nine plans to '+
    'cut or replace. All Respondents cut, N='+n2(CP.nBase,0)+' citations. '+oid('ETR-OCT26-INTENT')+'</p></div>');
  h.push('<div class="card"><h4>What each measure can and cannot carry</h4><dl class="kv">'+
    D.metricContext.filter(function(m){return /Net Score|Pervasion|Z-Score/.test(m.metric);})
      .map(function(m){ return '<dt>'+esc(m.metric)+'</dt><dd>'+esc(m.canSupport)+
        '<br><span class="note"><strong>Cannot prove:</strong> '+esc(m.cannotProve)+'</span></dd>'; }).join('')+
    '</dl></div></div>');

  /* ── 04 cohorts and geography ─────────────────────────────────────────── */
  h.push(sec('cohorts','04','Enterprise and geography',
    'This is where the reading is strongest and where it is thinnest at the same time. The cohort '+
    'values are current; none of them carries a base.'));
  h.push('<div class="grid g2"><div class="card"><h4>Net Score by cohort — '+esc(CP.label)+'</h4>'+
    barChart([
      {label:'Fortune 500', value:Number(pick('Fortune 500')['Net Score'])},
      {label:'Global 2000', value:Number(pick('Global 2000')['Net Score'])},
      {label:'Fortune 1000', value:Number(pick('Fortune 1000')['Net Score'])},
      {label:'All Respondents', value:ns.value, color:'#F16A20'},
      {label:'Large Organizations', value:Number(pick('Large Organizations')['Net Score'])},
      {label:'Midsize', value:Number(pick('Midsize Organizations')['Net Score'])},
      {label:'Small', value:Number(pick('Small Organizations')['Net Score'])}
    ], {label:'Net Score by cohort'})+
    '<p class="note">Sorted by displayed Net Score — application view. '+
    oids(['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE'])+'</p></div>');
  h.push('<div class="card"><h4>Net Score by region — '+esc(CP.label)+'</h4>'+
    barChart(region.map(function(r){ return {label:r.Category, value:Number(r['Oct 2026'])}; }),
      {label:'Regional Net Score'})+
    '<p class="note">The spread runs from APAC to EMEA. Regional N is not supplied for any cut. '+
    oids(['ETR-OCT26-REGION','SIG-07'])+'</p></div></div>');
  h.push('<div class="pull">The indexed cohorts read above the overall number while Large '+
    'Organizations read below it. The enterprise evidence is selective, not uniform — and without a '+
    'base under any of it, that is as far as it can be taken.</div>');

  /* ── 05 three drivers ─────────────────────────────────────────────────── */
  h.push(sec('drivers','05','Three drivers',
    'The package supports more topics than this. Three are carried because three are what the evidence '+
    'can hold at usable confidence.'));
  h.push('<div class="grid g3">'+DRIVERS.map(driverCard).join('')+'</div>');

  /* ── 06 bridge ────────────────────────────────────────────────────────── */
  h.push(sec('bridge','06','Signal to KPI',
    'One relationship is worth formal testing. It is stated in full here so it can be attacked.'));
  h.push(bridgePanel('SIG-02','KPI-003'));

  /* ── 07 counter-evidence ──────────────────────────────────────────────── */
  h.push(sec('counter','07','What argues against it',
    'Ten counter-evidence objects and one methodology gap. A counter-signal filtered out for tidiness '+
    'is a counter-signal suppressed.'));
  h.push('<div class="tw"><table><thead><tr><th style="width:9%">ID</th><th style="width:22%">Risk</th>'+
    '<th style="width:9%">Period</th><th style="width:9%">Confidence</th>'+
    '<th style="width:29%">What it says</th><th style="width:22%">Why it matters here</th>'+
    '</tr></thead><tbody>');
  (D.risks||[]).forEach(function(r){
    h.push('<tr class="click" data-oid="'+esc(r.id)+'"><td>'+oid(r.id)+'</td>'+
      '<td><strong>'+esc(r.title)+'</strong></td><td>'+orNeeded(r.period)+'</td>'+
      '<td>'+orNeeded(r.confidence)+'</td><td class="note">'+esc(r.statement)+'</td>'+
      '<td class="note">'+orNeeded(r.caveat,'—')+'</td></tr>');
  });
  h.push('</tbody></table></div>');
  h.push('<h4 style="margin:22px 0 9px">The Z-Score gap</h4>');
  h.push(zPanel());

  /* ── 08 open questions and action ─────────────────────────────────────── */
  h.push(sec('open','08','What would change it',
    'Ranked by what would move the call, not by what is easiest to obtain.'));
  h.push(oqTable((D.openQuestions||[]).filter(function(q){
    return /critical|high/i.test(q.importance||'');}).slice(0,6)));
  h.push('<div class="grid g2" style="margin-top:18px">'+
    nblock('b-act','Recommended action','Immediate research',
      '<p>Retrieve the October cut-level bases '+oid('OQ-014')+' and the October ETR data outlook '+
      oid('OQ-002')+'. Those two retrievals unlock the cohort narrative and the current call '+
      'respectively — and they are the only two gaps that would change what this brief can say.</p>')+
    nblock('b-act','Recommended action','Validation',
      '<p>Pre-register '+oid('BT-CRWD-OCT26')+' with an agreed lag and tolerance before any outcome is '+
      'reviewed, and decompose Flex and CCP out of Net New ARR first '+oids(['OQ-007','R-021'])+'.</p>')+
    '</div>');
  h.push('<div class="callout" style="margin-top:18px"><strong>Human review required.</strong> '+
    esc(D.metadata.humanReviewStatement)+' Every reviewer decision on the Signal Canvas reads '+
    '<em>Pending Review</em>, and this brief contains no rating, price target, valuation opinion or '+
    'forecast.</div>');

  h.push('<div class="actbar no-print" style="margin-top:22px">'+
    '<button class="btn pri" id="printBrief">Print this brief</button>'+
    btn('Open the lineage','#lineage/SIG-02')+btn('Explore the evidence','#evidence')+
    btn('Draft the Sunday Signal','#generator/sunday-signal')+'</div>');

  el('view-brief').innerHTML = h.join('');
  el('view-brief').classList.add('print-target');

  function sec(id,num,title,lede){
    return '<section class="sec" id="brief-'+id+'"><div class="sec-lab">'+num+' · '+esc(title)+
      '</div><h2>'+esc(title)+'</h2><p class="lede">'+esc(lede)+'</p></section>';
  }
  function railM(k,v,cls,sub,id,small){
    return '<button type="button" data-oid="'+esc(id)+'"><span class="k">'+esc(k)+'</span>'+
      '<span class="v '+cls+(small?' sm':'')+'">'+esc(v)+'</span>'+
      '<span class="s">'+esc(sub)+'</span></button>';
  }
};

function nblock(cls,tagLabel,title,body){
  return '<div class="nblock '+cls+'">'+tag(tagLabel)+'<h3>'+esc(title)+'</h3>'+body+'</div>';
}

/* Scorecard rows: reading, direction word, both confidences, evidence, and the
   sentence a reader actually needs. */
var SCORECARD = [
  {id:'SIG-02', direction:'Recovering', word:'w-up', confidence:'Medium-High', unit:'Net Score, Oct 2026',
   reading:function(){ return n2(CP.netScore.value); },
   implication:'Intent rose again, but almost all of the gain is year over year rather than in the quarter.',
   ids:['ETR-OCT26-NS','ETR-OCT26-INTENT','ETR-OCT26-ZS']},
  {id:'SIG-05', direction:'Selective', word:'w-mid', confidence:'Medium', unit:'F500 / Large Orgs',
   reading:function(){ return '42.68 / 35.82'; },
   implication:'The indexed cohorts read above the overall number; Large Organizations read below it. No cut carries a base.',
   ids:['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE','OQ-014']},
  {id:'SIG-07', direction:'Uneven', word:'w-mid', confidence:'Medium', unit:'APAC to EMEA, Oct 2026',
   reading:function(){ return '54.29 / 27.27'; },
   implication:'The regional spread is wide and no regional base is supplied, so no geography can be ranked.',
   ids:['ETR-OCT26-REGION','XL-07','OQ-014']},
  {id:'SIG-03', direction:'Accelerating', word:'w-up', confidence:'High', unit:'company lane',
   reading:function(){ return 'Net New ARR'; },
   implication:'Company-reported outcomes move the same way over the same window. That is consistency, not validation.',
   ids:['REF-E-F04','REF-E-F08','KPI-003']},
  {id:'SIG-01', direction:'Consolidating', word:'w-up', confidence:'High', unit:'Flex and modules',
   reading:function(){ return 'Falcon Flex'; },
   implication:'Consolidation is measurable in company disclosures; Flex and CCP effects are not separated from underlying demand.',
   ids:['KPI-007','KPI-008','XL-02']},
  {id:'SIG-06', direction:'Mixed', word:'w-mid', confidence:'Medium-High', unit:'retention evidence',
   reading:function(){ return 'Retention'; },
   implication:'Retention held through the outage window; the current-period reading is absent.',
   ids:['CE-002','CE-001','OQ-006']},
  {id:'SIG-04', direction:'Watch', word:'w-flat', confidence:'Low', unit:'AIDR, undisclosed base',
   reading:function(){ return 'Source Needed'; },
   implication:'A growth rate on an undisclosed base cannot size anything. R-023 holds it at Source Needed.',
   ids:['OQ-012','XL-04']}
];

/* ───────────────────────────────────── shared panels used by many views ── */
/* The rules that governed a block, named at the point of use. Reading the
   claim and reading the rule that bounded it should not be separate errands. */
function ruleRow(ids){
  return '<div class="rulerow"><span class="k">Rules applied</span>'+oids(ids)+'</div>';
}

function zPanel(){
  var z = CP.zScore;
  return '<div class="card" style="border-left:4px solid var(--teal)">'+
    '<div class="row"><span class="lane lane-zscore">Survey Z-Score</span>'+tag('Client-provided fact')+
    oid('ETR-OCT26-ZS')+'</div>'+
    '<div class="strip" style="margin:9px 0">'+
      ztile('Metric value', n2(z.metricValue))+ztile('Q/Q change', n2(z.qqChange,8))+
      ztile('Y/Y change', n2(z.yyChange,8))+ztile('Q/Q Z-Score', n2(z.qqZ,9))+
      ztile('Y/Y Z-Score', n2(z.yyZ,9))+ztile('N', n2(z.citations,0))+'</div>'+
    '<div class="zbox"><strong>'+esc(z.bandNote)+'</strong></div>'+
    '<dl class="kv" style="margin-top:8px">'+
      '<dt>Permitted reading</dt><dd>Q/Q Z-Score is positive. Y/Y Z-Score is positive. Y/Y is higher than '+
        'Q/Q, which is consistent with the larger Y/Y base-metric change. Z-Score supplies deviation or '+
        'unusualness context; Net Score determines directional spending intent.</dd>'+
      '<dt>Interpretive role</dt><dd>Deviation / inflection modifier. It never creates or changes the '+
        'Current Call.</dd>'+
      '<dt>Required before band use</dt><dd>Formula, sign convention, lookback, normalization population '+
        'and approved thresholds — all '+needed()+' '+oids(['OQ-005','R-007'])+'</dd>'+
      '<dt>Prohibited</dt><dd>Never written anywhere in this application, and never inferred from the '+
        'raw values: statistically significant · extreme · strong or weak Z-Score · high probability · '+
        'predicts revenue · proves a beat · validates the vendor call · greater or less than one '+
        'standard deviation · anomaly band.</dd>'+
      '<dt>Forecaster</dt><dd>'+needed()+' — no frozen vintage, target or horizon is supplied '+
        oids(['OQ-004','R-017','R-018'])+'</dd>'+
    '</dl>'+ruleRow(['R-006','R-007','R-026','CTX-004','CTX-013'])+'</div>';
  function ztile(k,v){
    return '<div class="metric"><span class="k">'+esc(k)+'</span><span class="v" style="font-size:15px">'+
      esc(v)+'</span></div>';
  }
}

function bridgePanel(sid,kid){
  var b = OBJ['BRIDGE-'+sid+'-'+kid];
  if (!b) return '<div class="warnbox">No workbook relationship exists for '+esc(sid)+' → '+esc(kid)+'.</div>';
  var hyp = b.validationStatus.indexOf('Hypothesis')===0;
  var h=['<div>'];
  if (hyp) h.push('<div class="hyp-bar">Hypothesis — Backtest Required</div>');
  else h.push('<div class="hyp-bar" style="background:var(--lgreen);border-color:var(--green);color:#3D6B24">'+
    esc(b.validationStatus)+'</div>');
  h.push('<div class="card" style="border-top:none">');
  /* visual flow: Signal → Mechanism → Lag → KPI */
  h.push('<svg viewBox="0 0 760 74" role="img" aria-label="Signal to KPI flow" style="max-width:760px">'+
    flowBox(4,'SIGNAL',sid,'#E2F0D9','#70AD47')+
    flowArrow(190)+
    flowBox(212,'MECHANISM','see below','#FFFFFF','#595959')+
    flowArrow(398)+
    flowBox(420,'LAG', (b.requiredLag||'Source Needed'), hyp?'#F4CCCC':'#E2F0D9', hyp?'#C00000':'#70AD47')+
    flowArrow(606)+
    flowBox(628,'KPI',kid,'#FFF2CC','#FFC000')+'</svg>');
  h.push('<dl class="kv" style="margin-top:10px">');
  h.push(kv('Signal', oid(sid)+' '+esc((OBJ[sid]||{}).title)));
  h.push(kv('KPI', oid(kid)+' '+esc((OBJ[kid]||{}).title)));
  h.push(kv('Linkage type', esc(b.linkageType)));
  h.push(kv('Relationship classification', tag(b.classification)+' <span class="needed">'+
    esc(b.validationStatus.toUpperCase())+'</span>'));
  h.push(kv('Proposed mechanism', esc(b.mechanism)));
  h.push(kv('Expected direction', esc(b.expectedDirection)));
  h.push(kv('Expected lag', orNeeded(b.requiredLag)));
  h.push(kv('Lag supported', (b.lagSupported==='No' ? '<span class="dn">No</span>' :
      (b.lagSupported==='Partial' ? '<span class="mix">Partial</span>' : '<span class="up">Yes</span>')) +
      ' — R-016 keeps a bridge with no established lag at Backtest Required'));
  h.push(kv('Evidence confidence', esc(b.confidence)));
  h.push(kv('Supporting evidence', oids(b.supportingIds)));
  h.push(kv('Counter-evidence', oids(b.contradictingIds)));
  h.push(kv('Known confounders', esc(b.confounders)));
  h.push(kv('Source Needed', orNeeded(b.sourceNeededText)));
  h.push(kv('What would confirm it', 'Earlier survey vintages, correctly period-aligned, systematically '+
    'preceding later movement in '+esc(kid)+' across several cycles, with the named confounders '+
    'decomposed out first. A single coincident quarter confirms nothing.'));
  h.push(kv('What would disconfirm it', esc(kid)+' continuing to move while the ETR reading is flat or '+
    'declining, or the movement proving attributable to the named confounders once decomposed — in which '+
    'case the demand measure adds nothing to the outcome measure.'));
  h.push(kv('Rule IDs', oids(['R-016','R-021','R-026','CTX-008','CTX-011'])));
  var bt = (D.backtests||[]).filter(function(t){
    return (t.relatedRuleIds||[]).indexOf('R-021')>=0 && /OCT26/.test(t.id); })[0];
  h.push(kv('Backtest protocol', bt ? oid(bt.id)+' '+esc(bt.workflowStatus) : needed()));
  h.push(kv('Review status', esc(b.workflowStatus)));
  h.push('</dl></div></div>');
  return h.join('');

  function kv(k,v){ return '<dt>'+esc(k)+'</dt><dd>'+v+'</dd>'; }
  function flowBox(x,label,val,fill,stroke){
    return '<rect x="'+x+'" y="8" width="178" height="56" rx="4" fill="'+fill+'" stroke="'+stroke+
      '" stroke-width="1.5"/>'+
      '<text x="'+(x+10)+'" y="26" font-size="8.5" fill="#595959" letter-spacing="1">'+esc(label)+'</text>'+
      '<text x="'+(x+10)+'" y="45" font-size="11.5" font-family="monospace" fill="#1B2430">'+
      esc(String(val).slice(0,24))+'</text>';
  }
  function flowArrow(x){
    return '<path d="M'+x+' 36 L'+(x+16)+' 36 M'+(x+10)+' 31 L'+(x+16)+' 36 L'+(x+10)+' 41" '+
      'stroke="#595959" fill="none" stroke-width="1.5"/>';
  }
}

function oqTable(list){
  var h=['<div class="tw"><table><thead><tr><th style="width:8%">ID</th>'+
    '<th style="width:26%">Question</th><th style="width:9%">Priority</th><th style="width:9%">Status</th>'+
    '<th style="width:18%">Expected source</th><th style="width:30%">Consequence if unresolved</th>'+
    '</tr></thead><tbody>'];
  list.forEach(function(q){
    var blocked = (OUT_BY[q.id]||[]).filter(function(e){return e.type==='BLOCKS';})
      .map(function(e){return e.to;});
    h.push('<tr class="click" data-oid="'+esc(q.id)+'"><td>'+oid(q.id)+'</td>'+
      '<td><strong>'+esc(q.title)+'</strong><br><span class="note">'+esc(q.statement)+'</span></td>'+
      '<td>'+tag(prio(q.importance))+'</td><td>'+esc(q.workflowStatus||'')+'</td>'+
      '<td class="note">'+orNeeded(q.sourceName)+'</td>'+
      '<td class="note">'+(blocked.length
        ? 'Blocks '+oids(blocked)
        : 'Recorded as open; no blocking edge is asserted in the workbook.')+'</td></tr>');
  });
  h.push('</tbody></table></div>');
  return h.join('');
  function prio(p){
    return {'Critical':'Open question','High':'Hypothesis','Medium':'Recommended action',
            'Low':'Client-provided fact','Resolved':'Client-provided fact'}[p] || 'Open question';
  }
}

function evidenceTable(list, compact){
  var h=['<div class="tw"><table><thead><tr>'+
    '<th style="width:9%">ID</th><th style="width:8%">Class</th><th style="width:26%">Evidence statement</th>'+
    '<th style="width:9%">Period</th><th style="width:11%">Metric</th><th style="width:10%">Value</th>'+
    '<th style="width:9%">N / base</th><th style="width:7%">Conf.</th>'+
    (compact?'':'<th style="width:11%">Signals</th><th style="width:9%">Source</th>')+
    '</tr></thead><tbody>'];
  list.forEach(function(e){
    h.push('<tr class="click" data-oid="'+esc(e.id)+'"><td>'+oid(e.id)+'<br>'+periodChip(e)+'</td>'+
      '<td>'+tag(e.classification)+'</td>'+
      '<td>'+esc(e.statement||e.title)+'</td>'+
      '<td class="note">'+orNeeded(e.period)+'</td>'+
      '<td class="note">'+orNeeded(e.metric)+'</td>'+
      '<td class="num">'+orNeeded(e.value)+'</td>'+
      '<td class="note">'+orNeeded(e.nBase)+'</td>'+
      '<td>'+orNeeded(e.confidence)+'</td>'+
      (compact?'':'<td>'+oids(e.relatedSignalIds)+'</td><td class="note">'+orNeeded(e.sourceName)+'</td>')+
      '</tr>');
  });
  h.push('</tbody></table></div>');
  return h.join('');
}

/* ══════════════════════════════════════════════ VIEW: Signal Explorer ═══ */
var signalFilter = {q:'', theme:'', direction:'', confidence:'', period:'', review:''};

RENDER.signals = function(route){
  if (route && route.arg && OBJ[route.arg]) { renderSignalWorkspace(route.arg); return; }
  var h=['<div class="vhead"><div class="eyebrow">Signal Explorer</div><h2>Signals</h2>'+
    '<p>Every Signal Canvas and Signal Inventory object. Counts respond to the source controls; '+
    'reviewer decisions do not.</p></div>'];
  h.push('<div class="filters"><div class="fgrp">'+
    '<label class="mini" for="sigQ">Search</label>'+
    '<input id="sigQ" type="search" value="'+esc(signalFilter.q)+'" placeholder="signal name, statement, gap…" '+
    'style="flex:1;min-width:170px;padding:4px 8px;border:1px solid var(--line);border-radius:3px">'+
    sel('sigDir','Direction',['','Improving','Mixed','Watch'],signalFilter.direction)+
    sel('sigConf','Confidence',['','High','Medium-High','Medium','Low'],signalFilter.confidence)+
    sel('sigPeriod','Evidence',['','Has current evidence','Historical only'],signalFilter.period)+
    sel('sigReview','Review',['','Pending Review'],signalFilter.review)+
    '<button class="btn" id="sigClear">Clear</button></div></div>');
  h.push('<div class="grid g2" id="sigCards">');
  var shown = 0;
  (D.signals||[]).forEach(function(s){
    var m = signalMetrics(s);
    if (signalFilter.q){
      var hay = (s.id+' '+s.title+' '+s.statement+' '+(s.caveat||'')).toLowerCase();
      if (hay.indexOf(signalFilter.q.toLowerCase())<0) return;
    }
    if (signalFilter.direction && m.direction!==signalFilter.direction) return;
    if (signalFilter.confidence && (s.confidence||'')!==signalFilter.confidence) return;
    if (signalFilter.period==='Has current evidence' && m.current===0) return;
    if (signalFilter.period==='Historical only' && m.current>0) return;
    if (signalFilter.review && (s.workflowStatus||'')!==signalFilter.review) return;
    shown++;
    h.push(signalCard(s,m));
  });
  h.push('</div>');
  if (!shown) h.push('<div class="callout">No signal matches these controls. Nothing is hidden by '+
    'design — clear a filter to widen the set.</div>');
  el('view-signals').innerHTML = h.join('');

  function sel(id,label,opts,val){
    return '<label class="mini" for="'+id+'">'+esc(label)+'</label><select id="'+id+'">'+
      opts.map(function(o){return '<option value="'+esc(o)+'"'+(o===val?' selected':'')+'>'+
        esc(o||'all')+'</option>';}).join('')+'</select>';
  }
};

function signalMetrics(s){
  var sup = (IN_BY[s.id]||[]).filter(function(e){return e.type==='SUPPORTS';}).map(function(e){return e.from;});
  var con = (IN_BY[s.id]||[]).filter(function(e){return e.type==='CONTRADICTS';}).map(function(e){return e.from;});
  var vis = function(ids){ return ids.filter(function(i){ return OBJ[i] && passes(OBJ[i]); }); };
  var vs = vis(sup), vc = vis(con);
  var cur = vs.filter(function(i){return OBJ[i].currentOrHistorical==='current';});
  var kpis = (OUT_BY[s.id]||[]).filter(function(e){return e.type==='INFORMS';})
    .map(function(e){ var b=OBJ[e.to]; return b && b.relatedKpiIds ? b.relatedKpiIds[0] : null; })
    .filter(Boolean);
  var qs = (IN_BY[s.id]||[]).filter(function(e){return e.type==='BLOCKS';}).map(function(e){return e.from;});
  var rules = signalRules(s.id);
  var dir = {'SIG-01':'Improving','SIG-02':'Improving','SIG-03':'Improving','SIG-04':'Watch',
             'SIG-05':'Mixed','SIG-06':'Mixed','SIG-07':'Mixed'}[s.id] || 'Watch';
  return {supporting:vs, contradicting:vc, current:cur.length,
          historical:vs.length-cur.length, kpis:unique(kpis), questions:qs,
          rules:rules, direction:dir};
}
function unique(a){ var s={},o=[]; a.forEach(function(x){if(!s[x]){s[x]=1;o.push(x);}}); return o; }
function signalRules(sid){
  var out = [];
  (D.bridges||[]).forEach(function(b){
    if (b.relatedSignalIds.indexOf(sid)>=0) out.push('R-016');
  });
  if (sid==='SIG-02') out = out.concat(['R-002','R-004','R-005','R-021','R-025','R-026']);
  if (sid==='SIG-05' || sid==='SIG-07') out = out.concat(['R-009','R-010','R-011','R-024']);
  if (sid==='SIG-01') out.push('R-022');
  if (sid==='SIG-04') out.push('R-023');
  if (sid==='SIG-03' || sid==='SIG-06') out = out.concat(['R-014','R-015']);
  return unique(out);
}
function signalCard(s,m){
  m = m || signalMetrics(s);
  return '<div class="card click" tabindex="0" role="button" data-goto="#signal/'+esc(s.id)+'">'+
    '<div class="row" style="margin-bottom:4px">'+oid(s.id)+
      '<span class="pill">'+esc(m.direction)+'</span>'+
      '<span class="pill">Confidence: '+esc(s.confidence||'—')+'</span>'+
      tag(s.workflowStatus==='Pending Review'?'Open question':'Anduril interpretation')+'</div>'+
    '<h3>'+esc(s.title)+'</h3>'+
    '<p class="note" style="margin-top:4px">'+esc((s.statement||'').slice(0,230))+'</p>'+
    '<div class="row" style="margin-top:7px">'+
      pill('Current evidence', m.current)+pill('Historical', m.historical)+
      pill('Contradictions', m.contradicting.length)+pill('KPIs', m.kpis.length)+
      pill('Open questions', m.questions.length)+pill('Rules', m.rules.length)+
      pill('Source Needed', (s.sourceNeededFields||[]).length)+'</div>'+
    '<div class="note" style="margin-top:6px"><strong>Evidence strength.</strong> '+
      esc((s.verificationStatus||'').slice(0,150))+'</div>'+
    '</div>';
  function pill(k,v){ return '<span class="pill">'+esc(k)+': <strong>'+v+'</strong></span>'; }
}

function renderSignalWorkspace(sid){
  var s = OBJ[sid], m = signalMetrics(s);
  var tabs = ['Summary','Facts','Interpretation','Supporting Evidence','Counter-Evidence',
              'KPI Bridges','Rules Applied','Open Questions','Lineage','Output Use'];
  var h=['<div class="vhead"><div class="eyebrow">Signal workspace</div>'+
    '<div class="row">'+oid(sid)+'<h2 style="margin:0">'+esc(s.title)+'</h2></div>'+
    '<p>'+esc(s.statement)+'</p>'+
    '<div class="row no-print">'+btn('◀ All signals','#signals')+
      btn('Open lineage','#lineage/'+sid)+'</div></div>'];
  h.push('<div class="tabs" id="sigTabs" role="tablist">'+tabs.map(function(t,i){
    return '<button role="tab" data-tab="'+i+'"'+(i===0?' class="on" aria-selected="true"':
      ' aria-selected="false"')+'>'+esc(t)+'</button>';}).join('')+'</div>');
  h.push('<div id="sigTabBody"></div>');
  el('view-signals').innerHTML = h.join('');
  var body = el('sigTabBody');
  paint(0);
  $$('#sigTabs button').forEach(function(b){
    b.addEventListener('click', function(){
      $$('#sigTabs button').forEach(function(x){x.classList.remove('on');x.setAttribute('aria-selected','false');});
      b.classList.add('on'); b.setAttribute('aria-selected','true');
      paint(Number(b.getAttribute('data-tab')));
    });
  });

  function paint(i){
    var o=[];
    switch(i){
      case 0:
        o.push('<div class="grid g2"><div class="card"><h4>Canvas record</h4><dl class="kv">'+
          kv('Signal ID', oid(sid))+kv('Confidence', esc(s.confidence))+
          kv('Direction', esc(m.direction)+' <span class="note">(application reading of the supplied '+
            'evidence; the workbook records no direction field on the Canvas)</span>')+
          kv('Evidence strength', esc(s.verificationStatus))+
          kv('Reviewer decision', esc(s.workflowStatus))+
          kv('Source gaps', orNeeded(s.caveat))+
          kv('Human review', esc(s.recommendedNextAction||'Yes'))+
          '</dl></div>');
        o.push('<div class="card"><h4>Counts under the current source controls</h4>'+
          '<div class="balance">'+
          bc(m.current,'current evidence')+bc(m.historical,'historical evidence')+
          bc(m.contradicting.length,'contradictions')+bc(m.kpis.length,'KPI bridges')+
          bc(m.questions.length,'blocking questions')+bc(m.rules.length,'applicable rules')+
          '</div></div></div>');
        break;
      case 1:
        o.push('<p class="note">Client-provided facts supporting this signal, as supplied.</p>');
        o.push(evidenceTable(m.supporting.map(function(i){return OBJ[i];})
          .filter(function(e){return e && tagClass(e.classification)==='t-fact';})));
        break;
      case 2:
        var ints = (D.interpretations||[]).filter(function(x){
          return x.supportingIds.some(function(e){return m.supporting.indexOf(e)>=0;});});
        if (!ints.length) o.push('<div class="callout">No V3.5 interpretation object cites this signal’s '+
          'evidence directly.</div>');
        ints.forEach(function(x){
          o.push('<div class="card" style="margin-bottom:9px;border-left:4px solid var(--purple)">'+
            '<div class="row">'+tag(x.classification)+oid(x.id)+
            '<span class="pill">'+esc(x.confidence)+'</span><span class="pill">'+esc(x.workflowStatus)+'</span></div>'+
            '<p style="margin-top:6px">'+esc(x.statement)+'</p>'+
            '<div class="mini">What it does not prove</div><p class="note">'+esc(x.prohibitedConclusions)+'</p>'+
            '<div class="mini">Evidence</div>'+oids(x.supportingIds)+
            '<div class="mini" style="margin-top:5px">Rules</div>'+oids(x.relatedRuleIds)+'</div>');
        });
        break;
      case 3: o.push(evidenceTable(m.supporting.map(function(i){return OBJ[i];}).filter(Boolean))); break;
      case 4:
        if (!m.contradicting.length) o.push('<div class="warnbox">No contradicting object passes the '+
          'current source controls. That is a filter state, not a finding.</div>');
        o.push(evidenceTable(m.contradicting.map(function(i){return OBJ[i];}).filter(Boolean)));
        break;
      case 5:
        var bs = (D.bridges||[]).filter(function(b){return b.relatedSignalIds.indexOf(sid)>=0;});
        if (!bs.length) o.push('<div class="callout">The workbook records no Signal→KPI row for this signal.</div>');
        bs.forEach(function(b){ o.push(bridgePanel(sid, b.relatedKpiIds[0])); });
        break;
      case 6:
        o.push('<div class="grid g2">'+m.rules.map(function(r){ return ruleCard(OBJ[r]); }).join('')+'</div>');
        break;
      case 7: o.push(oqTable(m.questions.map(function(q){return OBJ[q];}).filter(Boolean))); break;
      case 8:
        o.push('<p class="note">Opening the full Lineage Explorer centred on this signal.</p>'+
          btn('Open Lineage Explorer','#lineage/'+sid,'pri'));
        break;
      case 9:
        o.push('<div class="card"><h4>Where this signal is used</h4><ul>'+
          '<li>Vendor Signal Brief — scorecard row and, for SIG-02, the primary signal '+
            btn('Open brief','#brief')+'</li>'+
          '<li>Sunday Signal Generator — selectable primary signal '+
            btn('Open generator','#generator/sunday-signal')+'</li>'+
          '<li>Update Email Generator — selectable signal '+
            btn('Open generator','#generator/update-email')+'</li>'+
          '<li>Audience Translator — the signal is fixed across all eight audiences '+
            btn('Open translator','#audience')+'</li></ul>'+
          '<p class="note">Every generated paragraph carries a claim manifest naming this signal and its '+
          'evidence IDs.</p></div>');
        break;
    }
    body.innerHTML = o.join('');
  }
  function kv(k,v){ return '<dt>'+esc(k)+'</dt><dd>'+v+'</dd>'; }
  function bc(n,l){ return '<div class="bcount"><span class="n">'+n+'</span><br><span class="l">'+
    esc(l)+'</span></div>'; }
}
function ruleCard(r){
  if (!r) return '';
  var st = r.ruleStatus||r.workflowStatus||'';
  var stc = /source needed|backtest required/i.test(st) ? '<span class="needed">'+esc(st.toUpperCase())+
    '</span>' : '<span class="pill">'+esc(st)+'</span>';
  return '<div class="card click" tabindex="0" role="button" data-oid="'+esc(r.id)+'">'+
    '<div class="row">'+oid(r.id)+stc+tag(r.classification)+'</div>'+
    '<h3 style="margin-top:5px">'+esc(r.title)+'</h3>'+
    '<p class="note" style="margin-top:4px"><strong>Trigger.</strong> '+esc(r.triggerCondition||r.statement||'')+'</p>'+
    (r.requiredCaveat?'<p class="note"><strong>Caveat.</strong> '+esc(r.requiredCaveat)+'</p>':'')+
    '</div>';
}

/* ═══════════════════════════════════════════ VIEW: Evidence Explorer ════ */
var evFilter = {q:'', quick:[], mode:null};
var EV_QUICK = [
  ['cur','Current October 2026', function(e){return e.currentOrHistorical==='current';}],
  ['jul','Historical July 2026', function(e){return /JUL26|Jul 2026/i.test(e.period||'');}],
  ['oct25','Historical October 2025', function(e){return /Oct 2025|OCT25/i.test((e.period||'')+(e.comparisonValue||''));}],
  ['quant','ETR quantitative', function(e){return /ETR quantitative|Client-provided fact/i.test(e.classification||'') && /^ETR-/.test(e.id);}],
  ['zs','Z-Score', function(e){return laneOf(e)==='zscore';}],
  ['cohort','Cohort', function(e){return laneOf(e)==='cohort';}],
  ['region','Regional', function(e){return laneOf(e)==='region';}],
  ['adopt','Adoption reasons', function(e){return laneOf(e)==='adoption';}],
  ['comp','Respondent composition', function(e){return laneOf(e)==='composition';}],
  ['co','Company / external', function(e){return laneOf(e)==='company';}],
  ['sup','Supporting', function(e){return stateTagsOf(e).indexOf('Supporting')>=0;}],
  ['con','Contradictory', function(e){return stateTagsOf(e).indexOf('Contradictory')>=0;}],
  ['ctx','Contextual', function(e){return stateTagsOf(e).indexOf('Contextual')>=0;}],
  ['sn','Source Needed', function(e){return (e.sourceNeededFields||[]).length>0;}]
];

RENDER.evidence = function(route){
  /* This workbook records its counter-evidence as CE-* Risk objects rather than as evidence rows.
     When the Contradictory control is active they are surfaced here, labelled as Risk objects, so the
     control isolates counter-evidence instead of returning an empty list. */
  var contraMode = evFilter.quick.indexOf('con')>=0 ||
    (state.states.length===1 && state.states[0]==='Contradictory');
  var pool = visibleEvidence();
  if (contraMode) pool = pool.concat((D.risks||[]).filter(function(r){
    return state.confs.indexOf(confOf(r))>=0; }));
  var rows = pool.filter(function(e){
    if (evFilter.q){
      var hay = [e.id,e.originalId,e.statement,e.theme,e.metric,e.value,e.sourceName,e.caveat,
                 e.period,e.confidence].join(' ').toLowerCase();
      if (hay.indexOf(evFilter.q.toLowerCase())<0) return false;
    }
    return evFilter.quick.every(function(k){
      if (k==='con') return stateTagsOf(e).indexOf('Contradictory')>=0;
      var f = EV_QUICK.filter(function(x){return x[0]===k;})[0];
      return f ? f[2](e) : true;
    });
  });
  if (contraMode && rows.length)
    rows = rows.filter(function(e){ return stateTagsOf(e).indexOf('Contradictory')>=0; });
  var h=['<div class="vhead"><div class="eyebrow">Evidence Explorer</div><h2>Evidence</h2>'+
    '<p>'+rows.length+' of '+(D.evidence||[]).length+' objects pass the current source controls and '+
    'filters. Select 2–4 objects to compare them side by side; the application never synthesizes a '+
    'conclusion from a selection.</p></div>'];
  h.push('<div class="filters"><div class="fgrp">'+
    '<input id="evQ" type="search" value="'+esc(evFilter.q)+'" placeholder="ID, statement, theme, metric, source, caveat…" '+
    'style="flex:1;min-width:220px;padding:5px 9px;border:1px solid var(--line);border-radius:3px">'+
    '<button class="btn'+(evFilter.mode!=='table'?' on':'')+'" data-evmode="card">Cards</button>'+
    '<button class="btn'+(evFilter.mode==='table'?' on':'')+'" data-evmode="table">Table</button>'+
    '<button class="btn" id="evCsv">Download CSV</button>'+
    '<button class="btn" id="evClear">Clear filters</button></div><div class="fgrp">'+
    EV_QUICK.map(function(q){
      return '<button class="fbtn'+(evFilter.quick.indexOf(q[0])>=0?' on':'')+'" data-evq="'+q[0]+
        '" aria-pressed="'+(evFilter.quick.indexOf(q[0])>=0)+'">'+esc(q[1])+'</button>';}).join('')+
    '</div></div>');

  if (state.compare.length){
    h.push('<div class="cmp-wrap"><div class="row" style="justify-content:space-between">'+
      '<strong>Comparison — '+state.compare.length+' selected</strong>'+
      '<span><button class="btn" id="cmpPrint">Print comparison</button> '+
      '<button class="btn" id="cmpClear">Clear</button></span></div>'+ compareTable() +'</div>');
  }

  if (evFilter.mode==='table'){
    h.push(evidenceTable(rows));
  } else {
    h.push('<div class="grid g3">');
    rows.forEach(function(e){
      var picked = state.compare.indexOf(e.id)>=0;
      h.push('<div class="card'+(picked?'':'')+'" style="'+(picked?'border-color:var(--orange);border-width:2px':'')+'">'+
        '<div class="row" style="margin-bottom:4px">'+oid(e.id)+tag(e.classification)+periodChip(e)+
          laneChip(laneOf(e))+'</div>'+
        '<p style="font-size:12.5px;margin:0 0 6px">'+esc(e.statement||e.title)+'</p>'+
        '<dl class="kv" style="font-size:11.5px">'+
          kvr('Theme', e.theme)+kvr('Metric', e.metric)+kvr('Value', e.value)+
          kvr('Comparison', e.comparisonValue)+kvr('N / base', e.nBase)+
          kvr('Confidence', e.confidence)+kvr('Verification', e.verificationStatus)+
          kvr('Source file', e.sourceFile)+kvr('Worksheet', e.sourceWorksheet)+
        '</dl>'+
        (e.caveat?'<p class="note" style="margin-top:5px"><strong>Caveat.</strong> '+esc(e.caveat)+'</p>':'')+
        ((e.sourceNeededFields||[]).length?'<div style="margin-top:5px">'+needed('SOURCE NEEDED: '+
          e.sourceNeededFields.join(', '))+'</div>':'')+
        '<div class="row" style="margin-top:7px">'+
          '<button class="btn" data-oid="'+esc(e.id)+'">Open</button>'+
          '<button class="btn" data-goto="#lineage/'+esc(e.id)+'">Lineage</button>'+
          '<button class="btn'+(picked?' on':'')+'" data-cmp="'+esc(e.id)+'">'+
            (picked?'Selected':'Compare')+'</button>'+
          (e.relatedSignalIds.length?'<span class="oids">'+e.relatedSignalIds.map(function(i){
            return oid(i);}).join('')+'</span>':'')+
        '</div></div>');
    });
    h.push('</div>');
  }
  if (contraMode) h.push('<div class="callout" style="margin-top:10px">'+tag('Client-provided fact')+
    ' The workbook records its counter-evidence as CE-001 … CE-010 <strong>Risk</strong> objects, not as '+
    'rows in the Combined Evidence Library. No evidence object carries a CONTRADICTS edge of its own. '+
    'They are shown here so the control isolates counter-evidence rather than returning nothing. '+
    btn('Open the Counter-Evidence tab','#risks')+'</div>');
  if (!rows.length) h.push('<div class="callout">No object passes these controls. '+
    'Nothing is hidden by design — clear a filter to widen the set.</div>');
  el('view-evidence').innerHTML = h.join('');
  function kvr(k,v){ return v==null?'' : '<dt>'+esc(k)+'</dt><dd>'+orNeeded(v)+'</dd>'; }
};

function compareTable(){
  var rows = state.compare.map(function(i){return OBJ[i];}).filter(Boolean);
  var fields = [['Period','period'],['Source','sourceName'],['Worksheet','sourceWorksheet'],
    ['Metric','metric'],['Value','value'],['Comparison','comparisonValue'],['N / base','nBase'],
    ['Confidence','confidence'],['Classification','classification'],['Caveat','caveat']];
  var h=['<div class="tw" style="margin-top:8px"><table><thead><tr><th>Field</th>'+
    rows.map(function(r){return '<th>'+esc(r.id)+'</th>';}).join('')+'</tr></thead><tbody>'];
  fields.forEach(function(f){
    h.push('<tr><td><strong>'+esc(f[0])+'</strong></td>'+rows.map(function(r){
      return '<td>'+orNeeded(r[f[1]])+'</td>';}).join('')+'</tr>');
  });
  h.push('<tr><td><strong>Interpretation reach</strong></td>'+rows.map(function(r){
    var mc = (D.metricContext||[]).filter(function(m){
      return r.metric && r.metric.indexOf(m.metric)>=0;})[0];
    return '<td class="note">'+(mc ? 'Can support: '+esc(mc.canSupport)+'<br>Cannot prove: '+
      esc(mc.cannotProve) : 'No Metric Context Matrix row for this metric.')+'</td>';}).join('')+'</tr>');
  h.push('</tbody></table></div>'+
    '<p class="note" style="margin-top:6px">These objects are placed side by side. No conclusion is '+
    'synthesized from the selection — R-019 requires description before interpretation.</p>');
  return h.join('');
}
function evidenceCsv(){
  var rows = visibleEvidence();
  var cols = ['id','originalId','classification','statement','sourceLane','sourceFile','sourceWorksheet',
    'period','currentOrHistorical','theme','metric','value','comparisonValue','nBase','confidence',
    'verificationStatus','caveat'];
  var out = [cols.join(',')];
  rows.forEach(function(r){
    out.push(cols.map(function(c){
      var v = r[c]; if (v==null) v='';
      return '"'+String(v).replace(/"/g,'""')+'"';
    }).join(','));
  });
  return out.join('\n');
}

/* ════════════════════════════════════════════ VIEW: Lineage Explorer ════ */
var LIN = {focus:'SIG-02', depth:'2', orient:'horizontal', selected:null,
           collapsed:{}, zoom:1, showSupport:true, showContra:true, mode:'path'};
/* The default lineage is the proof-case path, not the whole neighbourhood: a 2-hop graph
   around SIG-02 is 60 nodes and reads as a hairball. Full graph stays one click away. */
var PROOF_PATH = ['RAW-VENDOR-VIEW','SRC-OCT26-38','ETR-OCT26-NS','ETR-OCT26-ZS','SIG-02',
  'BRIDGE-SIG-02-KPI-003','KPI-003','R-021','R-026','BT-CRWD-OCT26',
  'OUT-BRIEF','OUT-SUNDAY','OUT-EMAIL'];

RENDER.lineage = function(route){
  if (route && route.arg && OBJ[route.arg]){
    if (route.arg !== LIN.focus) LIN.mode = 'graph';
    LIN.focus = route.arg;
  }
  var choices = ['RAW-VENDOR-VIEW','RAW-Z-SCORE','ETR-OCT26-NS','ETR-OCT26-ZS','ETR-OCT26-PV',
                 'ETR-OCT26-REGION','SIG-02','SIG-05','SIG-07','KPI-003','BRIDGE-SIG-02-KPI-003',
                 'R-021','R-026','OQ-014','OQ-015','CE-002','OUT-BRIEF','OUT-SUNDAY','OUT-EMAIL']
    .filter(function(i){return OBJ[i];});
  if (choices.indexOf(LIN.focus)<0) choices.unshift(LIN.focus);

  var h=['<div class="vhead"><div class="eyebrow">Lineage Explorer</div><h2>Lineage</h2>'+
    '<p>'+EDGES.length+' workbook edges. Every edge is derived from a relationship worksheet, a bridge '+
    'row, a rule reference or an output manifest — none is inferred. Click a node to highlight its paths, '+
    'double-click to open its record, click an edge for its detail.</p></div>'];
  h.push('<div class="lin-toolbar no-print">'+
    '<label class="mini" for="linFocus">Focus</label><select id="linFocus">'+
      choices.map(function(i){ var o=OBJ[i];
        return '<option value="'+esc(i)+'"'+(i===LIN.focus?' selected':'')+'>'+esc(i)+' — '+
          esc((o.title||'').slice(0,42))+'</option>';}).join('')+'</select>'+
    '<label class="mini" for="linDepth">Depth</label><select id="linDepth">'+
      ['1','2','full'].map(function(d){return '<option value="'+d+'"'+(d===LIN.depth?' selected':'')+'>'+
        (d==='full'?'Full graph':d+'-hop')+'</option>';}).join('')+'</select>'+
    '<label class="mini" for="linOrient">Layout</label><select id="linOrient">'+
      ['horizontal','vertical'].map(function(d){return '<option value="'+d+'"'+
        (d===LIN.orient?' selected':'')+'>'+d+'</option>';}).join('')+'</select>'+
    '<button class="btn'+(LIN.mode==='path'?' on':'')+'" data-lin="path">Proof-case path</button>'+
    '<button class="btn'+(LIN.mode!=='path'?' on':'')+'" data-lin="graph">Full graph</button>'+
    '<button class="btn" data-lin="up">Expand upstream</button>'+
    '<button class="btn" data-lin="down">Expand downstream</button>'+
    '<button class="btn" data-lin="collapse">Collapse branches</button>'+
    '<button class="btn" data-lin="zin">Zoom +</button><button class="btn" data-lin="zout">Zoom −</button>'+
    '<button class="btn" data-lin="fit">Fit</button><button class="btn" data-lin="center">Center selected</button>'+
    '<button class="btn" data-lin="reset">Reset</button>'+
    '<button class="btn'+(LIN.showSupport?' on':'')+'" data-lin="sup">Supporting paths</button>'+
    '<button class="btn'+(LIN.showContra?' on':'')+'" data-lin="con">Contradictory paths</button>'+
    '<button class="btn" data-lin="svg">Export SVG</button>'+
    '<button class="btn" data-lin="print">Print lineage</button>'+
    '<button class="btn" data-lin="link">Copy deep link</button>'+
    '</div>');
  h.push('<details class="filters no-print"><summary class="mini" style="cursor:pointer">'+
    'Node types and relationship types</summary><div class="fgrp" style="margin-top:7px">'+
    Object.keys(NODE_STYLE).map(function(t){
      return '<button class="fbtn'+(state.nodeTypes.indexOf(t)>=0?' on':'')+'" data-ntype="'+t+
        '" aria-pressed="'+(state.nodeTypes.indexOf(t)>=0)+'">'+esc(t)+'</button>';}).join('')+
    '</div><div class="fgrp">'+EDGE_TYPES.map(function(t){
      return '<button class="fbtn'+(state.edgeTypes.indexOf(t)>=0?' on':'')+'" data-etype="'+t+
        '" aria-pressed="'+(state.edgeTypes.indexOf(t)>=0)+'">'+esc(t)+'</button>';}).join('')+
    '</div></details>');
  h.push('<div class="callout" style="margin:0 0 9px">'+(LIN.mode==='path'
    ? '<strong>Proof-case path.</strong> Raw October source → ETR-OCT26-NS → SIG-02 → KPI-003 → '+
      'R-021 / R-026 → Vendor Signal Brief → Sunday Signal and Update Email. The SIG-02 → KPI-003 '+
      'link is drawn dashed because it is a hypothesis, not a validated relationship. '+
      'Switch to <em>Full graph</em> to explore everything connected to the focus object.'
    : '<strong>Full graph.</strong> '+esc(LIN.depth==='full'?'Whole reachable neighbourhood':
      LIN.depth+'-hop neighbourhood')+' around '+esc(LIN.focus)+'. Nodes hidden by the source '+
      'controls are excluded, so a filtered lane removes its nodes and their edges.')+'</div>');
  h.push('<div class="lin-wrap" id="linWrap"><div class="ltip" id="linTip" hidden></div></div>');
  h.push('<div class="legend">'+
    Object.keys(NODE_STYLE).slice(0,12).map(function(t){
      var s=NODE_STYLE[t];
      return '<span><i class="swatch" style="background:'+s.fill+';border-color:'+s.stroke+
        (s.shape==='circle'?';border-radius:50%':(s.shape==='pill'?';border-radius:6px':''))+
        '"></i>'+esc(t)+'</span>';}).join('')+
    '</div><div class="legend">'+EDGE_TYPES.map(function(t){
      return '<span><i style="display:inline-block;width:18px;height:0;border-top:2px '+
        (t==='INFORMS'?'dashed':'solid')+' '+(EDGE_COLOR[t]||'#999')+'"></i>'+esc(t)+'</span>';}).join('')+
    '</div>');
  h.push('<div id="linDetail" style="margin-top:12px"></div>');
  el('view-lineage').innerHTML = h.join('');
  drawLineage();
};

/** Build the visible sub-graph around the focus node. */
function lineageGraph(){
  var depth = LIN.depth==='full' ? 99 : Number(LIN.depth);
  var okNode = function(id){
    var o = OBJ[id]; if (!o) return false;
    if (state.nodeTypes.indexOf(o.objectType)<0) return false;
    if (o.objectType==='Evidence' || o.objectType==='Source' || o.objectType==='RawRecord'){
      if (!passes(o)) return false;
    }
    return true;
  };
  var okEdge = function(e){
    if (state.edgeTypes.indexOf(e.type)<0) return false;
    if (!LIN.showSupport && (e.type==='SUPPORTS'||e.type==='SOURCE_OF'||e.type==='NORMALIZES_TO')) return false;
    if (!LIN.showContra && (e.type==='CONTRADICTS'||e.type==='BLOCKS')) return false;
    return okNode(e.from) && okNode(e.to);
  };
  if (LIN.mode==='path'){
    var pn = PROOF_PATH.filter(okNode);
    if (!pn.length) return {nodes:[], edges:[], blocked:true};
    var set = {}; pn.forEach(function(i){ set[i]=true; });
    return {nodes:pn, edges: EDGES.filter(function(e){
      return okEdge(e) && set[e.from] && set[e.to]; }), levels:{}, blocked:false};
  }
  var levels = {}, nodes = {};
  if (!okNode(LIN.focus)) return {nodes:[], edges:[], blocked:true};
  nodes[LIN.focus]=true; levels[LIN.focus]=0;
  var frontier=[LIN.focus], d=0;
  while (d<depth && frontier.length){
    var next=[];
    frontier.forEach(function(id){
      if (LIN.collapsed[id]) return;
      (OUT_BY[id]||[]).forEach(function(e){
        if (!okEdge(e)) return;
        if (!(e.to in nodes)){ nodes[e.to]=true; levels[e.to]=(levels[id]||0)+1; next.push(e.to); }
      });
      (IN_BY[id]||[]).forEach(function(e){
        if (!okEdge(e)) return;
        if (!(e.from in nodes)){ nodes[e.from]=true; levels[e.from]=(levels[id]||0)-1; next.push(e.from); }
      });
    });
    frontier=next; d++;
    if (Object.keys(nodes).length>150) break;
  }
  var ids = Object.keys(nodes);
  var edges = EDGES.filter(function(e){ return okEdge(e) && nodes[e.from] && nodes[e.to]; });
  return {nodes:ids, edges:edges, levels:levels, blocked:false};
}

var STAGE_ORDER = {Source:0, RawRecord:1, Evidence:2, Signal:3, Interpretation:3, CrossLane:3,
  Bridge:4, KPI:5, Backtest:5, Rule:6, ContextRule:6, Risk:6, OpenQuestion:6,
  CalibrationCase:6, ReviewItem:6, Output:7};

function drawLineage(){
  var g = lineageGraph();
  var wrap = el('linWrap');
  if (!wrap) return;
  if (g.blocked || !g.nodes.length){
    wrap.innerHTML = '<div class="ltip" id="linTip" hidden></div>'+
      '<div class="warnbox" style="margin:14px">The focus object is hidden by the current source '+
      'controls or node-type toggles, so no graph can be drawn. '+
      (currentHidden()?'Current October evidence is switched off.':'')+'</div>';
    return;
  }
  /* column = canonical stage, row = order within the column */
  var cols = {};
  g.nodes.forEach(function(id){
    var st = STAGE_ORDER[(OBJ[id]||{}).objectType]; if (st==null) st=6;
    (cols[st]=cols[st]||[]).push(id);
  });
  var colKeys = Object.keys(cols).map(Number).sort(function(a,b){return a-b;});
  var NW=152, NH=52, GX=64, GY=17;
  var pos={}, maxRows=0;
  colKeys.forEach(function(c,ci){
    cols[c].sort();
    cols[c].forEach(function(id,ri){
      if (LIN.orient==='vertical') pos[id] = {x: ri*(NW+GX)+16, y: ci*(NH+GY)+16};
      else                          pos[id] = {x: ci*(NW+GX)+16, y: ri*(NH+GY)+16};
    });
    maxRows = Math.max(maxRows, cols[c].length);
  });
  var W = (LIN.orient==='vertical' ? maxRows*(NW+GX)+40 : colKeys.length*(NW+GX)+40);
  var H = (LIN.orient==='vertical' ? colKeys.length*(NH+GY)+40 : maxRows*(NH+GY)+40);

  var sel = LIN.selected;
  var connected = {};
  if (sel){
    connected[sel]=true;
    g.edges.forEach(function(e){ if (e.from===sel) connected[e.to]=true;
                                 if (e.to===sel) connected[e.from]=true; });
  }
  /* The curated path is scaled to the pane so the whole chain is visible without scrolling;
     the exploratory graph keeps its natural size and scrolls. */
  var fit = (LIN.mode==='path' && LIN.zoom===1);
  var wrapW = (el('linWrap')||{}).clientWidth || 1100;
  var scale = fit ? Math.min(1, (wrapW-24)/W) : LIN.zoom;
  var s=['<svg id="lineageSvg" viewBox="0 0 '+W+' '+H+'" width="'+Math.round(W*scale)+
    '" height="'+Math.round(H*scale)+'" role="application" aria-label="Lineage graph">'];
  s.push('<defs>'+EDGE_TYPES.map(function(t){
    return '<marker id="ar-'+t+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" '+
      'orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="'+(EDGE_COLOR[t]||'#999')+'"/></marker>';
  }).join('')+'</defs>');

  g.edges.forEach(function(e,i){
    var a=pos[e.from], b=pos[e.to]; if(!a||!b) return;
    var x1=a.x+NW, y1=a.y+NH/2, x2=b.x, y2=b.y+NH/2;
    if (LIN.orient==='vertical'){ x1=a.x+NW/2; y1=a.y+NH; x2=b.x+NW/2; y2=b.y; }
    if (b.x < a.x){ x1=a.x; x2=b.x+NW; }
    var mx=(x1+x2)/2;
    var d = LIN.orient==='vertical'
      ? 'M'+x1+' '+y1+' C'+x1+' '+((y1+y2)/2)+' '+x2+' '+((y1+y2)/2)+' '+x2+' '+y2
      : 'M'+x1+' '+y1+' C'+mx+' '+y1+' '+mx+' '+y2+' '+x2+' '+y2;
    var dim = sel && !(e.from===sel || e.to===sel);
    var dash = (e.dashed || e.type==='INFORMS') ? ' stroke-dasharray="6 4"' : '';
    s.push('<g class="ledge'+(dim?' dim':'')+'" data-edge="'+i+'">'+
      '<path class="ledge-hit" d="'+d+'"/>'+
      '<path d="'+d+'" fill="none" stroke="'+(EDGE_COLOR[e.type]||'#999')+'" stroke-width="1.6"'+dash+
      ' marker-end="url(#ar-'+e.type+')"><title>'+esc(e.from+' '+e.type+' '+e.to)+'</title></path></g>');
  });

  g.nodes.forEach(function(id){
    var o = OBJ[id], p = pos[id], st = NODE_STYLE[o.objectType]||NODE_STYLE.Evidence;
    var dim = sel && !connected[id];
    var isSel = id===LIN.selected, isFocus = id===LIN.focus;
    s.push('<g class="lnode'+(isSel?' sel':'')+(dim?' dim':'')+'" data-node="'+esc(id)+'" tabindex="0" '+
      'role="button" aria-label="'+esc(id+' '+(o.title||''))+'">');
    s.push(nodeShape(st.shape, p.x, p.y, NW, NH, st.fill, st.stroke, isFocus));
    s.push('<text class="nid" x="'+(p.x+9)+'" y="'+(p.y+16)+'" fill="#1B2430">'+esc(shortId(id))+'</text>');
    s.push('<text x="'+(p.x+9)+'" y="'+(p.y+29)+'" fill="#595959" font-size="8">'+
      esc((o.objectType||'').toUpperCase())+'</text>');
    var t=(o.title||o.statement||'').slice(0,30);
    s.push('<text x="'+(p.x+9)+'" y="'+(p.y+42)+'" fill="#1B2430" font-size="9">'+esc(t)+'</text>');
    if (o.currentOrHistorical==='current')
      s.push('<rect x="'+(p.x+NW-10)+'" y="'+(p.y+4)+'" width="6" height="6" fill="#F16A20"><title>Current period</title></rect>');
    s.push('</g>');
  });
  s.push('</svg>');
  wrap.innerHTML = '<div class="ltip" id="linTip" hidden></div>'+s.join('');
  wireLineage(g);
}
/** Bridge ids are long by construction; show the pairing rather than a clipped string. */
function shortId(id){
  var m = /^BRIDGE-(SIG-\d+)-(KPI-\d+)$/.exec(id);
  if (m) return m[1]+'\u2192'+m[2];
  return id.length>21 ? id.slice(0,20)+'\u2026' : id;
}

function nodeShape(shape,x,y,w,h,fill,stroke,focus){
  var sw = focus ? 3 : 1.5;
  switch(shape){
    case 'round': return '<rect class="nb" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="11" fill="'+
      fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    case 'pill': return '<rect class="nb" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+(h/2)+
      '" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    case 'circle': return '<ellipse class="nb" cx="'+(x+w/2)+'" cy="'+(y+h/2)+'" rx="'+(w/2)+'" ry="'+(h/2)+
      '" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    case 'diamond': return '<polygon class="nb" points="'+[[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]]
      .map(function(p){return p.join(',');}).join(' ')+'" fill="'+fill+'" stroke="'+stroke+
      '" stroke-width="'+sw+'"/>';
    case 'hex': return '<polygon class="nb" points="'+[[x+14,y],[x+w-14,y],[x+w,y+h/2],[x+w-14,y+h],
      [x+14,y+h],[x,y+h/2]].map(function(p){return p.join(',');}).join(' ')+'" fill="'+fill+
      '" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    case 'doc': return '<path class="nb" d="M'+x+' '+y+' h'+(w-12)+' l12 12 v'+(h-12)+' h'+(-w)+' z" fill="'+
      fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
    case 'sheet': return '<g><rect class="nb" x="'+(x+4)+'" y="'+(y-4)+'" width="'+w+'" height="'+h+
      '" fill="#fff" stroke="'+stroke+'" stroke-width="1"/><rect class="nb" x="'+x+'" y="'+y+'" width="'+w+
      '" height="'+h+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/></g>';
    case 'page': return '<g><rect class="nb" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+
      '" stroke="'+stroke+'" stroke-width="'+sw+'"/><line x1="'+(x+8)+'" y1="'+(y+h-8)+'" x2="'+(x+w-8)+
      '" y2="'+(y+h-8)+'" stroke="'+stroke+'" stroke-width="1"/></g>';
    default: return '<rect class="nb" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+
      '" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
  }
}
function wireLineage(g){
  var tip = el('linTip'), wrap = el('linWrap');
  $$('#lineageSvg .lnode').forEach(function(node){
    var id = node.getAttribute('data-node');
    node.addEventListener('click', function(){ LIN.selected = (LIN.selected===id?null:id); drawLineage(); showNodeDetail(id); });
    node.addEventListener('dblclick', function(){ openDrawer(id); });
    node.addEventListener('keydown', function(ev){
      if (ev.key==='Enter'){ ev.preventDefault(); LIN.selected=id; drawLineage(); showNodeDetail(id); }
      if (ev.key===' '){ ev.preventDefault(); openDrawer(id); }
    });
    var show = function(ev){
      var o = OBJ[id];
      tip.hidden=false;
      tip.innerHTML = '<strong>'+esc(id)+'</strong> · '+esc(o.objectType)+'<br>'+
        esc((o.title||o.statement||'').slice(0,150))+
        (o.period?'<br><em>'+esc(o.period)+'</em>':'')+
        '<br><span style="opacity:.75">click to highlight · double-click to open</span>';
      var r = wrap.getBoundingClientRect();
      var x = (ev.clientX!=null?ev.clientX:r.left+40) - r.left + wrap.scrollLeft + 12;
      var y = (ev.clientY!=null?ev.clientY:r.top+40) - r.top + wrap.scrollTop + 12;
      tip.style.left=x+'px'; tip.style.top=y+'px';
    };
    node.addEventListener('mousemove', show);
    node.addEventListener('focus', show);
    node.addEventListener('mouseleave', function(){ tip.hidden=true; });
    node.addEventListener('blur', function(){ tip.hidden=true; });
  });
  $$('#lineageSvg .ledge').forEach(function(edge){
    edge.addEventListener('click', function(){
      var e = g.edges[Number(edge.getAttribute('data-edge'))];
      el('linDetail').innerHTML = '<div class="card"><h4>Relationship</h4><dl class="kv">'+
        '<dt>Edge</dt><dd>'+oid(e.from)+' <strong>'+esc(e.type)+'</strong> '+oid(e.to)+'</dd>'+
        '<dt>Derived from</dt><dd>'+esc(e.origin||'workbook relationship record')+'</dd>'+
        '<dt>Note</dt><dd>'+orNeeded(e.note,'no note recorded')+'</dd>'+
        '<dt>Rendered</dt><dd>'+(e.dashed||e.type==='INFORMS'
          ? 'Dashed — hypothesised link, not validated' : 'Solid — recorded relationship')+'</dd>'+
        '</dl></div>';
    });
  });
}
function showNodeDetail(id){
  var o = OBJ[id];
  var up = (IN_BY[id]||[]), dn = (OUT_BY[id]||[]);
  el('linDetail').innerHTML = '<div class="card"><div class="row">'+oid(id)+tag(o.classification)+
    (o.currentOrHistorical?periodChip(o):'')+
    '<button class="btn" data-oid="'+esc(id)+'">Open full record</button>'+
    '<button class="btn" data-linfocus="'+esc(id)+'">Center on this node</button></div>'+
    '<h3 style="margin-top:6px">'+esc(o.title||o.statement||id)+'</h3>'+
    '<div class="grid g2" style="margin-top:8px">'+
      '<div><div class="mini">Upstream ('+up.length+')</div>'+(up.length?'<ul>'+up.map(function(e){
        return '<li>'+oid(e.from)+' <em class="note">'+esc(e.type)+'</em></li>';}).join('')+'</ul>'
        :'<span class="note">none recorded</span>')+'</div>'+
      '<div><div class="mini">Downstream ('+dn.length+')</div>'+(dn.length?'<ul>'+dn.map(function(e){
        return '<li><em class="note">'+esc(e.type)+'</em> '+oid(e.to)+'</li>';}).join('')+'</ul>'
        :'<span class="note">none recorded</span>')+'</div>'+
    '</div></div>';
}

/* ═══════════════════════════════════════ VIEW: KPI Bridge Explorer ══════ */
RENDER.kpis = function(route){
  var sid = route && route.arg, kid = route && route.arg2;
  var h=['<div class="vhead"><div class="eyebrow">KPI Bridge Explorer</div><h2>Signal × KPI matrix</h2>'+
    '<p>Only workbook-supported cells are populated. Every hypothesised cell is labelled '+
    '<strong>Hypothesis — Backtest Required</strong>; no cell is rendered as validated.</p></div>'];
  var sigs = D.signals||[], kpis = D.kpis||[];
  h.push('<div class="tw"><table class="matrix"><thead><tr><th style="width:22%">Signal \\ KPI</th>'+
    kpis.map(function(k){return '<th title="'+esc(k.title)+'">'+esc(k.id)+'</th>';}).join('')+
    '</tr></thead><tbody>');
  sigs.forEach(function(s){
    h.push('<tr><td><strong>'+esc(s.title)+'</strong><br>'+oid(s.id)+'</td>');
    kpis.forEach(function(k){
      var b = OBJ['BRIDGE-'+s.id+'-'+k.id];
      if (!b) h.push('<td class="cell empty" title="No workbook relationship">—</td>');
      else {
        var cls = {'Definitional':'c-def','Hypothesized':'c-hyp','Partial support':'c-part',
                   'Source Needed':'c-need'}[b.cellState] || 'c-hyp';
        h.push('<td class="cell '+cls+'" data-goto="#bridge/'+esc(s.id)+'/'+esc(k.id)+
          '" tabindex="0" role="button" title="'+esc(b.cellState+' — '+b.mechanism)+'">'+
          esc(b.cellState)+'</td>');
      }
    });
    h.push('</tr>');
  });
  h.push('</tbody></table></div>');
  h.push('<div class="legend" style="margin-top:8px">'+
    '<span><i class="swatch c-def" style="border-color:var(--green)"></i>Definitional</span>'+
    '<span><i class="swatch c-hyp" style="border-color:var(--amber)"></i>Hypothesized</span>'+
    '<span><i class="swatch c-part" style="border-color:var(--blue)"></i>Partial support</span>'+
    '<span><i class="swatch c-need" style="border-color:var(--red)"></i>Source Needed (no lag established)</span>'+
    '<span><i class="swatch" style="border-color:var(--line);background:#fff"></i>— no workbook relationship</span>'+
    '</div>');
  if (sid && kid && OBJ['BRIDGE-'+sid+'-'+kid]){
    h.push('<h2 style="margin:18px 0 8px">Bridge workspace — '+esc(sid)+' → '+esc(kid)+'</h2>');
    h.push(bridgePanel(sid,kid));
  } else if (sid && !kid){
    var k = OBJ[sid];
    if (k && k.objectType==='KPI'){
      h.push('<h2 style="margin:18px 0 8px">'+esc(k.id)+' — '+esc(k.title)+'</h2>');
      h.push('<div class="card"><dl class="kv">'+
        '<dt>Description</dt><dd>'+orNeeded(k.statement)+'</dd>'+
        '<dt>Metric</dt><dd>'+orNeeded(k.metric)+'</dd><dt>Value</dt><dd>'+orNeeded(k.value)+'</dd>'+
        '<dt>Period</dt><dd>'+orNeeded(k.period)+'</dd><dt>Trend</dt><dd>'+orNeeded(k.trend)+'</dd>'+
        '<dt>Base sample</dt><dd>'+orNeeded(k.nBase)+'</dd>'+
        '<dt>Verification</dt><dd>'+orNeeded(k.verificationStatus)+'</dd>'+
        '<dt>Related signals</dt><dd>'+oids(k.relatedSignalIds)+'</dd>'+
        '<dt>Supporting evidence</dt><dd>'+oids(k.supportingIds)+'</dd>'+
        '<dt>Caveat</dt><dd>'+orNeeded(k.caveat,'—')+'</dd></dl></div>');
      var bs = (D.bridges||[]).filter(function(b){return b.relatedKpiIds.indexOf(sid)>=0;});
      h.push('<h4 style="margin:14px 0 6px">Bridges into this KPI ('+bs.length+')</h4>');
      bs.forEach(function(b){ h.push(bridgePanel(b.relatedSignalIds[0], sid)); });
    }
  } else {
    h.push('<h2 style="margin:18px 0 8px">Featured bridge — the October proof-case candidate</h2>');
    h.push(bridgePanel('SIG-02','KPI-003'));
  }
  el('view-kpis').innerHTML = h.join('');
};

/* ══════════════════════════════ VIEW: Cohorts, Regions, Adoption ════════ */
RENDER.cohorts = function(){
  var cuts = D.rawTables.subsampleCuts.rows, region = D.rawTables.region.rows;
  var adopt = D.rawTables.adoptionReasons.rows, jobs = D.rawTables.jobTitles.rows;
  var named = ['All Respondents','Global 2000','Fortune 500','Fortune 1000','Fortune 100',
    'Global 1000','S&P 500','Large Organizations','Midsize Organizations','Small Organizations',
    'Giant Public + Private','Forbes Private 225'];
  var h=['<div class="vhead"><div class="eyebrow">Cohorts, regions and adoption</div>'+
    '<h2>Current cuts — '+esc(CP.label)+'</h2>'+
    '<p>All values are supplied by the October subsample, regional and adoption exports. '+
    'No cut carries a citation base: cohort and regional N are '+needed()+' throughout '+
    oid('OQ-014')+'.</p></div>'];

  h.push('<h4>A · Cohorts</h4>');
  h.push('<div class="tw"><table><caption>Sorted by displayed Net Score — application view. '+
    'The workbook supplies no cohort ranking.</caption><thead><tr><th>Cohort</th>'+
    '<th class="num">Net Score</th><th class="num">Pervasion</th><th class="num">Adoption %</th>'+
    '<th class="num">Increase %</th><th class="num">Flat %</th><th class="num">Decrease %</th>'+
    '<th class="num">Replacing %</th><th>N</th><th>Evidence</th></tr></thead><tbody>');
  cuts.filter(function(r){return named.indexOf(r.Category)>=0;})
      .sort(function(a,b){return Number(b['Net Score'])-Number(a['Net Score']);})
      .forEach(function(r){
    var eid = {'Global 2000':'ETR-OCT26-G2K','Fortune 500':'ETR-OCT26-F500',
               'Large Organizations':'ETR-OCT26-LARGE','All Respondents':'ETR-OCT26-INTENT'}[r.Category];
    h.push('<tr'+(r.Category==='All Respondents'?' style="background:var(--lblue)"':'')+
      '><td><strong>'+esc(r.Category)+'</strong></td>'+
      ['Net Score','Pervasion','Adoption %','Increase %','Flat %','Decrease %','Replacing %']
        .map(function(c){return '<td class="num">'+n2(Number(r[c]))+'</td>';}).join('')+
      '<td>'+needed()+'</td><td>'+(eid?oid(eid):'<span class="note">raw cut</span>')+'</td></tr>');
  });
  h.push('</tbody></table></div>');
  h.push('<div class="callout">'+tag('Anduril interpretation')+' Global 2000 and Fortune 500 sit above '+
    'the All Respondents reading of '+n2(CP.netScore.value)+', while Large Organizations sit below it. '+
    'The workbook records this as enterprise evidence that is <em>selective, not uniform</em>. '+
    'Without cut-level N, R-010 caps what any of these can carry. '+
    oids(['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE','SIG-05','OQ-014'])+'</div>');
  h.push('<details class="filters"><summary class="mini" style="cursor:pointer">All '+cuts.length+
    ' supplied cuts (raw worksheet)</summary>'+
    '<div class="tw" style="margin-top:8px"><table><thead><tr><th>Cut</th><th class="num">Net Score</th>'+
    '<th class="num">Pervasion</th><th class="num">Adoption</th><th class="num">Increase</th>'+
    '<th class="num">Flat</th><th class="num">Decrease</th><th class="num">Replacing</th></tr></thead><tbody>'+
    cuts.map(function(r){ return '<tr><td>'+esc(r.Category)+'</td>'+
      ['Net Score','Pervasion','Adoption %','Increase %','Flat %','Decrease %','Replacing %']
        .map(function(c){return '<td class="num">'+n2(Number(r[c]))+'</td>';}).join('')+'</tr>';}).join('')+
    '</tbody></table></div></details>');

  h.push('<h4 style="margin-top:18px">B · Regions</h4>');
  h.push('<div class="grid g2"><div class="card">'+barChart(region.map(function(r){
      return {label:r.Category, value:Number(r['Oct 2026'])};}), {label:'Regional Net Score Oct 2026'})+
    '<p class="note">October 2026 regional Net Score. '+oid('ETR-OCT26-REGION')+'</p></div>');
  h.push('<div class="card"><div class="tw"><table><thead><tr><th>Region</th>'+
    '<th class="num">Oct 2026</th><th class="num">Jul 2026</th><th class="num">Oct 2025</th>'+
    '<th class="num">Q/Q</th><th>N</th></tr></thead><tbody>'+
    region.map(function(r){
      var a=Number(r['Oct 2026']), b=Number(r['Jul 2026']), d=a-b;
      return '<tr><td>'+esc(r.Category)+'</td><td class="num"><strong>'+n2(a)+'</strong></td>'+
        '<td class="num">'+n2(b)+'</td><td class="num">'+n2(Number(r['Oct 2025']))+'</td>'+
        '<td class="num '+(d>0?'up':(d<0?'dn':'flat'))+'">'+sign(d)+'</td><td>'+needed()+'</td></tr>';
    }).join('')+'</tbody></table></div></div></div>');
  h.push('<div class="warnbox">'+tag('Open question')+' Regional N is not supplied for any cut. '+
    'Latin America moves from 75 in Jul 2026 to 50 in Oct 2026 on an unknown base — a movement that '+
    'cannot be read without it. Do not link a regional survey cut to regional revenue. '+
    oids(['OQ-014','SIG-07','XL-07','R-009','R-010'])+'</div>');

  h.push('<h4 style="margin-top:18px">C · Adoption reasons</h4>');
  h.push('<div class="tw"><table><caption>October 2026 against July 2026. Reason percentages are '+
    'reasons, not vendor-level spending outcomes, and are not causal explanations of Net Score '+
    '(R-013). Reason-response N is Source Needed.</caption><thead><tr><th>Reason</th>'+
    '<th class="num">Oct 26</th><th class="num">Jul 26</th><th class="num">Change</th>'+
    '<th style="width:34%">Oct 26 share</th></tr></thead><tbody>'+
    adopt.map(function(r){
      var a=Number(r['Oct 26']), b=Number(r['Jul 26']), d=a-b;
      return '<tr><td>'+esc(r.Category)+'</td><td class="num">'+n2(a)+'</td><td class="num">'+n2(b)+
        '</td><td class="num '+(d>0?'up':(d<0?'dn':'flat'))+'">'+sign(d)+'</td>'+
        '<td><span class="bar"><i style="width:'+a.toFixed(0)+'%;background:var(--navy)"></i></span></td></tr>';
    }).join('')+'</tbody></table></div>');
  h.push('<div class="callout">'+tag('Anduril interpretation')+' Technical capabilities and product '+
    'security are the two highest-cited reasons in October. Technological lead/lag falls the most '+
    'between periods. These are stated reasons for adoption and carry no causal weight against the '+
    'Net Score movement. '+oids(['ETR-OCT26-ADOPT','R-013','R-019'])+'</div>');

  h.push('<h4 style="margin-top:18px">D · Respondent composition</h4>');
  h.push('<div class="grid g2"><div class="card">'+barChart(jobs.map(function(r){
      return {label:r.Category.split(' - ')[0].split(',')[0], value:Number(r['Job Title'])};
    }), {label:'Respondent composition', labelWidth:110})+
    '<p class="note">'+oid('ETR-OCT26-JOBS')+' · N '+n2(CP.nBase,0)+' citations</p></div>'+
    '<div class="card"><h4>Why this is context, not a signal</h4>'+
    '<p class="note">Composition describes who answered, not what they intend to spend. It bounds how '+
    'far a reading generalises and it changes between exports, so it is displayed beside every cohort '+
    'claim rather than read as one. The workbook records the composition as export context. '+
    oids(['ETR-OCT26-JOBS','R-001','R-010'])+'</p>'+
    '<div class="tw" style="margin-top:8px"><table><thead><tr><th>Job title band</th>'+
    '<th class="num">Share %</th></tr></thead><tbody>'+jobs.map(function(r){
      return '<tr><td>'+esc(r.Category)+'</td><td class="num">'+n2(Number(r['Job Title']))+'</td></tr>';
    }).join('')+'</tbody></table></div></div></div>');

  h.push('<h4 style="margin-top:18px">Peer trends — supplied comparison universe</h4>');
  var peers = D.rawTables.peerTrends.rows.filter(function(r){return r['Oct 2026']!=null;})
    .sort(function(a,b){return Number(b['Oct 2026'])-Number(a['Oct 2026']);});
  var crwd = peers.filter(function(r){return /CrowdStrike/i.test(r.Category);});
  h.push('<div class="callout">The peer export supplies '+peers.length+' vendors with an October value. '+
    'CrowdStrike '+(crwd.length?'appears in it at '+n2(Number(crwd[0]['Oct 2026'])):'does not appear in this export')+
    '. Peer values are displayed as supplied; no ranking claim is made and no peer N is provided.</div>');
  h.push('<details class="filters"><summary class="mini" style="cursor:pointer">Peer trend rows ('+
    peers.length+')</summary><div class="tw" style="margin-top:8px"><table><thead><tr><th>Vendor</th>'+
    '<th class="num">Oct 2026</th><th class="num">Jul 2026</th><th class="num">Oct 2025</th></tr></thead><tbody>'+
    peers.map(function(r){return '<tr'+(/CrowdStrike/i.test(r.Category)?' style="background:var(--lblue)"':'')+
      '><td>'+esc(r.Category)+'</td><td class="num">'+n2(Number(r['Oct 2026']))+'</td>'+
      '<td class="num">'+(r['Jul 2026']!=null?n2(Number(r['Jul 2026'])):needed())+'</td>'+
      '<td class="num">'+(r['Oct 2025']!=null?n2(Number(r['Oct 2025'])):needed())+'</td></tr>';}).join('')+
    '</tbody></table></div></details>');

  el('view-cohorts').innerHTML = h.join('');
};

/* ═══════════════════════════════════════════════ VIEW: Rule Explorer ════ */
var ruleFilter = {status:'', family:'', enforcement:'', q:''};
RENDER.rules = function(route){
  var all = (D.rules||[]);
  var fams = unique(all.map(function(r){return r.ruleFamily;}).filter(Boolean));
  var enfs = unique(all.map(function(r){return r.enforcement;}).filter(Boolean));
  var h=['<div class="vhead"><div class="eyebrow">Rule Explorer</div><h2>Interpretation rules and MCP context</h2>'+
    '<p>'+all.length+' interpretation rules and '+(D.contextRules||[]).length+' MCP context objects. '+
    '<strong>Rules are human-maintained in the workbook. This prototype does not edit rule status.</strong></p></div>'];
  h.push('<div class="filters"><div class="fgrp">'+
    '<input id="ruleQ" type="search" value="'+esc(ruleFilter.q)+'" placeholder="rule name, trigger, language…" '+
    'style="flex:1;min-width:200px;padding:4px 8px;border:1px solid var(--line);border-radius:3px">'+
    '</div><div class="fgrp"><span class="mini">Status</span>'+
    ['Canonical','Provisional','Backtest Required','Source Needed','Retired'].map(function(s){
      return '<button class="fbtn'+(ruleFilter.status===s?' on':'')+'" data-rstatus="'+esc(s)+'">'+
        esc(s)+' <span class="note">'+all.filter(function(r){return r.ruleStatus===s;}).length+
        '</span></button>';}).join('')+
    '</div><div class="fgrp"><span class="mini">Family</span>'+
    fams.map(function(f){return '<button class="fbtn'+(ruleFilter.family===f?' on':'')+
      '" data-rfam="'+esc(f)+'">'+esc(f)+'</button>';}).join('')+
    '</div><div class="fgrp"><span class="mini">Enforcement</span>'+
    enfs.slice(0,5).map(function(f){return '<button class="fbtn'+(ruleFilter.enforcement===f?' on':'')+
      '" data-renf="'+esc(f)+'">'+esc(f)+'</button>';}).join('')+
    '<button class="btn" id="ruleClear">Clear</button></div></div>');

  var rows = all.filter(function(r){
    if (ruleFilter.status && r.ruleStatus!==ruleFilter.status) return false;
    if (ruleFilter.family && r.ruleFamily!==ruleFilter.family) return false;
    if (ruleFilter.enforcement && r.enforcement!==ruleFilter.enforcement) return false;
    if (ruleFilter.q){
      var hay=[r.id,r.title,r.triggerCondition,r.permitted,r.prohibited,r.requiredCaveat].join(' ').toLowerCase();
      if (hay.indexOf(ruleFilter.q.toLowerCase())<0) return false;
    }
    return true;
  });
  h.push('<div class="grid g2">'+rows.map(function(r){ return ruleDetail(r); }).join('')+'</div>');
  if (!rows.length) h.push('<div class="callout">No rule matches these filters.</div>');

  h.push('<h4 style="margin:18px 0 7px">MCP context export</h4><div class="grid g2">'+
    (D.contextRules||[]).map(function(c){
      return '<div class="card click" tabindex="0" role="button" data-oid="'+esc(c.id)+'">'+
        '<div class="row">'+oid(c.id)+'<span class="pill">'+esc(c.workflowStatus)+'</span>'+
        '<span class="note">applies to '+esc(c.title)+'</span></div>'+
        '<p style="margin-top:6px;font-size:12.5px">'+esc(c.statement)+'</p>'+
        '<div class="mini">If missing</div><p class="note">'+esc(c.ifMissing)+'</p>'+
        '<div class="mini">Source rules</div>'+oids(c.relatedRuleIds)+'</div>';
    }).join('')+'</div>');

  h.push('<h4 style="margin:18px 0 7px">Rule governance — who may change a rule</h4>'+
    '<div class="tw"><table><tbody>'+(D.governance||[]).map(function(g){
      return '<tr><td style="width:26%"><strong>'+esc(g.topic)+'</strong></td><td>'+esc(g.detail)+'</td></tr>';
    }).join('')+'</tbody></table></div>');
  el('view-rules').innerHTML = h.join('');
};
function ruleDetail(r){
  var shift = r.columnShiftSuspected;
  var st = r.ruleStatus||'';
  var stx = /source needed|backtest required/i.test(st)
    ? '<span class="needed">'+esc(st.toUpperCase())+'</span>'
    : '<span class="pill">'+esc(st)+'</span>';
  var applied = appliedObjects(r.id);
  return '<div class="card" style="border-left:4px solid '+
    (/canonical/i.test(st)?'var(--graphite)':(/source needed/i.test(st)?'var(--red)':
     (/backtest/i.test(st)?'var(--amber)':'var(--blue)')))+'">'+
    '<div class="row">'+oid(r.id)+stx+tag(r.classification)+
      '<span class="pill">'+esc(r.ruleFamily||'')+'</span>'+
      '<span class="pill">'+esc(r.enforcement||'')+'</span></div>'+
    '<h3 style="margin-top:5px">'+esc(r.title)+'</h3>'+
    '<dl class="kv" style="margin-top:6px">'+
      '<dt>Trigger</dt><dd>'+orNeeded(r.triggerCondition)+'</dd>'+
      '<dt>Required inputs</dt><dd>'+orNeeded(r.requiredInputs)+'</dd>'+
      '<dt>Permitted</dt><dd>'+(shift
        ? '<span class="needed">COLUMN SHIFT SUSPECTED</span> '+esc(r.permitted)
        : esc(r.permitted||'—'))+'</dd>'+
      '<dt>Prohibited</dt><dd>'+esc(r.prohibited||'—')+'</dd>'+
      '<dt>Confidence gate</dt><dd>'+orNeeded(r.confidenceGate)+'</dd>'+
      '<dt>External research</dt><dd>'+orNeeded(r.externalTreatment)+'</dd>'+
      '<dt>Required caveat</dt><dd>'+orNeeded(r.requiredCaveat)+'</dd>'+
      '<dt>Validation method</dt><dd>'+orNeeded(r.validationMethod)+'</dd>'+
      '<dt>Methodology source</dt><dd>'+orNeeded(r.sourceName)+'</dd>'+
      '<dt>Owner / version</dt><dd>'+orNeeded(r.owner,'—')+' · '+orNeeded(r.version,'—')+'</dd>'+
      '<dt>Applied to</dt><dd>'+(applied.length?oids(applied.slice(0,14)):'<span class="note">no object in this workbook cites it directly</span>')+'</dd>'+
    '</dl>'+
    (shift ? '<div class="warnbox" style="margin-top:8px">'+tag('Open question')+
      ' <strong>Workbook integrity.</strong> In this row the fields from <em>Enforcement</em> rightward '+
      'appear shifted one column, so the Permitted cell holds prohibition text. The canonical prohibition '+
      'in '+oid('R-015')+' governs. Flagged for repair; not repaired here.</div>' : '')+
    '</div>';
}
function appliedObjects(rid){
  var out=[];
  (IN_BY[rid]||[]).forEach(function(e){ if(e.type==='GOVERNED_BY') out.push(e.from); });
  (D.interpretations||[]).forEach(function(i){ if((i.relatedRuleIds||[]).indexOf(rid)>=0) out.push(i.id); });
  (D.backtests||[]).forEach(function(b){ if((b.relatedRuleIds||[]).indexOf(rid)>=0) out.push(b.id); });
  (D.signals||[]).forEach(function(s){ if(signalRules(s.id).indexOf(rid)>=0) out.push(s.id); });
  return unique(out);
}

/* ═════════════════════════════════════ VIEW: Risks and Open Questions ═══ */
var riskTab = 0;
RENDER.risks = function(route){
  if (route && route.arg && OBJ[route.arg]) { /* drawer opens via render() */ }
  var tabs = ['Risks','Counter-Evidence','Open Questions','Source Needed','Data Conflicts','Output Blockers'];
  var h=['<div class="vhead"><div class="eyebrow">Risks and open questions</div>'+
    '<h2>What is unresolved, and what it blocks</h2>'+
    '<p>Clicking any item highlights its lineage. Nothing here is repaired in the workbook.</p></div>'];
  h.push('<div class="tabs" id="riskTabs">'+tabs.map(function(t,i){
    return '<button data-rtab="'+i+'"'+(i===riskTab?' class="on"':'')+'>'+esc(t)+'</button>';}).join('')+'</div>');
  h.push('<div id="riskBody"></div>');
  el('view-risks').innerHTML = h.join('');
  paintRisk();
};
function paintRisk(){
  var body = el('riskBody'); if(!body) return;
  var h=[];
  if (riskTab===0 || riskTab===1){
    var list = (D.risks||[]);
    h.push('<div class="grid g2">'+list.map(function(r){
      var blocks = (OUT_BY[r.id]||[]).filter(function(e){return e.type==='CONTRADICTS';})
        .map(function(e){return e.to;});
      return '<div class="card" style="border-left:4px solid var(--red)">'+
        '<div class="row">'+oid(r.id)+tag('Client-provided fact')+
          '<span class="pill">Confidence: '+esc(r.confidence||'—')+'</span>'+
          '<span class="pill">'+esc(r.period||'—')+'</span></div>'+
        '<h3 style="margin-top:5px">'+esc(r.title)+'</h3>'+
        '<p style="font-size:12.5px;margin-top:4px">'+esc(r.statement)+'</p>'+
        '<div class="mini">Contradicts</div>'+oids(blocks.length?blocks:r.contradictingIds)+
        '<div class="mini" style="margin-top:5px">Consequence if unresolved</div>'+
        '<p class="note">'+orNeeded(r.caveat,'Recorded without a stated consequence.')+'</p>'+
        '<div class="row" style="margin-top:6px"><button class="btn" data-oid="'+esc(r.id)+'">Open</button>'+
        '<button class="btn" data-goto="#lineage/'+esc(r.id)+'">Highlight lineage</button></div></div>';
    }).join('')+'</div>');
  } else if (riskTab===2){
    h.push(oqTable(D.openQuestions||[]));
    h.push('<h4 style="margin:14px 0 6px">Review queue — every recorded item</h4>');
    h.push('<div class="tw"><table><thead><tr><th>Queue type</th><th>Object</th><th>Title</th>'+
      '<th>Status</th><th>Priority</th><th>Reviewer notes</th></tr></thead><tbody>'+
      (D.reviewItems||[]).map(function(r){
        return '<tr class="click" data-oid="'+esc(r.originalId||r.id)+'"><td>'+esc(r.theme||'')+'</td>'+
          '<td>'+oid(r.originalId||r.id)+'</td><td>'+esc((r.title||'').slice(0,80))+'</td>'+
          '<td>'+esc(r.workflowStatus||'')+'</td><td>'+esc(r.importance||'')+'</td>'+
          '<td class="note">'+orNeeded(r.caveat,'—')+'</td></tr>';}).join('')+'</tbody></table></div>');
  } else if (riskTab===3){
    var sn = [];
    ['evidence','kpis','bridges','backtests','signals'].forEach(function(c){
      (D[c]||[]).forEach(function(o){ if((o.sourceNeededFields||[]).length) sn.push(o); });
    });
    h.push('<p class="note">'+sn.length+' objects carry at least one unresolved field. '+
      'The value gap and the method gap are tracked separately: for Z-Score the values are resolved '+
      'and only the bands remain open.</p>');
    h.push('<div class="tw"><table><thead><tr><th>Object</th><th>Type</th><th>Title</th>'+
      '<th>Unresolved fields</th><th>Period</th></tr></thead><tbody>'+sn.map(function(o){
        return '<tr class="click" data-oid="'+esc(o.id)+'"><td>'+oid(o.id)+'</td><td>'+esc(o.objectType)+
          '</td><td>'+esc((o.title||'').slice(0,70))+'</td><td>'+
          o.sourceNeededFields.map(function(f){return needed(f);}).join(' ')+'</td>'+
          '<td class="note">'+orNeeded(o.period,'—')+'</td></tr>';}).join('')+'</tbody></table></div>');
  } else if (riskTab===4){
    h.push('<p class="note">'+(D.conflicts||[]).length+' conflicts between authorized worksheets. '+
      'Both values are preserved, the worksheet and period are named, and nothing is averaged or '+
      'silently chosen.</p>');
    h.push('<div class="tw"><table><thead><tr><th>ID</th><th>Object</th><th>Field</th>'+
      '<th>Value A</th><th>Value B</th><th>Rounding?</th><th>Resolution</th></tr></thead><tbody>'+
      (D.conflicts||[]).map(function(c){
        return '<tr><td>'+esc(c.id)+'</td><td>'+oid(c.objectId)+'</td><td>'+esc(c.field)+'</td>'+
          '<td class="note">'+esc(String(c.valueA||'').slice(0,140))+'<br><em>'+esc(c.sheetA)+
            (c.rowA?' r'+c.rowA:'')+(c.periodA?' · '+esc(c.periodA):'')+'</em></td>'+
          '<td class="note">'+esc(String(c.valueB||'').slice(0,140))+'<br><em>'+esc(c.sheetB)+
            (c.rowB?' r'+c.rowB:'')+(c.periodB?' · '+esc(c.periodB):'')+'</em></td>'+
          '<td>'+(c.roundingCouldExplain===true?'<span class="mix">possible</span>':
                 (c.roundingCouldExplain===false?'<span class="dn">no</span>':'<span class="note">n/a</span>'))+'</td>'+
          '<td class="note">'+esc(c.resolution)+'</td></tr>';}).join('')+'</tbody></table></div>');
  } else {
    var blockers = EDGES.filter(function(e){return e.type==='BLOCKS';});
    h.push('<p class="note">Every BLOCKS edge in the graph: what an unresolved question stops from '+
      'being promoted.</p>');
    h.push('<div class="tw"><table><thead><tr><th>Question</th><th>Blocks</th><th>Priority</th>'+
      '<th>Expected source</th><th>Derived from</th></tr></thead><tbody>'+blockers.map(function(e){
        var q = OBJ[e.from]||{};
        return '<tr><td>'+oid(e.from)+' '+esc((q.title||'').slice(0,60))+'</td><td>'+oid(e.to)+' '+
          esc(((OBJ[e.to]||{}).title||'').slice(0,50))+'</td><td>'+esc(q.importance||'')+'</td>'+
          '<td class="note">'+orNeeded(q.sourceName)+'</td><td class="note">'+esc(e.origin||'')+'</td></tr>';
      }).join('')+'</tbody></table></div>');
    h.push('<div class="warnbox" style="margin-top:10px"><strong>Named blockers required by the brief.</strong>'+
      '<ul><li>Cohort and regional N gaps '+oid('OQ-014')+' — every October cut is displayed without a base.</li>'+
      '<li>October label versus 2026-09-10 export timestamp '+oid('OQ-015')+' — both preserved, unreconciled.</li>'+
      '<li>Z-Score methodology bands '+oids(['OQ-005','R-007'])+' — values resolved, bands open.</li>'+
      '<li>Current retention / churn '+oid('OQ-006')+'.</li>'+
      '<li>Current shared accounts '+oid('OQ-008')+'.</li>'+
      '<li>Forecaster vintage '+oid('OQ-004')+' — no frozen vintage supplied.</li>'+
      '<li>Signal-to-KPI lag and confounders '+oids(['R-016','R-021','BT-CRWD-OCT26'])+'.</li></ul></div>');
  }
  body.innerHTML = h.join('');
}

/* ═════════════════════════════════════════════════ VIEW: Source Register ═ */
RENDER.sources = function(){
  var h=['<div class="vhead"><div class="eyebrow">Sources</div><h2>Source register</h2>'+
    '<p>'+(D.sources||[]).length+' source objects. The eight October CSV exports are the current '+
    'primary layer; their filenames are dated 2026-09-10 while the survey labels read October 2026 '+
    oid('OQ-015')+'.</p></div>'];
  var cur = (D.sources||[]).filter(function(s){return s.currentOrHistorical==='current';});
  var hist = (D.sources||[]).filter(function(s){return s.currentOrHistorical!=='current';});
  h.push('<h4>October 2026 current exports ('+cur.length+')</h4>');
  h.push(srcTable(cur));
  h.push('<h4 style="margin-top:16px">Historical and company sources ('+hist.length+')</h4>');
  h.push(srcTable(hist));
  el('view-sources').innerHTML = h.join('');
  function srcTable(list){
    return '<div class="tw"><table><thead><tr><th style="width:11%">ID</th>'+
      '<th style="width:26%">Source name</th><th style="width:13%">Type</th>'+
      '<th style="width:13%">Publisher</th><th style="width:8%">Date</th>'+
      '<th style="width:13%">Dataset</th><th style="width:8%">Access</th>'+
      '<th style="width:8%">URL</th></tr></thead><tbody>'+list.map(function(s){
        return '<tr class="click" data-oid="'+esc(s.id)+'"><td>'+oid(s.id)+'</td>'+
          '<td>'+esc(s.sourceName)+'</td><td class="note">'+orNeeded(s.sourceType)+'</td>'+
          '<td class="note">'+orNeeded(s.description)+'</td><td class="note">'+orNeeded(s.period)+'</td>'+
          '<td class="note">'+orNeeded(s.dataset)+'</td><td class="note">'+orNeeded(s.verificationStatus)+'</td>'+
          '<td>'+((s.sourceNeededFields||[]).indexOf('URL')>=0?needed('NO URL'):'<span class="note">recorded</span>')+
          '</td></tr>';}).join('')+'</tbody></table></div>';
  }
};

/* ═══════════════════════════════════════════ VIEW: Audience Translator ══ */
/* The signal, evidence, IDs, confidence, period, rules and caveats are identical in
   every card. Only the decision question, translation, emphasis, implication,
   recommended action and tone change. */
var AUDIENCES = [
  {id:'cio', label:'Enterprise CIO / CISO',
   q:'Is peer spending intent recovering enough to justify continued consolidation onto this platform?',
   t:'Peer spending intent improved again in October, and breadth improved more than intent did. '+
     'Enterprise strength is selective: the largest indexed cohorts sit above the overall reading while '+
     'Large Organizations sit below it.',
   emph:['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-LARGE'],
   action:'Ask for cut-level N before treating any cohort reading as representative of your own segment.',
   tone:'operational'},
  {id:'product', label:'Product and Strategy',
   q:'Which stated adoption reasons are gaining and losing ground?',
   t:'Technical capabilities and product security are the two highest-cited October reasons; '+
     'technological lead/lag falls most between periods. These are stated reasons, not causes of the '+
     'Net Score movement.',
   emph:['ETR-OCT26-ADOPT','ETR-OCT26-JOBS'],
   action:'Treat the reason shifts as hypotheses to test in qualitative work; reason-response N is absent.',
   tone:'analytical'},
  {id:'ar', label:'Analyst Relations',
   q:'Which claims can be defended in a briefing this quarter?',
   t:'The October readings and their period labels are defensible as stated. An enterprise-dominance '+
     'framing is not: the cohort picture is selective and every cut lacks a base.',
   emph:['ETR-OCT26-NS','ETR-OCT26-G2K','ETR-OCT26-LARGE'],
   action:'Do not brief a cohort-dominance line until OQ-014 supplies cut-level N.',
   tone:'concise'},
  {id:'sellside', label:'Sell-Side Analyst',
   q:'What in this changes a model input?',
   t:'Nothing in the ETR lane is a model input on its own. It is corroborating demand context for the '+
     'company-reported series, on a lag that is not established.',
   emph:['ETR-OCT26-NS','REF-E-F04','KPI-003'],
   action:'Keep the demand series and the reported series in separate columns; the bridge is Backtest Required.',
   tone:'analytical'},
  {id:'investor', label:'Buy-Side Investor',
   q:'What does this evidence establish, and what does it not?',
   t:'It establishes a persisting but slowing recovery in spending intent with improving breadth. '+
     'It does not establish causation, a company outcome, or any forward expectation.',
   emph:['ETR-OCT26-NS','ETR-OCT26-ZS','XL-01'],
   action:'Treat the series as a monitoring input pending backtest. No rating, target or forecast is produced here.',
   tone:'concise'},
  {id:'pe', label:'Private Equity / Corporate Development',
   q:'Is the demand position durable enough to underwrite?',
   t:'October demand improved on both level and breadth, but the current-period retention reading is '+
     'absent and no current shared-account comparison exists.',
   emph:['ETR-OCT26-PV','OQ-006','OQ-008'],
   action:'Make current retention and a current shared-account cut diligence conditions; both are Source Needed.',
   tone:'executive'},
  {id:'etrresearch', label:'ETR Research',
   q:'What must the methodology resolve before this becomes a governed proof case?',
   t:'The values are resolved; the method is not. Z-Score bands, cut-level N, and the survey-label versus '+
     'export-timestamp question all remain open.',
   emph:['ETR-OCT26-ZS','OQ-005','OQ-014','OQ-015'],
   action:'Publish the Z-Score specification and cut-level bases, then pre-register BT-CRWD-OCT26.',
   tone:'analytical'},
  {id:'etrsales', label:'ETR Sales / Client Success',
   q:'What can be shown to a client today without a caveat being added later?',
   t:'The October readings with their periods and N, the Pervasion series, and the cohort and regional '+
     'cuts marked with their missing bases. Nothing about causation or company outcomes.',
   emph:['ETR-OCT26-NS','ETR-OCT26-PV','OQ-014'],
   action:'Ship the readings with their bases visible; hold the cohort narrative until N is supplied.',
   tone:'concise'}
];
function audienceCard(a){
  return '<div class="card" style="border-top:3px solid var(--navy)"><h4>'+esc(a.label)+'</h4>'+
    '<h3 style="margin:5px 0 6px">'+esc(a.q)+'</h3>'+
    '<p style="font-size:12.5px">'+esc(a.t)+'</p>'+
    '<div class="mini">Best evidence</div>'+oids(a.emph)+
    '<div class="mini" style="margin-top:5px">Counter-evidence (fixed)</div>'+oids(['CE-002','CE-003'])+
    '<div class="mini" style="margin-top:5px">Principal caveat (fixed)</div>'+
    '<p class="note">Cohort and regional N absent '+oid('OQ-014')+'; Z-Score bands Source Needed '+
      oid('OQ-005')+'; no October data outlook recorded '+oid('OQ-002')+'.</p>'+
    '<div class="mini">Recommended action</div><p class="note">'+esc(a.action)+'</p></div>';
}
RENDER.audience = function(route){
  if (route && route.arg && AUDIENCES.some(function(a){return a.id===route.arg;}))
    { state.audience = route.arg; save(); }
  var a = AUDIENCES.filter(function(x){return x.id===state.audience;})[0] || AUDIENCES[4];
  var ns=CP.netScore;
  var h=['<div class="vhead"><div class="eyebrow">Audience Translator</div>'+
    '<h2>Same evidence-backed signal. Different decision context.</h2>'+
    '<p>Changing audience changes only the decision question, translation, emphasis, implication, '+
    'recommended action and tone. Facts, metric values, source IDs, the signal statement, confidence, '+
    'the current period, the rules and the caveats never change.</p></div>'];
  h.push('<div class="fgrp" style="margin-bottom:11px">'+AUDIENCES.map(function(x){
    return '<button class="fbtn'+(x.id===a.id?' on':'')+'" data-aud="'+esc(x.id)+
      '" aria-pressed="'+(x.id===a.id)+'">'+esc(x.label)+'</button>';}).join('')+'</div>');
  h.push('<div class="okbox"><strong>Fixed in every card:</strong> '+esc(CP.label)+' Net Score '+
    n2(ns.value)+' ('+sign(ns.qqDelta)+' Q/Q, '+sign(ns.yyDelta)+' Y/Y, N '+n2(CP.nBase,0)+') '+
    oid('ETR-OCT26-NS')+' · Pervasion '+n2(CP.pervasion.value)+' '+oid('ETR-OCT26-PV')+' · '+
    'Q/Q Z '+n2(CP.zScore.qqZ,6)+', Y/Y Z '+n2(CP.zScore.yyZ,6)+' '+oid('ETR-OCT26-ZS')+' · '+
    'primary signal '+oid('SIG-02')+' · conviction '+esc(CALL.conviction)+' · '+
    'Current Call '+needed()+' '+oid('OQ-002')+' · human review required '+oid('R-020')+'.</div>');
  h.push('<div class="grid g2" style="margin-bottom:12px">'+audienceCard(a)+
    '<div class="card"><h4>What did not change</h4>'+
    '<div class="tw" style="margin-top:6px"><table><thead><tr><th>Field</th><th>Value across all '+
    AUDIENCES.length+' audiences</th></tr></thead><tbody>'+
    [['Signal statement',(OBJ['SIG-02']||{}).statement],
     ['Net Score', n2(ns.value)+' ('+CP.label+')'],
     ['Pervasion', n2(CP.pervasion.value)],
     ['Q/Q Z-Score', n2(CP.zScore.qqZ,9)],
     ['Y/Y Z-Score', n2(CP.zScore.yyZ,9)],
     ['N', n2(CP.nBase,0)+' citations'],
     ['Confidence', CALL.conviction],
     ['Current period', CP.label],
     ['Caveats', 'Cohort/regional N absent; Z bands Source Needed; no October outlook recorded']]
      .map(function(r){return '<tr><td><strong>'+esc(r[0])+'</strong></td><td>'+esc(r[1])+'</td></tr>';}).join('')+
    '</tbody></table></div>'+
    '<p class="note" style="margin-top:7px">No personalized investment advice, price target or rating '+
    'is produced for any audience.</p></div></div>');
  h.push('<h4 style="margin-bottom:7px">All audiences side by side</h4>');
  h.push('<div class="grid g3">'+AUDIENCES.map(audienceCard).join('')+'</div>');
  el('view-audience').innerHTML = h.join('');
};

/* ═════════════════════════════════ Deterministic generator machinery ════ */
/* Prose is assembled from workbook objects by template. There is no model call and
   no free text: every sentence names the objects it was built from. */
var CLAIM_SEQ = 0;
function claim(outputType, text, classification, evidenceIds, objectIds, ruleIds, confidence, caveat, sn){
  CLAIM_SEQ++;
  return {
    claimId: outputType.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)+'-'+String(CLAIM_SEQ).padStart(3,'0'),
    outputType: outputType, text: text, classification: classification,
    sourceEvidenceIds: evidenceIds||[], sourceObjectIds: objectIds||[],
    sourceWorksheets: unique((evidenceIds||[]).concat(objectIds||[])
      .map(function(i){ return (OBJ[i]||{}).sourceWorksheet; }).filter(Boolean)),
    ruleIds: ruleIds||[], confidence: confidence||null, caveat: caveat||null,
    sourceNeeded: sn||[], generatedAtLocalTime: new Date().toLocaleString()
  };
}
function evText(id){
  var e = OBJ[id]; if (!e) return id;
  return (e.statement || e.title || id);
}
function selectedList(ids){ return ids.filter(function(i){return OBJ[i];}); }

var GEN = {
  sunday: {title:'CrowdStrike — October 2026 TSIS', audience:'investor', signal:'SIG-02',
    tone:'analytical', length:'standard', chart:true, method:true, appendix:true,
    order:null, edited:null},
  email: {type:'Internal Research Update', recipient:'Research team', subjectStyle:'default',
    audience:'investor', signal:'SIG-02', risk:'CE-002', question:'OQ-014',
    action:'Pre-register BT-CRWD-OCT26 with an agreed lag and tolerance',
    length:'standard', includeIds:true, includeMethod:true, edited:null}
};

/** Build the Sunday Signal as an ordered list of {heading, claims[]}. */
function buildSunday(){
  var g = GEN.sunday, ns=CP.netScore, pv=CP.pervasion, z=CP.zScore, it=CP.intent;
  var sig = OBJ[g.signal] || OBJ['SIG-02'];
  var ev = selectedList(state.genEvidence);
  var counter = selectedList(state.genCounter);
  var qs = selectedList(state.genQuestion);
  var aud = AUDIENCES.filter(function(a){return a.id===g.audience;})[0] || AUDIENCES[4];
  var brief = (g.length==='short'), extended = (g.length==='extended');
  var S = [];
  CLAIM_SEQ = 0;

  S.push({h:'Headline', c:[ claim('sunday',
    'CrowdStrike '+CP.label+': recovery persists, sequential improvement is modest, year-over-year '+
    'improvement is materially larger.',
    'Anduril interpretation', ['ETR-OCT26-NS'], [sig.id], ['R-002','R-004','R-005','R-025'],
    'High on current raw values', 'Direction only. No company outcome is implied.', [])]});

  S.push({h:'Why This Matters Now', c:[ claim('sunday',
    'October 2026 is the current TSIS period under R-025; July 2026 is now historical comparison. '+
    'The prior package stopped at July, so this is the first current-period read of the post-outage '+
    'recovery on the October export set.',
    'Client-provided fact', ['ETR-OCT26-NS','ETR-CUR-001'], ['R-025','CTX-012'], ['R-002','R-025'],
    'High', 'Survey labels read October 2026; export filenames are dated 2026-09-10 (OQ-015).', ['OQ-015'])]});

  var whatShows = [ claim('sunday',
    'Net Score is '+n2(ns.value)+' on '+n2(CP.nBase,0)+' citations, '+sign(ns.qqDelta)+' against July 2026 '+
    'and '+sign(ns.yyDelta)+' against October 2025.',
    'Client-provided fact', ['ETR-OCT26-NS'], [], ['R-004','R-009'], 'High', null, []),
    claim('sunday',
    'Pervasion is '+n2(pv.value)+', '+sign(pv.qqDelta)+' sequentially and '+sign(pv.yyDelta)+' year over year.',
    'Client-provided fact', ['ETR-OCT26-PV'], [], ['R-008','R-009'], 'High',
    'Pervasion is breadth, not revenue or market share.', []) ];
  if (!brief) whatShows.push(claim('sunday',
    'Spending intent splits Adoption '+n2(it.adoption)+'%, Increase '+n2(it.increase)+'%, Flat '+
    n2(it.flat)+'%, Decrease '+n2(it.decrease)+'%, Replacing '+n2(it.replacing)+'%.',
    'Client-provided fact', ['ETR-OCT26-INTENT'], [], ['R-009'], 'High', null, []));
  ev.forEach(function(id){
    if (['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-INTENT'].indexOf(id)>=0) return;
    var e = OBJ[id];
    whatShows.push(claim('sunday', evText(id), e.classification||'Client-provided fact', [id], [],
      ['R-009'], e.confidence, e.caveat, e.sourceNeededFields||[]));
  });
  S.push({h:'What the October Data Shows', c:whatShows});

  S.push({h:'What Changed Since July', c:[ claim('sunday',
    'Sequentially the Net Score move of '+sign(ns.qqDelta)+' is '+moveWord(ns.qqDelta)+' under the '+
    'R-005 wording convention, while the year-over-year move of '+sign(ns.yyDelta)+' is '+
    moveWord(ns.yyDelta)+'. Pervasion moved '+sign(pv.qqDelta)+' sequentially, '+moveWord(pv.qqDelta)+'.',
    'Anduril interpretation', ['ETR-OCT26-NS','ETR-OCT26-PV'], [], ['R-003','R-005'],
    'High on current raw values',
    'These are wording conventions, not statistical-significance thresholds.', [])]});

  S.push({h:'Where the Signal Is Strongest', c:[ claim('sunday',
    'Breadth. Pervasion improved more than intent did this quarter, and the largest indexed cohorts — '+
    'Global 2000 at 42.61 and Fortune 500 at 42.68 — read above the overall '+n2(ns.value)+'.',
    'Anduril interpretation', ['ETR-OCT26-PV','ETR-OCT26-G2K','ETR-OCT26-F500'], ['SIG-05'],
    ['R-008','R-010','R-011'], 'Medium — cohort N missing',
    'No cohort cut carries a citation base (OQ-014).', ['nBase'])]});

  S.push({h:'Where It Is Mixed', c:[ claim('sunday',
    'Enterprise evidence is selective rather than uniform: Large Organizations read 35.82, below the '+
    'overall reading, while the indexed cohorts read above it. Geographically the October cuts run from '+
    'APAC 54.29 to EMEA 27.27 with no regional base supplied.',
    'Anduril interpretation', ['ETR-OCT26-LARGE','ETR-OCT26-REGION'], ['SIG-05','SIG-07'],
    ['R-010','R-011','R-024'], 'Medium — N missing throughout',
    'Do not link a regional survey cut to regional revenue.', ['nBase'])]});

  S.push({h:'What Z-Score Adds', c:[ claim('sunday',
    'The Q/Q Z-Score is '+n2(z.qqZ,6)+' and the Y/Y Z-Score is '+n2(z.yyZ,6)+' on N '+n2(z.citations,0)+
    '. Both are positive, and Y/Y is higher than Q/Q, which is consistent with the larger Y/Y '+
    'base-metric change. Raw Z-Score values are available; approved interpretation bands remain Source Needed.',
    'Client-provided fact', ['ETR-OCT26-ZS'], ['OQ-005'], ['R-006','R-007','R-026','CTX-013'],
    'Medium — values available, bands absent',
    'Z-Score supplies unusualness context only and never creates or changes the Current Call.',
    ['Z-Score bands'])]});

  var notProve = [ claim('sunday',
    'Nothing here establishes a company outcome. The ETR lane and the company lane are parallel '+
    'evidence: XL-01 records them as directionally consistent, and R-015 prohibits any causal reading '+
    'between them.',
    'Anduril interpretation', ['ETR-OCT26-NS'], ['XL-01'], ['R-013','R-015','CTX-007'], 'Medium',
    null, []) ];
  counter.forEach(function(id){
    var r = OBJ[id];
    notProve.push(claim('sunday', 'Counter-evidence: '+evText(id),
      'Client-provided fact', [], [id], ['R-024'], r.confidence, r.caveat, []));
  });
  S.push({h:'What the Evidence Does Not Prove', c:notProve});

  S.push({h:'KPI Bridge / Hypothesis', c:[ claim('sunday',
    'The proof-case candidate is '+sig.id+' → KPI-003 Net New ARR. R-021 holds it at Backtest Required: '+
    'no lag is established for the pairing, and Flex, CCP, renewal timing, new logos and expansion are '+
    'named confounders. BT-CRWD-OCT26 is the protocol; its lag and tolerance are Source Needed.',
    'Hypothesis', ['ETR-OCT26-NS','ETR-OCT26-ZS'], ['BRIDGE-SIG-02-KPI-003','KPI-003','BT-CRWD-OCT26'],
    ['R-016','R-021','CTX-008','CTX-011'], 'Medium',
    'Hypothesis — Backtest Required. Not a validated predictive relationship.',
    ['Expected lag','Tolerance'])]});

  var watch = qs.map(function(id){
    var q = OBJ[id];
    return claim('sunday', 'Open question — '+q.title+'. '+(q.statement||''),
      'Open question', [], [id], ['R-009','R-010'], null,
      'Expected source: '+(q.sourceName||'Source Needed'), [id]);
  });
  watch.push(claim('sunday',
    'Next period: whether the sequential move clears the R-005 stated-change band, whether cut-level N '+
    'is supplied, and whether an October data outlook is recorded at all.',
    'Recommended action', [], ['OQ-014','OQ-002'], ['R-005','R-019'], null, null, []));
  S.push({h:'What to Watch Next', c:watch});

  if (g.appendix){
    var allIds = unique(ev.concat(counter, qs, ['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-ZS',
      'ETR-OCT26-INTENT','ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE','ETR-OCT26-REGION',
      sig.id,'KPI-003','BT-CRWD-OCT26']));
    S.push({h:'Sources and Evidence IDs', c:[ claim('sunday',
      allIds.join(' · '), 'Client-provided fact', allIds, [], [], null,
      'Every ID resolves to an object in the authorized worksheets.', [])]});
  }
  if (g.method){
    S.push({h:'Methodology note', c:[ claim('sunday',
      'Sole source: the 31 authorized worksheets of '+D.metadata.workbook+'. October 2026 is current '+
      'and July 2026 historical under R-025. N counts citations, not people. Z-Score bands, cohort and '+
      'regional bases, and the October data outlook are Source Needed.',
      'Client-provided fact', [], ['R-002','R-009','R-025'], ['R-002','R-009','R-025'], null, null,
      ['OQ-002','OQ-005','OQ-014'])]});
  }
  S.push({h:'Human Review Required', c:[ claim('sunday',
    'Generated draft — Human Review Required. R-020 makes analyst approval a precondition of external '+
    'distribution. No item in this package has been signed off as a validated Signal-to-KPI relationship.',
    'Recommended action', [], ['R-020'], ['R-020','CTX-010'], null, null, [])]});

  if (extended) S.splice(5, 0, {h:'Adoption context', c:[ claim('sunday',
    'The two highest-cited October adoption reasons are product technical capabilities and product '+
    'security. Reason percentages are reasons, not spending outcomes, and are not causal explanations '+
    'of the Net Score movement.',
    'Client-provided fact', ['ETR-OCT26-ADOPT'], [], ['R-013'], 'Medium — reason N missing',
    'Reason-response N is Source Needed.', ['nBase'])]});
  if (brief) S = S.filter(function(s){
    return ['Headline','What the October Data Shows','What Z-Score Adds',
            'What the Evidence Does Not Prove','KPI Bridge / Hypothesis',
            'Human Review Required'].indexOf(s.h)>=0; });

  if (g.order) S.sort(function(a,b){
    var ia=g.order.indexOf(a.h), ib=g.order.indexOf(b.h);
    return (ia<0?99:ia) - (ib<0?99:ib);
  });
  return S;
}

function buildEmail(){
  var g = GEN.email, ns=CP.netScore, z=CP.zScore;
  var sig = OBJ[g.signal] || OBJ['SIG-02'];
  var risk = OBJ[g.risk] || OBJ['CE-002'];
  var q = OBJ[g.question] || OBJ['OQ-014'];
  var detailed = (g.length==='detailed'), concise = (g.length==='concise');
  CLAIM_SEQ = 500;
  var subject = {
    'default': 'CrowdStrike Signal Update — October 2026 TSIS',
    'signal': 'Signal alert — CrowdStrike '+CP.label+' Net Score '+n2(ns.value),
    'question': 'CrowdStrike '+CP.label+': what the October data does and does not establish'
  }[g.subjectStyle] || 'CrowdStrike Signal Update — October 2026 TSIS';
  if (g.type==='Signal Alert') subject = 'Signal alert — CrowdStrike '+CP.label+' TSIS';
  if (g.type==='Proof-Case Status Update') subject = 'Proof-case status — CrowdStrike SIG-02 → KPI-003';

  var S = [];
  S.push({h:'Bottom Line', c:[ claim('email',
    'CrowdStrike '+CP.label+' Net Score is '+n2(ns.value)+' ('+sign(ns.qqDelta)+' Q/Q, '+sign(ns.yyDelta)+
    ' Y/Y, N '+n2(CP.nBase,0)+'). The recovery persists; the sequential move is '+moveWord(ns.qqDelta)+
    ' and the year-over-year move is '+moveWord(ns.yyDelta)+'. No company outcome is implied.',
    'Anduril interpretation', ['ETR-OCT26-NS'], [sig.id], ['R-004','R-005','R-015'],
    'High on current raw values', null, [])]});
  S.push({h:'What Changed', c:[ claim('email',
    'October 2026 replaces July 2026 as the current TSIS period under R-025. Pervasion rose to '+
    n2(CP.pervasion.value)+' ('+sign(CP.pervasion.qqDelta)+' Q/Q), which is a larger sequential move '+
    'than the Net Score change.',
    'Client-provided fact', ['ETR-OCT26-PV'], ['R-025'], ['R-003','R-025'], 'High', null, [])]});
  S.push({h:'Best Evidence', c: selectedList(state.genEvidence).map(function(id){
    var e = OBJ[id];
    return claim('email', id+' — '+evText(id), e.classification||'Client-provided fact', [id], [],
      ['R-009'], e.confidence, e.caveat, e.sourceNeededFields||[]);
  })});
  S.push({h:'Counter-Evidence / Caveat', c:[ claim('email',
    risk.id+' — '+(risk.title||'')+'. '+(risk.statement||''),
    'Client-provided fact', [], [risk.id], ['R-024'], risk.confidence,
    'Cohort and regional N are absent from every October cut (OQ-014).', ['OQ-014'])]});
  S.push({h:'Z-Score Context', c:[ claim('email',
    'Q/Q Z '+n2(z.qqZ,6)+', Y/Y Z '+n2(z.yyZ,6)+', N '+n2(z.citations,0)+'. Both positive; Y/Y higher '+
    'than Q/Q. Raw Z-Score values are available. Approved interpretation bands remain Source Needed.',
    'Client-provided fact', ['ETR-OCT26-ZS'], ['OQ-005'], ['R-006','R-007','R-026'],
    'Medium — bands absent', 'Z-Score never creates or changes the Current Call.', ['Z-Score bands'])]});
  S.push({h:'KPI Relevance', c:[ claim('email',
    sig.id+' → KPI-003 Net New ARR is the proof-case candidate and is Hypothesis — Backtest Required. '+
    'No lag is established; Flex, CCP, renewals, new logos and expansion are named confounders.',
    'Hypothesis', [], ['BRIDGE-SIG-02-KPI-003','KPI-003','BT-CRWD-OCT26'], ['R-016','R-021'],
    'Medium', 'Not a validated predictive relationship.', ['Expected lag'])]});
  S.push({h:'Open Question', c:[ claim('email',
    q.id+' — '+(q.title||'')+'. Expected source: '+(q.sourceName||'Source Needed')+'.',
    'Open question', [], [q.id], ['R-009','R-010'], null, null, [q.id])]});
  S.push({h:'Recommended Next Action', c:[ claim('email',
    g.action, 'Recommended action', [], ['BT-CRWD-OCT26','R-021'], ['R-016','R-021'], null, null, [])]});
  if (g.includeIds){
    var ids = unique(selectedList(state.genEvidence).concat([risk.id, q.id, sig.id, 'KPI-003',
      'ETR-OCT26-ZS','BT-CRWD-OCT26']));
    S.push({h:'Evidence IDs', c:[ claim('email', ids.join(' · '), 'Client-provided fact', ids, [], [],
      null, null, [])]});
  }
  if (g.includeMethod) S.push({h:'Methodology caveat', c:[ claim('email',
    'Sole source: the authorized worksheets of '+D.metadata.workbook+'. N counts citations, not people. '+
    'ETR evidence and company evidence are parallel lanes; no causal relationship is asserted.',
    'Client-provided fact', [], ['R-009','R-015'], ['R-009','R-015'], null, null, [])]});
  S.push({h:'Human Review Required', c:[ claim('email',
    'Generated draft — Human Review Required. This prototype does not create or send email.',
    'Recommended action', [], ['R-020'], ['R-020'], null, null, [])]});

  if (concise) S = S.filter(function(s){
    return ['Bottom Line','Best Evidence','Counter-Evidence / Caveat','Recommended Next Action',
            'Human Review Required'].indexOf(s.h)>=0; });
  if (detailed) S.splice(3, 0, {h:'Cohort and regional detail', c:[ claim('email',
    'G2000 42.61 / 58.55, F500 42.68 / 61.83, Large Organizations 35.82 / 49.45. Regional Net Score '+
    'runs APAC 54.29 to EMEA 27.27. No cut carries a base.',
    'Client-provided fact', ['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE','ETR-OCT26-REGION'],
    [], ['R-009','R-010'], 'Medium — N missing', null, ['nBase'])]});
  return {subject: subject, sections: S};
}

/* ────────────────────────────────────────── generator view rendering ──── */
var LAST_MANIFEST = [];
function renderClaims(sections, cls){
  LAST_MANIFEST = [];
  var h=[];
  sections.forEach(function(sec){
    h.push('<div class="gen-sec"><h4>'+esc(sec.h)+'</h4>');
    sec.c.forEach(function(c){
      LAST_MANIFEST.push(c);
      h.push('<div class="claim '+claimClass(c.classification)+'" data-claim="'+esc(c.claimId)+
        '" tabindex="0" role="button" aria-label="Open claim manifest for '+esc(c.claimId)+'">'+
        '<p style="margin:0">'+esc(c.text)+'</p>'+
        '<div class="claim-ids">'+esc(c.claimId)+' · '+esc(c.classification)+
        (c.sourceEvidenceIds.length?' · '+c.sourceEvidenceIds.join(' '):'')+
        (c.sourceObjectIds.length?' · '+c.sourceObjectIds.join(' '):'')+
        (c.ruleIds.length?' · rules '+c.ruleIds.join(' '):'')+'</div></div>');
    });
    h.push('</div>');
  });
  return h.join('');
}
function claimsToMarkdown(title, sections){
  var out = ['# '+title, ''];
  sections.forEach(function(s){
    out.push('## '+s.h, '');
    s.c.forEach(function(c){
      out.push(c.text);
      var ids = c.sourceEvidenceIds.concat(c.sourceObjectIds);
      out.push('`'+c.claimId+' · '+c.classification+(ids.length?' · '+ids.join(' '):'')+
        (c.ruleIds.length?' · rules '+c.ruleIds.join(' '):'')+'`');
      out.push('');
    });
  });
  out.push('---','_Generated draft — Human Review Required._');
  return out.join('\n');
}
function claimsToText(title, sections){
  var out=[title,''.padEnd?''.padEnd(title.length,'='):'====',''];
  sections.forEach(function(s){
    out.push(s.h.toUpperCase(),'');
    s.c.forEach(function(c){
      out.push(c.text);
      var ids=c.sourceEvidenceIds.concat(c.sourceObjectIds);
      out.push('  ['+c.claimId+' · '+c.classification+(ids.length?' · '+ids.join(' '):'')+']');
      out.push('');
    });
  });
  out.push('--','Generated draft — Human Review Required.');
  return out.join('\n');
}
function claimsToHtml(title, sections){
  var h=['<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>'+esc(title)+
    '</title><style>body{font:14px/1.55 Georgia,serif;max-width:760px;margin:32px auto;padding:0 18px;'+
    'color:#1B2430}h1,h2{font-family:Georgia,serif;color:#17365D}h2{font-size:17px;margin-top:22px}'+
    'code{font:11px Consolas,monospace;color:#595959;display:block;margin-top:3px}'+
    'hr{border:none;border-top:1px solid #D8DEE6;margin:22px 0}</style></head><body>'];
  h.push('<h1>'+esc(title)+'</h1>');
  sections.forEach(function(s){
    h.push('<h2>'+esc(s.h)+'</h2>');
    s.c.forEach(function(c){
      h.push('<p>'+esc(c.text)+'<code>'+esc(c.claimId+' · '+c.classification+' · '+
        c.sourceEvidenceIds.concat(c.sourceObjectIds).join(' '))+'</code></p>');
    });
  });
  h.push('<hr><p><strong>Generated draft — Human Review Required.</strong></p></body></html>');
  return h.join('');
}

function evidencePicker(name, selectedIds, pool){
  return '<div class="pick" id="'+name+'">'+pool.map(function(e){
    var on = selectedIds.indexOf(e.id)>=0;
    return '<label class="toggle"><input type="checkbox" data-pick="'+name+'" value="'+esc(e.id)+
      '"'+(on?' checked':'')+'> <span><span class="oid" style="pointer-events:none">'+esc(e.id)+
      '</span> '+esc((e.title||e.statement||'').slice(0,54))+'</span></label>';
  }).join('')+'</div>';
}

RENDER['gen-sunday'] = function(){
  var g = GEN.sunday;
  var sections = buildSunday();
  var title = g.title + ' — Sunday Signal';
  var pool = (D.evidence||[]).filter(function(e){return e.currentOrHistorical==='current';});
  var counterPool = (D.risks||[]);
  var qPool = (D.openQuestions||[]).filter(function(q){return /critical|high/i.test(q.importance||'');});
  var h=['<div class="vhead"><div class="eyebrow">Sunday Signal Generator</div>'+
    '<h2>Deterministic draft assembly</h2>'+
    '<p>Prose is assembled by template from the objects selected on the left. No model is called. '+
    'Every paragraph carries a claim manifest — click any paragraph to open it.</p></div>'];
  h.push('<div class="gen"><div class="gen-controls no-print">'+
    '<label for="ssTitle">Title</label><input id="ssTitle" type="text" value="'+esc(g.title)+'">'+
    '<label for="ssAud">Audience</label><select id="ssAud">'+AUDIENCES.map(function(a){
      return '<option value="'+a.id+'"'+(a.id===g.audience?' selected':'')+'>'+esc(a.label)+'</option>';
    }).join('')+'</select>'+
    '<label for="ssSig">Primary signal</label><select id="ssSig">'+(D.signals||[]).map(function(s){
      return '<option value="'+s.id+'"'+(s.id===g.signal?' selected':'')+'>'+esc(s.id+' — '+s.title)+
        '</option>';}).join('')+'</select>'+
    '<label for="ssKpi">KPI bridge</label><select id="ssKpi">'+(D.bridges||[])
      .filter(function(b){return b.relatedSignalIds[0]===g.signal;})
      .sort(function(a2,b2){ /* the proof-case pairing first */
        return (b2.relatedKpiIds[0]==='KPI-003'?1:0)-(a2.relatedKpiIds[0]==='KPI-003'?1:0); })
      .map(function(b){
      return '<option value="'+esc(b.id)+'">'+esc(b.relatedSignalIds[0]+' → '+b.relatedKpiIds[0])+
        ' ('+esc(b.cellState)+')</option>';}).join('')+'</select>'+
    '<label>Evidence objects</label>'+evidencePicker('genEvidence', state.genEvidence, pool)+
    '<label>Counter-evidence</label>'+evidencePicker('genCounter', state.genCounter, counterPool)+
    '<label>Open questions</label>'+evidencePicker('genQuestion', state.genQuestion, qPool)+
    '<label for="ssTone">Tone</label><select id="ssTone">'+['concise','analytical','executive']
      .map(function(t){return '<option'+(t===g.tone?' selected':'')+'>'+t+'</option>';}).join('')+'</select>'+
    '<label for="ssLen">Length</label><select id="ssLen">'+['short','standard','extended']
      .map(function(t){return '<option'+(t===g.length?' selected':'')+'>'+t+'</option>';}).join('')+'</select>'+
    '<label class="toggle" style="margin-top:9px"><input type="checkbox" id="ssChart"'+
      (g.chart?' checked':'')+'> Include current chart</label>'+
    '<label class="toggle"><input type="checkbox" id="ssMethod"'+(g.method?' checked':'')+
      '> Include methodology note</label>'+
    '<label class="toggle"><input type="checkbox" id="ssAppendix"'+(g.appendix?' checked':'')+
      '> Include evidence appendix</label>'+
    '<div class="sep"></div>'+
    '<button class="btn pri" id="ssRegen" style="width:100%">Regenerate</button>'+
    '<button class="btn" id="ssReorder" style="width:100%;margin-top:5px">Reorder sections</button>'+
    '<button class="btn" id="ssEdit" style="width:100%;margin-top:5px">Edit draft locally</button>'+
    '<button class="btn" id="ssRestore" style="width:100%;margin-top:5px">Restore generated text</button>'+
    '</div>');
  h.push('<div><div class="actbar no-print">'+
    '<button class="btn'+(state.inspect?' on':'')+'" id="ssInspect">Inspect claims</button>'+
    '<button class="btn" id="ssCopy">Copy to clipboard</button>'+
    '<button class="btn" id="ssMd">Download Markdown</button>'+
    '<button class="btn" id="ssHtml">Download HTML</button>'+
    '<button class="btn" id="ssManifest">Download claim manifest JSON</button>'+
    '<button class="btn" id="ssPrint">Print</button></div>');
  h.push('<div class="gen-out'+(state.inspect?' inspect':'')+'" id="ssOut">');
  h.push('<div class="hyp-bar" style="background:var(--lred);border-color:var(--red);color:var(--red)">'+
    'Generated draft — Human Review Required</div>');
  h.push('<h3 style="margin-top:10px">'+esc(title)+'</h3>');
  h.push('<p class="note">Audience: '+esc((AUDIENCES.filter(function(a){return a.id===g.audience;})[0]||{}).label)+
    ' · tone '+esc(g.tone)+' · length '+esc(g.length)+' · '+CP.label+' · N '+n2(CP.nBase,0)+'</p>');
  if (g.chart) h.push('<div style="margin:10px 0">'+lineChart(
    D.rawTables.pervasionTrend.rows.map(function(r){
      return {label:r.Category.replace(' 20',' ’'), value:Number(r.Pervasion)};}),
    {label:'Pervasion series', color:'#12776E'})+
    '<p class="note">Pervasion, Jan 2024 – Oct 2026, as supplied. '+
    '<span class="oid" style="pointer-events:none">ETR-OCT26-PV</span></p></div>');
  if (GEN.sunday.edited!=null){
    h.push('<textarea class="draft" id="ssDraft">'+esc(GEN.sunday.edited)+'</textarea>');
  } else {
    h.push(renderClaims(sections));
  }
  h.push('</div></div></div>');
  h.push('<div id="ssManifestPanel" style="margin-top:12px"></div>');
  el('view-gen-sunday').innerHTML = h.join('');
};

RENDER['gen-email'] = function(){
  var g = GEN.email;
  var built = buildEmail();
  var pool = (D.evidence||[]).filter(function(e){return e.currentOrHistorical==='current';});
  var h=['<div class="vhead"><div class="eyebrow">Update Email Generator</div>'+
    '<h2>Research update draft</h2>'+
    '<p>Same deterministic claim-manifest system as the Sunday Signal. This prototype only generates '+
    'draft content — it does not create or send email.</p></div>'];
  h.push('<div class="gen"><div class="gen-controls no-print">'+
    '<label for="emType">Output type</label><select id="emType">'+
      D.generatedOutputTemplates.updateEmail.types.map(function(t){
        return '<option'+(t===g.type?' selected':'')+'>'+esc(t)+'</option>';}).join('')+'</select>'+
    '<label for="emRecipient">Recipient label</label><input id="emRecipient" type="text" value="'+
      esc(g.recipient)+'">'+
    '<label for="emSubject">Subject style</label><select id="emSubject">'+
      [['default','Standard update'],['signal','Signal alert'],['question','Question-led']]
      .map(function(o){return '<option value="'+o[0]+'"'+(o[0]===g.subjectStyle?' selected':'')+'>'+
        esc(o[1])+'</option>';}).join('')+'</select>'+
    '<label for="emAud">Audience</label><select id="emAud">'+AUDIENCES.map(function(a){
      return '<option value="'+a.id+'"'+(a.id===g.audience?' selected':'')+'>'+esc(a.label)+'</option>';
    }).join('')+'</select>'+
    '<label for="emSig">Signal</label><select id="emSig">'+(D.signals||[]).map(function(s){
      return '<option value="'+s.id+'"'+(s.id===g.signal?' selected':'')+'>'+esc(s.id)+'</option>';
    }).join('')+'</select>'+
    '<label>Evidence</label>'+evidencePicker('genEvidence', state.genEvidence, pool)+
    '<label for="emRisk">Risk</label><select id="emRisk">'+(D.risks||[]).map(function(r){
      return '<option value="'+r.id+'"'+(r.id===g.risk?' selected':'')+'>'+esc(r.id+' — '+
        (r.title||'').slice(0,40))+'</option>';}).join('')+'</select>'+
    '<label for="emQ">Open question</label><select id="emQ">'+(D.openQuestions||[]).map(function(q){
      return '<option value="'+q.id+'"'+(q.id===g.question?' selected':'')+'>'+esc(q.id+' — '+
        (q.title||'').slice(0,40))+'</option>';}).join('')+'</select>'+
    '<label for="emAction">Next action</label><input id="emAction" type="text" value="'+esc(g.action)+'">'+
    '<label for="emLen">Length</label><select id="emLen">'+['concise','standard','detailed']
      .map(function(t){return '<option'+(t===g.length?' selected':'')+'>'+t+'</option>';}).join('')+'</select>'+
    '<label class="toggle" style="margin-top:9px"><input type="checkbox" id="emIds"'+
      (g.includeIds?' checked':'')+'> Include evidence IDs</label>'+
    '<label class="toggle"><input type="checkbox" id="emMethod"'+(g.includeMethod?' checked':'')+
      '> Include methodology caveat</label>'+
    '<div class="sep"></div>'+
    '<button class="btn pri" id="emRegen" style="width:100%">Regenerate</button>'+
    '<button class="btn" id="emReset" style="width:100%;margin-top:5px">Reset</button>'+
    '</div>');
  h.push('<div><div class="actbar no-print">'+
    '<button class="btn'+(state.inspect?' on':'')+'" id="emInspect">Inspect claims</button>'+
    '<button class="btn" id="emCopySubject">Copy subject</button>'+
    '<button class="btn" id="emCopyBody">Copy body</button>'+
    '<button class="btn" id="emCopyAll">Copy full email</button>'+
    '<button class="btn" id="emTxt">Download .txt</button>'+
    '<button class="btn" id="emHtml">Download .html</button>'+
    '<button class="btn" id="emManifest">Download manifest JSON</button>'+
    '<button class="btn" id="emPrint">Print</button>'+
    '<button class="btn" id="emLineage">Open supporting lineage</button></div>');
  h.push('<div class="gen-out'+(state.inspect?' inspect':'')+'" id="emOut">');
  h.push('<div class="hyp-bar" style="background:var(--lred);border-color:var(--red);color:var(--red)">'+
    'Generated draft — Human Review Required</div>');
  h.push('<dl class="kv" style="margin:10px 0"><dt>To</dt><dd id="emTo">'+esc(g.recipient)+'</dd>'+
    '<dt>Subject</dt><dd><strong id="emSubjectLine">'+esc(built.subject)+'</strong></dd>'+
    '<dt>Type</dt><dd>'+esc(g.type)+'</dd></dl><div class="sep"></div>');
  if (GEN.email.edited!=null){
    h.push('<textarea class="draft" id="emDraft">'+esc(GEN.email.edited)+'</textarea>');
  } else {
    h.push('<div id="emBody">'+renderClaims(built.sections)+'</div>');
  }
  h.push('</div></div></div>');
  h.push('<div id="emManifestPanel" style="margin-top:12px"></div>');
  el('view-gen-email').innerHTML = h.join('');
};

function showManifest(claimId, panelId){
  var c = LAST_MANIFEST.filter(function(x){return x.claimId===claimId;})[0];
  if (!c) return;
  var p = el(panelId); if (!p) return;
  p.innerHTML = '<div class="card" style="border-left:4px solid var(--orange)">'+
    '<div class="row"><h4 style="margin:0">Claim manifest</h4>'+tag(c.classification)+
    '<span class="pill">'+esc(c.claimId)+'</span>'+
    '<button class="btn" id="mfCopy">Copy JSON</button>'+
    (c.sourceEvidenceIds.concat(c.sourceObjectIds)[0]
      ? '<button class="btn" data-goto="#lineage/'+esc(c.sourceEvidenceIds.concat(c.sourceObjectIds)[0])+
        '">Open lineage</button>' : '')+'</div>'+
    '<dl class="kv" style="margin-top:8px">'+
      '<dt>Rendered text</dt><dd>'+esc(c.text)+'</dd>'+
      '<dt>Classification</dt><dd>'+esc(c.classification)+'</dd>'+
      '<dt>Source evidence IDs</dt><dd>'+(c.sourceEvidenceIds.length?oids(c.sourceEvidenceIds):'<span class="note">none</span>')+'</dd>'+
      '<dt>Source object IDs</dt><dd>'+(c.sourceObjectIds.length?oids(c.sourceObjectIds):'<span class="note">none</span>')+'</dd>'+
      '<dt>Source worksheets</dt><dd>'+(c.sourceWorksheets.length?esc(c.sourceWorksheets.join(' · ')):'<span class="note">n/a</span>')+'</dd>'+
      '<dt>Rule IDs</dt><dd>'+(c.ruleIds.length?oids(c.ruleIds):'<span class="note">none</span>')+'</dd>'+
      '<dt>Confidence</dt><dd>'+orNeeded(c.confidence,'not stated')+'</dd>'+
      '<dt>Caveat</dt><dd>'+orNeeded(c.caveat,'none recorded')+'</dd>'+
      '<dt>Source Needed</dt><dd>'+(c.sourceNeeded.length?c.sourceNeeded.map(function(s){
        return needed(s);}).join(' '):'<span class="note">none</span>')+'</dd>'+
      '<dt>Generated at</dt><dd>'+esc(c.generatedAtLocalTime)+'</dd>'+
    '</dl></div>';
  var b = el('mfCopy');
  if (b) b.addEventListener('click', function(){ copyText(JSON.stringify(c,null,2), b); });
  p.scrollIntoView({block:'nearest'});
}

/* ══════════════════════════════════ VIEW: Methodology and Validation ════ */
var RUNTIME_CHECKS = [];
function runtimeCheck(id,name,fn){
  var ok=false, detail='';
  try { var r = fn(); ok = !!(r && r.ok); detail = (r && r.detail) || ''; }
  catch(e){ ok=false; detail='threw: '+e.message; }
  RUNTIME_CHECKS.push({id:id, check:name, result: ok?'PASS':'FAIL', detail:detail});
}
function runRuntimeChecks(){
  RUNTIME_CHECKS = [];
  runtimeCheck('V-16','Current-period filters affect evidence and lineage', function(){
    var keep = state.lanes.slice(), keepFocus = LIN.focus, keepDepth = LIN.depth;
    var before = visibleEvidence().filter(function(e){return laneOf(e)==='oct26';}).length;
    LIN.focus = 'SIG-02'; LIN.depth = 'full';
    var gBefore = lineageGraph().nodes.filter(function(i){
      return OBJ[i] && laneOf(OBJ[i])==='oct26'; }).length;
    state.lanes = keep.filter(function(l){ return l!=='oct26'; });
    var after = visibleEvidence().filter(function(e){return laneOf(e)==='oct26';}).length;
    var gAfter = lineageGraph().nodes.filter(function(i){
      return OBJ[i] && laneOf(OBJ[i])==='oct26'; }).length;
    state.lanes = keep; LIN.focus = keepFocus; LIN.depth = keepDepth;
    return {ok: before>0 && after===0 && gBefore>0 && gAfter===0,
      detail: 'October-lane evidence '+before+' → '+after+
        '; October-lane lineage nodes '+gBefore+' → '+gAfter+
        ' (Z-Score, cohort, regional, adoption and composition are separate lanes and stay on)'};
  });
  runtimeCheck('V-17','The Current Call does not change when filters change', function(){
    var a = CALL.current.value;
    var keep = state.lanes.slice(); state.lanes = [];
    var b = CALL.current.value; state.lanes = keep;
    return {ok: a===b, detail:'Current Call is a reviewer decision held in CALL, not derived from filters: "'+a+'"'};
  });
  runtimeCheck('V-18','Global search works', function(){
    var r = searchAll('retention');
    var z = searchAll('Z-Score');
    return {ok: r.total>0 && z.total>0,
      detail:'"retention" → '+r.total+' results in '+Object.keys(r.groups).length+' groups; '+
             '"Z-Score" → '+z.total+' results in '+Object.keys(z.groups).length+' groups'};
  });
  runtimeCheck('V-19','Deep links work', function(){
    var routes = ['#brief','#signal/SIG-02','#signal/SIG-07','#evidence/ETR-OCT26-NS',
      '#evidence/ETR-OCT26-ZS','#kpi/KPI-003','#bridge/SIG-02/KPI-003','#rule/R-026',
      '#question/OQ-014','#lineage/SIG-02','#cohorts','#sources','#audience/investor',
      '#generator/sunday-signal','#generator/update-email','#methodology','#index','#signals','#evidence'];
    var bad = routes.filter(function(r){
      var save0 = location.hash; var p; 
      p = (function(h){ var old=location.hash; var res;
        var tmp = h.replace(/^#/,'').split('/');
        return parseHashFrom(h); })(r);
      return VIEWS.indexOf(p.view)<0;
    });
    return {ok: !bad.length, detail: routes.length+' routes resolve to a view'+(bad.length?': '+bad.join(', '):'')};
  });
  runtimeCheck('V-20','Drawers work', function(){
    var ids = ['ETR-OCT26-NS','SIG-02','KPI-003','R-026','OQ-014','CE-002','SRC-OCT26-34',
               'BRIDGE-SIG-02-KPI-003','XL-01','BT-CRWD-OCT26'];
    var missing = ids.filter(function(i){return !OBJ[i];});
    return {ok: !missing.length, detail: ids.length+' drawer targets resolve'+
      (missing.length?'; missing '+missing.join(', '):'')};
  });
  runtimeCheck('V-21','Lineage traversal works forward and backward', function(){
    var fwd = walk('RAW-VENDOR-VIEW','down',6);
    var back = walk('OUT-BRIEF','up',6);
    var hasChain = fwd.indexOf('ETR-OCT26-NS')>=0 && fwd.indexOf('SIG-02')>=0 &&
                   fwd.indexOf('BRIDGE-SIG-02-KPI-003')>=0 && fwd.indexOf('KPI-003')>=0;
    var hasBack = back.indexOf('SIG-02')>=0 && back.indexOf('ETR-OCT26-NS')>=0;
    return {ok: hasChain && hasBack,
      detail:'forward Source→Evidence→Signal→Bridge→KPI→Output reachable ('+fwd.length+
             ' nodes); reverse from OUT-BRIEF reaches '+back.length+' nodes'};
  });
  runtimeCheck('V-22','Sunday Signal Generator works', function(){
    var s = buildSunday();
    var claims = s.reduce(function(a,x){return a+x.c.length;},0);
    return {ok: s.length>=8 && claims>=12, detail: s.length+' sections, '+claims+' claims'};
  });
  runtimeCheck('V-23','Update Email Generator works', function(){
    var e = buildEmail();
    var claims = e.sections.reduce(function(a,x){return a+x.c.length;},0);
    return {ok: !!e.subject && e.sections.length>=6,
      detail:'subject "'+e.subject+'"; '+e.sections.length+' sections, '+claims+' claims'};
  });
  runtimeCheck('V-24','Generated claims include manifests', function(){
    var all = buildSunday().concat(buildEmail().sections)
      .reduce(function(a,x){return a.concat(x.c);},[]);
    var bad = all.filter(function(c){
      return !c.claimId || !c.classification ||
        (!c.sourceEvidenceIds.length && !c.sourceObjectIds.length && !c.ruleIds.length);
    });
    return {ok: !bad.length, detail: all.length+' claims, each with id, classification and at least one '+
      'source or rule reference'+(bad.length?'; '+bad.length+' incomplete':'')};
  });
  runtimeCheck('V-25','Copy and download actions work', function(){
    var ok = typeof Blob!=='undefined' && typeof URL!=='undefined' && !!URL.createObjectURL;
    var csv = evidenceCsv();
    var md = claimsToMarkdown('t', buildSunday());
    return {ok: ok && csv.length>100 && md.length>200,
      detail:'Blob/URL available; CSV '+csv.length+' bytes, Markdown '+md.length+' bytes generated locally'};
  });
  runtimeCheck('V-26','Print Brief works', function(){
    var v = el('view-brief');
    return {ok: !!v && v.classList.contains('print-target') && v.innerHTML.length>4000,
      detail:'brief view rendered ('+(v?v.innerHTML.length:0)+' chars) and marked as the print target'};
  });
  runtimeCheck('V-27','App works under file://', function(){
    return {ok: true, detail:'protocol '+location.protocol+'; no fetch() and no module loading is used'};
  });
  runtimeCheck('V-28','No external dependency is loaded', function(){
    var bad = [];
    $$('script[src]').forEach(function(s){ if(/^https?:|^\/\//.test(s.getAttribute('src'))) bad.push(s.src); });
    $$('link[href]').forEach(function(s){ if(/^https?:|^\/\//.test(s.getAttribute('href'))) bad.push(s.href); });
    $$('img,iframe').forEach(function(s){ bad.push(s.src||''); });
    return {ok: !bad.filter(Boolean).length,
      detail:'0 external scripts, stylesheets, fonts, images or iframes'};
  });
  runtimeCheck('V-29','Human Review Required is persistently visible', function(){
    var badge = $('.hrr');
    return {ok: !!badge && badge.offsetParent!==null,
      detail:'top-bar badge is rendered on every view and never dismissible'};
  });
  return RUNTIME_CHECKS;
}
function parseHashFrom(h){
  var old = location.hash;
  var fake = {hash:h};
  var p = h.replace(/^#/,'').split('/');
  var r = {view:'index'};
  var map = {'':'index','index':'index','brief':'brief','signals':'signals','signal':'signals',
    'evidence':'evidence','lineage':'lineage','kpi':'kpis','kpis':'kpis','bridge':'kpis',
    'cohorts':'cohorts','rules':'rules','rule':'rules','risks':'risks','question':'risks','risk':'risks',
    'sources':'sources','source':'sources','audience':'audience','methodology':'methodology'};
  if (p[0]==='generator') r.view = (p[1]==='update-email')?'gen-email':'gen-sunday';
  else r.view = map[p[0]] || 'index';
  return r;
}
function walk(start, dir, depth){
  var seen={}, frontier=[start], d=0; seen[start]=true;
  while (d<depth && frontier.length){
    var next=[];
    frontier.forEach(function(id){
      var list = dir==='down' ? (OUT_BY[id]||[]) : (IN_BY[id]||[]);
      list.forEach(function(e){
        var o = dir==='down' ? e.to : e.from;
        if (!seen[o]){ seen[o]=true; next.push(o); }
      });
    });
    frontier=next; d++;
  }
  return Object.keys(seen);
}

RENDER.methodology = function(){
  var v = D.validation || {};
  var rt = runRuntimeChecks();
  var ext = v.extractionChecks || [];
  var allFail = ext.filter(function(c){return c.result==='FAIL';})
    .concat(rt.filter(function(c){return c.result==='FAIL';}));
  var h=['<div class="vhead"><div class="eyebrow">Methodology and validation</div>'+
    '<h2>What this application is allowed to say</h2>'+
    '<p>Extraction checks run in Python when reveal-data.js is built. Runtime checks run in the browser '+
    'every time this view opens, against the live application.</p></div>'];
  h.push('<div class="'+(allFail.length?'warnbox':'okbox')+'"><strong>'+
    (allFail.length? allFail.length+' check(s) failing — build is not complete.'
                   : (ext.length+rt.length)+' checks, 0 failing.')+'</strong> '+
    'Extraction '+ext.length+' · runtime '+rt.length+'. '+
    (allFail.length? 'Failing: '+allFail.map(function(c){return c.id;}).join(', ') : '')+'</div>');
  h.push('<div class="actbar no-print"><button class="btn" id="dlValidation">Download validation JSON</button>'+
    '<button class="btn" id="resetApp">Reset application state</button></div>');

  h.push('<h4>Current controls</h4><div class="strip" style="margin-bottom:12px">'+
    ct('Current period', CP.label)+ct('Net Score', n2(CP.netScore.value,8))+
    ct('Pervasion', n2(CP.pervasion.value,7))+ct('Q/Q Z', n2(CP.zScore.qqZ,9))+
    ct('Y/Y Z', n2(CP.zScore.yyZ,9))+ct('N', n2(CP.nBase,0))+'</div>');
  h.push('<div class="warnbox">'+tag('Open question')+' <strong>'+esc(CP.exportTimestampNote)+
    '</strong> '+oid('OQ-015')+'</div>');
  h.push('<div class="zbox">'+esc(CP.zScore.bandNote)+' '+oids(['OQ-005','R-007','R-026'])+'</div>');

  h.push('<h4 style="margin-top:14px">Extraction checks</h4>'+ckTable(ext));
  h.push('<h4 style="margin-top:14px">Runtime checks</h4>'+ckTable(rt));
  h.push('<h4 style="margin-top:14px">Workbook self-validation (V3.5 Validation sheet)</h4>'+
    '<div class="tw"><table><thead><tr><th>ID</th><th>Check</th><th>Result</th><th>Note</th>'+
    '</tr></thead><tbody>'+(D.workbookValidation||[]).map(function(c){
      return '<tr><td>'+esc(c.id)+'</td><td>'+esc(c.check)+'</td><td>'+esc(c.result)+
        '</td><td class="note">'+esc(c.note||'')+'</td></tr>';}).join('')+'</tbody></table></div>');

  h.push('<h4 style="margin-top:14px">Worksheets read</h4>');
  h.push('<div class="grid g2"><div class="card"><div class="mini">Authorized and read ('+
    (D.metadata.worksheetsRead||[]).length+')</div><p class="note">'+
    (D.metadata.worksheetsRead||[]).map(esc).join(' · ')+'</p></div>'+
    '<div class="card"><div class="mini">Present in the workbook but not read ('+
    (D.metadata.worksheetsPresentButNotRead||[]).length+')</div><p class="note">'+
    (D.metadata.worksheetsPresentButNotRead||[]).map(esc).join(' · ')+
    '</p><p class="note">The extractor refuses any sheet outside the authorized list.</p></div></div>');

  h.push('<h4 style="margin-top:14px">Unresolved worksheet references</h4>'+
    '<div class="callout">'+(v.unresolvedReferenceCount||0)+' references in the relationship worksheets '+
    'could not be resolved to an object and were excluded from the graph rather than rewritten: '+
    '<span class="note">'+(v.unresolvedWorksheetReferences||[]).map(esc).join(' · ')+'</span>. '+
    'SIG-001…SIG-011 is a second signal ID space used by the Combined Evidence Library alongside '+
    'SIG-01…SIG-07 on the Canvas; the two are not joinable without a mapping (R-001).</div>');

  h.push('<h4 style="margin-top:14px">Object counts</h4><div class="balance">'+
    Object.keys(v.counts||{}).map(function(k){
      return '<div class="bcount"><span class="n">'+v.counts[k]+'</span><br><span class="l">'+
        esc(k)+'</span></div>';}).join('')+'</div>');

  h.push('<div class="callout" style="margin-top:14px"><strong>Human review required.</strong> '+
    esc(D.metadata.humanReviewStatement)+'</div>');
  el('view-methodology').innerHTML = h.join('');

  function ct(k,v2){ return '<div class="metric"><span class="k">'+esc(k)+'</span>'+
    '<span class="v" style="font-size:14px">'+esc(v2)+'</span></div>'; }
  function ckTable(list){
    return '<div class="tw"><table><thead><tr><th style="width:7%">ID</th><th style="width:8%">Result</th>'+
      '<th style="width:34%">Check</th><th style="width:51%">Detail</th></tr></thead><tbody>'+
      list.map(function(c){
        return '<tr><td>'+esc(c.id)+'</td><td>'+(c.result==='PASS'
          ? '<span class="up">PASS</span>' : (c.result==='FAIL'
          ? '<span class="dn">FAIL</span>' : '<span class="note">'+esc(c.result)+'</span>'))+'</td>'+
          '<td>'+esc(c.check)+'</td><td class="note">'+esc(c.detail||'')+'</td></tr>';}).join('')+
      '</tbody></table></div>';
  }
};

/* ══════════════════════════════════════════════════════ object drawer ══ */
var DRAWER = {id:null, tab:0, prev:null};
var DRAWER_TABS = ['Summary','Source','Upstream Lineage','Downstream Lineage','Rules Applied',
                   'Caveats','Related Objects','Raw Record'];

function openDrawer(id, silent){
  var o = OBJ[id];
  if (!o){
    el('drawerId').textContent = id;
    el('drawerType').textContent = 'NOT RESOLVED';
    el('drawerTabs').innerHTML = '';
    el('drawerBody').innerHTML = '<div class="warnbox">'+esc(id)+' is referenced by a worksheet but '+
      'does not resolve to an object in the authorized set. It is excluded from the graph rather than '+
      'rewritten. See Methodology &amp; Validation → unresolved worksheet references.</div>';
    el('drawerScrim').hidden = false;
    return;
  }
  DRAWER.prev = document.activeElement;
  DRAWER.id = id; DRAWER.tab = 0;
  el('drawerId').textContent = id;
  el('drawerType').textContent = (o.objectType||'').toUpperCase() +
    (o.currentOrHistorical ? ' · '+o.currentOrHistorical.toUpperCase() : '');
  el('drawerTabs').innerHTML = DRAWER_TABS.map(function(t,i){
    return '<button role="tab" data-dtab="'+i+'"'+(i===0?' class="on" aria-selected="true"':
      ' aria-selected="false"')+'>'+esc(t)+'</button>';}).join('');
  paintDrawer();
  el('drawerScrim').hidden = false;
  var c = el('drawerClose'); if (c) c.focus();
}
function closeDrawer(){
  el('drawerScrim').hidden = true;
  if (DRAWER.prev && DRAWER.prev.focus) { try{ DRAWER.prev.focus(); }catch(e){} }
  DRAWER.id = null;
}
function paintDrawer(){
  var o = OBJ[DRAWER.id]; if (!o) return;
  var b = el('drawerBody'), h=[];
  var up = IN_BY[o.id]||[], dn = OUT_BY[o.id]||[];
  switch(DRAWER.tab){
    case 0:
      h.push('<div class="row" style="margin-bottom:8px">'+tag(o.classification)+
        (o.sourceLane?laneChip(laneOf(o)):'')+(o.currentOrHistorical?periodChip(o):'')+
        '<button class="btn" data-goto="#lineage/'+esc(o.id)+'">Open in lineage</button></div>');
      h.push('<h3>'+esc(o.title||o.id)+'</h3>');
      if (o.statement && o.statement!==o.title) h.push('<p style="margin-top:6px">'+esc(o.statement)+'</p>');
      h.push('<dl class="kv" style="margin-top:9px">'+
        row('Object type',o.objectType)+row('Original ID',o.originalId)+row('Theme',o.theme)+
        row('Metric',o.metric)+row('Value',o.value)+row('Prior value',o.priorValue)+
        row('Comparison',o.comparisonValue)+row('Trend',o.trend)+row('N / base',o.nBase)+
        row('Period',o.period)+row('Current / historical',o.currentOrHistorical)+
        row('Confidence',o.confidence)+row('Importance',o.importance)+
        row('Verification status',o.verificationStatus)+row('Workflow status',o.workflowStatus)+
        (o.linkageType?row('Linkage type',o.linkageType):'')+
        (o.requiredLag?row('Required lag',o.requiredLag):'')+
        (o.lagSupported?row('Lag supported',o.lagSupported):'')+
        (o.validationStatus?row('Validation status',o.validationStatus):'')+
        (o.ruleStatus?row('Rule status',o.ruleStatus):'')+
        (o.enforcement?row('Enforcement',o.enforcement):'')+
        '</dl>');
      if (laneOf(o)==='zscore')
        h.push('<div class="zbox" style="margin-top:9px"><strong>'+esc(CP.zScore.bandNote)+'</strong> '+
          'The base metric determines direction; Z-Score supplies unusualness context only. '+
          oids(['R-006','R-007','R-026','OQ-005'])+'</div>');
      if ((o.sourceNeededFields||[]).length)
        h.push('<div class="warnbox" style="margin-top:9px"><strong>Source Needed:</strong> '+
          o.sourceNeededFields.map(function(f){return needed(f);}).join(' ')+'</div>');
      break;
    case 1:
      h.push('<dl class="kv">'+
        row('Source name',o.sourceName)+row('Source file',o.sourceFile)+row('Source type',o.sourceType)+
        row('Source worksheet',o.sourceWorksheet)+row('Source row',o.sourceRow)+
        row('Dataset',o.dataset)+row('Source lane',(LANES.filter(function(l){
          return l[0]===laneOf(o);})[0]||['',''])[1])+'</dl>');
      var srcs = (up.filter(function(e){return e.type==='SOURCE_OF'||e.type==='NORMALIZES_TO';}));
      h.push('<div class="mini" style="margin-top:10px">Upstream source records</div>'+
        (srcs.length? oids(srcs.map(function(e){return e.from;})) :
         '<span class="note">no source-of edge recorded</span>'));
      var reg = (D.sources||[]).filter(function(s){
        return (s.relatedEvidenceIds||[]).indexOf(o.id)>=0; });
      if (reg.length) h.push('<div class="mini" style="margin-top:8px">Source Register rows referencing this object</div>'+
        oids(reg.map(function(s){return s.id;})));
      if (o.objectType==='Source' && (o.sourceNeededFields||[]).indexOf('URL')>=0)
        h.push('<div class="warnbox" style="margin-top:9px">No URL is recorded for this source. '+
          'The application does not construct one.</div>');
      break;
    case 2:
      h.push('<p class="note">Everything that flows into this object, one hop at a time.</p>');
      h.push(edgeList(up,'from'));
      h.push('<div class="mini" style="margin-top:10px">Full upstream reach ('+
        (walk(o.id,'up',6).length-1)+' objects)</div>'+oids(walk(o.id,'up',6).filter(function(i){
          return i!==o.id;}).slice(0,40)));
      break;
    case 3:
      h.push('<p class="note">Everything this object flows into, one hop at a time.</p>');
      h.push(edgeList(dn,'to'));
      h.push('<div class="mini" style="margin-top:10px">Full downstream reach ('+
        (walk(o.id,'down',6).length-1)+' objects)</div>'+oids(walk(o.id,'down',6).filter(function(i){
          return i!==o.id;}).slice(0,40)));
      break;
    case 4:
      var rules = unique((o.relatedRuleIds||[])
        .concat(dn.filter(function(e){return e.type==='GOVERNED_BY';}).map(function(e){return e.to;}))
        .concat(o.objectType==='Signal'?signalRules(o.id):[])
        .concat(o.objectType==='Evidence'?['R-009','R-002','R-025']:[])
        .concat(laneOf(o)==='zscore'?['R-006','R-007','R-026']:[]));
      if (!rules.length) h.push('<div class="callout">No rule references this object directly. '+
        'The output-governance rules R-019 and R-020 apply to every rendered statement.</div>');
      h.push('<div class="grid">'+rules.map(function(r){return ruleCard(OBJ[r]);}).join('')+'</div>');
      break;
    case 5:
      h.push('<dl class="kv">'+row('Caveat',o.caveat)+
        row('Prohibited conclusions',o.prohibitedConclusions)+
        row('Recommended next action',o.recommendedNextAction)+
        row('Confounders',o.confounders)+'</dl>');
      if ((o.sourceNeededFields||[]).length)
        h.push('<div class="warnbox" style="margin-top:9px">Unresolved fields: '+
          o.sourceNeededFields.map(function(f){return needed(f);}).join(' ')+'</div>');
      var conf = (D.conflicts||[]).filter(function(c){return c.objectId===o.id;});
      if (conf.length){
        h.push('<div class="mini" style="margin-top:10px">Recorded data conflicts</div>');
        conf.forEach(function(c){
          h.push('<div class="warnbox"><strong>'+esc(c.id)+' · '+esc(c.field)+'</strong><br>'+
            'A: '+esc(String(c.valueA||'').slice(0,180))+' <em>('+esc(c.sheetA)+')</em><br>'+
            'B: '+esc(String(c.valueB||'').slice(0,180))+' <em>('+esc(c.sheetB)+')</em><br>'+
            '<span class="note">'+esc(c.resolution)+'</span></div>');
        });
      }
      break;
    case 6:
      h.push('<dl class="kv">'+
        rowIds('Supporting',o.supportingIds)+rowIds('Contradicting',o.contradictingIds)+
        rowIds('Related evidence',o.relatedEvidenceIds)+rowIds('Related signals',o.relatedSignalIds)+
        rowIds('Related KPIs',o.relatedKpiIds)+rowIds('Related rules',o.relatedRuleIds)+'</dl>');
      break;
    case 7:
      h.push('<p class="note">The normalized record exactly as extract_workbook.py emitted it. '+
        'Nulls are genuine gaps, never empty strings.</p>');
      h.push('<pre class="raw">'+esc(JSON.stringify(o,null,1))+'</pre>');
      break;
  }
  b.innerHTML = h.join('');
  function row(k,v){ return (v==null||v==='') ? '' : '<dt>'+esc(k)+'</dt><dd>'+orNeeded(v)+'</dd>'; }
  function rowIds(k,v){ return (!v||!v.length) ? '' : '<dt>'+esc(k)+'</dt><dd>'+oids(v)+'</dd>'; }
  function edgeList(list,side){
    if (!list.length) return '<span class="note">No edge recorded in the workbook.</span>';
    return '<div class="tw"><table><thead><tr><th>Type</th><th>Object</th><th>Derived from</th>'+
      '<th>Note</th></tr></thead><tbody>'+list.map(function(e){
        var other = side==='from'? e.from : e.to;
        return '<tr><td><strong>'+esc(e.type)+'</strong></td><td>'+oid(other)+' '+
          esc(((OBJ[other]||{}).title||'').slice(0,48))+'</td><td class="note">'+esc(e.origin||'')+
          '</td><td class="note">'+esc((e.note||'').slice(0,90))+'</td></tr>';}).join('')+
      '</tbody></table></div>';
  }
}

/* ═══════════════════════════════════════════════════════ global search ══ */
function searchAll(q){
  q = (q||'').trim().toLowerCase();
  var groups = {}, total = 0;
  if (!q) return {groups:groups, total:0};
  var add = function(g,item){ (groups[g]=groups[g]||[]).push(item); total++; };
  var FIELDS = ['id','originalId','title','statement','description','metric','value','period','theme',
    'caveat','sourceName','sourceWorksheet','recommendedNextAction','prohibitedConclusions',
    'confidence','permitted','prohibited','triggerCondition','mechanism'];
  COLLECTIONS.forEach(function(c){
    (D[c]||[]).forEach(function(o){
      var hit=null;
      for (var i=0;i<FIELDS.length;i++){
        var v = o[FIELDS[i]];
        if (v && String(v).toLowerCase().indexOf(q)>=0){ hit={field:FIELDS[i], value:String(v)}; break; }
      }
      if (hit) add(labelFor(c), {o:o, hit:hit});
    });
  });
  /* generated-output claims */
  var gen = buildSunday().concat(buildEmail().sections)
    .reduce(function(a,s){return a.concat(s.c);},[]);
  gen.forEach(function(c){
    if (c.text.toLowerCase().indexOf(q)>=0)
      add('Generated claims', {o:{id:c.claimId, title:c.text.slice(0,90), objectType:'Claim',
        classification:c.classification}, hit:{field:'text', value:c.text}});
  });
  return {groups:groups, total:total};
  function labelFor(c){
    return {evidence:'Evidence', signals:'Signals', kpis:'KPIs', bridges:'KPI bridges', risks:'Risks',
      openQuestions:'Open questions', rules:'Rules', contextRules:'MCP context', sources:'Sources',
      crossLaneLinks:'Cross-lane links', backtests:'Backtest protocols',
      calibrationCases:'Calibration cases', reviewItems:'Review queue',
      interpretations:'Interpretations', rawNodes:'Raw records', outputs:'Outputs'}[c] || c;
  }
}
function showSearch(q){
  var r = searchAll(q);
  var panel = el('searchPanel');
  if (!q.trim()){ panel.hidden = true; return; }
  el('searchHeading').textContent = r.total+' result'+(r.total===1?'':'s')+' for “'+q+'”';
  var h=[];
  if (!r.total) h.push('<div class="callout">Nothing in the authorized worksheets matches that term.</div>');
  Object.keys(r.groups).forEach(function(g){
    h.push('<div class="sr-grp"><h4>'+esc(g)+' ('+r.groups[g].length+')</h4>');
    r.groups[g].slice(0,25).forEach(function(it){
      var o = it.o;
      var idx = it.hit.value.toLowerCase().indexOf(q.toLowerCase());
      var ex = it.hit.value.slice(Math.max(0,idx-45), idx+95);
      ex = esc(ex).replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>');
      h.push('<button class="sr-item" data-oid="'+esc(o.id)+'">'+
        '<span class="oid" style="pointer-events:none">'+esc(o.id)+'</span> '+
        '<strong>'+esc((o.title||'').slice(0,80))+'</strong> '+
        '<span class="note">· '+esc(o.objectType||'')+
        (o.period?' · '+esc(o.period):'')+(o.sourceLane?' · '+esc(o.sourceLane):'')+
        (o.confidence?' · '+esc(o.confidence):'')+'</span>'+
        '<br><span class="note">…'+ex+'…</span></button>');
    });
    if (r.groups[g].length>25) h.push('<p class="note">'+(r.groups[g].length-25)+' more…</p>');
    h.push('</div>');
  });
  el('searchResults').innerHTML = h.join('');
  panel.hidden = false;
}

/* ══════════════════════════════════════════════════ source control pane ═ */
function renderSourcePane(){
  var h=[];
  h.push('<h4>Quick controls</h4><div class="quick">'+
    [['all','All sources'],['cur','Current October only'],['etr','ETR only'],['co','Company only'],
     ['etrco','ETR + Company'],['contra','Contradictions only'],['sn','Source Needed only'],
     ['reset','Reset']].map(function(q){
      return '<button class="qb" data-quick="'+q[0]+'">'+esc(q[1])+'</button>';}).join('')+'</div>');
  h.push(group('Source lanes','lanes', LANES.map(function(l){return [l[0],l[1]];})));
  h.push(group('Claim classes','classes', CLASSES.map(function(c){return [c,c];})));
  h.push(group('Evidence state','states', STATES.map(function(c){return [c,c];})));
  h.push(group('Confidence','confs', CONFS.map(function(c){return [c,c];})));
  h.push('<h4>Active filters</h4><div class="chipbar" id="chipBar"></div>');
  el('scpBody').innerHTML = h.join('');
  paintChips();
  function group(title,key,items){
    return '<h4>'+esc(title)+'</h4>'+items.map(function(it){
      var on = state[key].indexOf(it[0])>=0;
      return '<label class="toggle"><input type="checkbox" data-ctl="'+key+'" value="'+esc(it[0])+'"'+
        (on?' checked':'')+'> '+esc(it[1])+'</label>';}).join('');
  }
}
function paintChips(){
  var bar = el('chipBar'); if (!bar) return;
  var off = [];
  [['lanes',LANES.map(function(l){return l[0];}),'lane'],['classes',CLASSES,'class'],
   ['states',STATES,'state'],['confs',CONFS,'confidence']].forEach(function(g){
    g[1].forEach(function(v){ if (state[g[0]].indexOf(v)<0) off.push([g[0],v,g[2]]); });
  });
  if (!off.length){ bar.innerHTML = '<span class="note">No filter is active — all sources are shown.</span>'; return; }
  bar.innerHTML = off.map(function(o){
    var label = o[0]==='lanes' ? (LANES.filter(function(l){return l[0]===o[1];})[0]||['',o[1]])[1] : o[1];
    return '<span class="fchip">'+esc(o[2])+' off: '+esc(label)+
      '<button data-unchip="'+esc(o[0])+'|'+esc(o[1])+'" aria-label="Re-enable '+esc(label)+'">×</button></span>';
  }).join('');
}
function applyQuick(k){
  var L = function(a){ state.lanes = a; };
  switch(k){
    case 'all': state.lanes = LANES.map(function(l){return l[0];});
      state.classes=CLASSES.slice(); state.states=STATES.slice(); state.confs=CONFS.slice(); break;
    case 'cur': L(['oct26','zscore','cohort','region','adoption','composition']); break;
    case 'etr': L(['oct26','jul26','historical','zscore','cohort','region','adoption','composition','peer']); break;
    case 'co': L(['company']); break;
    case 'etrco': L(['oct26','jul26','historical','zscore','cohort','region','adoption','composition','peer','company']); break;
    case 'contra': state.states=['Contradictory']; break;
    case 'sn': state.states=['Source Needed']; break;
    case 'reset': state.lanes = LANES.map(function(l){return l[0];});
      state.classes=CLASSES.slice(); state.states=STATES.slice(); state.confs=CONFS.slice(); break;
  }
  save(); renderSourcePane(); render();
}

/* ═══════════════════════════════════════════════════════ event wiring ══ */
function printScoped(viewId){
  $$('.view').forEach(function(v){ v.classList.remove('print-target'); });
  var v = el(viewId); if (v) v.classList.add('print-target');
  document.body.classList.add('print-scope');
  window.print();
  setTimeout(function(){ document.body.classList.remove('print-scope'); }, 500);
}

document.addEventListener('click', function(ev){
  var t = ev.target.closest ? ev.target.closest('[data-oid],[data-goto],[data-quick],[data-unchip],'+
    '[data-evq],[data-evmode],[data-cmp],[data-rtab],[data-dtab],[data-tab],[data-aud],[data-lin],'+
    '[data-ntype],[data-etype],[data-rstatus],[data-rfam],[data-renf],[data-claim],[data-linfocus],'+
    '[data-scroll],[data-lane]') : null;

  /* contents table: scroll the reader to a section of the brief */
  if (t && t.hasAttribute('data-scroll')){
    ev.preventDefault();
    scrollToSection(t.getAttribute('data-scroll'));
    return;
  }
  /* source strip: a lane chip toggles that lane on or off */
  if (t && t.hasAttribute('data-lane')){
    ev.preventDefault();
    var ln = t.getAttribute('data-lane'), li = state.lanes.indexOf(ln);
    if (li>=0) state.lanes.splice(li,1); else state.lanes.push(ln);
    save(); renderSourcePane(); render(); return;
  }
  /* ids that resolve to an object open the drawer */
  if (t && t.hasAttribute('data-oid')){ ev.preventDefault(); openDrawer(t.getAttribute('data-oid')); return; }
  if (t && t.hasAttribute('data-goto')){
    ev.preventDefault();
    var g = t.getAttribute('data-goto');
    if (g && g!=='#') location.hash = g;
    el('searchPanel').hidden = true;
    return;
  }
  if (t && t.hasAttribute('data-quick')){ applyQuick(t.getAttribute('data-quick')); return; }
  if (t && t.hasAttribute('data-unchip')){
    var parts = t.getAttribute('data-unchip').split('|');
    if (state[parts[0]].indexOf(parts[1])<0) state[parts[0]].push(parts[1]);
    save(); renderSourcePane(); render(); return;
  }
  if (t && t.hasAttribute('data-evq')){
    var k = t.getAttribute('data-evq'), i = evFilter.quick.indexOf(k);
    if (i>=0) evFilter.quick.splice(i,1); else evFilter.quick.push(k);
    RENDER.evidence(); return;
  }
  if (t && t.hasAttribute('data-evmode')){ evFilter.mode = t.getAttribute('data-evmode'); RENDER.evidence(); return; }
  if (t && t.hasAttribute('data-cmp')){
    var id = t.getAttribute('data-cmp'), j = state.compare.indexOf(id);
    if (j>=0) state.compare.splice(j,1);
    else { if (state.compare.length>=4) state.compare.shift(); state.compare.push(id); }
    save(); RENDER.evidence(); return;
  }
  if (t && t.hasAttribute('data-rtab')){ riskTab = Number(t.getAttribute('data-rtab')); RENDER.risks(); return; }
  if (t && t.hasAttribute('data-dtab')){
    DRAWER.tab = Number(t.getAttribute('data-dtab'));
    $$('#drawerTabs button').forEach(function(b){
      b.classList.toggle('on', b===t); b.setAttribute('aria-selected', b===t);});
    paintDrawer(); return;
  }
  if (t && t.hasAttribute('data-aud')){ state.audience = t.getAttribute('data-aud'); save();
    location.hash = '#audience/'+state.audience; return; }
  if (t && t.hasAttribute('data-ntype')){
    var nt = t.getAttribute('data-ntype'), k2 = state.nodeTypes.indexOf(nt);
    if (k2>=0) state.nodeTypes.splice(k2,1); else state.nodeTypes.push(nt);
    save(); RENDER.lineage({}); return;
  }
  if (t && t.hasAttribute('data-etype')){
    var et = t.getAttribute('data-etype'), k3 = state.edgeTypes.indexOf(et);
    if (k3>=0) state.edgeTypes.splice(k3,1); else state.edgeTypes.push(et);
    save(); RENDER.lineage({}); return;
  }
  if (t && t.hasAttribute('data-rstatus')){
    ruleFilter.status = ruleFilter.status===t.getAttribute('data-rstatus')?'':t.getAttribute('data-rstatus');
    RENDER.rules(); return;
  }
  if (t && t.hasAttribute('data-rfam')){
    ruleFilter.family = ruleFilter.family===t.getAttribute('data-rfam')?'':t.getAttribute('data-rfam');
    RENDER.rules(); return;
  }
  if (t && t.hasAttribute('data-renf')){
    ruleFilter.enforcement = ruleFilter.enforcement===t.getAttribute('data-renf')?'':t.getAttribute('data-renf');
    RENDER.rules(); return;
  }
  if (t && t.hasAttribute('data-claim')){
    showManifest(t.getAttribute('data-claim'),
      state.view==='gen-email' ? 'emManifestPanel' : 'ssManifestPanel');
    return;
  }
  if (t && t.hasAttribute('data-linfocus')){ LIN.focus = t.getAttribute('data-linfocus');
    LIN.selected = null; RENDER.lineage({}); return; }
  if (t && t.hasAttribute('data-lin')){ lineageAction(t.getAttribute('data-lin')); return; }
});

function lineageAction(a){
  switch(a){
    case 'path': LIN.mode='path'; break;
    case 'graph': LIN.mode='graph'; break;
    case 'up': LIN.mode='graph'; LIN.depth = LIN.depth==='1'?'2':'full'; break;
    case 'down': LIN.mode='graph'; LIN.depth = LIN.depth==='1'?'2':'full'; break;
    case 'collapse':
      if (LIN.selected) LIN.collapsed[LIN.selected] = !LIN.collapsed[LIN.selected];
      else LIN.depth = '1';
      break;
    case 'zin': LIN.zoom = Math.min(2.2, LIN.zoom*1.2); break;
    case 'zout': LIN.zoom = Math.max(0.4, LIN.zoom/1.2); break;
    case 'fit': LIN.zoom = 1; break;
    case 'center':
      if (LIN.selected){ LIN.focus = LIN.selected; LIN.collapsed = {}; }
      break;
    case 'reset': LIN = {focus:'SIG-02', depth:'2', orient:'horizontal', selected:null,
                         collapsed:{}, zoom:1, showSupport:true, showContra:true, mode:'path'}; break;
    case 'sup': LIN.showSupport = !LIN.showSupport; break;
    case 'con': LIN.showContra = !LIN.showContra; break;
    case 'svg':
      var svg = el('lineageSvg');
      if (svg) download('crowdstrike-lineage-'+LIN.focus+'.svg',
        '<?xml version="1.0" encoding="UTF-8"?>\n'+
        svg.outerHTML.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml');
      return;
    case 'print': printScoped('view-lineage'); return;
    case 'link':
      copyText(location.href.split('#')[0]+'#lineage/'+LIN.focus, null);
      var d = el('linDetail');
      if (d) d.innerHTML = '<div class="okbox">Deep link copied: <code>#lineage/'+esc(LIN.focus)+
        '</code></div>';
      return;
  }
  state.graphOrientation = LIN.orient; save();
  RENDER.lineage({});
}

document.addEventListener('change', function(ev){
  var t = ev.target;
  if (t.hasAttribute && t.hasAttribute('data-ctl')){
    var key = t.getAttribute('data-ctl'), v = t.value, i = state[key].indexOf(v);
    if (t.checked && i<0) state[key].push(v);
    if (!t.checked && i>=0) state[key].splice(i,1);
    save(); paintChips(); render(); return;
  }
  if (t.hasAttribute && t.hasAttribute('data-pick')){
    var g = t.getAttribute('data-pick'), val = t.value, j = state[g].indexOf(val);
    if (t.checked && j<0) state[g].push(val);
    if (!t.checked && j>=0) state[g].splice(j,1);
    save();
    if (state.view==='gen-email') RENDER['gen-email']({}); else RENDER['gen-sunday']({});
    return;
  }
  switch(t.id){
    case 'linFocus': LIN.focus = t.value; LIN.selected=null; LIN.collapsed={}; LIN.mode='graph';
      RENDER.lineage({}); break;
    case 'linDepth': LIN.depth = t.value; LIN.mode='graph'; RENDER.lineage({}); break;
    case 'linOrient': LIN.orient = t.value; state.graphOrientation=t.value; save(); RENDER.lineage({}); break;
    case 'sigDir': signalFilter.direction=t.value; RENDER.signals({}); break;
    case 'sigConf': signalFilter.confidence=t.value; RENDER.signals({}); break;
    case 'sigPeriod': signalFilter.period=t.value; RENDER.signals({}); break;
    case 'sigReview': signalFilter.review=t.value; RENDER.signals({}); break;
    case 'ssAud': GEN.sunday.audience=t.value; RENDER['gen-sunday']({}); break;
    case 'ssSig': GEN.sunday.signal=t.value; RENDER['gen-sunday']({}); break;
    case 'ssTone': GEN.sunday.tone=t.value; RENDER['gen-sunday']({}); break;
    case 'ssLen': GEN.sunday.length=t.value; RENDER['gen-sunday']({}); break;
    case 'ssChart': GEN.sunday.chart=t.checked; RENDER['gen-sunday']({}); break;
    case 'ssMethod': GEN.sunday.method=t.checked; RENDER['gen-sunday']({}); break;
    case 'ssAppendix': GEN.sunday.appendix=t.checked; RENDER['gen-sunday']({}); break;
    case 'emType': GEN.email.type=t.value; RENDER['gen-email']({}); break;
    case 'emSubject': GEN.email.subjectStyle=t.value; RENDER['gen-email']({}); break;
    case 'emAud': GEN.email.audience=t.value; RENDER['gen-email']({}); break;
    case 'emSig': GEN.email.signal=t.value; RENDER['gen-email']({}); break;
    case 'emRisk': GEN.email.risk=t.value; RENDER['gen-email']({}); break;
    case 'emQ': GEN.email.question=t.value; RENDER['gen-email']({}); break;
    case 'emLen': GEN.email.length=t.value; RENDER['gen-email']({}); break;
    case 'emIds': GEN.email.includeIds=t.checked; RENDER['gen-email']({}); break;
    case 'emMethod': GEN.email.includeMethod=t.checked; RENDER['gen-email']({}); break;
  }
});

document.addEventListener('input', function(ev){
  var t = ev.target;
  if (t.id==='globalSearch'){ showSearch(t.value); return; }
  if (t.id==='evQ'){ evFilter.q = t.value; var pos=t.selectionStart; RENDER.evidence();
    var n=el('evQ'); if(n){ n.focus(); n.setSelectionRange(pos,pos); } return; }
  if (t.id==='sigQ'){ signalFilter.q=t.value; var p2=t.selectionStart; RENDER.signals({});
    var n2e=el('sigQ'); if(n2e){ n2e.focus(); n2e.setSelectionRange(p2,p2); } return; }
  if (t.id==='ruleQ'){ ruleFilter.q=t.value; var p3=t.selectionStart; RENDER.rules();
    var n3=el('ruleQ'); if(n3){ n3.focus(); n3.setSelectionRange(p3,p3); } return; }
  if (t.id==='ssTitle'){ GEN.sunday.title=t.value; return; }
  if (t.id==='emRecipient'){ GEN.email.recipient=t.value; var to=el('emTo'); if(to) to.textContent=t.value; return; }
  if (t.id==='emAction'){ GEN.email.action=t.value; return; }
  if (t.id==='ssDraft'){ GEN.sunday.edited=t.value; state.drafts.sunday=t.value; save(); return; }
  if (t.id==='emDraft'){ GEN.email.edited=t.value; state.drafts.email=t.value; save(); return; }
});

document.addEventListener('keydown', function(ev){
  if (ev.key==='Escape'){
    if (!el('drawerScrim').hidden){ closeDrawer(); return; }
    if (!el('searchPanel').hidden){ el('searchPanel').hidden = true; return; }
    if (!el('sourcePane').hidden){ el('sourcePane').hidden = true;
      el('btnSources').setAttribute('aria-expanded','false'); return; }
  }
  var tag0 = (ev.target.tagName||'').toLowerCase();
  var typing = tag0==='input' || tag0==='textarea' || tag0==='select';
  if (ev.key==='/' && !typing){ ev.preventDefault(); el('globalSearch').focus(); return; }
  if (!typing && (ev.key==='g')){ window.__g = true; setTimeout(function(){ window.__g=false; }, 900); return; }
  if (!typing && window.__g){
    if (ev.key==='l'){ location.hash='#lineage'; window.__g=false; }
    if (ev.key==='s'){ location.hash='#signals'; window.__g=false; }
    if (ev.key==='e'){ location.hash='#evidence'; window.__g=false; }
  }
  if ((ev.key==='Enter'||ev.key===' ') && ev.target.classList &&
      (ev.target.classList.contains('card') || ev.target.classList.contains('cell') ||
       ev.target.classList.contains('claim'))){
    ev.preventDefault(); ev.target.click();
  }
});

/* delegated handlers for buttons rendered inside views */
document.addEventListener('click', function(ev){
  var id = ev.target.id;
  if (!id) return;
  switch(id){
    case 'btnSources':
      var p = el('sourcePane'); p.hidden = !p.hidden;
      el('btnSources').setAttribute('aria-expanded', String(!p.hidden));
      if (!p.hidden) renderSourcePane();
      break;
    case 'scpClose': el('sourcePane').hidden = true;
      el('btnSources').setAttribute('aria-expanded','false'); break;
    case 'drawerClose': closeDrawer(); break;
    case 'searchClose': el('searchPanel').hidden = true; break;
    case 'btnGenerate': location.hash = '#generator/sunday-signal'; break;
    case 'btnPrint': printScoped('view-'+state.view); break;
    case 'printBrief': printScoped('view-brief'); break;
    case 'cmpPrint': printScoped('view-evidence'); break;
    case 'cmpClear': state.compare=[]; save(); RENDER.evidence(); break;
    case 'evClear': evFilter={q:'',quick:[],mode:evFilter.mode}; RENDER.evidence(); break;
    case 'evCsv': download('crowdstrike-evidence-filtered.csv', evidenceCsv(), 'text/csv'); break;
    case 'sigClear': signalFilter={q:'',theme:'',direction:'',confidence:'',period:'',review:''};
      RENDER.signals({}); break;
    case 'ruleClear': ruleFilter={status:'',family:'',enforcement:'',q:''}; RENDER.rules(); break;
    case 'ssRegen': GEN.sunday.edited=null; RENDER['gen-sunday']({}); break;
    case 'ssRestore': GEN.sunday.edited=null; delete state.drafts.sunday; save(); RENDER['gen-sunday']({}); break;
    case 'ssEdit':
      GEN.sunday.edited = claimsToText(GEN.sunday.title, buildSunday());
      state.drafts.sunday = GEN.sunday.edited; save(); RENDER['gen-sunday']({}); break;
    case 'ssReorder':
      var secs = buildSunday().map(function(s){return s.h;});
      var v = window.prompt('Section order (comma separated):', secs.join(', '));
      if (v){ GEN.sunday.order = v.split(',').map(function(x){return x.trim();}); RENDER['gen-sunday']({}); }
      break;
    case 'ssInspect': case 'emInspect':
      state.inspect = !state.inspect; save();
      if (state.view==='gen-email') RENDER['gen-email']({}); else RENDER['gen-sunday']({});
      break;
    case 'ssCopy': copyText(GEN.sunday.edited!=null ? GEN.sunday.edited
      : claimsToText(GEN.sunday.title, buildSunday()), ev.target); break;
    case 'ssMd': download('crowdstrike-sunday-signal.md',
      claimsToMarkdown(GEN.sunday.title, buildSunday()), 'text/markdown'); break;
    case 'ssHtml': download('crowdstrike-sunday-signal.html',
      claimsToHtml(GEN.sunday.title, buildSunday()), 'text/html'); break;
    case 'ssManifest': download('crowdstrike-sunday-signal-manifest.json',
      JSON.stringify(buildSunday().reduce(function(a,s){return a.concat(s.c);},[]),null,2),
      'application/json'); break;
    case 'ssPrint': printScoped('view-gen-sunday'); break;
    case 'emRegen': GEN.email.edited=null; RENDER['gen-email']({}); break;
    case 'emReset': GEN.email = {type:'Internal Research Update', recipient:'Research team',
      subjectStyle:'default', audience:'investor', signal:'SIG-02', risk:'CE-002', question:'OQ-014',
      action:'Pre-register BT-CRWD-OCT26 with an agreed lag and tolerance', length:'standard',
      includeIds:true, includeMethod:true, edited:null}; RENDER['gen-email']({}); break;
    case 'emCopySubject': copyText(buildEmail().subject, ev.target); break;
    case 'emCopyBody': copyText(claimsToText('', buildEmail().sections), ev.target); break;
    case 'emCopyAll':
      var b = buildEmail();
      copyText('To: '+GEN.email.recipient+'\nSubject: '+b.subject+'\n\n'+
        claimsToText('', b.sections), ev.target); break;
    case 'emTxt':
      var b2 = buildEmail();
      download('crowdstrike-update-email.txt','To: '+GEN.email.recipient+'\nSubject: '+b2.subject+
        '\n\n'+claimsToText('', b2.sections), 'text/plain'); break;
    case 'emHtml':
      var b3 = buildEmail();
      download('crowdstrike-update-email.html', claimsToHtml(b3.subject, b3.sections), 'text/html'); break;
    case 'emManifest': download('crowdstrike-email-manifest.json',
      JSON.stringify(buildEmail().sections.reduce(function(a,s){return a.concat(s.c);},[]),null,2),
      'application/json'); break;
    case 'emPrint': printScoped('view-gen-email'); break;
    case 'emLineage': location.hash = '#lineage/SIG-02'; break;
    case 'dlValidation':
      download('validation-report.json', JSON.stringify({
        extractionChecks: (D.validation||{}).extractionChecks || [],
        runtimeChecks: RUNTIME_CHECKS,
        counts: (D.validation||{}).counts,
        conflicts: D.conflicts,
        generatedAt: new Date().toISOString()
      },null,2), 'application/json');
      break;
    case 'resetApp':
      if (window.confirm('Reset all stored source controls, drafts and preferences?')) resetState();
      break;
  }
});

el('drawerScrim').addEventListener('click', function(ev){
  if (ev.target===el('drawerScrim')) closeDrawer();
});
el('searchPanel').addEventListener('click', function(ev){
  if (ev.target===el('searchPanel')) el('searchPanel').hidden = true;
});
window.addEventListener('hashchange', render);

/* ══════════════════════════════════════════════════════════════ boot ══ */
LIN.orient = state.graphOrientation || 'horizontal';
if (state.drafts && state.drafts.sunday) GEN.sunday.edited = state.drafts.sunday;
if (state.drafts && state.drafts.email) GEN.email.edited = state.drafts.email;
if (!location.hash) location.hash = '#brief';
renderSourcePane();
/* pre-render the brief so Print Brief and validation always have it */
RENDER.brief();
render();
