/* ══════════════════════════════════════════════════════════════════════════
   narrative-templates.js — deterministic prose assembly.

   Every paragraph in the Company page, the Narrative view, the Update Email and
   the Sunday Signal is built here, by template, from objects that already exist
   in the extracted workbook. There is no model call, no network call and no free
   text. Each paragraph is returned as a claim object carrying its own manifest,
   so prose that reads as prose still traces to the evidence behind it.

   This file is loaded before app.js and uses its globals (claim, CP, OBJ, D,
   CALL, n2, sign, moveWord, unique) at call time, never at load time.
   ══════════════════════════════════════════════════════════════════════════ */

var NARRATIVE = {};

/* ─────────────────────────────────────────────────────────── small helpers ── */

/** The numbers every template opens from, read fresh so filters and rebuilds
    are always reflected. Nothing here is stored or cached. */
/** The spending-intent split, said plainly. The workbook supplies it only for
    the subsample cut that belongs to the archived October reading, so for the
    canonical observation it is reported as not supplied rather than carried
    across from a reading that no longer stands. */
function intentSentence(){
  var it = (CP && CP.intent) || {};
  if (it.supplied === false || it.increase == null)
    return 'The spending-intent split (adopting, increasing, flat, decreasing, replacing) is not ' +
           'supplied for this observation, so the composition behind the Net Score is not shown.';
  return 'The intent split runs ' + n2(it.increase) + '% increasing and ' + n2(it.adoption) +
         '% adopting against ' + n2(it.decrease) + '% decreasing and ' + n2(it.replacing) +
         '% replacing, with ' + n2(it.flat) + '% flat.';
}

function NV(){
  return {
    ns: CP.netScore, pv: CP.pervasion, z: CP.zScore, it: CP.intent,
    n:  CP.nBase, period: CP.label, shortPeriod: CP.shortLabel,
    prior: (D.historicalPeriods||[])[0] || {},
    yearAgo: (D.historicalPeriods||[])[1] || {}
  };
}

/** A named cohort cut, read out of the supplied subsample table rather than
    retyped. The evidence objects carry these figures inside a formatted string
    ("42.61 / 58.55"), so the raw table is the reliable place to read a number. */
function NCUT(category, field){
  var rows = ((D.rawTables || {}).subsampleCuts || {rows:[]}).rows;
  for (var i = 0; i < rows.length; i++){
    if (rows[i].Category === category){
      var v = rows[i][field || 'Net Score'];
      return (v == null || v === '') ? null : Number(v);
    }
  }
  return null;
}

/** A regional cut for the current period. The region table is keyed by period
    label across its columns. */
function NREGION(){
  var rows = ((D.rawTables || {}).region || {rows:[]}).rows;
  var col = CP.label in (rows[0] || {}) ? CP.label
          : (CP.shortLabel in (rows[0] || {}) ? CP.shortLabel : null);
  if (!col) return [];
  return rows.filter(function(r){ return r[col] != null && r[col] !== ''; })
    .map(function(r){ return {k:r.Category, v:Number(r[col])}; })
    .sort(function(a, b){ return b.v - a.v; });
}

/** A number, or the words that stand in for one. Never a blank and never a zero
    standing in for an absent value. */
function orNum(v, dp){ return v == null || isNaN(v) ? 'Source Needed' : n2(v, dp); }

/* ══════════════════════════════════════════ COMPANY — hero and narrative ══ */

/** The one-line headline. Built from the primary signal's own direction words,
    not written independently of the data layer. */
NARRATIVE.companyHeadline = function(){
  var v = NV();
  var breadthLed = (v.pv.qqDelta != null && v.ns.qqDelta != null &&
                    v.pv.qqDelta > v.ns.qqDelta);
  if (breadthLed)
    return 'Recovery is still building — but breadth is improving faster than spending intent.';
  return 'Recovery is still building, and spending intent is carrying it.';
};

/** Two or three sentences, assembled from the governed primary-signal object. */
NARRATIVE.companyDeck = function(){
  var v = NV(), sig = OBJ[CALL.primarySignalId] || {};
  return claim('company',
    'CrowdStrike’s ' + v.period + ' spending intent reads ' + n2(v.ns.value) + ' on ' +
    n2(v.n, 0) + ' citations — ' + sign(v.ns.qqDelta) + ' against ' + (v.prior.label||'the prior period') +
    ', which the workbook’s movement-wording rule calls ' + moveWord(v.ns.qqDelta) + ', and ' +
    sign(v.ns.yyDelta) + ' against ' + (v.yearAgo.label||'a year earlier') + ', ' + moveWord(v.ns.yyDelta) +
    '. Deployment breadth rose further still, to ' + n2(v.pv.value) + ' (' + sign(v.pv.qqDelta) +
    '). ' + (sig.statementSuperseded
      ? 'The statement recorded for the primary signal was authored against the archived October ' +
        'reading and is kept, unchanged, in the Archive; the reading above is the canonical ' +
        'observation.'
      : 'The recorded reading is: “' + CALL.primarySignalText + '”'),
    'ETR interpretation', ['ETR-OCT26-NS','ETR-OCT26-PV'], [sig.id || 'SIG-02'],
    ['R-004','R-005','R-008'], 'High on current raw values',
    'Spending intent and deployment breadth only. No company outcome is implied.', []);
};

/** The three-column editorial strip below the lead chart. */
NARRATIVE.snapshot = function(){
  var v = NV();
  return [
    { key:'changed', label:'What changed', cls:'Client-provided fact',
      c: claim('company',
        'The sequential move is small and the annual move is not. Net Score rose ' +
        sign(v.ns.qqDelta) + ' against ' + (v.prior.label||'July 2026') + ' — ' +
        moveWord(v.ns.qqDelta) + ' under the workbook’s own movement terminology — against ' +
        sign(v.ns.yyDelta) + ' over the year, ' + moveWord(v.ns.yyDelta) + '. Pervasion moved ' +
        sign(v.pv.qqDelta) + ' sequentially, a larger step than intent took over the same quarter.',
        'Client-provided fact', ['ETR-OCT26-NS','ETR-OCT26-PV'], [], ['R-003','R-004','R-005','R-008'],
        'High', 'The movement-terminology rule supplies wording conventions, not significance ' +
        'thresholds.', []) },

    { key:'matters', label:'Why it matters', cls:'ETR interpretation',
      c: claim('company',
        'Breadth and intent moving together is the shape of a recovery that is spreading rather than ' +
        'concentrating: more accounts report the platform in use, and the accounts already there are ' +
        'not pulling back. That is a demand reading about survey respondents. It is not revenue, ' +
        'market share or retention, and the workbook records no validated path from it to any of them.',
        'ETR interpretation', ['ETR-OCT26-NS','ETR-OCT26-PV'], ['XL-01'],
        ['R-013','R-015','CTX-007'], 'Medium',
        'R-015 permits directional consistency between lanes and prohibits causal assertion.', []) },

    { key:'open', label:'What remains open', cls:'Open question',
      c: claim('company',
        'The call on record is inherited, not resolved from ' + v.period + ' evidence: the workbook ' +
        'carries the last resolved Outlook from July 2026 and records no separate ' + v.period +
        ' Outlook field. Underneath it, no October cohort or regional cut carries a citation base, ' +
        'and the approved Z-Score method bands that would let the deviation numbers be read against ' +
        'a threshold are absent.',
        'Open question', [], ['OQ-002','OQ-014','OQ-005'], ['R-007','R-009','R-025'], null,
        'Prior outlooks are historical under R-025 and are not carried forward.',
        ['OQ-002','OQ-014','OQ-005']) }
  ];
};

/** The three story moves. Each is a short narrative, not an ID dump. */
NARRATIVE.moves = function(){
  var v = NV();
  var g2k = NCUT('Global 2000'), f500 = NCUT('Fortune 500'),
      lrg = NCUT('Large Organizations');
  return [
    { key:'recovery', kicker:'Move one', direction:'Improving',
      confidence:'High on current raw values', classification:'ETR interpretation',
      title:'The recovery persists, and it has slowed',
      c: claim('company',
        'Fifteen months after the outage, spending intent is still climbing: ' + n2(v.ns.value) +
        ' now against ' + n2(v.yearAgo.netScore) + ' a year ago. Almost all of that distance was ' +
        'covered before this quarter. The latest step, ' + sign(v.ns.qqDelta) + ', is ' +
        moveWord(v.ns.qqDelta) + '; the annual step, ' + sign(v.ns.yyDelta) + ', is ' +
        moveWord(v.ns.yyDelta) + '. Both Z-Scores are positive, with the annual figure the higher of ' +
        'the two — consistent with the larger annual change in the base metric.',
        'ETR interpretation', ['ETR-OCT26-NS','ETR-OCT26-ZS'], ['SIG-02'],
        ['R-004','R-005','R-006','R-026'], 'High on current raw values',
        'Z-Score supplies deviation context only and never creates or changes the Current Call.', []),
      counter:'Replacement intent has not gone to zero: 10% held firm replacement plans as of April 2025, ' +
        'with a further 24% still contemplating.',
      counterIds:['CE-002'],
      metricA:{k:(v.yearAgo.label||'Oct 2025'), v:n2(v.yearAgo.netScore)},
      metricB:{k:v.shortPeriod, v:n2(v.ns.value)},
      evidence:['ETR-OCT26-NS','ETR-OCT26-ZS','ETR-OCT26-PV','ETR-OCT26-INTENT'],
      focus:'ETR-OCT26-NS' },

    { key:'enterprise', kicker:'Move two', direction:'Mixed',
      confidence:'Medium — cohort N missing', classification:'ETR interpretation',
      title:'Enterprise strength is selective, not uniform',
      c: claim('company',
        'The indexed cohorts read above the overall number — Global 2000 at ' + orNum(g2k) +
        ' and Fortune 500 at ' + orNum(f500) + ' against ' + n2(v.ns.value) + ' overall — while Large ' +
        'Organizations read below it at ' + orNum(lrg) + '. Those cuts sit inside different definitions, ' +
        'so the gap between them is a description of the sample, not a ranking of segments. None of ' +
        'them carries a citation base, which is the single largest gap in the cohort picture.',
        'ETR interpretation', ['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE'],
        ['SIG-05','OQ-014'], ['R-009','R-010','R-011'], 'Medium — cohort N missing',
        'No October cut carries an N (OQ-014). Cohort readings are not segment market share.',
        ['OQ-014']),
      counter:'Price is a live objection in the same cohorts: Falcon Enterprise is the most expensive ' +
        'list-priced tier among the compared vendors.',
      counterIds:['CE-006'],
      metricA:{k:'G2000 / F500', v:orNum(g2k)+' / '+orNum(f500)},
      metricB:{k:'Large Orgs', v:orNum(lrg)},
      evidence:['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE','ETR-OCT26-REGION'],
      focus:'ETR-OCT26-G2K' },

    { key:'outcome', kicker:'Move three', direction:'Improving',
      confidence:'Medium', classification:'Hypothesis',
      title:'Company outcomes moved the same way, on separate evidence',
      c: claim('company',
        'Company-reported net new ARR, ending ARR and RPO sit in their own lane and move in the same ' +
        'direction as the demand reading over the same window. The workbook’s cross-lane record treats ' +
        'that as parallel evidence and nothing more. The candidate relationship between the demand ' +
        'signal and Net New ARR is held at Backtest Required: no lag is established, and Flex, CCP, renewal timing, new logos and ' +
        'expansion are all named as confounders. Until BT-CRWD-OCT26 runs with an agreed lag and ' +
        'tolerance, this stays a hypothesis.',
        'Hypothesis', ['REF-E-F04','REF-E-F03','REF-E-F08'],
        ['XL-01','BRIDGE-SIG-02-KPI-003','KPI-003','BT-CRWD-OCT26'],
        ['R-015','R-016','R-021','CTX-008'], 'Medium',
        'Hypothesis — Backtest Required. Not a validated predictive relationship.',
        ['Expected lag','Tolerance']),
      counter:'The reported series carries its own caveats: GAAP net income was $5.3M against $322.9M ' +
        'non-GAAP in Q2 FY2027, and FY2026 EPS guidance came in below consensus.',
      counterIds:['CE-009','CE-010'],
      metricA:{k:'Bridge state', v:'Hypothesis'},
      metricB:{k:'Established lag', v:'Source Needed'},
      evidence:['REF-E-F04','REF-E-F03','REF-E-F08','XL-01'],
      focus:'BRIDGE-SIG-02-KPI-003' }
  ];
};

/** The counterpoint band — prose, not a table. */
NARRATIVE.counterpoint = function(){
  return [
    claim('company',
      'The strongest argument against reading this as a clean recovery is that the thing being ' +
      'recovered from is still in the data. In July 2024, 96 of 100 surveyed customers reported ' +
      'impact from the outage, 46% called it significant or worse, and 58% said they would reconsider ' +
      'consolidating onto the platform. That is historical evidence, and it is the baseline the ' +
      'current numbers are climbing out of — not a reading that has been superseded.',
      'Client-provided fact', [], ['CE-001'], ['R-024','R-025'], 'High',
      'Treated as historical under the current-period promotion rule. It bounds the interpretation; ' +
      'it does not move the current period.', []),

    claim('company',
      'Replacement intent decayed rather than disappeared. By April 2025, 10% held firm plans to ' +
      'replace and another 24% were still contemplating it, down from 44% likely-to-replace in the ' +
      'immediate aftermath. Alongside that, the survey suggests Microsoft Defender is now considered ' +
      'viable and in some cases preferable — a competitive reading that the current Net Score does ' +
      'not resolve either way.',
      'Client-provided fact', [], ['CE-002','CE-003'], ['R-024'], 'Medium',
      'Both readings are pre-current-period and are not refreshed in the October export set.', []),

    claim('company',
      'What would change the interpretation is narrower than it looks. Cut-level citation bases would ' +
      'establish whether the cohort spread is a real difference or a thin-sample artefact. Approved ' +
      'Z-Score bands would say whether a deviation of this size is ordinary. A recorded October data ' +
      'outlook would let the current call read as something other than Source Needed. All three are ' +
      'open questions with named expected sources.',
      'Open question', [], ['OQ-014','OQ-005','OQ-002'], ['R-007','R-009','R-019'], null,
      'None of the three is answerable from the material in this package.',
      ['OQ-014','OQ-005','OQ-002'])
  ];
};

/** Three watch items, each drawn from an existing open question. */
NARRATIVE.watch = function(){
  return [
    { id:'OQ-002', signal:'SIG-02', status:'Critical · Open',
      title:'Whether an October data outlook is recorded at all',
      why:'The prior Positive outlook is now treated as historical under the workbook’s current-period ' +
          'promotion rule, so with nothing recorded for the current period the call cannot resolve in ' +
          'either direction.',
      resolve:'An ETR Viewpoint List entry carrying a current TSIS data outlook for CrowdStrike.' },
    { id:'OQ-014', signal:'SIG-05', status:'High · Open',
      title:'Whether the October cuts arrive with citation bases',
      why:'Every cohort and regional reading in this package is quoted without an N, so none of them ' +
          'can be weighed against the overall number with confidence.',
      resolve:'A TSIS query or base export giving per-cut N for the October cohort and regional cuts.' },
    { id:'OQ-005', signal:'SIG-02', status:'High · Open',
      title:'Whether the sequential move clears a stated-change band',
      why:'The raw Z-Scores are supplied but the approved bands are not, so the deviation numbers ' +
          'carry no interpretation and the workbook’s movement-terminology convention is doing that ' +
          'work alone.',
      resolve:'The ETR Z-Score methodology: formula, sign convention, lookback, normalization ' +
              'population and approved thresholds.' }
  ];
};

/** Counts for the Research Foundation panel. Object counts, never a score. */
NARRATIVE.foundation = function(){
  var vis = visibleEvidence();
  return [
    { k:'Evidence objects', v:(D.evidence||[]).length, s:'in the package', go:'#evidence' },
    { k:'Current evidence', v:vis.filter(function(e){return e.currentOrHistorical==='current';}).length,
      s:CP.label, go:'#evidence' },
    { k:'Historical evidence', v:vis.filter(function(e){return e.currentOrHistorical!=='current';}).length,
      s:'earlier periods', go:'#evidence' },
    { k:'Signals', v:(D.signals||[]).length, s:'Signal Canvas objects', go:'#signals' },
    { k:'Sources', v:(D.sources||[]).length, s:'Source Register rows', go:'#sources' },
    { k:'KPI bridges', v:(D.bridges||[]).length, s:'signal-to-KPI cells', go:'#kpis' },
    { k:'Rules', v:(D.rules||[]).length, s:'interpretation rules', go:'#rules' },
    { k:'Relationships', v:EDGES.length, s:'workbook edges', go:'#lineage' },
    { k:'Open questions', v:(D.openQuestions||[]).length, s:'unresolved', go:'#risks' }
  ];
};

/* ═══════════════════════════════════════════════ UPDATE EMAIL — formats ══ */

NARRATIVE.EMAIL_FORMATS = [
  ['clean',      'Clean email',      'Cohesive prose, ready to review and send'],
  ['structured', 'Structured update','Labelled sections for internal circulation'],
  ['alert',      'Signal alert',     'Short, one movement, one caveat'],
  ['exec',       'Executive note',   'Three paragraphs, decision-facing']
];

/** Subject lines. Built from the reading, never invented. */
NARRATIVE.emailSubject = function(format, style){
  var v = NV();
  if (format === 'alert')
    return 'Signal alert — CrowdStrike ' + v.period + ' Net Score ' + n2(v.ns.value);
  if (format === 'exec')
    return 'CrowdStrike ' + v.period + ' — what the demand data does and does not establish';
  if (style === 'question')
    return 'CrowdStrike ' + v.period + ': what the October data does and does not establish';
  if (style === 'signal')
    return 'Signal alert — CrowdStrike ' + v.period + ' Net Score ' + n2(v.ns.value);
  return 'CrowdStrike signal update — ' + v.period + ' TSIS';
};

/**
 * The clean email. Four to six connected paragraphs with transitions, no
 * headings, no inline IDs. Each paragraph still carries a full manifest.
 */
NARRATIVE.emailClean = function(g){
  var v = NV();
  var risk = OBJ[g.risk] || OBJ['CE-002'] || {};
  var q = OBJ[g.question] || OBJ['OQ-014'] || {};
  var P = [];

  P.push(claim('email',
    'CrowdStrike’s ' + v.period + ' survey read is in, and the short version is that the ' +
    'post-outage recovery is still building but has slowed to a walk. Spending intent came in at ' +
    n2(v.ns.value) + ' on ' + n2(v.n, 0) + ' citations, ' + sign(v.ns.qqDelta) + ' against ' +
    (v.prior.label||'July') + ' and ' + sign(v.ns.yyDelta) + ' against ' + (v.yearAgo.label||'last October') +
    '. Almost the whole of that improvement is the annual leg.',
    'ETR interpretation', ['ETR-OCT26-NS'], [g.signal||'SIG-02'], ['R-004','R-005','R-025'],
    'High on current raw values', 'Direction only; no company outcome is implied.', []));

  P.push(claim('email',
    'What moved more than intent did was breadth. Pervasion rose to ' + n2(v.pv.value) + ', up ' +
    sign(v.pv.qqDelta) + ' on the quarter, which is a larger sequential step than the ' +
    sign(v.ns.qqDelta) + ' on Net Score. More accounts are reporting the platform in use, and the ' +
    'accounts already there are not pulling back. ' + intentSentence(),
    'Client-provided fact', ['ETR-OCT26-PV','ETR-OCT26-INTENT'], [], ['R-008','R-009'], 'High',
    'Pervasion is deployment breadth, not revenue or market share.', []));

  if (g.length !== 'concise') P.push(claim('email',
    'The enterprise picture underneath is selective rather than uniform. The indexed cohorts read ' +
    'above the overall number while Large Organizations read below it, and those cuts use different ' +
    'definitions, so the spread describes the sample rather than ranking the segments. It is worth ' +
    'saying plainly that none of the October cuts carries a citation base.',
    'ETR interpretation', ['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE'], ['SIG-05'],
    ['R-010','R-011'], 'Medium — cohort N missing', 'No October cut carries an N (OQ-014).',
    ['OQ-014']));

  P.push(claim('email',
    'Two things should temper it. ' + (risk.title || 'The recorded counter-evidence') + ' remains on ' +
    'the record — ' + (risk.statement || 'see the risk object') + ' — and it has not been ' +
    'refreshed in the October set. And the deviation figures that would tell us whether this quarter’s ' +
    'move is ordinary or unusual cannot be read: the raw Z-Scores are supplied, but the approved bands ' +
    'are not, so they stay context rather than evidence.',
    'Client-provided fact', ['ETR-OCT26-ZS'], [risk.id || 'CE-002','OQ-005'],
    ['R-006','R-007','R-024','R-026'], 'Medium — bands absent',
    'Z-Score never creates or changes the Current Call.', ['OQ-005']));

  P.push(claim('email',
    'The honest position on company outcomes is that we do not have one yet. The demand series and the ' +
    'reported series move together, but the relationship between them is a hypothesis held at Backtest ' +
    'Required with no established lag, so nothing here is a model input on its own. ' +
    (q.title ? 'The open question I would most like closed is ' + q.title.replace(/\?$/, '') + '. ' : '') +
    g.action + '.',
    'Recommended action', [], ['BRIDGE-SIG-02-KPI-003','BT-CRWD-OCT26', q.id || 'OQ-014'],
    ['R-016','R-021'], 'Medium', 'Hypothesis — Backtest Required.', []));

  if (g.length === 'detailed') P.push(claim('email',
    'I will pick this up again on the next survey with three things in view: whether the sequential ' +
    'move clears a stated-change band, whether cut-level bases arrive, and whether an outlook is ' +
    'recorded for the current period at all. Any of the three would change how firmly this can be put.',
    'Recommended action', [], ['OQ-002','OQ-005','OQ-014'], ['R-005','R-019'], null, null, []));

  return P;
};

/** The short, one-movement alert. */
NARRATIVE.emailAlert = function(g){
  var v = NV();
  return [
    claim('email',
      'CrowdStrike ' + v.period + ' TSIS: Net Score ' + n2(v.ns.value) + ' on ' + n2(v.n,0) +
      ' citations, ' + sign(v.ns.qqDelta) + ' sequentially and ' + sign(v.ns.yyDelta) +
      ' year over year. Pervasion ' + n2(v.pv.value) + ', ' + sign(v.pv.qqDelta) + '.',
      'Client-provided fact', ['ETR-OCT26-NS','ETR-OCT26-PV'], [], ['R-004','R-008','R-009'],
      'High', null, []),
    claim('email',
      'The sequential move is ' + moveWord(v.ns.qqDelta) + ' under the wording convention; the annual ' +
      'move is ' + moveWord(v.ns.yyDelta) + '. Breadth outpaced intent this quarter. No company ' +
      'outcome is implied and no outlook is recorded for the current period.',
      'ETR interpretation', ['ETR-OCT26-NS'], ['OQ-002'], ['R-005','R-015','R-025'],
      'High on current raw values', 'Current Call is Source Needed pending a recorded outlook.',
      ['OQ-002'])
  ];
};

/** Three paragraphs, decision-facing. */
NARRATIVE.emailExec = function(g){
  var v = NV();
  return [
    claim('email',
      'The demand picture for CrowdStrike improved again in ' + v.period + ', and the improvement is ' +
      'mostly a year in the making rather than a quarter. Spending intent is ' + n2(v.ns.value) + ', ' +
      sign(v.ns.yyDelta) + ' over the year and ' + sign(v.ns.qqDelta) + ' over the quarter, with ' +
      'deployment breadth rising faster than intent.',
      'ETR interpretation', ['ETR-OCT26-NS','ETR-OCT26-PV'], ['SIG-02'], ['R-004','R-005','R-008'],
      'High on current raw values', null, []),
    claim('email',
      'What it does not tell us is anything about company results. The survey lane and the reported ' +
      'lane are parallel evidence; the relationship between them is untested and is recorded as a ' +
      'hypothesis. Treat this as monitoring context, not as a forecast input.',
      'ETR interpretation', [], ['XL-01','BRIDGE-SIG-02-KPI-003'], ['R-015','R-021'], 'Medium',
      'Hypothesis — Backtest Required.', []),
    claim('email',
      'Three gaps are worth knowing about: no outlook is recorded for the current period, no October ' +
      'cut carries a citation base, and the approved Z-Score bands are absent. ' + g.action + '.',
      'Recommended action', [], ['OQ-002','OQ-014','OQ-005'], ['R-007','R-009','R-019'], null, null,
      ['OQ-002','OQ-014','OQ-005'])
  ];
};

/* ═════════════════════════════════════════════ SUNDAY SIGNAL — formats ══ */

NARRATIVE.SUNDAY_STYLES = [
  ['cohesive', 'Cohesive Signal', 'One connected essay, minimal subheads'],
  ['exec',     'Executive Signal','Short, decision-facing, no subheads'],
  ['data',     'Data-Led Signal', 'Readings first, interpretation after'],
  ['note',     'Research Note',   'Methodical, with the open questions kept in view']
];
NARRATIVE.SUNDAY_LENGTHS = [['brief','Brief'],['standard','Standard'],['extended','Extended']];

NARRATIVE.sundayTitle = function(){
  return 'CrowdStrike — ' + CP.label + ' TSIS';
};
NARRATIVE.sundayDeck = function(){
  var v = NV();
  return 'Spending intent is ' + n2(v.ns.value) + ' and breadth is ' + n2(v.pv.value) +
    '. The recovery is fifteen months old, still moving, and slowing.';
};

/**
 * The cohesive essay. Returns an ordered list of blocks:
 *   {sub: 'optional subhead', c: claim}
 * At most three subheads are emitted at Standard length, and none at Brief.
 */
NARRATIVE.sunday = function(style, length, opts){
  opts = opts || {};
  var v = NV(), B = [];
  var brief = (length === 'brief'), extended = (length === 'extended');
  var note = (style === 'note');
  var sig = OBJ[opts.signal || 'SIG-02'] || {};
  var aud = (typeof AUDIENCES !== 'undefined' ? AUDIENCES : []).filter(function(a){
    return a.id === opts.audience; })[0] || null;
  var extra = (opts.evidence || []).filter(function(id){
    return ['ETR-OCT26-NS','ETR-OCT26-PV','ETR-OCT26-INTENT','ETR-OCT26-ZS'].indexOf(id) < 0 && OBJ[id];
  });
  var counter = (opts.counter || []).filter(function(id){ return OBJ[id]; });
  var qs = (opts.questions || []).filter(function(id){ return OBJ[id]; });

  /* ── opening ─────────────────────────────────────────────────────────── */
  B.push({ essential:true, c: claim('sunday',
    'It has been fifteen months since the outage, and the question that keeps getting asked about ' +
    'CrowdStrike is whether the recovery in spending intent is real or whether it has simply run out ' +
    'of room. The ' + v.period + ' survey period gives the clearest answer so far, and it is a ' +
    'qualified one: the recovery is real, it is still building, and it has slowed sharply.',
    'ETR interpretation', ['ETR-OCT26-NS'], [sig.id || 'SIG-02'],
    ['R-002','R-004','R-005','R-025'], 'High on current raw values',
    'Direction only. No company outcome is implied.', []) });

  B.push({ essential:true, c: claim('sunday',
    'Net Score reads ' + n2(v.ns.value) + ' on ' + n2(v.n,0) + ' citations. Against ' +
    (v.prior.label||'July 2026') + ' that is ' + sign(v.ns.qqDelta) + ', which the workbook’s own ' +
    'wording convention calls ' + moveWord(v.ns.qqDelta) + '. Against ' + (v.yearAgo.label||'October 2025') +
    ' it is ' + sign(v.ns.yyDelta) + ', ' + moveWord(v.ns.yyDelta) + '. Put those two numbers side by ' +
    'side and the shape of the year becomes obvious: nearly all of the distance was covered before ' +
    'this quarter, and the latest step is a small one.',
    'Client-provided fact', ['ETR-OCT26-NS'], [], ['R-004','R-005','R-009'], 'High',
    'These are wording conventions, not statistical-significance thresholds.', []) });

  /* ── primary signal in focus — changes with the "Primary signal" control ── */
  if (sig.id) B.push({ essential:true, c: claim('sunday',
    'The reading this piece is built around is “' + (sig.title || 'the recorded signal') +
    '.” ' + (sig.statementSuperseded
       ? 'Its recorded statement was authored against the archived October reading and is kept in ' +
         'the Archive; the canonical reading is used here: “' + sigStatement(sig) + '” '
       : 'As the workbook states it: “' + (sig.statement || 'no statement is recorded') + '” ') +
    'Recorded ' +
    'direction is ' + (sig.direction || 'Source Needed') + ' at ' +
    (sig.confidence || 'Source Needed') + ' confidence.',
    sig.classification || 'Client-provided fact', [], [sig.id], ['R-009'], sig.confidence,
    sig.caveat || 'This is the signal selected for this piece; it does not change the Current Call.', []) });

  /* ── who this is for — changes with the "Audience" control ─────────────── */
  if (aud) B.push({ essential:true, c: claim('sunday',
    'For ' + aud.label + ', the question in front of this reading is: ' + aud.q + ' ' + aud.t + ' ' +
    (typeof audienceWhy === 'function' ? audienceWhy(aud) : ''),
    'ETR interpretation', aud.emph.slice(0,2), [], ['R-013'], null,
    'Framed for ' + aud.label + '; the underlying facts, values and confidence are unchanged by the ' +
    'framing.', []) });

  /* ── body ────────────────────────────────────────────────────────────── */
  var subA = (style === 'exec' || (brief && !note)) ? null : 'What the October data shows';
  B.push({ sub: subA, c: claim('sunday',
    'The more interesting movement is in breadth rather than level. Pervasion — the share of ' +
    'respondents reporting the platform in use — rose to ' + n2(v.pv.value) + ', up ' +
    sign(v.pv.qqDelta) + ' on the quarter, a larger step than intent took over the same period. ' +
    intentSentence() + ' Deployment is spreading faster than budgets are ' +
    'growing, which is a recovery of a particular kind: wider, not yet deeper.',
    'Client-provided fact', ['ETR-OCT26-PV','ETR-OCT26-INTENT'], [], ['R-008','R-009'], 'High',
    'Pervasion is breadth, not revenue or market share.', []) });

  if (!brief || note) B.push({ c: claim('sunday',
    'Where the reading is strongest is in the largest accounts, and where it is weakest is in the ' +
    'confidence we can attach to that. The indexed cohorts read above the overall number while Large ' +
    'Organizations read below it — and those two cuts use different definitions, so the gap ' +
    'describes the sample rather than ranking the segments. Geographically the October cuts run wide, ' +
    'from APAC at the top to EMEA at the bottom. Not one of these cuts arrives with a citation base, ' +
    'which is the single largest gap in the package.',
    'ETR interpretation', ['ETR-OCT26-G2K','ETR-OCT26-F500','ETR-OCT26-LARGE','ETR-OCT26-REGION'],
    ['SIG-05','SIG-07','OQ-014'], ['R-010','R-011','R-024'], 'Medium — N missing throughout',
    'Do not read a regional survey cut as regional revenue.', ['OQ-014']) });

  extra.forEach(function(id){
    var e = OBJ[id];
    B.push({ c: claim('sunday', (e.statement || e.title || id),
      e.classification || 'Client-provided fact', [id], [], ['R-009'], e.confidence, e.caveat,
      e.sourceNeededFields || []) });
  });

  if (extended) B.push({ c: claim('sunday',
    'The stated reasons behind adoption are worth a line, with a caveat attached to it. The two ' +
    'highest-cited October reasons are product technical capabilities and product security. Those are ' +
    'reasons respondents gave, not causes of the Net Score movement, and the reason-response base is ' +
    'not supplied either.',
    'Client-provided fact', ['ETR-OCT26-ADOPT'], [], ['R-013'], 'Medium — reason N missing',
    'Reasons are not causal explanations of a metric movement.', ['OQ-014']) });

  var subB = (style === 'exec' || (brief && !note)) ? null : 'What it does not establish';
  B.push({ sub: subB, c: claim('sunday',
    'This is the point at which the numbers stop and the discipline starts. The deviation figures are ' +
    'supplied — Q/Q ' + n2(v.z.qqZ, 6) + ' and Y/Y ' + n2(v.z.yyZ, 6) + ', both positive, with the ' +
    'annual figure higher — but the approved bands that would let anyone say whether a move of ' +
    'this size is ordinary are not. So the deviation numbers stay context. They do not upgrade the ' +
    'reading, and they never create or change the call.',
    'Client-provided fact', ['ETR-OCT26-ZS'], ['OQ-005'], ['R-006','R-007','R-026','CTX-013'],
    'Medium — values available, bands absent',
    'Z-Score supplies deviation context only.', ['OQ-005']) });

  B.push({ c: claim('sunday',
    'Nor does any of it establish a company outcome. The survey lane and the reported lane are ' +
    'parallel evidence: they point the same way over the same window, and the workbook records that ' +
    'as directional consistency and explicitly prohibits reading anything causal into it. The ' +
    'candidate relationship — the demand signal to net new ARR — is held at Backtest ' +
    'Required, with no established lag and a named list of confounders.',
    'ETR interpretation', ['ETR-OCT26-NS'], ['XL-01','BRIDGE-SIG-02-KPI-003','KPI-003','BT-CRWD-OCT26'],
    ['R-013','R-015','R-016','R-021','CTX-007'], 'Medium',
    'Hypothesis — Backtest Required. Not a validated predictive relationship.',
    ['Expected lag','Tolerance']) });

  if (!brief || note) {
    var cList = counter.length ? counter : ['CE-001','CE-002'];
    var first = OBJ[cList[0]] || {}, second = OBJ[cList[1]] || null;
    B.push({ c: claim('sunday',
      'The counter-case has not gone away, it has decayed. ' + (first.title || cList[0]) + ': ' +
      (first.statement || '') + '.' + (second ? ' Alongside it, ' + (second.title || cList[1]) +
      ' — ' + (second.statement || '') + '.' : '') + ' Both readings are historical and neither ' +
      'is refreshed in the October export set, which is exactly why they bound the interpretation ' +
      'rather than settle it.',
      'Client-provided fact', [], cList.slice(0, 2), ['R-024','R-025'], first.confidence || 'Medium',
      'Historical evidence under the current-period promotion rule. It does not move the current ' +
      'period.', []) });
  }

  /* ── closing ─────────────────────────────────────────────────────────── */
  var subC = (style === 'exec' || (brief && !note)) ? null : 'What to watch next';
  var watchText = 'Three things would change how firmly any of this can be put. Whether the sequential ' +
    'move clears a stated-change band once approved Z-Score bands exist. Whether the October cohort ' +
    'and regional cuts arrive with citation bases. And whether an ETR data outlook is recorded for the ' +
    'current period at all — because until one is, the prior Positive reading stays historical and ' +
    'the current call reads Source Needed.';
  if (qs.length) {
    watchText += ' The open questions carried here are ' + qs.join(', ') + '.';
  }
  if (aud) watchText += ' For ' + aud.label + ', the recommended next step is: ' + aud.action;
  B.push({ essential:true, sub: subC, c: claim('sunday', watchText, 'Recommended action', [],
    unique(['OQ-002','OQ-005','OQ-014'].concat(qs)), ['R-005','R-007','R-019','R-025'], null,
    'Each has a named expected source recorded against it.',
    unique(['OQ-002','OQ-005','OQ-014'].concat(qs))) });

  if (note) {
    /* Research Note keeps the three live open items in view explicitly,
       structurally, rather than only when the reader happens to select them. */
    B.push({ c: claim('sunday',
      'Carried open in this note, regardless of what is selected above: whether the current-period ' +
      'ETR data outlook is recorded, whether the Z-Score bands are approved, and whether the cohort ' +
      'and regional cuts arrive with a citation base. None of the three is resolved by this reading.',
      'Open question', [], ['OQ-002','OQ-005','OQ-014'],
      ['R-002','R-005','R-024'], null,
      'These stay open until the workbook records a resolution — nothing here resolves them.',
      ['OQ-002','OQ-005','OQ-014']) });
  }

  if (style === 'data') {
    /* readings first: move the two data paragraphs to the front, keep the rest in order */
    var head = B.filter(function(b){ return /^(Net Score reads|The more interesting)/.test(b.c.text); });
    var tail = B.filter(function(b){ return head.indexOf(b) < 0; });
    B = head.concat(tail);
  }
  if (style === 'exec') {
    /* short and decision-facing: the opening, the raw numbers, the selected signal and
       audience framing, the discipline paragraph and the closing action — nothing else. */
    B = B.filter(function(b){ return b.essential || /Nor does any of it/.test(b.c.text); });
  }
  return B;
};

/** Optional footnotes, appended only when the reader asks for them. */
NARRATIVE.sundayFootnotes = function(flags, blocks){
  var out = [];
  if (flags.method) out.push(claim('sunday',
    'Methodology. Sole source: the authorized worksheets of ' + D.metadata.workbook + '. ' +
    CP.label + ' is the current TSIS period and July 2026 is historical comparison under R-025. ' +
    'N counts citations, not people. Z-Score bands, cohort and regional bases, and the current data ' +
    'outlook are Source Needed.',
    'Client-provided fact', [], ['R-002','R-009','R-025'], ['R-002','R-009','R-025'], null, null,
    ['OQ-002','OQ-005','OQ-014']));
  if (flags.ids) {
    var ids = unique((blocks||[]).reduce(function(a, b){
      return a.concat(b.c.sourceEvidenceIds, b.c.sourceObjectIds); }, []));
    out.push(claim('sunday', 'Evidence and object IDs behind this piece: ' + ids.join(' · '),
      'Client-provided fact', ids, [], [], null,
      'Every ID resolves to an object in the authorized worksheets.', []));
  }
  if (flags.review) out.push(claim('sunday',
    'Generated draft — Human Review Required. R-020 makes analyst approval a precondition of ' +
    'external distribution.',
    'Recommended action', [], ['R-020'], ['R-020','CTX-010'], null, null, []));
  return out;
};

/* ══════════════════════════════════════════════ NARRATIVE VIEW sections ══ */

NARRATIVE.SECTIONS = [
  ['question',  '01', 'The research question',      'what this package was assembled to answer'],
  ['answer',    '02', 'The short answer',           'stated plainly, before the evidence'],
  ['signal',    '03', 'The signal',                 'the recorded primary signal and its status'],
  ['changed',   '04', 'What changed',               'this period against the last, and against last year'],
  ['breadth',   '05', 'Demand and breadth',         'what each headline measure carries'],
  ['cohorts',   '06', 'Enterprise and geography',   'where the reading is strong, and where it thins'],
  ['counter',   '07', 'What argues against it',     'the counter-case and the deviation gap'],
  ['bridge',    '08', 'The signal-to-KPI hypothesis','the one relationship worth testing'],
  ['watch',     '09', 'What to watch',              'the three open questions that would move this'],
  ['method',    '10', 'Methodology note',           'the rules this reading was assembled under']
];

NARRATIVE.QUESTION = 'Is CrowdStrike’s post-outage recovery still building, ' +
  'or has it flattened out a year on?';

NARRATIVE.shortAnswer = function(){
  var v = NV();
  return 'It is still building, and it has slowed sharply. Spending intent rose again in ' + v.period +
    ' and deployment breadth rose faster, so the recovery is real — but almost all of the ' +
    'improvement is year-over-year rather than in the last quarter, and the enterprise picture ' +
    'underneath it is selective rather than uniformly strong.';
};

NARRATIVE.pull = function(key){
  var v = NV();
  return ({
    changed: 'The sequential move is ' + sign(v.ns.qqDelta) + '. The annual move is ' +
             sign(v.ns.yyDelta) + '. The year is the story; the quarter is not.',
    breadth: 'Deployment is spreading faster than budgets are growing — a recovery that is ' +
             'wider, not yet deeper.',
    counter: 'The counter-case has not gone away. It has decayed.',
    bridge:  'Two series moving the same way is a reason to test a relationship, not evidence that ' +
             'one exists.'
  })[key] || '';
};
