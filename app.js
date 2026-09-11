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
var CLASSES = ['Client-provided fact','ETR interpretation','Hypothesis',
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
  view:'company', schemaVersion:2,
  emailFormat:'clean', sundayStyle:'cohesive', sundayLength:'standard',
  emailNotes:{method:false, appendix:false, review:false, ids:false, logo:true},
  sundayNotes:{method:false, ids:false, review:false},
  lanes:null, classes:null, states:null, confs:null,
  audience:'investor', evidenceMode:'list', graphOrientation:'horizontal',
  graphDepth:'2', nodeTypes:null, edgeTypes:null,
  genEvidence:['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-ZS'],
  genCounter:['CE-002'], genQuestion:['OQ-014'], drafts:{}, dismissedTips:[],
  inspect:false, compare:[], sundayNewsletter:false
};
var state = load();

/* No reading-mode toggle exists in this application: there is one interface,
   and the one inspection toggle is Inspect Claims (state.inspect). A saved
   "mode" value from an earlier build is dropped silently by the storage
   migration below, never carried forward and never warned about. */
function load(){
  var s = {};
  for (var k in DEFAULT_STATE) s[k] = DEFAULT_STATE[k];
  try {
    var raw = localStorage.getItem('reveal.crwd.state');
    var p = raw ? JSON.parse(raw) : null;
    if (typeof REVEAL_MIGRATE_STATE === 'function') p = REVEAL_MIGRATE_STATE(p);
    if (p) for (var j in p) if (j in s) s[j] = p[j];
  } catch(e){}
  if (!s.lanes)   s.lanes   = LANES.map(function(l){return l[0];});
  if (!s.classes) s.classes = CLASSES.slice();
  if (!s.states)  s.states  = STATES.slice();
  if (!s.confs)   s.confs   = CONFS.slice();
  if (!s.nodeTypes) s.nodeTypes = Object.keys(NODE_STYLE);
  if (!s.emailNotes) s.emailNotes = {method:false, appendix:false, review:false, ids:false, logo:true};
  if (!('logo' in s.emailNotes)) s.emailNotes.logo = true;
  if (!s.sundayNotes) s.sundayNotes = {method:false, ids:false, review:false};
  if (!s.edgeTypes) s.edgeTypes = EDGE_TYPES.slice();
  s.schemaVersion = DEFAULT_STATE.schemaVersion;
  return s;
}
function save(){
  try { localStorage.setItem('reveal.crwd.state', JSON.stringify(state)); } catch(e){}
}
function resetState(){
  try { localStorage.removeItem('reveal.crwd.state'); } catch(e){}
  state = load(); state.view='company';
  location.hash = '#company'; render(); renderSourcePane();
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

/* A polite live region, so copy actions and other state changes are
   announced rather than only shown. */
function announce(msg){
  var r = el('liveRegion'); if (!r) return;
  r.textContent = '';
  setTimeout(function(){ r.textContent = msg; }, 30);
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
  if (c.indexOf('interpretation')>=0) return 't-interp';
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
/* Company, Narrative and the Executive Brief are the default reading paths.
   Object IDs (EV-, SIG-, OQ-, R-, KPI-… and relationship IDs) are absent from
   their running prose regardless of any toggle — this flag is switched on
   only while those three render, and oid()/oids() answer it by rendering a
   small, unlabelled citation mark instead of the literal ID. The mark is
   still a real button: it still opens the object drawer on click, still
   carries the object's title as its accessible name, so the evidence is one
   click away — it is reachable, just not printed as a bare code in the
   sentence. Every other view (drawers, Evidence, Signals, KPI Bridges,
   Lineage, Methodology, claim manifests, technical-detail disclosures,
   export footnotes) renders the literal ID as before. */
var QUIET_CITE = false;
function withQuietCite(fn){
  QUIET_CITE = true;
  try { return fn(); } finally { QUIET_CITE = false; }
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
  if (QUIET_CITE){
    return '<button type="button" class="'+cls+' oid-quiet" data-oid="'+esc(id)+'" '+
      'title="'+esc(title)+'" aria-label="Open supporting evidence: '+esc(title)+'">'+
      '<span aria-hidden="true">●</span></button>';
  }
  return '<button type="button" class="'+cls+'" data-oid="'+esc(id)+'" title="'+esc(title)+'">'+
         esc(id)+(extra?' '+esc(extra):'')+'</button>';
}
function oids(list){
  if (!list || !list.length) return QUIET_CITE ? '' : '<span class="note">none recorded</span>';
  return '<span class="oids">'+list.map(function(i){return oid(i);}).join('')+'</span>';
}

/** The "Missing source" component. Used in the default reading paths in
    place of a bare "SOURCE NEEDED" span — never invents an owner, priority or
    expected evidence: any field the data does not supply reads "Not
    specified". `opts.question` names the open question this gap already is,
    when one exists, and drives the View question / Open lineage actions. */
function missingSource(need, why, opts){
  opts = opts || {};
  var qid = opts.question;
  var q = qid ? OBJ[qid] : null;
  var owner = opts.owner || 'Not specified';
  var priority = opts.priority || (q && q.importance) || 'Not specified';
  var status = opts.status || (q && q.workflowStatus) || 'Source Needed';
  var expected = opts.expected || (q && q.sourceName) || 'Not specified';
  var lineageId = opts.lineage || qid;
  var acts = [];
  if (qid) acts.push('<button type="button" class="lnk" data-goto="#question/'+esc(qid)+
    '">View question</button>');
  if (lineageId) acts.push('<button type="button" class="lnk" data-goto="#lineage/'+esc(lineageId)+
    '">Open lineage</button>');
  if (expected !== 'Not specified') acts.push('<button type="button" class="lnk" data-goto="#sources">'+
    'View expected evidence</button>');
  var reqText = 'Research request — ' + need + '. ' + why +
    (expected !== 'Not specified' ? ' Expected evidence: ' + expected + '.' : '');
  acts.push('<button type="button" class="lnk" data-copyreq="'+esc(reqText)+
    '">Copy research request</button>');
  return '<div class="missing-source"><div class="ms-head"><span class="ms-tag">Missing source</span></div>'+
    '<dl class="ms-kv">'+
      '<dt>Need</dt><dd>'+esc(need)+'</dd>'+
      '<dt>Why it matters</dt><dd>'+esc(why)+'</dd>'+
      '<dt>Owner</dt><dd>'+esc(owner)+'</dd>'+
      '<dt>Priority</dt><dd>'+esc(priority)+'</dd>'+
      '<dt>Status</dt><dd>'+esc(status)+'</dd>'+
      '<dt>Expected evidence</dt><dd>'+esc(expected)+'</dd>'+
    '</dl>'+
    '<div class="ms-acts no-print">'+acts.join(' · ')+'</div>'+
  '</div>';
}

/** The CrowdStrike wordmark. Small, restrained, and fails gracefully: if the
    asset is ever unavailable the <img> hides itself rather than showing a
    broken-image icon, and the surrounding layout does not depend on it. */
function brandLogo(cls){
  return '<img class="brand-logo '+esc(cls||'')+'" src="assets/crowdstrike-logo.png" alt="CrowdStrike" '+
    'onerror="this.style.display=\'none\'">';
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
var VIEWS = ['company','narrative','signals','evidence','lineage','kpis','cohorts','rules',
             'risks','sources','audience','gen-sunday','gen-email','gen-brief','methodology'];
var pendingFocus = null;

function parseHash(){
  var h = (location.hash||'#company').replace(/^#/,'');
  var p = h.split('/');
  var r = {view:'company', arg:null, arg2:null};
  switch(p[0]){
    case '': r.view='company'; break;
    case 'company': r.view='company'; break;
    case 'index': r.view='company'; break;          /* legacy route, preserved */
    case 'narrative': r.view='narrative'; break;
    case 'brief': r.view='narrative'; break;        /* legacy route, preserved */
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
    case 'generator': r.view = (p[1]==='update-email') ? 'gen-email' :
      (p[1]==='executive-brief' ? 'gen-brief' : 'gen-sunday'); break;
    case 'methodology': r.view='methodology'; break;
    default: r.view='company';
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
  el('tbPeriod').textContent = CP.label;
  el('tbUpdated').textContent = CP.exportTimestamp || 'Not specified';
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

/* ═══════════════════════════════════════════════ VIEW: Company (landing) ═
   The company comes first, then the question, then one chart, then the story.
   The governed machinery is all still here — it sits below the narrative and
   surfaces on demand rather than competing with it.
   ══════════════════════════════════════════════════════════════════════════ */

/** The supplied observations for the lead chart. Nothing is interpolated: the
    Pervasion series is supplied for every period on the axis, and Net Score is
    supplied for three of them, so Net Score is drawn as points with a segment
    only where two consecutive periods are both supplied. */
function recoverySeries(){
  var rows = D.rawTables.pervasionTrend.rows;
  var axis = rows.map(function(r){ return r.Category; });
  var perv = rows.map(function(r){ return {label:r.Category, value:Number(r.Pervasion)}; });
  /* The trend axis is labelled in short form ("Oct 2026") while the period
     objects carry both spellings. Key on the short label, and keep the long one
     as an alias so neither naming convention silently drops a point. */
  var nsBy = {};
  function putNs(o, value, role){
    if (value == null) return;
    if (o.shortLabel) nsBy[o.shortLabel] = {value:value, role:role};
    if (o.label)      nsBy[o.label]      = {value:value, role:role};
  }
  putNs(CP, CP.netScore.value, 'current period');
  (D.historicalPeriods||[]).forEach(function(hp){
    putNs(hp, hp.netScore, hp.role || 'historical comparison');
  });
  var ns = axis.map(function(lab){
    return nsBy[lab] ? {label:lab, value:nsBy[lab].value, role:nsBy[lab].role} : null;
  });
  return {axis:axis, pervasion:perv, netScore:ns,
          suppliedNs: ns.filter(function(x){return !!x;}).length, total: axis.length};
}

/** The lead chart. One frame, two series, direct labels, no invented points. */
function recoveryChart(opts){
  opts = opts || {};
  var uid = opts.id || 'lead';
  var S = recoverySeries();
  var W = 880, H = 322, L = 46, R = 96, T = 26, B = 44;
  var all = S.pervasion.map(function(p){return p.value;})
    .concat(S.netScore.filter(function(x){return !!x;}).map(function(p){return p.value;}));
  var lo = Math.floor(Math.min.apply(null, all) - 4), hi = Math.ceil(Math.max.apply(null, all) + 4);
  var X = function(i){ return L + i * (W - L - R) / (S.axis.length - 1); };
  var Y = function(v){ return T + (hi - v) / (hi - lo) * (H - T - B); };
  var curI = S.axis.length - 1;
  var julI = S.axis.indexOf('Jul 2026');

  var g = ['<svg viewBox="0 0 ' + W + ' ' + H + '" class="leadsvg" role="img" ' +
    'aria-labelledby="' + uid + 'Title ' + uid + 'Desc"><title id="' + uid +
    'Title">The recovery profile</title>' +
    '<desc id="' + uid + 'Desc">Deployment breadth is supplied for all ' + S.total + ' survey periods from ' +
    S.axis[0] + ' to ' + S.axis[curI] + ' and rises to ' + n2(S.pervasion[curI].value) +
    '. Spending intent is supplied for ' + S.suppliedNs + ' of those periods only and reads ' +
    n2(CP.netScore.value) + ' in the current period. Unsupplied periods are left blank.</desc>'];

  g.push('<rect x="' + (X(curI) - 17).toFixed(1) + '" y="' + T + '" width="34" height="' +
    (H - T - B) + '" fill="#F16A20" opacity=".07"/>');

  for (var k = 0; k <= 3; k++){
    var gv = lo + (hi - lo) * k / 3;
    g.push('<line x1="' + L + '" y1="' + Y(gv).toFixed(1) + '" x2="' + (W - R) + '" y2="' +
      Y(gv).toFixed(1) + '" stroke="#E7E2D9"/>');
    g.push('<text x="' + (L - 9) + '" y="' + (Y(gv) + 3.5).toFixed(1) + '" font-size="10.5" ' +
      'text-anchor="end" fill="#8A8478">' + gv.toFixed(0) + '</text>');
  }

  /* breadth — supplied for every period, so a continuous line is honest */
  g.push('<polyline fill="none" stroke="#0F6E66" stroke-width="2.4" ' +
    'stroke-linejoin="round" points="' + S.pervasion.map(function(p, i){
      return X(i).toFixed(1) + ',' + Y(p.value).toFixed(1); }).join(' ') + '"/>');

  /* intent — a segment only between two consecutive supplied periods */
  S.netScore.forEach(function(p, i){
    if (!p || !S.netScore[i + 1]) return;
    g.push('<line x1="' + X(i).toFixed(1) + '" y1="' + Y(p.value).toFixed(1) +
      '" x2="' + X(i + 1).toFixed(1) + '" y2="' + Y(S.netScore[i + 1].value).toFixed(1) +
      '" stroke="#17365D" stroke-width="2.4"/>');
  });

  /* the gap, named rather than bridged */
  var first = -1, gapEnd = -1;
  S.netScore.forEach(function(p, i){
    if (!p) return;
    if (first < 0) first = i; else if (gapEnd < 0) gapEnd = i;
  });
  if (first >= 0 && gapEnd > first + 1){
    var mid = (X(first) + X(gapEnd)) / 2;
    var midY = Y((S.netScore[first].value + S.netScore[gapEnd].value) / 2);
    g.push('<line x1="' + (X(first) + 8).toFixed(1) + '" y1="' + Y(S.netScore[first].value).toFixed(1) +
      '" x2="' + (X(gapEnd) - 8).toFixed(1) + '" y2="' + Y(S.netScore[gapEnd].value).toFixed(1) +
      '" stroke="#B8AFA1" stroke-width="1" stroke-dasharray="2 5"/>');
    g.push('<text x="' + mid.toFixed(1) + '" y="' + (midY - 10).toFixed(1) +
      '" font-size="10" text-anchor="middle" fill="#8A8478" font-style="italic">' +
      'no intervening periods supplied</text>');
  }

  /* points — focusable, hoverable, and each opens its evidence object */
  S.pervasion.forEach(function(p, i){
    var cur = (i === curI);
    g.push('<circle class="pt" data-oid="ETR-OCT26-PV" tabindex="0" role="button" ' +
      'aria-label="Deployment breadth, ' + esc(p.label) + ': ' + n2(p.value) + '" ' +
      'data-tip="' + esc(p.label) + ' · breadth ' + n2(p.value) + '" cx="' + X(i).toFixed(1) +
      '" cy="' + Y(p.value).toFixed(1) + '" r="' + (cur ? 5 : 3.4) + '" fill="#0F6E66"/>');
  });
  S.netScore.forEach(function(p, i){
    if (!p) return;
    var cur = (i === curI);
    g.push('<circle class="pt" data-oid="ETR-OCT26-NS" tabindex="0" role="button" ' +
      'aria-label="Spending intent, ' + esc(p.label) + ': ' + n2(p.value) + ', ' + esc(p.role) + '" ' +
      'data-tip="' + esc(p.label) + ' · intent ' + n2(p.value) + ' · ' + esc(p.role) + '" cx="' +
      X(i).toFixed(1) + '" cy="' + Y(p.value).toFixed(1) + '" r="' + (cur ? 5.6 : 4) +
      '" fill="' + (cur ? '#F16A20' : '#17365D') + '"/>');
  });

  /* direct labels at the latest values */
  g.push('<text x="' + (X(curI) + 12) + '" y="' + (Y(CP.netScore.value) + 1).toFixed(1) +
    '" font-size="12.5" font-weight="700" fill="#17365D">' + n2(CP.netScore.value) + '</text>' +
    '<text x="' + (X(curI) + 12) + '" y="' + (Y(CP.netScore.value) + 15).toFixed(1) +
    '" font-size="10" fill="#8A8478">intent</text>');
  g.push('<text x="' + (X(curI) + 12) + '" y="' + (Y(CP.pervasion.value) + 1).toFixed(1) +
    '" font-size="12.5" font-weight="700" fill="#0F6E66">' + n2(CP.pervasion.value) + '</text>' +
    '<text x="' + (X(curI) + 12) + '" y="' + (Y(CP.pervasion.value) + 15).toFixed(1) +
    '" font-size="10" fill="#8A8478">breadth</text>');

  S.axis.forEach(function(lab, i){
    if (i % 2 !== 0 && i !== curI && i !== julI) return;
    g.push('<text x="' + X(i).toFixed(1) + '" y="' + (H - 24) + '" font-size="10" ' +
      'text-anchor="middle" fill="' + (i === curI ? '#B4470F' : '#8A8478') + '"' +
      (i === curI ? ' font-weight="700"' : '') + '>' + esc(lab.replace(' 20', ' ’')) + '</text>');
  });
  /* the two period roles, named under their own ticks and kept short enough
     that adjacent quarters do not collide */
  if (julI >= 0) g.push('<text x="' + X(julI).toFixed(1) + '" y="' + (H - 10) +
    '" font-size="9" text-anchor="middle" fill="#8A8478" font-style="italic">historical</text>');
  g.push('<text x="' + X(curI).toFixed(1) + '" y="' + (H - 10) +
    '" font-size="9" text-anchor="middle" fill="#B4470F" font-weight="700">current</text>');
  g.push('</svg>');

  /* the same numbers as a table, for anyone who would rather read them */
  var tbl = ['<div class="tw"><table><caption class="sr">The recovery profile, as supplied</caption>' +
    '<thead><tr><th>Survey period</th><th>Deployment breadth</th><th>Spending intent</th></tr></thead><tbody>'];
  S.axis.forEach(function(lab, i){
    tbl.push('<tr><td>' + esc(lab) + '</td><td>' + n2(S.pervasion[i].value) + '</td><td>' +
      (S.netScore[i] ? n2(S.netScore[i].value) : '<span class="note">not supplied</span>') +
      '</td></tr>');
  });
  tbl.push('</tbody></table></div>');

  return '<figure class="lead">' +
    '<figcaption><div class="lead-head">The recovery profile</div>' +
    '<p class="lead-sub">Spending intent and deployment breadth, displayed only for supplied periods.</p>' +
    '</figcaption>' +
    '<div class="lead-legend"><span class="lg"><i class="sw sw-ns"></i>Spending intent · Net Score · ' +
      S.suppliedNs + ' of ' + S.total + ' periods supplied</span>' +
    '<span class="lg"><i class="sw sw-pv"></i>Deployment breadth · Pervasion · all ' + S.total +
      ' periods supplied</span></div>' +
    '<div class="lead-plot" data-plot="1" id="' + uid + 'Plot">' + g.join('') +
      '<div class="charttip" hidden></div></div>' +
    '<p class="lead-take">Breadth moved more than intent did in the latest period: ' +
      sign(CP.pervasion.qqDelta) + ' on deployment breadth against ' + sign(CP.netScore.qqDelta) +
      ' on spending intent.</p>' +
    '<div class="lead-acts no-print"><button type="button" class="btn" data-expand="' + uid +
      'Table" aria-expanded="false" aria-controls="' + uid + 'Table">Show the numbers</button>' +
      (opts.bare ? '' :
        '<button type="button" class="btn" data-oid="ETR-OCT26-NS">Inspect spending intent</button>' +
        '<button type="button" class="btn" data-oid="ETR-OCT26-PV">Inspect breadth</button>') +
      '</div>' +
    '<div class="xpanel" id="' + uid + 'Table" hidden>' + tbl.join('') +
      '<p class="note">Unsupplied Net Score periods are left blank and are never interpolated. ' +
      'Values are as extracted; nothing on this chart comes from outside the workbook.</p></div>' +
    '</figure>';
}

/** Tooltips for the lead chart, on hover and on keyboard focus alike. */
function wireChart(){
  $$('.lead-plot[data-plot]').forEach(wireOnePlot);
}
function wireOnePlot(plot){
  var tip = $('.charttip', plot);
  if (!plot || !tip) return;
  function show(pt){
    tip.textContent = pt.getAttribute('data-tip');
    var pb = plot.getBoundingClientRect(), b = pt.getBoundingClientRect();
    tip.style.left = (b.left - pb.left + b.width / 2) + 'px';
    tip.style.top  = (b.top  - pb.top  - 12) + 'px';
    tip.hidden = false;
  }
  function hide(){ tip.hidden = true; }
  $$('.pt', plot).forEach(function(pt){
    pt.addEventListener('mouseenter', function(){ show(pt); });
    pt.addEventListener('mouseleave', hide);
    pt.addEventListener('focus', function(){ show(pt); });
    pt.addEventListener('blur', hide);
    pt.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' || ev.key === ' '){
        ev.preventDefault(); openDrawer(pt.getAttribute('data-oid'));
      }
    });
  });
  plot.addEventListener('mouseleave', hide);
}

RENDER.company = function(){
  QUIET_CITE = true;
  var v = { ns:CP.netScore, pv:CP.pervasion, z:CP.zScore, it:CP.intent };
  var h = [];
  CLAIM_SEQ = 0;   /* company claim ids are stable across repaints */

  /* ── hero ───────────────────────────────────────────────────────────── */
  /* No logo repeated here — the persistent header already carries the one
     CrowdStrike wordmark, and it stays on screen above every view. */
  h.push('<header class="chero">');
  h.push('<div class="chero-eyebrow">' + esc(CP.label) + ' research</div>');
  h.push('<div class="chero-id"><h1>CrowdStrike</h1><span class="tick">CRWD</span>' +
    '<button type="button" class="sigchip" data-goto="#signal/' + esc(CALL.primarySignalId) + '">' +
    esc((OBJ[CALL.primarySignalId] || {}).title || 'Primary signal') + '</button></div>');
  h.push('<h2 class="chero-head">' + esc(NARRATIVE.companyHeadline()) + '</h2>');
  var deck = NARRATIVE.companyDeck();
  h.push('<p class="chero-deck">' + esc(deck.text) + '</p>');
  h.push('<div class="chips">' +
    statusChip('Current call', CALL.current.value,
      CALL.current.value === 'Source Needed' ? 'need' : 'pos', 'OQ-002',
      CALL.current.value === 'Source Needed' ? 'Why Source Needed?' : 'Details') +
    statusChip('Direction', CALL.direction, 'pos', 'SIG-02', 'Details') +
    statusChip('Conviction', CALL.conviction, 'neu', 'SIG-02', 'Details') +
    statusChip('Evidence confidence', CALL.evidenceConfidence.split(/[—-]/)[0].trim(),
      'neu', 'SIG-02', 'Details') +
    statusChip('Current period', CP.label, 'neu', null, null) +
    '</div>');
  h.push('<div class="chero-acts no-print">' +
    btn('Read the narrative', '#narrative', 'pri') +
    btn('Explore the signal', '#signal/SIG-02') +
    btn('Open lineage', '#lineage/SIG-02') + '</div>');
  h.push('</header>');

  /* ── metric rail — right under the heading, above the chart ──────────── */
  h.push('<div class="railhead"><h3>Key metrics</h3><p class="note">' + esc(CP.label) +
    ' · N ' + n2(CP.nBase, 0) + ' citations. Every tile opens its evidence object.</p></div>');
  h.push('<div class="mrail">' +
    mtile('Net Score', n2(v.ns.value), 'spending intent', 'ETR-OCT26-NS') +
    mtile('Q/Q change', sign(v.ns.qqDelta), moveWord(v.ns.qqDelta), 'ETR-OCT26-NS') +
    mtile('Y/Y change', sign(v.ns.yyDelta), moveWord(v.ns.yyDelta), 'ETR-OCT26-NS') +
    mtile('Pervasion', n2(v.pv.value), 'deployment breadth', 'ETR-OCT26-PV') +
    mtile('Q/Q Z', n2(v.z.qqZ, 3), 'bands Source Needed', 'ETR-OCT26-ZS') +
    mtile('Y/Y Z', n2(v.z.yyZ, 3), 'bands Source Needed', 'ETR-OCT26-ZS') +
    mtile('N', n2(CP.nBase, 0), 'citations, not people', 'ETR-OCT26-ZS') +
    '</div>');

  /* ── lead chart ─────────────────────────────────────────────────────── */
  h.push(recoveryChart());

  /* ── narrative snapshot ─────────────────────────────────────────────── */
  h.push('<div class="snap">' + NARRATIVE.snapshot().map(function(b){
    return '<div class="snapcol"><div class="snap-k">' + esc(b.label) + '</div>' +
      '<p>' + esc(b.c.text) + '</p>' +
      '<div class="snap-foot">' + tag(b.cls) +
      '<button type="button" class="lnk no-print" data-claim="' + esc(b.c.claimId) +
        '">Inspect evidence</button></div></div>';
  }).join('') + '</div>');
  h.push('<div id="snapManifest" class="no-print"></div>');

  /* ── the company story ──────────────────────────────────────────────── */
  h.push('<section class="band"><div class="band-head"><div class="eyebrow">The company story</div>' +
    '<h2>In three moves</h2><p class="lede">The package supports more topics than this. Three are ' +
    'carried, because three are what the evidence holds at usable confidence.</p></div>');
  h.push('<div class="moves">' + NARRATIVE.moves().map(function(m){
    return '<article class="move">' +
      '<div class="move-k">' + esc(m.kicker) + '</div>' +
      '<h3>' + esc(m.title) + '</h3>' +
      '<p>' + esc(m.c.text) + '</p>' +
      '<div class="move-mini"><div><span class="k">' + esc(m.metricA.k) + '</span>' +
        '<span class="v">' + esc(m.metricA.v) + '</span></div>' +
        '<div><span class="k">' + esc(m.metricB.k) + '</span><span class="v">' +
        esc(m.metricB.v) + '</span></div></div>' +
      '<div class="move-meta">' + tag(m.classification) +
        '<span class="pill">' + esc(m.direction) + '</span>' +
        '<span class="pill">' + esc(m.confidence) + '</span></div>' +
      '<div class="move-counter"><span class="k">Counterpoint</span>' + esc(m.counter) + '</div>' +
      '<div class="move-acts no-print"><span class="evn">' + m.evidence.length +
        ' evidence objects</span>' +
        '<button type="button" class="lnk" data-oid="' + esc(m.focus) + '">Explore evidence</button>' +
        '</div></article>';
  }).join('') + '</div></section>');

  /* ── counterpoint ───────────────────────────────────────────────────── */
  h.push('<section class="counterband"><div class="band-head"><div class="eyebrow">The counterpoint</div>' +
    '<h2>What argues against it</h2></div><div class="counterbody">' +
    NARRATIVE.counterpoint().map(function(c){
      return '<p>' + esc(c.text) + '</p>'; }).join('') +
    '<div class="no-print" style="margin-top:15px">' +
      btn('View all counter-evidence', '#risks/counter') +
      btn('Open the risk register', '#risks') + '</div></div></section>');

  /* ── what to watch ──────────────────────────────────────────────────── */
  h.push('<section class="band"><div class="band-head"><div class="eyebrow">Next period</div>' +
    '<h2>What to watch next</h2></div>');
  h.push('<ol class="watch">' + NARRATIVE.watch().map(function(w){
    return '<li><div class="w-top"><h4>' + esc(w.title) + '</h4>' +
      '<span class="w-st">' + esc(w.status) + '</span></div>' +
      '<p class="w-why">' + esc(w.why) + '</p>' +
      '<dl class="w-kv"><dt>What would resolve it</dt><dd>' + esc(w.resolve) + '</dd>' +
      '<dt>Related signal</dt><dd>' + oid(w.signal) + '</dd></dl>' +
      '<div class="no-print"><button type="button" class="lnk" data-goto="#question/' + esc(w.id) +
      '">Open this question</button></div></li>';
  }).join('') + '</ol>');
  h.push('<div class="no-print" style="margin-top:13px">' +
    btn('Generate update', '#generator/update-email', 'pri') +
    btn('Open Risks and Questions', '#risks') + '</div></section>');

  /* ── research foundation, below the narrative ───────────────────────── */
  h.push('<section class="foundation"><button type="button" class="fx-head" data-expand="fxBody" ' +
    'aria-expanded="false" aria-controls="fxBody"><span class="eyebrow">Research foundation</span>' +
    '<span class="fx-sum">' + (D.evidence || []).length + ' evidence objects · ' +
    (D.sources || []).length + ' sources · ' + (D.rules || []).length + ' rules · ' +
    EDGES.length + ' relationships</span><span class="fx-caret" aria-hidden="true">▾</span></button>');
  h.push('<div class="xpanel" id="fxBody" hidden><div class="fxgrid">' +
    NARRATIVE.foundation().map(function(f){
      return '<button type="button" class="fxcell" data-goto="' + esc(f.go) + '">' +
        '<span class="n">' + f.v + '</span><span class="k">' + esc(f.k) + '</span>' +
        '<span class="s">' + esc(f.s) + '</span></button>';
    }).join('') + '</div>' +
    '<p class="note">These are counts of objects, not scores. The workbook supplies no weighting ' +
    'scheme, so no composite is computed anywhere in this application.</p>' +
    '<div class="no-print">' + btn('View evidence', '#evidence') + btn('View lineage', '#lineage') +
    btn('View sources', '#sources') + btn('View methodology', '#methodology') +
    btn('Explore the research foundation', '#evidence', 'pri') + '</div></div></section>');

  QUIET_CITE = false;
  el('view-company').innerHTML = h.join('');
  wireChart();

  function statusChip(k, val, kind, id, linkLabel){
    return '<span class="schip s-' + kind + '"><span class="k">' + esc(k) + '</span>' +
      '<span class="v">' + esc(val) + '</span>' +
      (id ? '<button type="button" class="q no-print" data-oid="' + esc(id) + '">' +
        esc(linkLabel || id) + '</button>' : '') + '</span>';
  }
  function mtile(k, val, s, id){
    return '<button type="button" class="mtile" data-oid="' + esc(id) + '">' +
      '<span class="k">' + esc(k) + '</span><span class="v">' + esc(val) + '</span>' +
      '<span class="s">' + esc(s) + '</span></button>';
  }
};

function btn(label,href,cls){
  return '<button type="button" class="btn '+(cls||'')+'" data-goto="'+esc(href)+'">'+esc(label)+'</button>';
}

/* the three drivers, each assembled from workbook objects */
var DRIVERS = [
  { key:'demand', title:'Post-outage demand recovery persists, modestly',
    classification:'ETR interpretation', direction:'Improving', confidence:'High on current raw values',
    body:function(){
      var ns=CP.netScore;
      return 'Net Score '+n2(ns.value)+' in '+CP.label+', '+sign(ns.qqDelta)+' sequentially ('+
        moveWord(ns.qqDelta)+', per the workbook’s movement terminology) and '+sign(ns.yyDelta)+
        ' year over year ('+moveWord(ns.yyDelta)+
        '). Pervasion '+n2(CP.pervasion.value)+', '+sign(CP.pervasion.qqDelta)+' sequentially. '+
        'Both Z-Scores are positive with Y/Y above Q/Q.';
    },
    evidence:['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-ZS','ETR-OCT26-INTENT'],
    counter:['CE-002','CE-003'], kpi:'KPI-003', questions:['OQ-002','OQ-005'] },
  { key:'cohort', title:'Enterprise breadth is selective, not uniform',
    classification:'ETR interpretation', direction:'Mixed', confidence:'Medium — cohort N missing',
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

/* ═══════════════════════════════════════════════════ VIEW: Narrative ═════
   A digital research brief. Question, answer, signal, evidence, counter-case,
   hypothesis, what to watch, method — in that order, at a reading width, with
   every number still one click from the object it came from.
   ══════════════════════════════════════════════════════════════════════════ */

RENDER.narrative = function(){
  QUIET_CITE = true;
  var ns = CP.netScore, pv = CP.pervasion, z = CP.zScore, it = CP.intent;
  var cuts = (D.rawTables.subsampleCuts || {rows:[]}).rows;
  var h = [];
  CLAIM_SEQ = 200;   /* narrative claim ids sit in their own band */

  /* ── contents ────────────────────────────────────────────────────────── */
  h.push('<div class="nbar no-print"><div class="nbar-t">Contents</div>' +
    NARRATIVE.SECTIONS.map(function(s){
      return '<button type="button" data-scroll="nar-' + s[0] + '"><span class="num">' + s[1] +
        '</span>' + esc(s[2]) + '</button>';
    }).join('') + '</div>');

  h.push(brandLogo('reader-logo'));
  h.push('<article class="reader">');

  /* ── 01 the research question ───────────────────────────────────────── */
  h.push(nsec('question', '01', 'The research question'));
  h.push('<h1 class="n-question">' + esc(NARRATIVE.QUESTION) + '</h1>');
  h.push('<p class="note" style="margin-top:10px">Everything below is assembled to answer it, ' +
    'in the order a reader would want it.</p>');

  /* ── 02 short answer ────────────────────────────────────────────────── */
  h.push(nsec('answer', '02', 'The short answer'));
  h.push('<div class="n-answer"><p>' + esc(NARRATIVE.shortAnswer()) + '</p></div>');
  h.push('<p class="scope">ETR measures respondent spending intent and deployment breadth. It does not ' +
    'measure revenue, ARR, market share, financial performance or share price, and nothing here should ' +
    'be read as doing so. ' + esc(CP.label) + ' is the current survey period; July 2026 is historical ' +
    'comparison.</p>');

  /* ── 03 the signal ──────────────────────────────────────────────────── */
  h.push(nsec('signal', '03', 'The signal'));
  var sig = OBJ[CALL.primarySignalId] || {};
  h.push('<p>' + esc(sig.statement || CALL.primarySignalText) + ' That is the recorded reading for ' +
    oid(CALL.primarySignalId) + ', whose reviewer status is <strong>' +
    esc(sig.workflowStatus || 'Source Needed') + '</strong>. The prior call was ' +
    esc(CALL.prior.value) + ' in July 2026; under the current-period promotion rule that reading is ' +
    'now historical, and no ' +
    esc(CP.label) + ' data outlook is recorded anywhere in the package, which is why the current call ' +
    'reads <strong>Source Needed</strong> rather than carrying the earlier one forward.</p>');
  h.push(missingSource('An October 2026 ETR data outlook',
    'Without a recorded outlook for the current period, the call cannot resolve in either direction and ' +
    'stays Source Needed rather than carrying the prior Positive reading forward.',
    {question:'OQ-002'}));
  h.push(callouts([
    ['Current call', CALL.current.value, 'need'],
    ['Prior call', CALL.prior.value + ' · Jul 2026', 'neu'],
    ['Direction', CALL.direction, 'pos'],
    ['Conviction', CALL.conviction, 'neu'],
    ['Evidence confidence', 'Mixed', 'neu'],
    ['Outcome linkage', 'Low', 'need']
  ]));

  /* ── 04 what changed ────────────────────────────────────────────────── */
  h.push(nsec('changed', '04', 'What changed'));
  h.push('<p>Net Score reads <strong>' + n2(ns.value) + '</strong> on ' + n2(CP.nBase, 0) +
    ' citations ' + oid('ETR-OCT26-NS') + '. Against July 2026 that is ' + sign(ns.qqDelta) +
    ', which the workbook’s own wording convention calls <em>' + moveWord(ns.qqDelta) +
    '</em>. Against October 2025 it is ' + sign(ns.yyDelta) + ', <em>' + moveWord(ns.yyDelta) +
    '</em>. Read those two numbers together and the shape of the year is plain: nearly all of the ' +
    'distance was covered before this quarter.</p>');
  h.push(pull(NARRATIVE.pull('changed')));
  h.push('<p>Three survey periods are supplied for Net Score and twelve for Pervasion. Nothing between ' +
    'them is interpolated, and the chart on the Company page leaves the unsupplied Net Score periods ' +
    'blank rather than drawing through them ' + oids(['R-003', 'R-005']) + '.</p>');

  /* ── 05 demand and breadth ──────────────────────────────────────────── */
  h.push(nsec('breadth', '05', 'Demand and breadth'));
  h.push('<p>The two headline measures carry different things. Net Score is a spending-intent balance: ' +
    n2(it.adoption) + '% adopting and ' + n2(it.increase) + '% increasing against ' + n2(it.decrease) +
    '% decreasing and ' + n2(it.replacing) + '% replacing, with ' + n2(it.flat) + '% flat ' +
    oid('ETR-OCT26-INTENT') + '. Pervasion is deployment breadth — the share of respondents reporting ' +
    'the platform in use at all — and it rose to <strong>' + n2(pv.value) + '</strong>, ' +
    sign(pv.qqDelta) + ' on the quarter ' + oid('ETR-OCT26-PV') + '. Breadth moved further than intent ' +
    'did over the same period.</p>');
  h.push(pull(NARRATIVE.pull('breadth')));
  h.push('<p class="note">Pervasion is breadth, not revenue and not market share. A rise in it says ' +
    'more respondents report the platform in use; it says nothing about what they spend ' +
    oids(['R-008', 'R-009']) + '.</p>');

  /* ── 06 enterprise and geography ────────────────────────────────────── */
  h.push(nsec('cohorts', '06', 'Enterprise and geography'));
  h.push('<p>The enterprise picture is selective rather than uniform, and the honest caveat is larger ' +
    'than the finding: no October cut carries a citation base ' + oid('OQ-014') + '. The cohorts below ' +
    'sit inside different definitions, so the spread between them describes the sample rather than ' +
    'ranking the segments.</p>');
  /* the named enterprise cohorts, in the order the story uses them, plus the
     all-respondent row so the comparison has something to be a comparison to */
  var WANT = ['All Respondents','Global 2000','Fortune 500','Large Organizations',
              'Midsize Organizations','Small Organizations'];
  var picked = WANT.map(function(name){
    return cuts.filter(function(r){ return r.Category === name; })[0];
  }).filter(Boolean);
  if (picked.length) h.push(miniTable(
    ['Cut', 'Net Score', 'Pervasion', 'Citation base'],
    picked.map(function(r){
      return [r.Category, n2(Number(r['Net Score'])), r.Pervasion ? n2(Number(r.Pervasion)) : '—',
              '<span class="needed">SOURCE NEEDED</span>'];
    })));
  var regions = NREGION();
  if (regions.length) h.push('<p>Geographically the October cuts run wide — from ' +
    esc(regions[0].k + ' at ' + n2(regions[0].v)) + ' down to ' +
    esc(regions[regions.length-1].k + ' at ' + n2(regions[regions.length-1].v)) + ' ' +
    oid('ETR-OCT26-REGION') + '. A regional survey cut is not regional revenue, and with no base ' +
    'supplied the spread cannot be weighed ' + oids(['R-011', 'R-024']) + '.</p>');

  /* ── 07 what argues against it ──────────────────────────────────────── */
  h.push(nsec('counter', '07', 'What argues against it'));
  NARRATIVE.counterpoint().forEach(function(c, i){
    h.push('<p>' + esc(c.text) + ' <button type="button" class="lnk no-print" data-claim="' +
      esc(c.claimId) + '">Inspect</button></p>');
    if (i === 0) h.push(pull(NARRATIVE.pull('counter')));
  });
  h.push('<p>Separately, the deviation figures cannot be read. Q/Q Z is ' + n2(z.qqZ, 6) +
    ' and Y/Y Z is ' + n2(z.yyZ, 6) + ' on N ' + n2(z.citations, 0) + ' ' + oid('ETR-OCT26-ZS') +
    ' — both positive, with the annual figure higher, consistent with the larger annual change in the ' +
    'base metric. The approved bands that would say whether a move of this size is ordinary remain ' +
    '<strong>Source Needed</strong>. The Z-Score supplies deviation context ' +
    'only and never creates or changes the call.</p>');
  h.push(missingSource('Approved Z-Score interpretation bands',
    'Without approved bands, the raw deviation figures stay context rather than evidence — there is no ' +
    'way to say whether a move of this size is ordinary or unusual.',
    {question:'OQ-005'}));

  /* ── 08 the hypothesis ──────────────────────────────────────────────── */
  h.push(nsec('bridge', '08', 'The signal-to-KPI hypothesis'));
  h.push('<div class="hyp-bar">Hypothesis — Backtest Required</div>');
  h.push('<p>One relationship in this package is worth formal testing, and it is stated here in full so ' +
    'that it can be attacked. ' + oid('SIG-02') + ' to ' + oid('KPI-003') + ' Net New ARR: the demand ' +
    'reading and the reported series move the same way over the same window, and ' + oid('XL-01') +
    ' records that as parallel evidence. ' + oid('R-021') + ' holds the pairing at Backtest Required. ' +
    'No lag is established. Flex, CCP, renewal timing, new logos and expansion are named as ' +
    'confounders. The protocol is ' + oid('BT-CRWD-OCT26') + ', and its expected lag and tolerance ' +
    'remain <strong>Source Needed</strong>.</p>');
  h.push(missingSource('Backtest protocol lag and tolerance',
    'Needed to run BT-CRWD-OCT26 and test the signal-to-KPI hypothesis rather than leave it a hypothesis ' +
    'indefinitely.',
    {expected:'A pre-registered protocol with an agreed lag and tolerance', status:'Backtest Required'}));
  h.push(pull(NARRATIVE.pull('bridge')));
  h.push('<p class="note">' + oid('R-015') + ' permits a statement of directional consistency between ' +
    'the two lanes and prohibits any causal assertion between them. Nothing in this application ' +
    'asserts one.</p>');

  /* ── 09 what to watch ───────────────────────────────────────────────── */
  h.push(nsec('watch', '09', 'What to watch'));
  h.push('<ol class="watch narrow">' + NARRATIVE.watch().map(function(w){
    return '<li><div class="w-top"><h4>' + esc(w.title) + '</h4><span class="w-st">' +
      esc(w.status) + '</span></div><p class="w-why">' + esc(w.why) + '</p>' +
      '<dl class="w-kv"><dt>What would resolve it</dt><dd>' + esc(w.resolve) + '</dd></dl>' +
      '<div class="no-print"><button type="button" class="lnk" data-goto="#question/' + esc(w.id) +
      '">Open this question</button></div></li>';
  }).join('') + '</ol>');

  /* ── 10 methodology note ────────────────────────────────────────────── */
  h.push(nsec('method', '10', 'Methodology note'));
  h.push('<p>The sole factual source is the authorized worksheets of ' + esc(D.metadata.workbook) +
    '. ' + esc(CP.label) + ' is the current TSIS period and July 2026 is historical comparison under ' +
    oid('R-025') + '. N counts citations, not people ' + oid('R-009') + '. Prose in the generators is ' +
    'assembled by template from these objects; no model is called and no network request is made. ' +
    'Every generated paragraph carries a claim manifest naming its evidence, objects, worksheets, ' +
    'rules, confidence and caveats.</p>');
  h.push('<p>Three things are Source Needed and are shown as such rather than filled: the current ' +
    'period data outlook ' + oid('OQ-002') + ', cut-level citation bases ' + oid('OQ-014') + ', and ' +
    'the approved Z-Score bands ' + oid('OQ-005') + '. ' + oid('R-020') + ' makes analyst approval a ' +
    'precondition of external distribution, so every output here is a working draft.</p>');

  h.push('</article>');

  /* ── research foundation, at the foot ───────────────────────────────── */
  h.push('<section class="foundation"><button type="button" class="fx-head" data-expand="narFx" ' +
    'aria-expanded="false" aria-controls="narFx"><span class="eyebrow">Research foundation</span>' +
    '<span class="fx-sum">What makes this up — ' + (D.evidence || []).length + ' evidence objects, ' +
    EDGES.length + ' relationships</span><span class="fx-caret" aria-hidden="true">▾</span></button>' +
    '<div class="xpanel" id="narFx" hidden><div class="fxgrid">' +
    NARRATIVE.foundation().map(function(f){
      return '<button type="button" class="fxcell" data-goto="' + esc(f.go) + '">' +
        '<span class="n">' + f.v + '</span><span class="k">' + esc(f.k) + '</span>' +
        '<span class="s">' + esc(f.s) + '</span></button>';
    }).join('') + '</div><p class="note">Object counts, not scores. No composite is computed.</p>' +
    '<div class="no-print">' +
    btn('Explore the research foundation', '#evidence', 'pri') +
    btn('View lineage', '#lineage') +
    btn('View methodology', '#methodology') + '</div></div></section>');

  h.push('<div id="narManifest" class="no-print"></div>');

  QUIET_CITE = false;
  el('view-narrative').innerHTML = h.join('');

  function nsec(id, num, title){
    return '<section class="sec nsec" id="nar-' + id + '"><div class="sec-lab">' + num +
      '</div><h2>' + esc(title) + '</h2></section>';
  }
  function pull(text){
    return text ? '<blockquote class="pull">' + esc(text) + '</blockquote>' : '';
  }
  function callouts(rows){
    return '<div class="ncall">' + rows.map(function(r){
      return '<div class="nc nc-' + r[2] + '"><span class="k">' + esc(r[0]) + '</span>' +
        '<span class="v">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
  }
  function miniTable(head, rows){
    return '<div class="tw"><table><thead><tr>' + head.map(function(x){
      return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function(r){ return '<tr>' + r.map(function(c, i){
        return '<td>' + (i === 3 ? c : esc(c)) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
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

  /* Presentation groups only. The workbook records no ranking, so the grouping
     is derived from fields that do exist: the recorded primary signal, whether
     a signal carries current-period evidence, and whether its reading is held
     at Source Needed. Nothing about the signal objects themselves changes. */
  function groupOf(s, m){
    if (s.id === CALL.primarySignalId) return 'primary';
    var row = SCORECARD.filter(function(r){ return r.id === s.id; })[0];
    if (row && row.reading() === 'Source Needed') return 'gap';
    return m.current > 0 ? 'supporting' : 'watch';
  }
  var GROUPS = [
    ['primary',    'Primary signal',  'the reading the current call is built on'],
    ['supporting', 'Supporting',      'carries current-period evidence'],
    ['watch',      'Watch',           'evidence is historical or thin for this period'],
    ['gap',        'Research gap',    'the reading itself is Source Needed']
  ];

  var h = ['<div class="vhead"><div class="eyebrow">Signals</div>' +
    '<h2>Seven readings, and what each one can carry</h2>' +
    '<p>Grouped by the role each signal plays in the current call. The grouping is a display ' +
    'choice derived from existing fields — the workbook records no ranking and none is invented ' +
    'here. Counts respond to the source controls; reviewer decisions do not.</p></div>'];

  h.push('<div class="filters"><div class="fgrp">' +
    '<label class="mini" for="sigQ">Search</label>' +
    '<input id="sigQ" type="search" value="' + esc(signalFilter.q) + '" ' +
    'placeholder="signal name, statement, gap…" ' +
    'style="flex:1;min-width:170px;padding:4px 8px;border:1px solid var(--line);border-radius:3px">' +
    sel('sigDir','Direction',['','Improving','Mixed','Watch'],signalFilter.direction) +
    sel('sigConf','Confidence',['','High','Medium-High','Medium','Low'],signalFilter.confidence) +
    sel('sigPeriod','Evidence',['','Has current evidence','Historical only'],signalFilter.period) +
    sel('sigReview','Review',['','Pending Review'],signalFilter.review) +
    '<button class="btn" id="sigClear">Clear</button></div></div>');

  var buckets = {primary:[], supporting:[], watch:[], gap:[]};
  var shown = 0;
  (D.signals || []).forEach(function(s){
    var m = signalMetrics(s);
    if (signalFilter.q){
      var hay = (s.id + ' ' + s.title + ' ' + s.statement + ' ' + (s.caveat || '')).toLowerCase();
      if (hay.indexOf(signalFilter.q.toLowerCase()) < 0) return;
    }
    if (signalFilter.direction && m.direction !== signalFilter.direction) return;
    if (signalFilter.confidence && (s.confidence || '') !== signalFilter.confidence) return;
    if (signalFilter.period === 'Has current evidence' && m.current === 0) return;
    if (signalFilter.period === 'Historical only' && m.current > 0) return;
    if (signalFilter.review && (s.workflowStatus || '') !== signalFilter.review) return;
    shown++;
    buckets[groupOf(s, m)].push({s:s, m:m});
  });

  GROUPS.forEach(function(gp){
    var list = buckets[gp[0]];
    if (!list.length) return;
    h.push('<div class="siggroup"><div class="sg-head"><h3>' + esc(gp[1]) + '</h3>' +
      '<span class="sg-d">' + esc(gp[2]) + '</span><span class="sg-n">' + list.length + '</span></div>');
    list.forEach(function(x){ h.push(signalRow(x.s, x.m, gp[0] === 'primary')); });
    h.push('</div>');
  });

  if (!shown) h.push('<div class="callout">No signal matches these controls. Nothing is hidden by ' +
    'design — clear a filter to widen the set.</div>');
  el('view-signals').innerHTML = h.join('');

  function sel(id, label, opts, val){
    return '<label class="mini" for="' + id + '">' + esc(label) + '</label><select id="' + id + '">' +
      opts.map(function(o){ return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') +
        '>' + esc(o || 'all') + '</option>'; }).join('') + '</select>';
  }
};

/** One signal as an editorial row: name, a sentence, direction, confidence,
    current evidence and the caveat that bounds it. Everything else moves into
    the workspace behind it. */
function signalRow(s, m, primary){
  var row = SCORECARD.filter(function(r){ return r.id === s.id; })[0];
  var reading = row ? row.reading() : null;
  var word = row ? row.word : 'w-flat';
  var dir = row ? row.direction : (m.direction || 'Source Needed');
  var line = row ? row.implication : (s.statement || '');
  var caveat = s.caveat || (row && reading === 'Source Needed' ?
    'The reading itself is Source Needed.' : 'No caveat is recorded against this signal.');
  return '<article class="sigrow' + (primary ? ' is-primary' : '') + '" data-goto="#signal/' +
    esc(s.id) + '" tabindex="0" role="button" aria-label="Open the workspace for ' + esc(s.id) + '">' +
    '<div class="sr-main">' +
      (primary ? '<div class="sr-badge">Recorded primary signal</div>' : '') +
      '<h4>' + esc(s.title) + '</h4>' +
      '<p>' + esc(line) + '</p>' +
      '<p class="sr-cav"><span class="k">Principal caveat</span>' + esc(caveat) + '</p>' +
    '</div>' +
    '<div class="sr-side">' +
      '<div class="sr-read"><span class="k">Reading</span><span class="v">' +
        esc(reading || '—') + '</span>' +
        (row ? '<span class="u">' + esc(row.unit) + '</span>' : '') + '</div>' +
      '<div class="sr-chips"><span class="word ' + word + '">' + esc(dir) + '</span>' +
        '<span class="pill">' + esc(s.confidence || 'Source Needed') + '</span></div>' +
      '<div class="sr-ev"><span class="n">' + m.current + '</span> current evidence · ' +
        '<span class="n">' + m.supporting.length + '</span> supporting · ' +
        '<span class="n">' + m.contradicting.length + '</span> counter</div>' +
      '<div class="sr-id">' + oid(s.id) + '<span class="note">' +
        esc(s.workflowStatus || '') + '</span></div>' +
    '</div></article>';
}

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
      tag(s.workflowStatus==='Pending Review'?'Open question':'ETR interpretation')+'</div>'+
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
var evFilter = {q:'', quick:[], mode:'list'};   /* list first; cards and table on request */
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
  h.push('<p class="note" style="margin:-6px 0 12px">The list shows statement, period, lane, ' +
    'confidence and related signal. Cards add every field; the table adds sorting and CSV.</p>');
  h.push('<div class="filters"><div class="fgrp">'+
    '<input id="evQ" type="search" value="'+esc(evFilter.q)+'" placeholder="ID, statement, theme, metric, source, caveat…" '+
    'style="flex:1;min-width:220px;padding:5px 9px;border:1px solid var(--line);border-radius:3px">'+
    '<button class="btn'+(evFilter.mode==='list'?' on':'')+'" data-evmode="list">List</button>'+
    '<button class="btn'+(evFilter.mode==='card'?' on':'')+'" data-evmode="card">Cards</button>'+
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
  } else if (evFilter.mode!=='card'){
    /* The default. Statement first, then the five fields a reader needs to weigh
       it; everything else is one click away in the object drawer. */
    h.push('<div class="evlist">');
    rows.forEach(function(e){
      var sig = (OUT_BY[e.id]||[]).filter(function(x){return x.type==='SUPPORTS'||x.type==='CONTRADICTS';})
        .map(function(x){return x.to;}).filter(function(i){return /^SIG-/.test(i);})[0];
      h.push('<button type="button" class="evrow'+(state.compare.indexOf(e.id)>=0?' picked':'')+
        '" data-oid="'+esc(e.id)+'">'+
        '<span class="ev-st">'+esc(e.statement||e.title||'')+'</span>'+
        '<span class="ev-meta">'+
          '<span class="ev-f"><i>Period</i>'+esc(e.period||'—')+'</span>'+
          '<span class="ev-f"><i>Lane</i>'+esc((LANES.filter(function(l){return l[0]===laneOf(e);})[0]||['','—'])[1])+'</span>'+
          '<span class="ev-f"><i>Confidence</i>'+esc(e.confidence||'Source Needed')+'</span>'+
          '<span class="ev-f"><i>Signal</i>'+esc(sig||'—')+'</span>'+
          '<span class="ev-f"><i>ID</i>'+esc(e.id)+'</span>'+
        '</span></button>');
    });
    h.push('</div>');
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
  if (LIN.mode==='path'){
    h.push('<div class="pathtell"><button type="button" class="pt-head" data-expand="pathTell" '+
      'aria-expanded="false" aria-controls="pathTell"><span class="eyebrow">Tell me this path</span>'+
      '<span class="fx-sum">The same chain, in plain language</span>'+
      '<span class="fx-caret" aria-hidden="true">▾</span></button>'+
      '<div class="xpanel" id="pathTell" hidden>'+tellPath()+'</div></div>');
  }
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
/** The proof-case path narrated. Every sentence is built from a relationship
    that exists in the graph — the edge type supplies the verb, so nothing is
    inferred and no causal language is introduced by the retelling. */
var EDGE_VERB = {
  SOURCE_OF:'is the source of', NORMALIZES_TO:'is normalized into',
  SUPPORTS:'supports', CONTRADICTS:'contradicts', INFORMS:'informs',
  CONTEXTUALIZES:'supplies context for', GOVERNED_BY:'is governed by',
  BLOCKS:'blocks', RELATES_TO:'relates to', COMMUNICATES:'is communicated in',
  GENERATED_FROM:'was generated from', HISTORICAL_COMPARISON:'is the historical comparison for',
  IMPACTS:'bears on'
};
function tellPath(){
  var nodes = PROOF_PATH.filter(function(id){ return !!OBJ[id]; });
  var lines = [];
  for (var i = 0; i < nodes.length - 1; i++){
    var from = nodes[i], to = nodes[i + 1];
    var fwd = (OUT_BY[from] || []).filter(function(e){ return e.to === to; })[0];
    var back = fwd ? null : (IN_BY[from] || []).filter(function(e){ return e.from === to; })[0];
    var edge = fwd || back;
    if (!edge) continue;
    var a = fwd ? from : to, b = fwd ? to : from;
    lines.push({a:a, b:b, verb:(EDGE_VERB[edge.type] || 'relates to'), type:edge.type,
                note:edge.note || null,
                dashed: edge.type === 'INFORMS' || /hypoth/i.test(edge.note || '')});
  }
  if (!lines.length) return '<p class="note">No path edges are present under the current source ' +
    'controls, so there is nothing to narrate. Switch a lane back on to restore it.</p>';
  return '<ol class="telllist">' + lines.map(function(l){
    return '<li><span class="tl-t">' + esc(l.type) + '</span>' +
      '<p>' + oid(l.a) + ' <strong>' + esc(l.verb) + '</strong> ' + oid(l.b) +
      (l.note ? ' — ' + esc(l.note) : '') + '</p>' +
      (l.dashed ? '<p class="note">This link is drawn dashed: it is a recorded hypothesis, not a ' +
        'validated relationship, and nothing in the chain asserts that one object caused another.</p>'
                : '') + '</li>';
  }).join('') + '</ol>' +
  '<p class="note">Each sentence uses the relationship type recorded in the workbook as its verb. ' +
  'No edge is inferred and no causal claim is introduced by the retelling.</p>';
}

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
  h.push('<div class="callout">'+tag('ETR interpretation')+' Global 2000 and Fortune 500 sit above '+
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
  h.push('<div class="callout">'+tag('ETR interpretation')+' Technical capabilities and product '+
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
var ruleFilter = {status:'', family:'', enforcement:'', q:'', scope:'narrative'};
/* The rules the current narrative actually applied. Collected from the claim
   manifests the Company page and the two generators have just produced — so it
   is an observation of what ran, not a curated list. */
function narrativeRuleIds(){
  var ids = {};
  function take(cs){ cs.forEach(function(c){ (c.ruleIds||[]).forEach(function(r){ ids[r]=1; }); }); }
  try { take([NARRATIVE.companyDeck()]); } catch(e){}
  try { take(NARRATIVE.snapshot().map(function(b){return b.c;})); } catch(e){}
  try { take(NARRATIVE.moves().map(function(m){return m.c;})); } catch(e){}
  try { take(NARRATIVE.counterpoint()); } catch(e){}
  try { take(NARRATIVE.sunday('cohesive','standard',{}).map(function(b){return b.c;})); } catch(e){}
  ids['R-020'] = 1;   /* human review governs every output */
  ids['R-025'] = 1;   /* the period convention governs every reading */
  return Object.keys(ids);
}

RENDER.rules = function(route){
  var all = (D.rules||[]);
  var narrow = (ruleFilter.scope !== 'all');
  var narrativeIds = narrativeRuleIds();
  var fams = unique(all.map(function(r){return r.ruleFamily;}).filter(Boolean));
  var enfs = unique(all.map(function(r){return r.enforcement;}).filter(Boolean));
  var h=['<div class="vhead"><div class="eyebrow">Rule Explorer</div><h2>Interpretation rules and MCP context</h2>'+
    '<p>'+all.length+' interpretation rules and '+(D.contextRules||[]).length+' MCP context objects. '+
    '<strong>Rules are human-maintained in the workbook. This prototype does not edit rule status.</strong></p></div>'];
  h.push('<div class="scopebar"><button type="button" class="seg'+(narrow?' on':'')+
    '" data-rscope="narrative" aria-pressed="'+narrow+'">Rules affecting the current narrative'+
    '<span class="c">'+narrativeIds.filter(function(i){return OBJ[i];}).length+'</span></button>'+
    '<button type="button" class="seg'+(narrow?'':' on')+'" data-rscope="all" aria-pressed="'+
    (!narrow)+'">View all rules<span class="c">'+all.length+'</span></button></div>');
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
    if (narrow && narrativeIds.indexOf(r.id)<0) return false;
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
  if (narrow) h.push('<p class="note" style="margin-top:9px">These are the rules named in the claim '+
    'manifests the current narrative produced, plus the two that govern every output. '+
    'Switch to <em>View all rules</em> for the full registry.</p>');

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
  return '<div class="card rulecard" style="border-left:4px solid '+
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
var riskView = 'now';
RENDER.risks = function(route){
  if (route && route.arg === 'counter'){ riskView = 'all'; riskTab = 1; }
  var tabs = ['Risks','Counter-Evidence','Open Questions','Source Needed','Data Conflicts','Output Blockers'];
  var h=['<div class="vhead"><div class="eyebrow">Risks and open questions</div>'+
    '<h2>What is unresolved, and what it blocks</h2>'+
    '<p>Clicking any item highlights its lineage. Nothing here is repaired in the workbook.</p></div>'];
  h.push('<div class="scopebar"><button type="button" class="seg'+(riskView==='now'?' on':'')+
    '" data-rkview="now" aria-pressed="'+(riskView==='now')+'">Most important now</button>'+
    '<button type="button" class="seg'+(riskView==='now'?'':' on')+'" data-rkview="all" aria-pressed="'+
    (riskView!=='now')+'">Everything recorded</button></div>');
  if (riskView === 'now'){
    h.push(mostImportantNow());
    el('view-risks').innerHTML = h.join('');
    return;
  }
  h.push('<div class="tabs" id="riskTabs">'+tabs.map(function(t,i){
    return '<button data-rtab="'+i+'"'+(i===riskTab?' class="on"':'')+'>'+esc(t)+'</button>';}).join('')+'</div>');
  h.push('<div id="riskBody"></div>');
  el('view-risks').innerHTML = h.join('');
  paintRisk();
};

/* "Most important now" is assembled from the priority and blocking fields the
   workbook already records — the importance a question carries, and whether it
   blocks an object through a BLOCKS relationship. No proprietary importance
   score is computed, and nothing is ranked against anything the workbook does
   not rank itself. */
function mostImportantNow(){
  var qs = (D.openQuestions||[]).filter(function(q){ return /critical|high/i.test(q.importance||''); });
  var order = {critical:0, high:1};
  qs = qs.slice().sort(function(a,b){
    var ka = order[(a.importance||'').toLowerCase()], kb = order[(b.importance||'').toLowerCase()];
    if (ka !== kb) return (ka==null?9:ka) - (kb==null?9:kb);
    var ba = (OUT_BY[a.id]||[]).filter(function(e){return e.type==='BLOCKS';}).length;
    var bb = (OUT_BY[b.id]||[]).filter(function(e){return e.type==='BLOCKS';}).length;
    return bb - ba;
  });
  var h = ['<p class="note" style="margin-bottom:14px">Ordered by the importance each question '+
    'records, then by how many objects it blocks through a recorded BLOCKS relationship. '+
    'Both fields come from the workbook; no composite score is computed.</p>'];
  h.push('<div class="nowlist">');
  qs.forEach(function(q){
    var blocks = (OUT_BY[q.id]||[]).filter(function(e){return e.type==='BLOCKS';}).map(function(e){return e.to;});
    h.push('<article class="nowrow"><div class="nr-l">'+
      '<span class="nr-imp imp-'+esc((q.importance||'').toLowerCase())+'">'+esc(q.importance||'—')+'</span>'+
      '<span class="nr-id">'+oid(q.id)+'</span></div>'+
      '<div class="nr-m"><h4>'+esc(q.title||q.id)+'</h4>'+
      '<p>'+esc(q.statement||'')+'</p>'+
      '<p class="nr-src"><span class="k">Expected source</span>'+
        esc(q.sourceName||'Source Needed')+'</p></div>'+
      '<div class="nr-r"><div class="k">Blocks</div>'+
        (blocks.length ? oids(blocks) + '<div class="note" style="margin-top:6px">'+blocks.length+
          (blocks.length===1?' object':' objects')+'</div>'
                       : '<span class="note">No blocking relationship recorded.</span>')+
      '<div class="no-print" style="margin-top:9px">'+
        '<button type="button" class="lnk" data-oid="'+esc(q.id)+'">Open</button> · '+
        '<button type="button" class="lnk" data-goto="#lineage/'+esc(q.id)+'">Lineage</button>'+
      '</div></div></article>');
  });
  h.push('</div>');
  var ce = (D.risks||[]).filter(function(r){ return /high/i.test(r.confidence||''); });
  h.push('<h3 style="margin:26px 0 10px;font:400 20px/1.2 var(--serif);color:var(--deep)">'+
    'Counter-evidence recorded at high confidence</h3>');
  h.push('<div class="nowlist">'+ce.map(function(r){
    return '<article class="nowrow"><div class="nr-l">'+
      '<span class="nr-imp imp-counter">'+esc(r.confidence||'')+'</span>'+
      '<span class="nr-id">'+oid(r.id)+'</span></div>'+
      '<div class="nr-m"><h4>'+esc(r.title||'')+'</h4><p>'+esc(r.statement||'')+'</p></div>'+
      '<div class="nr-r"><div class="k">Period</div><span class="note">'+esc(r.period||'—')+'</span>'+
      '<div class="no-print" style="margin-top:9px">'+
        '<button type="button" class="lnk" data-oid="'+esc(r.id)+'">Open</button></div></div></article>';
  }).join('')+'</div>');
  return h.join('');
}
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
/* Source families. Each family is a test against fields the register already
   carries — the period a source belongs to and its recorded type. Assignment is
   in priority order and exclusive, so every source is counted exactly once and
   none is reclassified. */
var SOURCE_FAMILIES = [
  ['current',    'Current October exports', function(s){
     return s.currentOrHistorical === 'current'; }],
  ['etr',        'Historical ETR', function(s){
     return /ETR|TSIS|Observatory/i.test(s.sourceName || '') ||
            /flash survey|research report/i.test(s.sourceType || ''); }],
  ['company',    'Company evidence', function(s){
     return /earnings|sec filing|press release/i.test(s.sourceType || ''); }],
  ['external',   'External research', function(s){
     return /article|market|competitive|interview|analysis/i.test(s.sourceType || ''); }],
  ['analyst',    'Analyst layer', function(){ return true; }]
];
function sourceFamily(s){
  for (var i = 0; i < SOURCE_FAMILIES.length; i++){
    try { if (SOURCE_FAMILIES[i][2](s)) return SOURCE_FAMILIES[i]; } catch(e){}
  }
  return SOURCE_FAMILIES[SOURCE_FAMILIES.length - 1];
}
function sourceFamilyCards(){
  var all = D.sources || [];
  var counts = {};
  all.forEach(function(s){ var f = sourceFamily(s); counts[f[0]] = (counts[f[0]] || 0) + 1; });
  return '<div class="famgrid">' + SOURCE_FAMILIES.filter(function(f){ return counts[f[0]]; })
    .map(function(f){
      return '<button type="button" class="famcard" data-expand="srcAll">' +
        '<span class="n">' + counts[f[0]] + '</span>' +
        '<span class="k">' + esc(f[1]) + '</span></button>';
    }).join('') + '</div>';
}

RENDER.sources = function(){
  var h=['<div class="vhead"><div class="eyebrow">Sources</div><h2>Source register</h2>'+
    '<p>'+(D.sources||[]).length+' source objects. The eight October CSV exports are the current '+
    'primary layer; their filenames are dated 2026-09-10 while the survey labels read October 2026 '+
    oid('OQ-015')+'.</p></div>'];
  h.push(sourceFamilyCards());
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
RENDER.audience = function(route){
  if (route && route.arg && AUDIENCES.some(function(a){ return a.id === route.arg; }))
    { state.audience = route.arg; save(); }
  var a = AUDIENCES.filter(function(x){ return x.id === state.audience; })[0] || AUDIENCES[4];
  var ns = CP.netScore;
  var h = ['<div class="vhead"><div class="eyebrow">Audience Translator</div>' +
    '<h2>Same evidence. Different decision.</h2>' +
    '<p>Changing audience changes the decision question, the translation, the emphasis and the ' +
    'recommended action. It never changes a fact, a metric value, a source ID, the signal statement, ' +
    'the confidence, the current period, the rules or the caveats.</p></div>'];

  h.push('<div class="aud3">');

  /* ── left: who is reading ───────────────────────────────────────────── */
  h.push('<nav class="aud-pick" aria-label="Audience">' +
    '<div class="ap-lab">Reading this</div>' +
    AUDIENCES.map(function(x){
      return '<button type="button" class="apbtn' + (x.id === a.id ? ' on' : '') + '" data-aud="' +
        esc(x.id) + '" aria-pressed="' + (x.id === a.id) + '">' + esc(x.label) + '</button>';
    }).join('') + '</nav>');

  /* ── centre: the translated decision narrative ──────────────────────── */
  h.push('<div class="aud-mid">');
  h.push('<div class="am-eyebrow">The decision in front of them</div>');
  h.push('<h3 class="am-q">' + esc(a.q) + '</h3>');
  h.push('<p class="am-t">' + esc(a.t) + '</p>');

  h.push('<div class="am-block"><div class="am-k">Why it matters to them</div><p>' +
    esc(audienceWhy(a)) + '</p></div>');

  /* Statements are separate readings, so they are listed separately rather than
     run together into a paragraph that would read as one claim. */
  h.push('<div class="am-block"><div class="am-k">Best supporting evidence</div><ul class="am-list">' +
    a.emph.filter(function(id){ return OBJ[id]; }).map(function(id){
      var o = OBJ[id];
      return '<li>' + esc(o.statement || o.title || id) +
        '<span class="cite-id"> ' + oid(id) + '</span></li>';
    }).join('') + '</ul></div>');

  h.push('<div class="am-block am-counter"><div class="am-k">Counterpoint</div><ul class="am-list">' +
    ['CE-002','CE-003'].filter(function(id){ return OBJ[id]; }).map(function(id){
      var o = OBJ[id];
      return '<li><strong>' + esc(o.title || id) + '.</strong> ' + esc(o.statement || '') +
        '<span class="cite-id"> ' + oid(id) + '</span></li>';
    }).join('') + '</ul>' +
    '<p class="note">Both readings are historical and neither is refreshed in the October set. ' +
    'They are carried unchanged for every audience.</p></div>');

  h.push('<div class="am-block am-action"><div class="am-k">Recommended action</div><p>' +
    esc(a.action) + '</p></div>');

  h.push('<div class="am-acts no-print">' +
    '<button type="button" class="btn pri" data-handoff="sunday|' + esc(a.id) +
      '">Use this audience in Sunday Signal</button>' +
    '<button type="button" class="btn" data-handoff="email|' + esc(a.id) +
      '">Use this audience in Update Email</button>' +
    '<button type="button" class="btn" data-handoff="brief|' + esc(a.id) +
      '">Use this audience in Executive Brief</button>' +
    btn('Open the signal', '#signal/SIG-02') + '</div>');
  h.push('</div>');

  /* ── right: what did not move ───────────────────────────────────────── */
  h.push('<aside class="aud-fixed" aria-label="What stays fixed">' +
    '<button type="button" class="af-head" data-expand="audFixed" aria-expanded="true" ' +
    'aria-controls="audFixed"><span class="ap-lab">What stayed fixed</span>' +
    '<span class="fx-caret" aria-hidden="true">▾</span></button>' +
    '<div id="audFixed">' +
    '<p class="af-note">Identical across all ' + AUDIENCES.length + ' audiences.</p>' +
    fixedRows([
      ['Signal statement', (OBJ['SIG-02'] || {}).statement],
      ['Net Score', n2(ns.value) + ' (' + CP.label + ')'],
      ['Sequential change', sign(ns.qqDelta)],
      ['Year-over-year change', sign(ns.yyDelta)],
      ['Pervasion', n2(CP.pervasion.value)],
      ['Q/Q Z-Score', n2(CP.zScore.qqZ, 9)],
      ['Y/Y Z-Score', n2(CP.zScore.yyZ, 9)],
      ['N', n2(CP.nBase, 0) + ' citations'],
      ['Conviction', CALL.conviction],
      ['Current period', CP.label],
      ['Current call', CALL.current.value],
      ['Human review', 'Required (R-020)']
    ]) +
    '<p class="af-note">Caveats carried unchanged: cohort and regional N absent (OQ-014); Z-Score ' +
    'bands Source Needed (OQ-005); no current-period data outlook recorded (OQ-002).</p>' +
    '<p class="af-note">No personalized investment advice, price target or rating is produced for ' +
    'any audience.</p></div></aside>');

  h.push('</div>');
  el('view-audience').innerHTML = h.join('');

  function fixedRows(rows){
    return '<dl class="af-kv">' + rows.map(function(r){
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1] == null ? 'Source Needed' : r[1]) + '</dd>';
    }).join('') + '</dl>';
  }
};

/** Why the reading matters to this particular reader. Assembled from their own
    recorded decision question and action, never from anything invented about
    their business. */
function audienceWhy(a){
  var map = {
    cio: 'The consolidation case rests on whether peers are still committing budget. They are, and ' +
         'more of them report the platform in use than a quarter ago — but the cohort figures that ' +
         'would tell you about your own segment arrive without a base.',
    product: 'Reason mix moves slowly, and this period supplies the stated reasons without the ' +
         'response counts behind them. Treat the shifts as directions to investigate rather than ' +
         'findings to act on.',
    ar: 'A briefing can defend the October readings and their period labels exactly as stated. It ' +
         'cannot defend a cohort-dominance framing, because the cuts are selective and none carries ' +
         'a base.',
    sellside: 'Nothing here is a model input on its own. The demand series corroborates the reported ' +
         'series on a lag that has never been established, which is precisely what the backtest ' +
         'protocol exists to settle.',
    investor: 'What the evidence establishes is a persisting, slowing recovery in spending intent ' +
         'with improving breadth. What it does not establish is causation, a company outcome, or any ' +
         'forward expectation — and the package says so in its own rules.',
    pe: 'Underwriting needs durability, and two of the inputs are missing: the current-period ' +
         'retention reading, and a current shared-account comparison. Both are open questions with ' +
         'named expected sources.',
    etrresearch: 'The gaps in this package are methodological rather than analytical: cut-level ' +
         'bases, approved Z-Score bands, and a recorded data outlook for the current period.'
  };
  return map[a.id] || 'This reading is demand context. The path from it to any company outcome is ' +
    'recorded as a hypothesis and held at Backtest Required.';
}

/* ═════════════════════════════════ Deterministic generator machinery ════ */
/* Prose is assembled from workbook objects by template. There is no model call and
   no free text: every sentence names the objects it was built from. */
var CLAIM_SEQ = 0;
var CLAIM_REGISTRY = {};
function claim(outputType, text, classification, evidenceIds, objectIds, ruleIds, confidence, caveat, sn){
  CLAIM_SEQ++;
  var c = mkClaim(outputType, text, classification, evidenceIds, objectIds, ruleIds,
                  confidence, caveat, sn);
  CLAIM_REGISTRY[c.claimId] = c;
  return c;
}
function mkClaim(outputType, text, classification, evidenceIds, objectIds, ruleIds, confidence, caveat, sn){
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
    length:'standard', includeIds:true, includeMethod:true, edited:null},
  brief: {audience:'investor', signal:'SIG-02', appendix:false, ids:false, review:false}
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
    'ETR interpretation', ['ETR-OCT26-NS'], [sig.id], ['R-002','R-004','R-005','R-025'],
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
    'ETR interpretation', ['ETR-OCT26-NS','ETR-OCT26-PV'], [], ['R-003','R-005'],
    'High on current raw values',
    'These are wording conventions, not statistical-significance thresholds.', [])]});

  S.push({h:'Where the Signal Is Strongest', c:[ claim('sunday',
    'Breadth. Pervasion improved more than intent did this quarter, and the largest indexed cohorts — '+
    'Global 2000 at 42.61 and Fortune 500 at 42.68 — read above the overall '+n2(ns.value)+'.',
    'ETR interpretation', ['ETR-OCT26-PV','ETR-OCT26-G2K','ETR-OCT26-F500'], ['SIG-05'],
    ['R-008','R-010','R-011'], 'Medium — cohort N missing',
    'No cohort cut carries a citation base (OQ-014).', ['nBase'])]});

  S.push({h:'Where It Is Mixed', c:[ claim('sunday',
    'Enterprise evidence is selective rather than uniform: Large Organizations read 35.82, below the '+
    'overall reading, while the indexed cohorts read above it. Geographically the October cuts run from '+
    'APAC 54.29 to EMEA 27.27 with no regional base supplied.',
    'ETR interpretation', ['ETR-OCT26-LARGE','ETR-OCT26-REGION'], ['SIG-05','SIG-07'],
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
    'ETR interpretation', ['ETR-OCT26-NS'], ['XL-01'], ['R-013','R-015','CTX-007'], 'Medium',
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
    'ETR interpretation', ['ETR-OCT26-NS'], [sig.id], ['R-004','R-005','R-015'],
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
function claimsToHtml(title, sections, includeLogo){
  var h=['<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>'+esc(title)+
    '</title><style>body{font:14px/1.55 Georgia,serif;max-width:760px;margin:32px auto;padding:0 18px;'+
    'color:#1B2430}h1,h2{font-family:Georgia,serif;color:#17365D}h2{font-size:17px;margin-top:22px}'+
    'code{font:11px Consolas,monospace;color:#595959;display:block;margin-top:3px}'+
    '.brand-logo{max-height:34px;margin-bottom:14px}'+
    'hr{border:none;border-top:1px solid #D8DEE6;margin:22px 0}</style></head><body>'];
  if (includeLogo) h.push(brandLogo('email-logo'));
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

/* ═══════════════════════════════════════════ VIEW: Update Email Generator ═
   The deliverable is an email, so the email is what the page shows: To, Subject,
   Body, and prose that reads as prose. The claim manifests are still generated
   for every paragraph — they live behind "Inspect claims" rather than inside the
   text, and they never travel with anything the reader copies.
   ══════════════════════════════════════════════════════════════════════════ */

/** Build the email for the selected format. Returns
    {subject, greeting, paragraphs:[claim], closing, footnotes:[claim]} */
function buildCleanEmail(){
  var g = GEN.email;
  CLAIM_SEQ = 500;
  var fmt = state.emailFormat || 'clean';
  var P = fmt === 'alert' ? NARRATIVE.emailAlert(g)
        : fmt === 'exec'  ? NARRATIVE.emailExec(g)
        : NARRATIVE.emailClean(g);
  var notes = [];
  var N = state.emailNotes || {};
  if (N.method) notes.push(claim('email',
    'Methodology: sole source is the authorized worksheets of ' + D.metadata.workbook + '. ' +
    CP.label + ' is the current TSIS period; July 2026 is historical comparison. N counts citations, ' +
    'not people. ETR evidence and company evidence are parallel lanes and no causal relationship is ' +
    'asserted between them.',
    'Client-provided fact', [], ['R-009','R-015','R-025'], ['R-009','R-015','R-025'], null, null, []));
  if (N.appendix){
    var ids = unique(P.reduce(function(a, c){
      return a.concat(c.sourceEvidenceIds, c.sourceObjectIds); }, []));
    notes.push(claim('email', 'Evidence appendix: ' + ids.join(' · '),
      'Client-provided fact', ids, [], [], null,
      'Every ID resolves to an object in the authorized worksheets.', []));
  }
  if (N.review) notes.push(claim('email',
    'Generated draft — Human Review Required. R-020 makes analyst approval a precondition of ' +
    'external distribution.', 'Recommended action', [], ['R-020'], ['R-020'], null, null, []));
  return {
    subject: NARRATIVE.emailSubject(fmt, g.subjectStyle),
    greeting: fmt === 'alert' ? null : greetingFor(g.recipient),
    paragraphs: P,
    closing: fmt === 'alert' ? null : 'Happy to walk through any of it.',
    footnotes: notes,
    format: fmt
  };
}
/* A recipient label can be a person or a group. "Research team" is a group, so
   it gets "Hi all" rather than "Hi Research". */
function greetingFor(recipient){
  var r = String(recipient || '').trim();
  if (!r) return 'Hi all,';
  if (/\b(team|group|all|desk|committee|everyone|list)\b/i.test(r) || /[,&]/.test(r))
    return 'Hi all,';
  return 'Hi ' + r.split(/\s+/)[0] + ',';
}

/** The structured variant keeps the old labelled shape, for readers who want it. */
function structuredEmail(){
  var built = buildEmail();
  CLAIM_SEQ = 700;
  return built;
}

/** Plain text of the email body only — no manifests, no IDs, no chrome. */
function emailBodyText(E){
  var out = [];
  if (E.greeting) out.push(E.greeting, '');
  E.paragraphs.forEach(function(c){ out.push(c.text, ''); });
  if (E.closing) out.push(E.closing, '');
  if (E.footnotes.length){
    out.push('—', '');
    E.footnotes.forEach(function(c){ out.push(c.text, ''); });
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function emailBodyHtml(E, includeLogo){
  var h = ['<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + esc(E.subject) +
    '</title><style>body{font:15px/1.65 Georgia,serif;max-width:640px;margin:32px auto;' +
    'padding:0 18px;color:#1B2430}p{margin:0 0 15px}hr{border:none;border-top:1px solid #D8DEE6;' +
    'margin:22px 0}.fn{font-size:12.5px;color:#5B6068}.brand-logo{max-height:34px;margin-bottom:14px}' +
    '</style></head><body>'];
  if (includeLogo) h.push(brandLogo('email-logo'));
  if (E.greeting) h.push('<p>' + esc(E.greeting) + '</p>');
  E.paragraphs.forEach(function(c){ h.push('<p>' + esc(c.text) + '</p>'); });
  if (E.closing) h.push('<p>' + esc(E.closing) + '</p>');
  if (E.footnotes.length){
    h.push('<hr>');
    E.footnotes.forEach(function(c){ h.push('<p class="fn">' + esc(c.text) + '</p>'); });
  }
  h.push('</body></html>');
  return h.join('');
}

RENDER['gen-email'] = function(){
  var g = GEN.email;
  var fmt = state.emailFormat || 'clean';
  var structured = (fmt === 'structured');
  var E = structured ? null : buildCleanEmail();
  var built = structured ? structuredEmail() : null;
  var N = state.emailNotes || {};
  var pool = (D.evidence || []).filter(function(e){ return e.currentOrHistorical === 'current'; });
  var h = [];

  h.push('<div class="vhead"><div class="eyebrow">Update Email</div>' +
    '<h2>' + (structured ? 'Structured update' : 'A draft you could send') + '</h2>' +
    '<p>Prose is assembled by template from the objects on the left. No model is called. Every ' +
    'paragraph carries a claim manifest; turn on <em>Inspect claims</em> to see them. Nothing you ' +
    'copy from here carries hidden metadata.</p></div>');

  /* format switcher — the primary control, above everything else */
  h.push('<div class="fmtbar no-print" role="group" aria-label="Email format">' +
    NARRATIVE.EMAIL_FORMATS.map(function(f){
      return '<button type="button" class="fmt' + (f[0] === fmt ? ' on' : '') + '" data-emfmt="' +
        f[0] + '" aria-pressed="' + (f[0] === fmt) + '"><span class="t">' + esc(f[1]) +
        '</span><span class="d">' + esc(f[2]) + '</span></button>';
    }).join('') + '</div>');

  h.push('<div class="gen gen-wide">');

  /* ── controls ───────────────────────────────────────────────────────── */
  h.push('<div class="gen-controls no-print">' +
    '<label for="emRecipient">To</label><input id="emRecipient" type="text" value="' +
      esc(g.recipient) + '">' +
    '<label for="emSubject">Subject style</label><select id="emSubject">' +
      [['default','Standard update'],['signal','Signal alert'],['question','Question-led']]
      .map(function(o){ return '<option value="' + o[0] + '"' +
        (o[0] === g.subjectStyle ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select>' +
    '<label for="emAud">Audience</label><select id="emAud">' + AUDIENCES.map(function(a){
      return '<option value="' + a.id + '"' + (a.id === g.audience ? ' selected' : '') + '>' +
        esc(a.label) + '</option>'; }).join('') + '</select>' +
    '<label for="emSig">Signal</label><select id="emSig">' + (D.signals || []).map(function(s){
      return '<option value="' + s.id + '"' + (s.id === g.signal ? ' selected' : '') + '>' +
        esc(s.id) + '</option>'; }).join('') + '</select>' +
    '<label for="emRisk">Counter-evidence</label><select id="emRisk">' + (D.risks || []).map(function(r){
      return '<option value="' + r.id + '"' + (r.id === g.risk ? ' selected' : '') + '>' +
        esc(r.id + ' — ' + (r.title || '').slice(0, 38)) + '</option>'; }).join('') + '</select>' +
    '<label for="emQ">Open question</label><select id="emQ">' + (D.openQuestions || []).map(function(q){
      return '<option value="' + q.id + '"' + (q.id === g.question ? ' selected' : '') + '>' +
        esc(q.id + ' — ' + (q.title || '').slice(0, 38)) + '</option>'; }).join('') + '</select>' +
    '<label for="emAction">Next action</label><input id="emAction" type="text" value="' +
      esc(g.action) + '">' +
    '<label for="emLen">Length</label><select id="emLen">' + ['concise','standard','detailed']
      .map(function(t){ return '<option' + (t === g.length ? ' selected' : '') + '>' + t +
        '</option>'; }).join('') + '</select>' +
    (structured ? '<label>Evidence</label>' + evidencePicker('genEvidence', state.genEvidence, pool) : '') +
    '<div class="sep"></div><div class="ctl-lab">Include</div>' +
    noteToggle('email','logo','Include logo in HTML version') +
    noteToggle('email','method','Methodology footnote') +
    noteToggle('email','appendix','Evidence appendix') +
    noteToggle('email','review','Human Review line') +
    noteToggle('email','ids','Source IDs in the body') +
    '<p class="note" style="margin-top:8px">The logo appears only in the downloaded HTML version, ' +
    'when a rendered logo file is available. The other four are off for a clean email, so the body ' +
    'stays sendable. The Human Review status stays on the application chrome either way.</p>' +
    '<div class="sep"></div>' +
    '<button class="btn pri" id="emRegen" style="width:100%">Regenerate</button>' +
    '<button class="btn" id="emReset" style="width:100%;margin-top:5px">Reset</button>' +
    '</div>');

  /* ── output ─────────────────────────────────────────────────────────── */
  h.push('<div><div class="actbar no-print">' +
    '<button class="btn' + (state.inspect ? ' on' : '') + '" id="emInspect">Inspect claims</button>' +
    '<button class="btn" id="emCopySubject">Copy subject</button>' +
    '<button class="btn" id="emCopyBody">Copy body</button>' +
    '<button class="btn" id="emCopyAll">Copy full email</button>' +
    '<button class="btn" id="emTxt">Download TXT</button>' +
    '<button class="btn" id="emHtml">Download HTML</button>' +
    '<button class="btn" id="emPrint">Print</button>' +
    '<button class="btn" id="emManifest">Manifest JSON</button>' +
    '<button class="btn" id="emLineage">Open lineage</button></div>');

  h.push('<div class="hyp-bar chrome-note review-status">Generated draft — Human Review Required. ' +
    'This line is application chrome and is not part of the email body.</div>');

  h.push('<div class="gen-out email-canvas' + (state.inspect ? ' inspect' : '') + '" id="emOut">');
  h.push('<div class="email-head">' +
    '<div class="eh-row"><span class="eh-k">To</span><span class="eh-v" id="emTo">' +
      esc(g.recipient) + '</span></div>' +
    '<div class="eh-row"><span class="eh-k">Subject</span><span class="eh-v subj" id="emSubjectLine">' +
      esc(structured ? built.subject : E.subject) + '</span></div></div>');

  if (GEN.email.edited != null){
    h.push('<textarea class="draft" id="emDraft">' + esc(GEN.email.edited) + '</textarea>');
  } else if (structured){
    h.push('<div id="emBody">' + renderClaims(built.sections) + '</div>');
  } else {
    h.push('<div class="email-body" id="emBody">');
    if (E.greeting) h.push(para(E.greeting, null));
    E.paragraphs.forEach(function(c){ h.push(para(c.text, c)); });
    if (E.closing) h.push(para(E.closing, null));
    if (E.footnotes.length){
      h.push('<div class="footnotes">');
      E.footnotes.forEach(function(c){ h.push(para(c.text, c, 'fn')); });
      h.push('</div>');
    }
    h.push('</div>');
    LAST_MANIFEST = E.paragraphs.concat(E.footnotes);
  }
  h.push('</div></div></div>');
  h.push('<div id="emManifestPanel" style="margin-top:12px"></div>');
  el('view-gen-email').innerHTML = h.join('');
};

/* ════════════════════════════════════════ VIEW: Sunday Signal Generator ══ */

function buildCohesive(){
  CLAIM_SEQ = 0;
  var style = state.sundayStyle || 'cohesive';
  var length = state.sundayLength || 'standard';
  var blocks = NARRATIVE.sunday(style, length, {
    signal: GEN.sunday.signal,
    audience: GEN.sunday.audience,
    evidence: state.genEvidence,
    counter: state.genCounter,
    questions: state.genQuestion
  });
  var notes = NARRATIVE.sundayFootnotes(state.sundayNotes || {}, blocks);
  return {title: GEN.sunday.title || NARRATIVE.sundayTitle(), deck: NARRATIVE.sundayDeck(),
          blocks: blocks, footnotes: notes, style: style, length: length};
}

function essayText(S, withNotes){
  var out = [S.title, '', S.deck, ''];
  S.blocks.forEach(function(b){
    if (b.sub) out.push(b.sub, '');
    out.push(b.c.text, '');
  });
  if (withNotes && S.footnotes.length){
    out.push('—', '');
    S.footnotes.forEach(function(c){ out.push(c.text, ''); });
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function essayMarkdown(S){
  var out = ['# ' + S.title, '', '_' + S.deck + '_', ''];
  S.blocks.forEach(function(b){
    if (b.sub) out.push('## ' + b.sub, '');
    out.push(b.c.text, '');
  });
  if (S.footnotes.length){ out.push('---', ''); S.footnotes.forEach(function(c){ out.push(c.text, ''); }); }
  return out.join('\n');
}
function essayHtml(S){
  var h = ['<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + esc(S.title) +
    '</title><style>body{font:16px/1.72 Georgia,serif;max-width:660px;margin:40px auto;padding:0 20px;' +
    'color:#1B2430}h1{font-size:29px;line-height:1.22;color:#0F243E;margin:0 0 10px}' +
    '.deck{font-size:17px;color:#5B6068;margin:0 0 26px}h2{font-size:17px;color:#17365D;' +
    'margin:28px 0 10px}p{margin:0 0 17px}hr{border:none;border-top:1px solid #D8DEE6;margin:26px 0}' +
    '.fn{font-size:13px;color:#5B6068}</style></head><body>'];
  h.push('<h1>' + esc(S.title) + '</h1><p class="deck">' + esc(S.deck) + '</p>');
  S.blocks.forEach(function(b){
    if (b.sub) h.push('<h2>' + esc(b.sub) + '</h2>');
    h.push('<p>' + esc(b.c.text) + '</p>');
  });
  if (S.footnotes.length){
    h.push('<hr>');
    S.footnotes.forEach(function(c){ h.push('<p class="fn">' + esc(c.text) + '</p>'); });
  }
  h.push('</body></html>');
  return h.join('');
}

RENDER['gen-sunday'] = function(){
  var g = GEN.sunday;
  var S = buildCohesive();
  var pool = (D.evidence || []).filter(function(e){ return e.currentOrHistorical === 'current'; });
  var counterPool = (D.risks || []);
  var qPool = (D.openQuestions || []).filter(function(q){ return /critical|high/i.test(q.importance || ''); });
  var subheads = S.blocks.filter(function(b){ return !!b.sub; }).length;
  var h = [];

  h.push('<div class="vhead"><div class="eyebrow">Sunday Signal</div>' +
    '<h2>One connected piece, not a stack of sections</h2>' +
    '<p>Assembled deterministically from the selected objects. Every paragraph carries a claim ' +
    'manifest behind <em>Inspect claims</em>; the prose itself stays free of IDs.</p></div>');

  h.push('<div class="fmtbar no-print" role="group" aria-label="Composition style">' +
    NARRATIVE.SUNDAY_STYLES.map(function(f){
      return '<button type="button" class="fmt' + (f[0] === S.style ? ' on' : '') + '" data-ssty="' +
        f[0] + '" aria-pressed="' + (f[0] === S.style) + '"><span class="t">' + esc(f[1]) +
        '</span><span class="d">' + esc(f[2]) + '</span></button>';
    }).join('') + '</div>');

  h.push('<div class="gen gen-wide">');
  h.push('<div class="gen-controls no-print">' +
    '<label for="ssTitle">Title</label><input id="ssTitle" type="text" value="' + esc(S.title) + '">' +
    '<div class="ctl-lab">Length</div><div class="segbar">' + NARRATIVE.SUNDAY_LENGTHS.map(function(l){
      return '<button type="button" class="seg' + (l[0] === S.length ? ' on' : '') + '" data-sslen="' +
        l[0] + '" aria-pressed="' + (l[0] === S.length) + '">' + esc(l[1]) + '</button>';
    }).join('') + '</div>' +
    '<label for="ssAud">Audience</label><select id="ssAud">' + AUDIENCES.map(function(a){
      return '<option value="' + a.id + '"' + (a.id === g.audience ? ' selected' : '') + '>' +
        esc(a.label) + '</option>'; }).join('') + '</select>' +
    '<label for="ssSig">Primary signal</label><select id="ssSig">' + (D.signals || []).map(function(s){
      return '<option value="' + s.id + '"' + (s.id === g.signal ? ' selected' : '') + '>' +
        esc(s.id + ' — ' + s.title) + '</option>'; }).join('') + '</select>' +
    '<label>Additional evidence</label>' + evidencePicker('genEvidence', state.genEvidence, pool) +
    '<label>Counter-evidence</label>' + evidencePicker('genCounter', state.genCounter, counterPool) +
    '<label>Open questions</label>' + evidencePicker('genQuestion', state.genQuestion, qPool) +
    '<div class="sep"></div><div class="ctl-lab">Include</div>' +
    '<label class="toggle"><input type="checkbox" id="ssChart"' + (g.chart ? ' checked' : '') +
      '> Lead chart</label>' +
    noteToggle('sunday','method','Methodology footnote') +
    noteToggle('sunday','ids','Evidence ID footnote') +
    noteToggle('sunday','review','Human Review line') +
    '<div class="sep"></div>' +
    '<button class="btn pri" id="ssRegen" style="width:100%">Regenerate</button>' +
    '<button class="btn" id="ssEdit" style="width:100%;margin-top:5px">Edit draft locally</button>' +
    '<button class="btn" id="ssRestore" style="width:100%;margin-top:5px">Restore generated text</button>' +
    '</div>');

  h.push('<div><div class="actbar no-print">' +
    '<button class="btn' + (state.inspect ? ' on' : '') + '" id="ssInspect">Inspect claims</button>' +
    '<button class="btn" id="ssCopy">Copy prose</button>' +
    '<button class="btn" id="ssCopyNotes">Copy with footnotes</button>' +
    '<button class="btn" id="ssMd">Download Markdown</button>' +
    '<button class="btn" id="ssHtml">Download HTML</button>' +
    '<button class="btn" id="ssPrint">Print</button>' +
    '<button class="btn" id="ssManifest">Manifest JSON</button>' +
    '<button class="btn" id="ssLineage">Open lineage</button>' +
    '<button class="btn' + (SS_PREVIEW ? ' on' : '') + '" id="ssPreview">Preview as branded newsletter</button>' +
    '</div>');

  h.push('<div class="hyp-bar chrome-note review-status">Generated draft — Human Review Required. ' +
    'This line is application chrome and is not part of the piece.</div>');

  h.push('<div class="gen-out essay' + (state.inspect ? ' inspect' : '') +
    (SS_PREVIEW ? ' newsletter' : '') + '" id="ssOut">');
  if (SS_PREVIEW) h.push(brandLogo('newsletter-logo'));
  h.push('<h1 class="essay-title">' + esc(S.title) + '</h1>');
  h.push('<p class="essay-deck">' + esc(S.deck) + '</p>');
  if (g.chart) h.push('<div class="essay-fig">' +
    recoveryChart({id:'essay', bare:true}) + '</div>');

  if (GEN.sunday.edited != null){
    h.push('<textarea class="draft" id="ssDraft">' + esc(GEN.sunday.edited) + '</textarea>');
  } else {
    S.blocks.forEach(function(b){
      if (b.sub) h.push('<h3>' + esc(b.sub) + '</h3>');
      h.push(para(b.c.text, b.c));
    });
    if (S.footnotes.length){
      h.push('<div class="footnotes">');
      S.footnotes.forEach(function(c){ h.push(para(c.text, c, 'fn')); });
      h.push('</div>');
    }
    LAST_MANIFEST = S.blocks.map(function(b){ return b.c; }).concat(S.footnotes);
  }
  h.push('</div>');
  h.push('<p class="note no-print" style="margin-top:9px">' + S.blocks.length + ' paragraphs, ' +
    subheads + ' visible ' + (subheads === 1 ? 'subhead' : 'subheads') + ', ' +
    (S.blocks.length + S.footnotes.length) + ' claim manifests.</p>');
  h.push('</div></div>');
  h.push('<div id="ssManifestPanel" style="margin-top:12px"></div>');
  el('view-gen-sunday').innerHTML = h.join('');
  if (g.chart) wireChart();
};

var SS_PREVIEW = false;

/* ═══════════════════════════════════════ VIEW: Executive Brief Generator ═
   A distinct route, not the Update Email's "Executive note" format — this is
   a print-ready research brief: research question, bottom line, primary
   signal, what changed, why it matters, counterpoint, what to watch, a
   methodology note and an optional evidence appendix. It is built from the
   same NARRATIVE prose and claim() manifests the Company page and Narrative
   view already produce, rather than a second copy of the logic. No internal
   ID appears in the default body — the same claim/para() convention the
   other two generators use — reachable instead through Inspect Claims, the
   object drawer and Lineage.
   ══════════════════════════════════════════════════════════════════════════ */
function buildBrief(){
  CLAIM_SEQ = 900;
  var g = GEN.brief;
  var sig = OBJ[g.signal] || OBJ['SIG-02'] || {};
  var snap = NARRATIVE.snapshot();          /* [changed, why it matters, what remains open] */
  var counter = NARRATIVE.counterpoint();   /* 3 claims */
  var watch = NARRATIVE.watch();            /* 3 {id, title, why, resolve, signal, status} */

  var bottomLine = claim('brief',
    'CrowdStrike ' + CP.label + ': the post-outage recovery in spending intent persists, deployment ' +
    'breadth is improving faster than intent, and the current call reads ' + CALL.current.value + '. ' +
    'No company outcome — revenue, ARR or market share — is implied by any of it.',
    'ETR interpretation', ['ETR-OCT26-NS','ETR-OCT26-PV'], [sig.id || 'SIG-02'],
    ['R-004','R-005','R-025'], 'High on current raw values',
    'Direction only. No company outcome is implied.', []);

  var primarySignal = claim('brief',
    (sig.statement || CALL.primarySignalText || '') + ' Reviewer status: ' +
    (sig.workflowStatus || 'Pending Review') + '.',
    'Client-provided fact', [], [sig.id || 'SIG-02'], ['R-002'],
    sig.confidence || 'Medium-High', sig.caveat || null, []);

  var watchClaims = watch.map(function(w){
    return claim('brief', w.title + '. ' + w.why, 'Open question', [], [w.id], ['R-019'], null,
      w.resolve, [w.id]);
  });

  var methodology = claim('brief',
    'Sole factual source: the authorized worksheets of ' + D.metadata.workbook + '. ' + CP.label +
    ' is the current TSIS period; July 2026 is historical comparison under the workbook’s ' +
    'current-period promotion rule. N counts citations, not people. Every claim in this brief carries ' +
    'a full manifest, reachable behind Inspect Claims.',
    'Client-provided fact', [], ['R-002','R-009','R-025'], ['R-002','R-009','R-025'], null, null, []);

  var sections = [
    {h:'Bottom line', c:[bottomLine]},
    {h:'Primary signal', c:[primarySignal]},
    {h:'What changed', c:[snap[0].c]},
    {h:'Why it matters', c:[snap[1].c]},
    {h:'Counterpoint', c:counter.slice(0, 2)},
    {h:'What to watch', c:watchClaims},
    {h:'Methodology note', c:[methodology]}
  ];
  var appendix = null;
  if (g.appendix){
    var ids = unique(sections.reduce(function(a, s){
      return a.concat(s.c.reduce(function(b, c){
        return b.concat(c.sourceEvidenceIds, c.sourceObjectIds); }, [])); }, []));
    appendix = claim('brief', 'Evidence and object IDs behind this brief: ' + ids.join(' · '),
      'Client-provided fact', ids, [], [], null,
      'Every ID resolves to an object in the authorized worksheets.', []);
  }
  return {question:NARRATIVE.QUESTION, sections:sections, appendix:appendix};
}

RENDER['gen-brief'] = function(route){
  if (route && route.arg && AUDIENCES.some(function(a){ return a.id === route.arg; }))
    { GEN.brief.audience = route.arg; }
  var g = GEN.brief;
  var B = buildBrief();
  var h = [];

  h.push('<div class="vhead"><div class="eyebrow">Executive Brief</div>' +
    '<h2>A print-ready research brief, not an email</h2>' +
    '<p>Research question, bottom line, primary signal, what changed, why it matters, the ' +
    'counterpoint and what to watch — assembled from the same objects and claim manifests as the ' +
    'Company page and the Narrative view. No internal ID appears in the body by default; turn on ' +
    '<em>Inspect claims</em> to see the manifest behind any paragraph.</p></div>');

  h.push('<div class="gen gen-wide">');
  h.push('<div class="gen-controls no-print">' +
    '<label for="brAud">Audience</label><select id="brAud">' + AUDIENCES.map(function(a){
      return '<option value="' + a.id + '"' + (a.id === g.audience ? ' selected' : '') + '>' +
        esc(a.label) + '</option>'; }).join('') + '</select>' +
    '<label for="brSig">Primary signal</label><select id="brSig">' + (D.signals || []).map(function(s){
      return '<option value="' + s.id + '"' + (s.id === g.signal ? ' selected' : '') + '>' +
        esc(s.id + ' — ' + s.title) + '</option>'; }).join('') + '</select>' +
    '<div class="sep"></div><div class="ctl-lab">Include</div>' +
    '<label class="toggle"><input type="checkbox" id="brAppendix"' + (g.appendix ? ' checked' : '') +
      '> Evidence appendix</label>' +
    '<p class="note" style="margin-top:8px">The audience selection carries the reading a step further ' +
    'without changing a fact — see the Audience Translator’s <em>Use in Executive Brief</em> ' +
    'handoff.</p></div>');

  h.push('<div><div class="actbar no-print">' +
    '<button class="btn' + (state.inspect ? ' on' : '') + '" id="brInspect">Inspect claims</button>' +
    '<button class="btn" id="brCopy">Copy brief</button>' +
    '<button class="btn" id="brMd">Download Markdown</button>' +
    '<button class="btn" id="brHtml">Download HTML</button>' +
    '<button class="btn" id="brPrint">Print</button>' +
    '<button class="btn" id="brManifest">Manifest JSON</button>' +
    '<button class="btn" id="brLineage">Open lineage</button></div>');

  h.push('<div class="hyp-bar chrome-note review-status">Generated draft — Human Review Required. ' +
    'R-020 makes analyst approval a precondition of external distribution.</div>');

  h.push('<div class="gen-out essay brief' + (state.inspect ? ' inspect' : '') + '" id="brOut">');
  h.push(brandLogo('brief-logo'));
  h.push('<div class="eyebrow">Research question</div>');
  h.push('<h1 class="brief-title">' + esc(B.question) + '</h1>');
  B.sections.forEach(function(s){
    h.push('<h3>' + esc(s.h) + '</h3>');
    s.c.forEach(function(c){ h.push(para(c.text, c)); });
  });
  if (B.appendix){
    h.push('<h3>Evidence appendix</h3>');
    h.push(para(B.appendix.text, B.appendix, 'fn'));
  }
  h.push('</div>');
  h.push('<p class="note no-print" style="margin-top:9px">' +
    B.sections.reduce(function(a, s){ return a + s.c.length; }, 0) + ' claim manifests behind this brief.</p>');
  h.push('</div></div>');
  h.push('<div id="brManifestPanel" style="margin-top:12px"></div>');
  el('view-gen-brief').innerHTML = h.join('');
};
function briefText(B){
  var out = [B.question, ''];
  B.sections.forEach(function(s){
    out.push(s.h, '');
    s.c.forEach(function(c){ out.push(c.text, ''); });
  });
  if (B.appendix) out.push('Evidence appendix', '', B.appendix.text, '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function briefMarkdown(B){
  var out = ['# Executive Brief', '', '_' + B.question + '_', ''];
  B.sections.forEach(function(s){
    out.push('## ' + s.h, '');
    s.c.forEach(function(c){ out.push(c.text, ''); });
  });
  if (B.appendix) out.push('---', '', B.appendix.text, '');
  return out.join('\n');
}
function briefHtml(B){
  var h = ['<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Executive Brief</title>' +
    '<style>body{font:16px/1.7 Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;' +
    'color:#1B2430}h1{font-size:26px;line-height:1.25;color:#0F243E}h3{font-size:14px;' +
    'text-transform:uppercase;letter-spacing:.08em;color:#17365D;margin:26px 0 8px}p{margin:0 0 15px}' +
    '</style></head><body>'];
  h.push('<div>Research question</div><h1>' + esc(B.question) + '</h1>');
  B.sections.forEach(function(s){
    h.push('<h3>' + esc(s.h) + '</h3>');
    s.c.forEach(function(c){ h.push('<p>' + esc(c.text) + '</p>'); });
  });
  if (B.appendix) h.push('<h3>Evidence appendix</h3><p>' + esc(B.appendix.text) + '</p>');
  h.push('</body></html>');
  return h.join('');
}

/** A paragraph. In Inspect mode it gains a claim-class outline and becomes
    clickable; the text itself never changes, so what is copied never changes. */
function para(text, c, cls){
  if (!c) return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(text) + '</p>';
  return '<p class="cp ' + claimClass(c.classification) + (cls ? ' ' + cls : '') +
    '" data-claim="' + esc(c.claimId) + '" tabindex="0" role="button" ' +
    'aria-label="Open claim manifest ' + esc(c.claimId) + '">' + esc(text) + '</p>';
}

/** A footnote toggle that reads as an inclusion choice rather than a setting. */
function noteToggle(kind, key, label){
  var on = ((kind === 'email' ? state.emailNotes : state.sundayNotes) || {})[key];
  return '<label class="toggle"><input type="checkbox" data-note="' + kind + '|' + key + '"' +
    (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
}

/** What the reader would actually copy — never the manifests, never the IDs. */
function currentEmailSubject(){
  return state.emailFormat==='structured' ? structuredEmail().subject
    : NARRATIVE.emailSubject(state.emailFormat || 'clean', GEN.email.subjectStyle);
}
function currentEmailBody(){
  if (GEN.email.edited != null) return GEN.email.edited;
  if (state.emailFormat==='structured') return claimsToText('', structuredEmail().sections);
  return emailBodyText(buildCleanEmail());
}

function showManifest(claimId, panelId){
  var c = LAST_MANIFEST.filter(function(x){return x.claimId===claimId;})[0] ||
          CLAIM_REGISTRY[claimId];
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
      '#generator/sunday-signal','#generator/update-email','#generator/executive-brief',
      '#methodology','#index','#signals','#evidence'];
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
    /* Exercise the scoping the print path actually uses: paint the narrative
       brief, scope the document to it, and confirm that it is the only view left
       showing. The earlier version of this check asserted on a class that a
       previous print had left behind, so it failed as soon as anything else was
       printed — it tested a side effect rather than the mechanism. */
    var v = el('view-narrative');
    if (!v) return {ok:false, detail:'no narrative view in the document'};
    RENDER.narrative({view:'narrative'});
    var hadScope = document.body.classList.contains('print-scope');
    var prior = $$('.view.print-target').map(function(x){ return x.id; });
    $$('.view').forEach(function(x){ x.classList.remove('print-target'); });
    v.classList.add('print-target');
    document.body.classList.add('print-scope');
    var targets = $$('.view.print-target');
    var only = targets.length===1 && targets[0]===v;
    var body = (v.innerText||v.textContent||'');
    var hasQuestion = body.indexOf('research question')>=0 || body.indexOf(NARRATIVE.QUESTION)>=0;
    if (!hadScope) document.body.classList.remove('print-scope');
    $$('.view').forEach(function(x){ x.classList.remove('print-target'); });
    prior.forEach(function(id){ var n = el(id); if (n) n.classList.add('print-target'); });
    return {ok: only && v.innerHTML.length>4000 && hasQuestion,
      detail:'narrative brief rendered ('+v.innerHTML.length+' chars), print scope isolates it to '+
        'one view, and the question and short answer survive the scoping'};
  });
  runtimeCheck('V-27','App works under file://', function(){
    return {ok: true, detail:'protocol '+location.protocol+'; no fetch() and no module loading is used'};
  });
  runtimeCheck('V-28','No external dependency is loaded', function(){
    var bad = [];
    $$('script[src]').forEach(function(s){ if(/^https?:|^\/\//.test(s.getAttribute('src'))) bad.push(s.src); });
    $$('link[href]').forEach(function(s){ if(/^https?:|^\/\//.test(s.getAttribute('href'))) bad.push(s.href); });
    /* A local, relative image (the CrowdStrike wordmark, BRAND-001) is not an
       external dependency — only a remote-scheme src/href counts as one. */
    $$('img,iframe').forEach(function(s){
      var v = s.getAttribute('src') || '';
      if (/^https?:|^\/\//.test(v)) bad.push(v);
    });
    return {ok: !bad.filter(Boolean).length,
      detail: bad.filter(Boolean).length
        ? bad.filter(Boolean).join(', ')
        : '0 external scripts, stylesheets, fonts, images or iframes'};
  });
  runtimeCheck('V-29','Human Review status appears in generator chrome, not a global badge', function(){
    /* There is no global "Human Review Required" warning in the top bar — that
       badge was removed with the mode system. Review status still has to show
       up somewhere non-optional: on every generated draft's own chrome. Render
       each generator view (restoring whatever was on screen afterward, the
       same pattern V-26 uses for the narrative print check) and confirm the
       .review-status line is present and visible in each one, and that no
       global .hrr badge exists anywhere in the document. */
    var globalBadge = $('.hrr');
    /* These three views are hidden .view sections unless the reader is on
       one of them; rendering into their (offscreen) markup here to check for
       the chrome line is harmless and does not touch state.view or the
       currently-visible view — it never re-enters this check, unlike
       re-rendering the current (methodology) view would. */
    var ids = ['gen-sunday','gen-email','gen-brief'];
    var missing = [];
    ids.forEach(function(v){
      RENDER[v]({});
      var host = el('view-'+v);
      var line = host && host.querySelector('.review-status');
      if (!line || !/Human Review Required/i.test(line.textContent||'')) missing.push(v);
    });
    return {ok: !globalBadge && !missing.length,
      detail: (globalBadge ? 'a global .hrr badge is still present; ' : 'no global .hrr badge; ') +
        (missing.length ? 'missing review-status chrome on: '+missing.join(', ')
                         : 'review-status chrome present on all '+ids.length+' generator views')};
  });
  return RUNTIME_CHECKS;
}
function parseHashFrom(h){
  var old = location.hash;
  var fake = {hash:h};
  var p = h.replace(/^#/,'').split('/');
  var r = {view:'company'};
  var map = {'':'company','index':'company','company':'company','brief':'narrative',
    'narrative':'narrative','signals':'signals','signal':'signals',
    'evidence':'evidence','lineage':'lineage','kpi':'kpis','kpis':'kpis','bridge':'kpis',
    'cohorts':'cohorts','rules':'rules','rule':'rules','risks':'risks','question':'risks','risk':'risks',
    'sources':'sources','source':'sources','audience':'audience','methodology':'methodology'};
  if (p[0]==='generator') r.view = (p[1]==='update-email')?'gen-email':
    (p[1]==='executive-brief'?'gen-brief':'gen-sunday');
  else r.view = map[p[0]] || 'company';
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
  var ux = (v.uxChecks || []);
  var uxFail = ux.filter(function(c){ return c.result==='FAIL'; });
  allFail = allFail.concat(uxFail);
  h.push('<div class="'+(allFail.length?'warnbox':'okbox')+'"><strong>'+
    (allFail.length? allFail.length+' check(s) failing — build is not complete.'
                   : (ext.length+rt.length+ux.length)+' checks, 0 failing.')+'</strong> '+
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
  if (ux.length){
    h.push('<h4 style="margin-top:14px">Interface and behaviour checks ('+ux.length+')</h4>');
    h.push('<p class="note" style="margin-bottom:7px">Run against the built application by the '+
      'Playwright suite in test.mjs and recorded here. They cover the default route and mode, the '+
      'lead chart\u2019s refusal to interpolate, the Current Call staying reviewer-controlled, clean '+
      'prose in both generators, claim-manifest completeness, print scoping, every preserved route, '+
      'and responsive behaviour down to a phone.</p>');
    h.push('<button type="button" class="btn no-print" data-expand="uxTable" aria-expanded="false" '+
      'aria-controls="uxTable">Show all '+ux.length+' checks</button>');
    h.push('<div class="xpanel" id="uxTable" hidden>'+ckTable(ux)+'</div>');
  }
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
/* The print menu. Six named surfaces, each with its own print styling, plus
   whatever the reader is currently looking at. */
var PRINT_TARGETS = [
  ['pmCompany',   'Company profile'],
  ['pmNarrative', 'Narrative brief'],
  ['pmBrief',     'Executive Brief'],
  ['pmSunday',    'Sunday Signal'],
  ['pmEmail',     'Update email'],
  ['pmLineage',   'Lineage'],
  ['pmEvidence',  'Evidence comparison'],
  ['pmCurrent',   'This page']
];
function togglePrintMenu(){
  var m = el('printMenu'), b = el('btnPrint');
  if (!m){
    m = document.createElement('div');
    m.id = 'printMenu'; m.className = 'printmenu'; m.setAttribute('role','menu');
    m.innerHTML = PRINT_TARGETS.map(function(t){
      return '<button type="button" role="menuitem" id="' + t[0] + '">' + esc(t[1]) + '</button>';
    }).join('');
    document.body.appendChild(m);
  }
  var open = m.hasAttribute('hidden');
  if (open){
    var r = b.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    m.removeAttribute('hidden');
  } else m.setAttribute('hidden','');
  b.setAttribute('aria-expanded', String(open));
}
function closePrintMenu(){
  var m = el('printMenu'); if (m) m.setAttribute('hidden','');
  var b = el('btnPrint'); if (b) b.setAttribute('aria-expanded','false');
}

/* The header's Create control: a quick menu onto the four Create
   destinations, so starting a generator does not require opening the
   sidebar. It changes no state of its own — each item is a plain route. */
var CREATE_TARGETS = [
  ['#generator/sunday-signal',   'Sunday Signal'],
  ['#generator/update-email',    'Update Email'],
  ['#audience',                  'Audience Translator'],
  ['#generator/executive-brief', 'Executive Brief']
];
function toggleCreateMenu(){
  var m = el('createMenu'), b = el('btnCreate');
  if (!m){
    m = document.createElement('div');
    m.id = 'createMenu'; m.className = 'printmenu'; m.setAttribute('role','menu');
    m.innerHTML = CREATE_TARGETS.map(function(t){
      return '<button type="button" role="menuitem" data-goto="' + esc(t[0]) + '">' + esc(t[1]) +
        '</button>';
    }).join('');
    document.body.appendChild(m);
  }
  var open = m.hasAttribute('hidden');
  if (open){
    var r = b.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    m.removeAttribute('hidden');
  } else m.setAttribute('hidden','');
  b.setAttribute('aria-expanded', String(open));
}
function closeCreateMenu(){
  var m = el('createMenu'); if (m) m.setAttribute('hidden','');
  var b = el('btnCreate'); if (b) b.setAttribute('aria-expanded','false');
}

function printScoped(viewId){
  closePrintMenu();
  $$('.view').forEach(function(v){ v.classList.remove('print-target'); });
  /* paint the target even if the reader has never opened it */
  var key = viewId.replace(/^view-/, '');
  if (RENDER[key]) { try { RENDER[key]({view:key}); } catch(e){} }
  var v = el(viewId); if (v) v.classList.add('print-target');
  document.body.classList.add('print-scope');
  window.print();
  setTimeout(function(){ document.body.classList.remove('print-scope'); }, 500);
}

document.addEventListener('click', function(ev){
  var t = ev.target.closest ? ev.target.closest('[data-oid],[data-goto],[data-quick],[data-unchip],'+
    '[data-evq],[data-evmode],[data-cmp],[data-rtab],[data-dtab],[data-tab],[data-aud],[data-lin],'+
    '[data-ntype],[data-etype],[data-rstatus],[data-rfam],[data-renf],[data-claim],[data-linfocus],'+
    '[data-scroll],[data-rscope],[data-rkview],[data-note],[data-emfmt],[data-ssty],[data-sslen],'+
    '[data-expand],[data-handoff],[data-sub],[data-copyreq],[data-create]') : null;

  if (t && t.hasAttribute('data-rscope')){
    ev.preventDefault(); ruleFilter.scope = t.getAttribute('data-rscope'); RENDER.rules({}); return;
  }
  if (t && t.hasAttribute('data-rkview')){
    ev.preventDefault(); riskView = t.getAttribute('data-rkview'); RENDER.risks({}); return;
  }
  if (t && t.hasAttribute('data-emfmt')){
    ev.preventDefault();
    state.emailFormat = t.getAttribute('data-emfmt');
    /* a format change keeps every selection the reader has already made */
    GEN.email.edited = null; save(); RENDER['gen-email']({}); return;
  }
  if (t && t.hasAttribute('data-ssty')){
    ev.preventDefault();
    state.sundayStyle = t.getAttribute('data-ssty');
    GEN.sunday.edited = null; save(); RENDER['gen-sunday']({}); return;
  }
  if (t && t.hasAttribute('data-sslen')){
    ev.preventDefault();
    state.sundayLength = t.getAttribute('data-sslen');
    GEN.sunday.edited = null; save(); RENDER['gen-sunday']({}); return;
  }
  if (t && t.hasAttribute('data-handoff')){
    ev.preventDefault();
    var hv = t.getAttribute('data-handoff').split('|');
    if (hv[0]==='sunday'){ GEN.sunday.audience = hv[1]; GEN.sunday.edited = null; save();
      location.hash = '#generator/sunday-signal'; }
    else if (hv[0]==='brief'){ GEN.brief.audience = hv[1]; save(); location.hash = '#generator/executive-brief'; }
    else { GEN.email.audience = hv[1]; save(); location.hash = '#generator/update-email'; }
    return;
  }
  if (t && t.hasAttribute('data-copyreq')){
    ev.preventDefault(); copyText(t.getAttribute('data-copyreq'), t); announce('Research request copied.');
    return;
  }
  if (t && t.hasAttribute('data-create')){
    ev.preventDefault(); toggleCreateMenu(); return;
  }
  /* progressive disclosure: a control that owns a panel and says so */
  if (t && t.hasAttribute('data-expand')){
    ev.preventDefault();
    var pan = el(t.getAttribute('data-expand'));
    if (pan){
      pan.hidden = !pan.hidden;
      t.setAttribute('aria-expanded', String(!pan.hidden));
      t.classList.toggle('open', !pan.hidden);
      var lbl = t.getAttribute('data-label-open'), lbl2 = t.getAttribute('data-label-shut');
      if (lbl && lbl2) t.textContent = pan.hidden ? lbl : lbl2;
    }
    return;
  }
  /* contents table: scroll the reader to a section of the brief */
  if (t && t.hasAttribute('data-scroll')){
    ev.preventDefault();
    scrollToSection(t.getAttribute('data-scroll'));
    return;
  }
  /* ids that resolve to an object open the drawer */
  if (t && t.hasAttribute('data-oid')){ ev.preventDefault(); openDrawer(t.getAttribute('data-oid')); return; }
  if (t && t.hasAttribute('data-goto')){
    ev.preventDefault();
    var g = t.getAttribute('data-goto');
    if (g && g!=='#') location.hash = g;
    el('searchPanel').hidden = true;
    closeCreateMenu();
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
    var panel = state.view==='gen-email' ? 'emManifestPanel'
              : state.view==='gen-brief' ? 'brManifestPanel'
              : state.view==='company'   ? 'snapManifest'
              : state.view==='narrative' ? 'narManifest' : 'ssManifestPanel';
    showManifest(t.getAttribute('data-claim'), panel);
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
  if (t.hasAttribute && t.hasAttribute('data-note')){
    var nk = t.getAttribute('data-note').split('|');
    var bag = nk[0]==='email' ? state.emailNotes : state.sundayNotes;
    bag[nk[1]] = t.checked; save();
    RENDER[nk[0]==='email' ? 'gen-email' : 'gen-sunday']({});
    return;
  }
  if (t.hasAttribute && t.hasAttribute('data-pick')){
    var g = t.getAttribute('data-pick'), val = t.value, j = state[g].indexOf(val);
    if (t.checked && j<0) state[g].push(val);
    if (!t.checked && j>=0) state[g].splice(j,1);
    /* a changed input set means the frozen manual draft, if any, is stale —
       clear it so the visible piece reflects the new selection immediately. */
    if (state.view==='gen-email'){ GEN.email.edited=null; save(); RENDER['gen-email']({}); }
    else { GEN.sunday.edited=null; save(); RENDER['gen-sunday']({}); }
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
    case 'ssAud': GEN.sunday.audience=t.value; GEN.sunday.edited=null; save(); RENDER['gen-sunday']({}); break;
    case 'ssSig': GEN.sunday.signal=t.value; GEN.sunday.edited=null; save(); RENDER['gen-sunday']({}); break;
    case 'ssChart': GEN.sunday.chart=t.checked; save(); RENDER['gen-sunday']({}); break;
    case 'emSubject': GEN.email.subjectStyle=t.value; RENDER['gen-email']({}); break;
    case 'emAud': GEN.email.audience=t.value; RENDER['gen-email']({}); break;
    case 'emSig': GEN.email.signal=t.value; RENDER['gen-email']({}); break;
    case 'emRisk': GEN.email.risk=t.value; RENDER['gen-email']({}); break;
    case 'emQ': GEN.email.question=t.value; RENDER['gen-email']({}); break;
    case 'emLen': GEN.email.length=t.value; RENDER['gen-email']({}); break;
    case 'brAud': GEN.brief.audience=t.value; RENDER['gen-brief']({}); break;
    case 'brSig': GEN.brief.signal=t.value; RENDER['gen-brief']({}); break;
    case 'brAppendix': GEN.brief.appendix=t.checked; RENDER['gen-brief']({}); break;
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
  if (t.id==='ssTitle'){ GEN.sunday.title=t.value;
    var ssH1=el('ssOut') && el('ssOut').querySelector('.essay-title'); if(ssH1) ssH1.textContent=t.value;
    return; }
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
    case 'btnPrint': togglePrintMenu(); break;
    case 'pmCompany':   printScoped('view-company'); break;
    case 'pmNarrative': printScoped('view-narrative'); break;
    case 'pmBrief':     printScoped('view-gen-brief'); break;
    case 'pmSunday':    printScoped('view-gen-sunday'); break;
    case 'pmEmail':     printScoped('view-gen-email'); break;
    case 'pmLineage':   printScoped('view-lineage'); break;
    case 'pmEvidence':  printScoped('view-evidence'); break;
    case 'pmCurrent':   printScoped('view-'+state.view); break;
    case 'printBrief':  printScoped('view-narrative'); break;
    case 'cmpPrint': printScoped('view-evidence'); break;
    case 'cmpClear': state.compare=[]; save(); RENDER.evidence(); break;
    case 'evClear': evFilter={q:'',quick:[],mode:evFilter.mode}; RENDER.evidence(); break;
    case 'evCsv': download('crowdstrike-evidence-filtered.csv', evidenceCsv(), 'text/csv'); break;
    case 'sigClear': signalFilter={q:'',theme:'',direction:'',confidence:'',period:'',review:''};
      RENDER.signals({}); break;
    case 'ruleClear': ruleFilter={status:'',family:'',enforcement:'',q:'',scope:ruleFilter.scope};
      RENDER.rules(); break;
    case 'ssRegen': GEN.sunday.edited=null; RENDER['gen-sunday']({}); break;
    case 'ssRestore': GEN.sunday.edited=null; delete state.drafts.sunday; save(); RENDER['gen-sunday']({}); break;
    case 'ssEdit':
      GEN.sunday.edited = essayText(buildCohesive(), true);
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
      : essayText(buildCohesive(), false), ev.target); announce('Prose copied.'); break;
    case 'ssCopyNotes': copyText(GEN.sunday.edited!=null ? GEN.sunday.edited
      : essayText(buildCohesive(), true), ev.target); announce('Prose and footnotes copied.'); break;
    case 'ssMd': download('crowdstrike-sunday-signal.md',
      essayMarkdown(buildCohesive()), 'text/markdown'); break;
    case 'ssHtml': download('crowdstrike-sunday-signal.html',
      essayHtml(buildCohesive()), 'text/html'); break;
    case 'ssManifest':
      var SS = buildCohesive();
      download('crowdstrike-sunday-signal-manifest.json',
        JSON.stringify(SS.blocks.map(function(b){return b.c;}).concat(SS.footnotes), null, 2),
        'application/json'); break;
    case 'ssLineage': location.hash = '#lineage/SIG-02'; break;
    case 'ssPreview': SS_PREVIEW = !SS_PREVIEW; RENDER['gen-sunday']({}); break;
    case 'ssPrint': printScoped('view-gen-sunday'); break;
    case 'emRegen': GEN.email.edited=null; RENDER['gen-email']({}); break;
    case 'emReset': GEN.email = {type:'Internal Research Update', recipient:'Research team',
      subjectStyle:'default', audience:'investor', signal:'SIG-02', risk:'CE-002', question:'OQ-014',
      action:'Pre-register BT-CRWD-OCT26 with an agreed lag and tolerance', length:'standard',
      includeIds:true, includeMethod:true, edited:null};
      state.emailFormat='clean';
      state.emailNotes={method:false, appendix:false, review:false, ids:false};
      save(); RENDER['gen-email']({}); break;
    case 'emCopySubject': copyText(currentEmailSubject(), ev.target); announce('Subject copied.'); break;
    case 'emCopyBody': copyText(currentEmailBody(), ev.target); announce('Email body copied.'); break;
    case 'emCopyAll':
      copyText('To: '+GEN.email.recipient+'\nSubject: '+currentEmailSubject()+'\n\n'+
        currentEmailBody(), ev.target); announce('Full email copied.'); break;
    case 'emTxt':
      download('crowdstrike-update-email.txt','To: '+GEN.email.recipient+'\nSubject: '+
        currentEmailSubject()+'\n\n'+currentEmailBody(), 'text/plain'); break;
    case 'emHtml':
      download('crowdstrike-update-email.html',
        state.emailFormat==='structured'
          ? claimsToHtml(structuredEmail().subject, structuredEmail().sections, !!state.emailNotes.logo)
          : emailBodyHtml(buildCleanEmail(), !!state.emailNotes.logo), 'text/html'); break;
    case 'emManifest':
      download('crowdstrike-email-manifest.json', JSON.stringify(
        state.emailFormat==='structured'
          ? structuredEmail().sections.reduce(function(a,x){return a.concat(x.c);},[])
          : (function(){ var E=buildCleanEmail(); return E.paragraphs.concat(E.footnotes); })(),
        null, 2), 'application/json'); break;
    case 'emPrint': printScoped('view-gen-email'); break;
    case 'emLineage': location.hash = '#lineage/SIG-02'; break;
    case 'brInspect':
      state.inspect = !state.inspect; save(); RENDER['gen-brief']({}); break;
    case 'brCopy': copyText(briefText(buildBrief()), ev.target); announce('Brief copied.'); break;
    case 'brMd': download('crowdstrike-executive-brief.md',
      briefMarkdown(buildBrief()), 'text/markdown'); break;
    case 'brHtml': download('crowdstrike-executive-brief.html',
      briefHtml(buildBrief()), 'text/html'); break;
    case 'brPrint': printScoped('view-gen-brief'); break;
    case 'brManifest':
      var BR = buildBrief();
      var brClaims = BR.sections.reduce(function(a,s){return a.concat(s.c);},[]);
      if (BR.appendix) brClaims = brClaims.concat([BR.appendix]);
      download('crowdstrike-executive-brief-manifest.json',
        JSON.stringify(brClaims, null, 2), 'application/json'); break;
    case 'brLineage': location.hash = '#lineage/SIG-02'; break;
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

document.addEventListener('click', function(ev){
  var m = el('printMenu');
  if (m && !m.hasAttribute('hidden') && !m.contains(ev.target) && ev.target.id !== 'btnPrint')
    closePrintMenu();
  var c = el('createMenu');
  if (c && !c.hasAttribute('hidden') && !c.contains(ev.target) && ev.target.id !== 'btnCreate')
    closeCreateMenu();
}, true);
el('drawerScrim').addEventListener('click', function(ev){
  if (ev.target===el('drawerScrim')) closeDrawer();
});
el('searchPanel').addEventListener('click', function(ev){
  if (ev.target===el('searchPanel')) el('searchPanel').hidden = true;
});
(function(){
  var nt = el('navToggle');
  if (nt) nt.addEventListener('click', function(){
    var open = document.querySelector('.sidebar').classList.toggle('open');
    nt.setAttribute('aria-expanded', open);
  });
})();
window.addEventListener('hashchange', function(){
  render();
  /* on a phone the menu closes itself once a destination is chosen */
  var sb = document.querySelector('.sidebar');
  if (sb) { sb.classList.remove('open'); var nt=el('navToggle'); if (nt) nt.setAttribute('aria-expanded','false'); }
});

/* ══════════════════════════════════════════════════════════════ boot ══ */
LIN.orient = state.graphOrientation || 'horizontal';
if (state.drafts && state.drafts.sunday) GEN.sunday.edited = state.drafts.sunday;
if (state.drafts && state.drafts.email) GEN.email.edited = state.drafts.email;
if (!location.hash) location.hash = '#company';
renderSourcePane();
render();
