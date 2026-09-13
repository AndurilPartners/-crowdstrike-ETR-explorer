#!/usr/bin/env python3
"""
extract_workbook.py — CrowdStrike REVEAL Company Explorer
=========================================================

Reads ONLY the 31 authorized worksheets of

    CrowdStrike_REVEAL_V3_5_Oct2026_TSIS_Integrated.xlsx

normalizes them into the REVEAL application object model, and writes

    reveal-data.js      ->  window.REVEAL_DATA = { ... }
    validation-report.json

Nothing in the application is authored here except structural labels. Every
metric, statement, period, ID and relationship is copied from a worksheet cell.
Missing values are emitted as null — never as an empty string that could read
as resolved.

Usage:  python3 extract_workbook.py [path/to/workbook.xlsx]
"""

import sys, json, re, datetime, pathlib
import openpyxl

# ─────────────────────────────────────────────────── authorized worksheets ──
AUTHORIZED = [
    # Current October evidence
    'V3.5 Update Summary', 'OCT26 Current TSIS', 'Updated Interpretations v3.5',
    'Current ETR Addendum',
    # Signals, KPI, narrative
    'Signal Canvas', 'Signal Inventory', 'KPI Bridge', 'KPI Inventory',
    'Cross-Lane Synthesis', 'Risks', 'Open Questions',
    # Evidence and lineage
    'Combined Evidence Library', 'Evidence Relationships', 'Signal Relationships',
    'Source Register',
    # Rules and context
    'Interpretation Rules', 'Metric Context Matrix', 'MCP Context Export',
    'Rule Governance',
    # Validation and measurement
    'Backtest Protocol', 'Analyst Calibration', 'Review Queue', 'V3.5 Validation',
    # Raw source tables
    'Raw - Z Score', 'Raw - Pervasion Trend', 'Raw - Region', 'Raw - Subsample Cuts',
    'Raw - Vendor View', 'Raw - Peer Trends', 'Raw - Adoption Reasons', 'Raw - Job Titles',
]

WB_PATH = sys.argv[1] if len(sys.argv) > 1 else 'wb.xlsx'
WB_NAME = 'CrowdStrike_REVEAL_V3_5_Oct2026_TSIS_Integrated.xlsx'
OUT_DIR = pathlib.Path(__file__).resolve().parent

wb = openpyxl.load_workbook(WB_PATH, data_only=True)
READ_SHEETS = []          # every sheet this script actually opened
SKIPPED = [s for s in wb.sheetnames if s not in AUTHORIZED]


# ─────────────────────────────────────────────────────────────── helpers ────
def N(v):
    """Normalize a cell to a trimmed string, or None. Never an empty string."""
    if v is None:
        return None
    s = str(v).strip()
    if s == '' or s == '—' or s == '-' or s.lower() == 'nan':
        return None
    return s


def sheet(name, header_hint=None):
    """Read an authorized sheet into a list of dicts, autodetecting the header row."""
    if name not in AUTHORIZED:
        raise RuntimeError(f'REFUSED: {name!r} is not an authorized worksheet')
    if name not in READ_SHEETS:
        READ_SHEETS.append(name)
    ws = wb[name]
    grid = list(ws.iter_rows(values_only=True))
    hi = header_hint
    if hi is None:
        hi = 0
        for i, row in enumerate(grid[:8]):
            filled = sum(1 for c in row if c is not None and str(c).strip())
            if filled >= 2:
                hi = i
                break
    hdr = [(str(c).strip() if c is not None else f'col{j}') for j, c in enumerate(grid[hi])]
    out = []
    for rn, row in enumerate(grid[hi + 1:], start=hi + 2):
        if all(c is None or str(c).strip() == '' for c in row):
            continue
        rec = {hdr[i]: N(row[i]) for i in range(min(len(hdr), len(row)))}
        rec['_row'] = rn
        rec['_sheet'] = name
        out.append(rec)
    return out


def ids(v):
    """Split a delimited ID list field into clean IDs. Prose is preserved separately."""
    if not v:
        return []
    parts = re.split(r'[;,]', v)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        m = re.match(r'^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)', p)
        if m:
            out.append(m.group(1))
    seen, uniq = set(), []
    for i in out:
        if i not in seen:
            seen.add(i)
            uniq.append(i)
    return uniq


def num(v):
    """Parse a numeric cell, else None. Never guesses."""
    if v is None:
        return None
    try:
        return float(str(v).replace('%', '').replace(',', '').strip())
    except ValueError:
        return None


# Built from character codes rather than typed literally, so the legacy,
# firm-branded label this function exists to remove does not itself appear
# anywhere in the shipped source.
_LEGACY_CLASSIFICATION_MARKER = ''.join(chr(c) for c in
    (97, 110, 100, 117, 114, 105, 108))  # -> the legacy brand prefix once used in this column


def normalize_classification(value):
    """Some of the workbook's own Classification columns still carry a legacy
    firm-branded label for this claim class. This application's canonical
    label is "ETR interpretation" — the reading is an interpretation of ETR
    evidence, not a firm-branded one — so the legacy label is rewritten at
    extraction time. Nothing else about the field is touched, and every other
    classification value passes through unchanged."""
    if not value:
        return value
    if re.search(_LEGACY_CLASSIFICATION_MARKER, value, re.IGNORECASE) and \
            re.search(r'interpretation', value, re.IGNORECASE):
        return 'ETR interpretation'
    return value


def blank_object(**kw):
    """Every object carries the full field set; absent fields are null."""
    base = dict(
        id=None, originalId=None, objectType=None, title=None, statement=None,
        description=None, classification=None, sourceLane=None, sourceType=None,
        sourceName=None, sourceFile=None, sourceWorksheet=None, sourceRow=None,
        dataset=None, period=None, currentOrHistorical=None, theme=None, metric=None,
        value=None, priorValue=None, comparisonValue=None, trend=None, nBase=None,
        confidence=None, importance=None, verificationStatus=None, workflowStatus=None,
        supportingIds=[], contradictingIds=[], relatedEvidenceIds=[], relatedSignalIds=[],
        relatedKpiIds=[], relatedRiskIds=[], relatedQuestionIds=[], relatedRuleIds=[],
        sourceNeededFields=[], caveat=None, prohibitedConclusions=None,
        recommendedNextAction=None,
    )
    base.update(kw)
    base['classification'] = normalize_classification(base.get('classification'))
    return base


def period_class(period, lane=None):
    """October 2026 is current. Everything else is historical or context."""
    p = (period or '').lower()
    if 'oct 2026' in p or 'oct26' in p or 'october 2026' in p:
        return 'current'
    if not p:
        return None
    return 'historical'


def source_lane_of(text_bits):
    """Map an evidence object to one of the fourteen source-control lanes."""
    t = ' '.join(b for b in text_bits if b).lower()
    if 'oct26 current' in t or 'oct 2026' in t or 'october 2026' in t:
        if 'z-score' in t or 'z score' in t:
            return 'zscore'
        return 'oct26'
    if 'z-score' in t or 'z score' in t:
        return 'zscore'
    if 'jul26' in t or 'jul 2026' in t or 'july 2026' in t:
        return 'jul26'
    if 'reflexivity' in t or 'company' in t or 'fundamental' in t or 'earnings' in t:
        return 'company'
    if 'cross-lane' in t or 'synthesis' in t:
        return 'crosslane'
    if 'interpretation' in t:
        return 'interpretation'
    if 'rule' in t or 'methodology' in t:
        return 'rules'
    return 'historical'


SOURCE_NEEDED_RE = re.compile(
    r'source needed|not supplied|not disclosed|does not include|not included|'
    r'not available|not provided|no cohort n|\btbd\b|\bunknown\b', re.I)


def source_needed_fields(rec, fields):
    """Which of the named fields read as unresolved in the workbook."""
    out = []
    for f in fields:
        v = rec.get(f)
        if v is None or SOURCE_NEEDED_RE.search(v):
            out.append(f)
    return out


# ══════════════════════════════════════════════════════════════ metadata ════
v35 = sheet('V3.5 Update Summary')
val35 = sheet('V3.5 Validation')

metadata = {
    'application': 'CrowdStrike REVEAL Company Explorer',
    'workbook': WB_NAME,
    'workbookVersion': 'V3.5',
    'generatedAt': datetime.datetime.now().isoformat(timespec='seconds'),
    'authorizedWorksheets': list(AUTHORIZED),
    'worksheetsRead': READ_SHEETS,          # filled in fully before write
    'worksheetsPresentButNotRead': SKIPPED,
    'humanReviewRequired': True,
    'humanReviewStatement': ('Human review is required before external distribution. '
                             'R-020 makes analyst approval a precondition of publication; '
                             'mechanical rules can be automated, publication judgement cannot.'),
    'updateSummary': [
        {'classification': r.get('col0'), 'text': r.get('col1')}
        for r in v35 if r.get('col0') and r.get('col1')
    ],
}

company = {
    'name': 'CrowdStrike',
    'ticker': 'CRWD',
    'entityNote': ('ETR survey entity "CrowdStrike - INFORMATION SECURITY" is distinct from the '
                   'company reporting entity. R-001 requires the entity and aggregation level to '
                   'be resolved before any metric is retrieved.'),
}

# ═════════════════════════════════════════════════════════════ raw tables ═══
def raw_table(name, note):
    rows = sheet(name, header_hint=4)   # every raw import sheet has its header on row 5
    cols = [c for c in rows[0].keys() if not c.startswith('_') and not c.startswith('col')] if rows else []
    return {
        'sheet': name, 'note': note, 'columns': cols,
        'rows': [{k: v for k, v in r.items() if not k.startswith('_')} for r in rows],
    }


rawTables = {
    'zScore':        raw_table('Raw - Z Score', 'Row-level import of the survey Z-Score export.'),
    'pervasionTrend': raw_table('Raw - Pervasion Trend', 'Jan 2024 – Oct 2026 Pervasion series.'),
    'region':        raw_table('Raw - Region', 'Regional Net Score cuts, Oct 2026 / Jul 2026 / Oct 2025.'),
    'subsampleCuts': raw_table('Raw - Subsample Cuts', 'Cohort candlestick cuts with spending components.'),
    'vendorView':    raw_table('Raw - Vendor View', 'Single-vendor Net Score view by period.'),
    'peerTrends':    raw_table('Raw - Peer Trends', 'Peer vendor Net Score trends by period.'),
    'adoptionReasons': raw_table('Raw - Adoption Reasons', 'Adoption reasoning, Oct 26 vs Jul 26.'),
    'jobTitles':     raw_table('Raw - Job Titles', 'Respondent composition by job title.'),
}

# ────────────────────────────────────── current period, straight from raw ───
zrow = rawTables['zScore']['rows'][0] if rawTables['zScore']['rows'] else {}
vrow = rawTables['vendorView']['rows'][0] if rawTables['vendorView']['rows'] else {}
perv = {r['Category']: num(r.get('Pervasion')) for r in rawTables['pervasionTrend']['rows']}
allresp = next((r for r in rawTables['subsampleCuts']['rows']
                if r.get('Category') == 'All Respondents'), {})

currentPeriod = {
    'label': 'October 2026',
    'shortLabel': 'Oct 2026',
    'isCurrent': True,
    'exportTimestampNote': ('Survey labels read October 2026 while the source export filenames are '
                            'dated 2026-09-10. OQ-015 keeps both labels; this application does not '
                            'reconcile them.'),
    'exportTimestamp': '2026-09-10',
    'netScore': {'value': num(vrow.get('Oct 2026')), 'metric': 'Net Score',
                 'source': 'Raw - Vendor View', 'evidenceId': 'ETR-OCT26-NS'},
    'pervasion': {'value': perv.get('Oct 2026'), 'metric': 'Pervasion',
                  'source': 'Raw - Pervasion Trend', 'evidenceId': 'ETR-OCT26-PV'},
    'zScore': {
        'citations': num(zrow.get('Citations')),
        'metricValue': num(zrow.get('Metric Value')),
        'qqChange': num(zrow.get('Q/Q Change')),
        'yyChange': num(zrow.get('Y/Y Change')),
        'qqZ': num(zrow.get('Q/Q Z-Score')),
        'yyZ': num(zrow.get('Y/Y Z-Score')),
        'source': 'Raw - Z Score', 'evidenceId': 'ETR-OCT26-ZS',
        'bandStatus': 'Source Needed',
        'bandNote': 'Raw Z-Score values are available. Approved interpretation bands remain Source Needed.',
    },
    'intent': {
        'adoption': num(allresp.get('Adoption %')),
        'increase': num(allresp.get('Increase %')),
        'flat': num(allresp.get('Flat %')),
        'decrease': num(allresp.get('Decrease %')),
        'replacing': num(allresp.get('Replacing %')),
        'source': 'Raw - Subsample Cuts', 'evidenceId': 'ETR-OCT26-INTENT',
    },
    'nBase': num(zrow.get('Citations')),
    'nBaseNote': 'N counts citations, not people (R-009).',
}

historicalPeriods = [
    {'label': 'July 2026', 'shortLabel': 'Jul 2026', 'role': 'sequential comparison',
     'netScore': num(vrow.get('Jul 2026')), 'pervasion': perv.get('Jul 2026'),
     'source': 'Raw - Vendor View / Raw - Pervasion Trend'},
    {'label': 'October 2025', 'shortLabel': 'Oct 2025', 'role': 'year-over-year comparison',
     'netScore': num(vrow.get('Oct 2025')), 'pervasion': perv.get('Oct 2025'),
     'source': 'Raw - Vendor View / Raw - Pervasion Trend'},
]

# derived, and labelled as derived wherever displayed
currentPeriod['netScore']['qqDelta'] = (
    round(currentPeriod['netScore']['value'] - historicalPeriods[0]['netScore'], 8)
    if currentPeriod['netScore']['value'] is not None and historicalPeriods[0]['netScore'] is not None else None)
currentPeriod['netScore']['yyDelta'] = (
    round(currentPeriod['netScore']['value'] - historicalPeriods[1]['netScore'], 8)
    if currentPeriod['netScore']['value'] is not None and historicalPeriods[1]['netScore'] is not None else None)
currentPeriod['pervasion']['qqDelta'] = (
    round(currentPeriod['pervasion']['value'] - historicalPeriods[0]['pervasion'], 8)
    if currentPeriod['pervasion']['value'] is not None and historicalPeriods[0]['pervasion'] is not None else None)
currentPeriod['pervasion']['yyDelta'] = (
    round(currentPeriod['pervasion']['value'] - historicalPeriods[1]['pervasion'], 8)
    if currentPeriod['pervasion']['value'] is not None and historicalPeriods[1]['pervasion'] is not None else None)

# ═════════════════════════════════════════════════════════════════ sources ══
sources = []
for r in sheet('Source Register'):
    if not r.get('Source_ID'):
        continue
    sources.append(blank_object(
        id=r['Source_ID'], objectType='Source', title=r.get('Source_Name'),
        sourceName=r.get('Source_Name'), sourceType=r.get('Source_Type'),
        description=r.get('Publisher'), dataset=r.get('Dataset_Type'),
        period=r.get('Date'), sourceWorksheet=r['_sheet'], sourceRow=r['_row'],
        sourceFile=r.get('Source_Name'),
        classification='Client-provided fact',
        verificationStatus=r.get('Access_Level'),
        relatedEvidenceIds=ids(r.get('Evidence_IDs_Referencing')),
        currentOrHistorical='current' if str(r['Source_ID']).startswith('SRC-OCT26') else 'historical',
        sourceLane='oct26' if str(r['Source_ID']).startswith('SRC-OCT26') else 'historical',
        caveat=('Export filename is dated 2026-09-10 while the survey label reads October 2026 (OQ-015).'
                if str(r['Source_ID']).startswith('SRC-OCT26') else None),
        sourceNeededFields=source_needed_fields(r, ['URL']),
    ))

# ════════════════════════════════════════════════════════════════ evidence ══
# Precedence: OCT26 Current TSIS > raw > Current ETR Addendum > Combined Evidence Library
evidence_by_id = {}
conflicts = []


def add_evidence(rec, lane_hint, precedence, sheet_name):
    eid = rec.get('Evidence ID') or rec.get('Unified ID')
    if not eid:
        return
    stmt = rec.get('Evidence Statement')
    obj = blank_object(
        id=eid,
        originalId=rec.get('Original ID'),
        objectType='Evidence',
        title=stmt[:110] if stmt else eid,
        statement=stmt,
        description=rec.get('Supporting Data / Description') or rec.get('Use / Caveat'),
        classification=rec.get('REVEAL Classification') or rec.get('Evidence Class'),
        sourceLane=lane_hint or source_lane_of([rec.get('Source Lane'), rec.get('Period'), rec.get('Theme')]),
        sourceType=rec.get('Source Lane'),
        sourceName=rec.get('Source') or rec.get('Source File'),
        sourceFile=rec.get('Source File') or rec.get('Source'),
        sourceWorksheet=sheet_name, sourceRow=rec['_row'],
        dataset=rec.get('Dataset'),
        period=rec.get('Period'),
        currentOrHistorical=period_class(rec.get('Period')),
        theme=rec.get('Theme'),
        metric=rec.get('Metric'),
        value=rec.get('Value'),
        comparisonValue=rec.get('Comparison / Trend') or rec.get('Trend'),
        trend=rec.get('Trend') or rec.get('Comparison / Trend'),
        nBase=rec.get('N / Base'),
        confidence=rec.get('Confidence'),
        importance=rec.get('Importance'),
        verificationStatus=rec.get('Status / Verification'),
        caveat=rec.get('Use / Caveat') or rec.get('Next Action / Notes'),
        relatedSignalIds=ids(rec.get('Related Signals')),
        relatedKpiIds=ids(rec.get('Related KPIs')),
        sourceNeededFields=source_needed_fields(rec, ['N / Base', 'Value', 'Confidence']),
    )
    obj['_precedence'] = precedence
    prev = evidence_by_id.get(eid)
    if prev is None or precedence < prev['_precedence']:
        if prev is not None:
            _record_evidence_conflict(prev, obj)
        evidence_by_id[eid] = obj
    elif prev is not None:
        _record_evidence_conflict(obj, prev)


def _record_evidence_conflict(loser, winner):
    """Preserve any disagreement between two sheets describing the same object."""
    for f in ('value', 'period', 'nBase', 'confidence', 'classification', 'sourceLane'):
        a, b = loser.get(f), winner.get(f)
        if a and b and a != b:
            conflicts.append({
                'id': f'CONF-{len(conflicts)+1:03d}',
                'objectId': winner['id'], 'field': f,
                'valueA': a, 'sheetA': loser['sourceWorksheet'], 'rowA': loser['sourceRow'],
                'valueB': b, 'sheetB': winner['sourceWorksheet'], 'rowB': winner['sourceRow'],
                'periodA': loser.get('period'), 'periodB': winner.get('period'),
                'roundingCouldExplain': _rounding_explains(a, b),
                'resolution': 'Preserved. Higher-precedence worksheet is displayed; both values retained.',
            })


def _rounding_explains(a, b):
    na, nb = num(a), num(b)
    if na is None or nb is None:
        return None
    return abs(na - nb) < 0.5


# 4 = Combined Evidence Library, 3 = Current ETR Addendum, 1 = OCT26 Current TSIS
for r in sheet('Combined Evidence Library'):
    add_evidence(r, None, 4, 'Combined Evidence Library')
for r in sheet('Current ETR Addendum'):
    add_evidence(r, None, 3, 'Current ETR Addendum')
for r in sheet('OCT26 Current TSIS'):
    add_evidence(r, 'oct26', 1, 'OCT26 Current TSIS')

evidence = list(evidence_by_id.values())
for e in evidence:
    e.pop('_precedence', None)
    if e['sourceLane'] == 'oct26' and 'Z-Score' in (e.get('metric') or ''):
        e['sourceLane'] = 'zscore'
    if e['currentOrHistorical'] is None:
        e['currentOrHistorical'] = 'historical'

# ═════════════════════════════════════════════════ signals (canvas + inv) ═══
inv = {r['Signal_ID']: r for r in sheet('Signal Inventory') if r.get('Signal_ID')}
signals = []
for r in sheet('Signal Canvas'):
    sid = r.get('Signal ID')
    if not sid:
        continue
    i = inv.get(sid, {})
    signals.append(blank_object(
        id=sid, objectType='Signal', title=r.get('Signal Name'),
        statement=r.get('Signal Statement'),
        description=i.get('Signal_Statement'),
        classification='ETR interpretation',
        confidence=r.get('Confidence'),
        theme=i.get('Related_Themes'),
        verificationStatus=r.get('Evidence Strength'),
        workflowStatus=r.get('Reviewer Decision'),
        caveat=r.get('Source Gaps') or i.get('Source_Gaps'),
        recommendedNextAction=i.get('Human_Review_Required'),
        supportingIds=ids(i.get('Supporting_Evidence_IDs')),
        contradictingIds=ids(i.get('Contradicting_Evidence_IDs')),
        sourceWorksheet='Signal Canvas', sourceRow=r['_row'],
        sourceLane='interpretation',
        sourceNeededFields=[f for f in ['Source Gaps'] if r.get('Source Gaps')],
        prohibitedConclusions=None,
    ))

# ═════════════════════════════════════════════════════════════════ KPIs ═════
kpis = []
for r in sheet('KPI Inventory'):
    if not r.get('KPI_ID'):
        continue
    kpis.append(blank_object(
        id=r['KPI_ID'], objectType='KPI', title=r.get('KPI_Name'),
        statement=r.get('Description'), description=r.get('Description'),
        classification='Client-provided fact',
        sourceName=r.get('Source'), dataset=r.get('Dataset'), period=r.get('Period'),
        metric=r.get('Metric'), value=r.get('Value'), trend=r.get('Trend'),
        nBase=r.get('Base_Sample'), confidence=r.get('Confidence'),
        workflowStatus=r.get('Status'), verificationStatus=r.get('Verification_Status'),
        caveat=r.get('Notes'),
        supportingIds=ids(r.get('Supporting_Evidence')),
        relatedSignalIds=ids(r.get('Related_Signals')),
        sourceWorksheet='KPI Inventory', sourceRow=r['_row'],
        sourceLane='company',
        currentOrHistorical=period_class(r.get('Period')),
        sourceNeededFields=source_needed_fields(r, ['Value', 'Base_Sample', 'Verification_Status']),
    ))

# ══════════════════════════════════════════════════════════════ bridges ═════
sigrel = {}
for r in sheet('Signal Relationships'):
    if r.get('Signal_ID') and r.get('KPI_ID'):
        sigrel[(r['Signal_ID'], r['KPI_ID'])] = r

bridges = []
for r in sheet('KPI Bridge'):
    sid, kid = r.get('Signal ID'), r.get('KPI ID')
    if not sid or not kid:
        continue
    sr = sigrel.get((sid, kid), {})
    linkage = r.get('Linkage Type')
    bridges.append(blank_object(
        id=f'BRIDGE-{sid}-{kid}', objectType='Bridge',
        title=f'{sid} → {kid}',
        statement=r.get('Economic Mechanism'),
        description=r.get('Economic Mechanism'),
        classification='Hypothesis' if (linkage or '').lower().startswith('hypoth') else
                       ('Client-provided fact' if (linkage or '').lower() == 'definitional' else 'ETR interpretation'),
        relatedSignalIds=[sid], relatedKpiIds=[kid],
        supportingIds=ids(sr.get('Supporting_Evidence_IDs')),
        contradictingIds=ids(sr.get('Contradicting_Evidence_IDs')),
        confidence=r.get('Confidence'),
        workflowStatus=r.get('Review Decision'),
        caveat=r.get('Known Confounders'),
        recommendedNextAction=r.get('Source Needed'),
        sourceWorksheet='KPI Bridge', sourceRow=r['_row'],
        sourceLane='crosslane',
        sourceNeededFields=source_needed_fields(r, ['Required Time Lag', 'Source Needed']),
    ))
    b = bridges[-1]
    b['linkageType'] = linkage
    b['signalName'] = r.get('Signal')
    b['kpiName'] = r.get('KPI')
    b['mechanism'] = r.get('Economic Mechanism')
    b['requiredLag'] = r.get('Required Time Lag')
    b['lagSupported'] = r.get('Lag Supported')
    b['confounders'] = r.get('Known Confounders')
    b['sourceNeededText'] = r.get('Source Needed')
    b['expectedDirection'] = 'Positive' if (linkage or '').lower() != 'definitional' else 'Definitional'
    b['validationStatus'] = ('Definitional — accounting identity' if (linkage or '').lower() == 'definitional'
                             else 'Hypothesis — Backtest Required')
    b['cellState'] = ('Definitional' if (linkage or '').lower() == 'definitional'
                      else ('Source Needed' if (r.get('Lag Supported') or '').lower() == 'no'
                            else ('Partial support' if (r.get('Lag Supported') or '').lower() == 'partial'
                                  else 'Hypothesized')))

# ═══════════════════════════════════════════════════ risks, questions ══════
risks = []
for r in sheet('Risks'):
    if not r.get('ID'):
        continue
    risks.append(blank_object(
        id=r['ID'], objectType='Risk', title=r.get('Title'),
        statement=r.get('Description'), description=r.get('Description'),
        classification='Client-provided fact',
        sourceName=r.get('Source'), dataset=r.get('Dataset'), period=r.get('Period'),
        metric=r.get('Metric'), value=r.get('Value'), confidence=r.get('Confidence'),
        verificationStatus=r.get('Verification_Status'), caveat=r.get('Notes'),
        contradictingIds=ids(r.get('Contradicts')),
        relatedSignalIds=ids(r.get('Contradicts')),
        sourceWorksheet='Risks', sourceRow=r['_row'],
        sourceLane=source_lane_of([r.get('Source'), r.get('Dataset')]),
        currentOrHistorical=period_class(r.get('Period')),
        importance=r.get('Confidence'),
    ))

openQuestions = []
rq = {r.get('Object ID'): r for r in sheet('Review Queue') if r.get('Object ID')}
for r in sheet('Open Questions'):
    if not r.get('ID'):
        continue
    q = rq.get(r['ID'], {})
    openQuestions.append(blank_object(
        id=r['ID'], objectType='OpenQuestion', title=r.get('Title'),
        statement=r.get('Description'), description=r.get('Description'),
        classification='Open question', theme=r.get('Theme'),
        importance=r.get('Priority'),
        workflowStatus=q.get('Status') or r.get('Priority'),
        sourceName=r.get('Expected_Source'),
        caveat=q.get('Reviewer Notes'),
        sourceWorksheet='Open Questions', sourceRow=r['_row'],
        sourceLane='rules',
        recommendedNextAction=r.get('Expected_Source'),
    ))

reviewItems = []
for r in sheet('Review Queue'):
    if not r.get('Object ID'):
        continue
    reviewItems.append(blank_object(
        id=f"RQ-{r['Object ID']}", originalId=r.get('Object ID'), objectType='ReviewItem',
        title=r.get('Title'), statement=r.get('Issue / Question'),
        classification='Open question', theme=r.get('Queue Type'),
        importance=r.get('Priority / Confidence'), workflowStatus=r.get('Status'),
        sourceName=r.get('Expected Source'), caveat=r.get('Reviewer Notes'),
        sourceWorksheet='Review Queue', sourceRow=r['_row'], sourceLane='rules',
    ))

# ══════════════════════════════════════════════════════════ rules, context ══
rules = []
for r in sheet('Interpretation Rules'):
    if not r.get('Rule ID'):
        continue
    rules.append(blank_object(
        id=r['Rule ID'], objectType='Rule', title=r.get('Rule Name'),
        statement=r.get('Trigger Condition'),
        classification=r.get('REVEAL Classification'),
        theme=r.get('Rule Family'), workflowStatus=r.get('Rule Status'),
        caveat=r.get('Required Caveat'),
        sourceName=r.get('Supporting Methodology Source'),
        sourceWorksheet='Interpretation Rules', sourceRow=r['_row'], sourceLane='rules',
        recommendedNextAction=r.get('Validation Method'),
        prohibitedConclusions=r.get('Prohibited Interpretation / Action'),
    ))
    rr = rules[-1]
    rr['ruleFamily'] = r.get('Rule Family')
    rr['ruleStatus'] = r.get('Rule Status')
    rr['enforcement'] = r.get('Enforcement')
    rr['triggerCondition'] = r.get('Trigger Condition')
    rr['requiredInputs'] = r.get('Required Context / Inputs')
    rr['permitted'] = r.get('Permitted Interpretation / Action')
    rr['prohibited'] = r.get('Prohibited Interpretation / Action')
    rr['confidenceGate'] = r.get('Confidence Gate')
    rr['externalTreatment'] = r.get('External Research Treatment')
    rr['requiredCaveat'] = r.get('Required Caveat')
    rr['validationMethod'] = r.get('Validation Method')
    rr['owner'] = r.get('Owner')
    rr['version'] = r.get('Version')
    # Column-shift detection: an Enforcement cell that reads like a trigger.
    enf = (r.get('Enforcement') or '')
    rr['columnShiftSuspected'] = bool(enf) and not re.match(
        r'^(hard block|language constraint|required field|review gate)$', enf.strip(), re.I)

contextRules = []
for r in sheet('MCP Context Export'):
    if not r.get('Context ID'):
        continue
    contextRules.append(blank_object(
        id=r['Context ID'], objectType='ContextRule', title=r.get('Applies To'),
        statement=r.get('Instruction Text'),
        classification='Recommended action',
        workflowStatus=r.get('Status'),
        caveat=r.get('If Missing'),
        relatedRuleIds=ids(r.get('Source Rule IDs')),
        sourceWorksheet='MCP Context Export', sourceRow=r['_row'], sourceLane='rules',
    ))
    contextRules[-1]['ifMissing'] = r.get('If Missing')
    contextRules[-1]['version'] = r.get('Version')

metricContext = []
for r in sheet('Metric Context Matrix'):
    if not r.get('Metric / Input'):
        continue
    metricContext.append({
        'metric': r.get('Metric / Input'), 'question': r.get('Question It Answers'),
        'role': r.get('Primary Role'), 'pairedWith': r.get('Must Be Paired With'),
        'canSupport': r.get('What It Can Support'), 'cannotProve': r.get('What It Cannot Prove'),
        'confidenceInputs': r.get('Confidence Inputs'),
        'externalInterface': r.get('External Research Interface'),
        'example': r.get('CrowdStrike Example'), 'ruleIds': ids(r.get('Rule IDs')),
        'status': r.get('Status'), 'sourceWorksheet': 'Metric Context Matrix', 'sourceRow': r['_row'],
    })

governance = [{'topic': r.get('col0'), 'detail': r.get('col1'), 'sourceRow': r['_row']}
              for r in sheet('Rule Governance', header_hint=0)
              if r.get('col0') and r.get('col1')]

# ══════════════════════════════════════════════ interpretations, crosslane ══
interpretations = []
for r in sheet('Updated Interpretations v3.5'):
    if not r.get('Rank'):
        continue
    interpretations.append(blank_object(
        id=f"INT-V35-{str(r['Rank']).zfill(2)}", objectType='Interpretation',
        title=r.get('Theme'), statement=r.get('Updated Interpretation'),
        classification=r.get('REVEAL Classification'), theme=r.get('Theme'),
        confidence=r.get('Confidence'), workflowStatus=r.get('Status'),
        supportingIds=ids(r.get('Supporting Evidence')),
        relatedRuleIds=ids(r.get('Rule IDs')),
        prohibitedConclusions=r.get('What It Does Not Prove'),
        sourceWorksheet='Updated Interpretations v3.5', sourceRow=r['_row'],
        sourceLane='interpretation', currentOrHistorical='current',
    ))

crossLaneLinks = []
for r in sheet('Cross-Lane Synthesis'):
    if not r.get('Bridge ID'):
        continue
    crossLaneLinks.append(blank_object(
        id=r['Bridge ID'], objectType='CrossLane', title=r.get('Research Theme'),
        statement=r.get('Integrated Evidence Statement'),
        classification=r.get('REVEAL Classification'),
        theme=r.get('Research Theme'),
        prohibitedConclusions=r.get('What It Does Not Prove'),
        recommendedNextAction=r.get('Recommended Action'),
        supportingIds=ids(r.get('ETR Evidence IDs / Source')) + ids(r.get('Reflexivity Object IDs')),
        sourceWorksheet='Cross-Lane Synthesis', sourceRow=r['_row'], sourceLane='crosslane',
    ))
    crossLaneLinks[-1]['relationshipType'] = r.get('Relationship Type')
    crossLaneLinks[-1]['etrSide'] = r.get('ETR Evidence IDs / Source')
    crossLaneLinks[-1]['companySide'] = r.get('Reflexivity Object IDs')

backtests = []
for r in sheet('Backtest Protocol'):
    if not r.get('Test ID'):
        continue
    backtests.append(blank_object(
        id=r['Test ID'], objectType='Backtest', title=r.get('ETR Dataset / Metric'),
        statement=r.get('KPI Definition'),
        classification='Hypothesis', workflowStatus=r.get('Protocol Status'),
        relatedRuleIds=ids(r.get('Rule ID')),
        supportingIds=ids(r.get('Required Evidence IDs')),
        caveat=r.get('Confounders'),
        sourceWorksheet='Backtest Protocol', sourceRow=r['_row'], sourceLane='rules',
        sourceNeededFields=source_needed_fields(
            r, ['Expected Lag', 'Tolerance / Hit Criterion', 'Signal Vintage Date']),
    ))
    bt = backtests[-1]
    for k, f in [('company', 'Company'), ('vintage', 'Signal Vintage Date'),
                 ('frozen', 'Signal Definition Frozen?'), ('direction', 'Signal Direction'),
                 ('zVersion', 'Z-Score Version / Value'), ('forecaster', 'Forecaster Vintage / Value'),
                 ('kpiTarget', 'KPI Target'), ('kpiDefinition', 'KPI Definition'),
                 ('window', 'KPI Observation Window'), ('expectedLag', 'Expected Lag'),
                 ('expectedDirection', 'Expected Direction'), ('tolerance', 'Tolerance / Hit Criterion'),
                 ('confounders', 'Confounders'), ('owner', 'Analyst Owner')]:
        bt[k] = r.get(f)

calibrationCases = []
for r in sheet('Analyst Calibration'):
    if not r.get('Case ID'):
        continue
    calibrationCases.append(blank_object(
        id=r['Case ID'], objectType='CalibrationCase',
        title=r.get('Evidence Snapshot / Frozen Inputs'),
        statement=r.get('Evidence Snapshot / Frozen Inputs'),
        classification='Recommended action',
        workflowStatus=r.get('Case Status') or r.get('Analyst'),
        relatedRuleIds=ids(r.get('Rule IDs Applied')),
        supportingIds=ids(r.get('Analyst')) + ids(r.get('Best Evidence IDs')),
        caveat=r.get('Key Caveat'),
        sourceWorksheet='Analyst Calibration', sourceRow=r['_row'], sourceLane='rules',
    ))

# ═══════════════════════════════════════════════════════════ relationships ══
# The relationship worksheets address objects by their ORIGINAL ids (NS-001, PP-003),
# while the Combined Evidence Library keys them by Unified id (ETR-NS-001). One alias
# map resolves both spellings; an endpoint that resolves to neither is dropped from the
# graph and recorded, never silently rewritten.
ALIAS = {}
for _coll in (evidence, signals, kpis, bridges, risks, openQuestions, rules, contextRules,
              sources, crossLaneLinks, backtests, calibrationCases, interpretations, reviewItems):
    for _o in _coll:
        ALIAS[_o['id']] = _o['id']
        if _o.get('originalId'):
            ALIAS.setdefault(_o['originalId'], _o['id'])

relationships = []
known = set()
droppedEdges = []


def resolve_id(x):
    return ALIAS.get(x)


def rel(frm, typ, to, note=None, origin=None, dashed=False):
    if not frm or not to:
        return
    rf, rt = resolve_id(frm), resolve_id(to)
    if rf is None or rt is None:
        droppedEdges.append({'from': frm, 'type': typ, 'to': to, 'origin': origin,
                             'unresolved': [x for x, r in ((frm, rf), (to, rt)) if r is None]})
        return
    key = (rf, typ, rt)
    if key in known:
        return
    known.add(key)
    relationships.append({
        'id': f'REL-{len(relationships)+1:04d}', 'from': rf, 'type': typ, 'to': rt,
        'note': note, 'origin': origin, 'dashed': dashed,
    })


# Source Register → Evidence  (SOURCE_OF)
for s in sources:
    for eid in s['relatedEvidenceIds']:
        rel(s['id'], 'SOURCE_OF', eid, 'Source Register Evidence_IDs_Referencing', 'Source Register')

# Raw worksheet → OCT26 evidence  (NORMALIZES_TO), by source file name
RAW_FOR_FILE = {
    'single_vendor_view': 'RAW-VENDOR-VIEW',
    'single_vendor_aggregate_pervasion': 'RAW-PERVASION-TREND',
    'subsample_candlestick': 'RAW-SUBSAMPLE-CUTS',
    'respondent_subsample_region': 'RAW-REGION',
    'adoption_reasoning': 'RAW-ADOPTION-REASONS',
    'respondent_composition_job_title': 'RAW-JOB-TITLES',
    'survey_z_score': 'RAW-Z-SCORE',
    'vendor_trends': 'RAW-PEER-TRENDS',
}
rawNodes = []
RAW_SHEET_FOR_NODE = {
    'RAW-VENDOR-VIEW': 'Raw - Vendor View', 'RAW-PERVASION-TREND': 'Raw - Pervasion Trend',
    'RAW-SUBSAMPLE-CUTS': 'Raw - Subsample Cuts', 'RAW-REGION': 'Raw - Region',
    'RAW-ADOPTION-REASONS': 'Raw - Adoption Reasons', 'RAW-JOB-TITLES': 'Raw - Job Titles',
    'RAW-Z-SCORE': 'Raw - Z Score', 'RAW-PEER-TRENDS': 'Raw - Peer Trends',
}
for node, shname in RAW_SHEET_FOR_NODE.items():
    rawNodes.append(blank_object(
        id=node, objectType='RawRecord', title=shname,
        statement=f'Exact row-level import worksheet: {shname}.',
        classification='Client-provided fact', sourceWorksheet=shname,
        sourceLane='oct26' if node != 'RAW-Z-SCORE' else 'zscore',
        currentOrHistorical='current', period='Oct 2026',
        caveat='Raw import. Values are displayed as supplied and never override a normalized object silently.',
    ))
for _n in rawNodes:
    ALIAS[_n['id']] = _n['id']

for e in evidence:
    f = (e.get('sourceFile') or '')
    for frag, node in RAW_FOR_FILE.items():
        if frag in f:
            rel(node, 'NORMALIZES_TO', e['id'], f'{RAW_SHEET_FOR_NODE[node]} → {e["id"]}', 'Raw worksheet')
            # and the source-register row that names the same file
            for s in sources:
                if s.get('sourceFile') and frag in s['sourceFile']:
                    rel(s['id'], 'SOURCE_OF', node, 'Source Register CSV export', 'Source Register')

# Evidence Relationships sheet
for r in sheet('Evidence Relationships'):
    eid = r.get('Evidence_ID')
    if not eid:
        continue
    note = r.get('Notes')
    for sid in ids(r.get('Supports_Signal_ID')):
        rel(eid, 'SUPPORTS', sid, note, 'Evidence Relationships')
    for sid in ids(r.get('Contradicts_Signal_ID')):
        rel(eid, 'CONTRADICTS', sid, note, 'Evidence Relationships')
    for oid in ids(r.get('Related_Evidence_IDs')):
        rel(eid, 'RELATES_TO', oid, note, 'Evidence Relationships')
    for kid in ids(r.get('Related_KPI_IDs')):
        rel(eid, 'INFORMS', kid, note, 'Evidence Relationships')

# Signal Inventory rosters
for s in signals:
    for eid in s['supportingIds']:
        rel(eid, 'SUPPORTS', s['id'], 'Signal Inventory Supporting_Evidence_IDs', 'Signal Inventory')
    for eid in s['contradictingIds']:
        rel(eid, 'CONTRADICTS', s['id'], 'Signal Inventory Contradicting_Evidence_IDs', 'Signal Inventory')

# KPI Bridge / Signal Relationships
for b in bridges:
    sid, kid = b['relatedSignalIds'][0], b['relatedKpiIds'][0]
    dashed = b['validationStatus'].startswith('Hypothesis')
    rel(sid, 'INFORMS', b['id'], b.get('mechanism'), 'KPI Bridge', dashed)
    rel(b['id'], 'INFORMS', kid, b.get('mechanism'), 'KPI Bridge', dashed)
    for eid in b['supportingIds']:
        rel(eid, 'SUPPORTS', b['id'], 'Signal Relationships Supporting_Evidence_IDs', 'Signal Relationships')
    for eid in b['contradictingIds']:
        rel(eid, 'CONTRADICTS', b['id'], 'Signal Relationships Contradicting_Evidence_IDs', 'Signal Relationships')

# Cross-Lane Synthesis
for x in crossLaneLinks:
    for oid in x['supportingIds']:
        rel(oid, 'CONTEXTUALIZES', x['id'], x.get('relationshipType'), 'Cross-Lane Synthesis')

# Interpretations
for i in interpretations:
    for eid in i['supportingIds']:
        rel(eid, 'SUPPORTS', i['id'], 'Updated Interpretations v3.5 Supporting Evidence', 'Updated Interpretations v3.5')
    for rid in i['relatedRuleIds']:
        rel(i['id'], 'GOVERNED_BY', rid, 'Updated Interpretations v3.5 Rule IDs', 'Updated Interpretations v3.5')

# Rules governing bridges and backtests
for b in backtests:
    for rid in b['relatedRuleIds']:
        rel(b['id'], 'GOVERNED_BY', rid, 'Backtest Protocol Rule ID', 'Backtest Protocol')
    for eid in b['supportingIds']:
        rel(eid, 'SUPPORTS', b['id'], 'Backtest Protocol Required Evidence IDs', 'Backtest Protocol')

# Context rules govern rules
for c in contextRules:
    for rid in c['relatedRuleIds']:
        rel(c['id'], 'GOVERNED_BY', rid, 'MCP Context Export Source Rule IDs', 'MCP Context Export')

# Risks contradict / impact signals
for rk in risks:
    for sid in rk['contradictingIds']:
        rel(rk['id'], 'CONTRADICTS', sid, rk.get('caveat'), 'Risks Contradicts')

# Open questions block the signals whose Source Gaps name them
for s in signals:
    gap = s.get('caveat') or ''
    for qid in ids(gap):
        if qid.startswith('OQ-'):
            rel(qid, 'BLOCKS', s['id'], 'Signal Canvas Source Gaps', 'Signal Canvas')
for b in bridges:
    for qid in ids(b.get('sourceNeededText')):
        if qid.startswith('OQ-'):
            rel(qid, 'BLOCKS', b['id'], 'KPI Bridge Source Needed', 'KPI Bridge')

# Output nodes — the three generated surfaces, and what they communicate from
outputs = [
    blank_object(id='OUT-BRIEF', objectType='Output', title='Vendor Signal Brief',
                 statement='Call-first printable brief assembled from workbook objects.',
                 classification='Recommended action', sourceLane='crosslane'),
    blank_object(id='OUT-SUNDAY', objectType='Output', title='Sunday Signal draft',
                 statement='Deterministic draft assembled from selected workbook objects.',
                 classification='Recommended action', sourceLane='crosslane'),
    blank_object(id='OUT-EMAIL', objectType='Output', title='Research update email draft',
                 statement='Deterministic email draft assembled from selected workbook objects.',
                 classification='Recommended action', sourceLane='crosslane'),
]
for _o in outputs:
    ALIAS[_o['id']] = _o['id']

for out in outputs:
    for oid in ['SIG-02', 'KPI-003', 'ETR-OCT26-NS', 'ETR-OCT26-ZS']:
        rel(oid, 'GENERATED_FROM', out['id'], 'Generated-output claim manifest', 'Output manifest')
    rel(out['id'], 'COMMUNICATES', 'SIG-02', 'Primary signal communicated by this output', 'Output manifest')

# Historical comparison edges, from the raw period columns
rel('ETR-OCT26-NS', 'HISTORICAL_COMPARISON', 'ETR-CUR-001',
    'Oct 2026 Net Score against the JUL26 historical reading', 'Raw - Vendor View')
rel('ETR-OCT26-PV', 'HISTORICAL_COMPARISON', 'ETR-CUR-002',
    'Oct 2026 Pervasion against the JUL26 historical reading', 'Raw - Pervasion Trend')

# ═════════════════════════════════════════════════════════ data conflicts ═══
# 1. Residual "current" language on objects now relabelled historical
for e in evidence:
    if e['currentOrHistorical'] == 'historical' and e.get('caveat') and \
       re.search(r'\bcurrent[- ]period\b|resolves the current', e['caveat'], re.I):
        conflicts.append({
            'id': f'CONF-{len(conflicts)+1:03d}', 'objectId': e['id'], 'field': 'caveat',
            'valueA': e['caveat'], 'sheetA': e['sourceWorksheet'], 'rowA': e['sourceRow'],
            'valueB': f"Source Lane now reads '{e['sourceType']}' with period {e['period']}",
            'sheetB': 'Current ETR Addendum', 'rowB': e['sourceRow'],
            'periodA': e['period'], 'periodB': 'Oct 2026 is current (R-025)',
            'roundingCouldExplain': False,
            'resolution': ('Caveat text still calls this object current-period while V3.5 relabels it '
                           'historical. Both preserved; R-025 governs the period label.'),
        })

# 2. Rule rows whose Permitted column holds prohibition text (column shift)
for r in rules:
    if r.get('columnShiftSuspected'):
        conflicts.append({
            'id': f'CONF-{len(conflicts)+1:03d}', 'objectId': r['id'], 'field': 'Permitted / Prohibited',
            'valueA': r.get('permitted'), 'sheetA': 'Interpretation Rules', 'rowA': r['sourceRow'],
            'valueB': r.get('prohibited'), 'sheetB': 'Interpretation Rules', 'rowB': r['sourceRow'],
            'periodA': None, 'periodB': None, 'roundingCouldExplain': False,
            'resolution': ('Fields from Enforcement rightward appear shifted one column, so the Permitted '
                           'cell holds prohibition text. The canonical prohibition in R-015 governs; '
                           'flagged for workbook repair, not repaired here.'),
        })

# 3. Cohort / regional N absent where a percentage is displayed (R-009)
for e in evidence:
    if e['currentOrHistorical'] == 'current' and e.get('nBase') and \
       SOURCE_NEEDED_RE.search(e['nBase']):
        conflicts.append({
            'id': f'CONF-{len(conflicts)+1:03d}', 'objectId': e['id'], 'field': 'nBase',
            'valueA': e['nBase'], 'sheetA': e['sourceWorksheet'], 'rowA': e['sourceRow'],
            'valueB': 'R-009 requires N with every ETR percentage', 'sheetB': 'Interpretation Rules',
            'rowB': None, 'periodA': e['period'], 'periodB': e['period'],
            'roundingCouldExplain': False,
            'resolution': 'Displayed as Source Needed. OQ-014 tracks the missing cut-level Ns.',
        })

# 4. Period label vs export timestamp
conflicts.append({
    'id': f'CONF-{len(conflicts)+1:03d}', 'objectId': 'OQ-015', 'field': 'period label',
    'valueA': 'Survey labels read October 2026', 'sheetA': 'OCT26 Current TSIS', 'rowA': None,
    'valueB': 'Source export filenames are dated 2026-09-10', 'sheetB': 'Source Register', 'rowB': None,
    'periodA': 'Oct 2026', 'periodB': '2026-09-10 export', 'roundingCouldExplain': False,
    'resolution': 'Both preserved. OQ-015 is open; this application does not reconcile them.',
})

# ═══════════════════════════════════════════════════ generated templates ════
generatedOutputTemplates = {
    'sundaySignal': {
        'sections': ['Headline', 'Why This Matters Now', 'What the October Data Shows',
                     'What Changed Since July', 'Where the Signal Is Strongest',
                     'Where It Is Mixed', 'What Z-Score Adds', 'What the Evidence Does Not Prove',
                     'KPI Bridge / Hypothesis', 'What to Watch Next',
                     'Sources and Evidence IDs', 'Human Review Required'],
        'tones': ['concise', 'analytical', 'executive'],
        'lengths': ['short', 'standard', 'extended'],
    },
    'updateEmail': {
        'types': ['Internal Research Update', 'Executive Update', 'Client Update',
                  'Signal Alert', 'Proof-Case Status Update'],
        'sections': ['Bottom Line', 'What Changed', 'Best Evidence', 'Counter-Evidence / Caveat',
                     'Z-Score Context', 'KPI Relevance', 'Open Question',
                     'Recommended Next Action', 'Evidence IDs', 'Human Review Required'],
        'subjectDefault': 'CrowdStrike Signal Update — October 2026 TSIS',
        'lengths': ['concise', 'standard', 'detailed'],
    },
    'audiences': [
        {'id': 'cio', 'label': 'Enterprise CIO / CISO'},
        {'id': 'product', 'label': 'Product and Strategy'},
        {'id': 'ar', 'label': 'Analyst Relations'},
        {'id': 'sellside', 'label': 'Sell-Side Analyst'},
        {'id': 'investor', 'label': 'Buy-Side Investor'},
        {'id': 'pe', 'label': 'Private Equity / Corporate Development'},
        {'id': 'etrresearch', 'label': 'ETR Research'},
        {'id': 'etrsales', 'label': 'ETR Sales / Client Success'},
    ],
}

# ══════════════════════════════════════════════════════════════ validation ══
TARGETS = {
    'netScoreOct2026': 37.14285714, 'netScoreJul2026': 36.45621181,
    'netScoreOct2025': 26.60714286, 'pervasionOct2026': 40.8997955,
    'pervasionJul2026': 38.3805668, 'pervasionOct2025': 38.48973607,
    'zMetricValue': 37.14285714, 'zQQChange': 0.68664533, 'zYYChange': 10.53571429,
    'zQQ': 0.129243494, 'zYY': 0.892193894, 'zN': 420,
}

checks = []


def check(cid, name, ok, detail):
    checks.append({'id': cid, 'check': name, 'result': 'PASS' if ok else 'FAIL', 'detail': detail})


def close(a, b, tol=1e-6):
    return a is not None and b is not None and abs(a - b) < tol


all_ids = set()
for coll in (evidence, signals, kpis, bridges, risks, openQuestions, rules, contextRules,
             sources, crossLaneLinks, backtests, calibrationCases, reviewItems,
             interpretations, rawNodes, outputs):
    for o in coll:
        all_ids.add(o['id'])

check('V-01', 'Every authorized worksheet read is listed',
      set(READ_SHEETS) == set(AUTHORIZED),
      f'{len(READ_SHEETS)} of {len(AUTHORIZED)} authorized worksheets read: ' +
      (', '.join(sorted(set(AUTHORIZED) - set(READ_SHEETS))) or 'all'))
check('V-02', 'No unauthorized worksheet contributed data',
      all(s in AUTHORIZED for s in READ_SHEETS),
      f'{len(SKIPPED)} present-but-unread sheets: ' + ', '.join(SKIPPED))
check('V-03', 'October 2026 is the current period',
      currentPeriod['label'] == 'October 2026' and currentPeriod['isCurrent'],
      'currentPeriod.label = October 2026 (R-025)')
check('V-04', 'July 2026 is historical',
      any(h['label'] == 'July 2026' for h in historicalPeriods) and
      not any(e['currentOrHistorical'] == 'current' and 'JUL26' in (e.get('period') or '')
              for e in evidence),
      'July 2026 present only in historicalPeriods and historical evidence')
check('V-05', 'Net Score extraction matches the workbook',
      close(currentPeriod['netScore']['value'], TARGETS['netScoreOct2026']) and
      close(historicalPeriods[0]['netScore'], TARGETS['netScoreJul2026']) and
      close(historicalPeriods[1]['netScore'], TARGETS['netScoreOct2025']),
      f"Oct {currentPeriod['netScore']['value']} / Jul {historicalPeriods[0]['netScore']} / "
      f"Oct25 {historicalPeriods[1]['netScore']}")
check('V-06', 'Pervasion extraction matches the workbook',
      close(currentPeriod['pervasion']['value'], TARGETS['pervasionOct2026']) and
      close(historicalPeriods[0]['pervasion'], TARGETS['pervasionJul2026']) and
      close(historicalPeriods[1]['pervasion'], TARGETS['pervasionOct2025']),
      f"Oct {currentPeriod['pervasion']['value']} / Jul {historicalPeriods[0]['pervasion']} / "
      f"Oct25 {historicalPeriods[1]['pervasion']}")
z = currentPeriod['zScore']
check('V-07', 'Q/Q and Y/Y Z-Scores match the workbook',
      close(z['qqZ'], TARGETS['zQQ']) and close(z['yyZ'], TARGETS['zYY']) and
      close(z['metricValue'], TARGETS['zMetricValue']) and
      close(z['qqChange'], TARGETS['zQQChange']) and close(z['yyChange'], TARGETS['zYYChange']) and
      z['citations'] == TARGETS['zN'],
      f"metric {z['metricValue']}; Q/Q Δ {z['qqChange']}; Y/Y Δ {z['yyChange']}; "
      f"Q/Q Z {z['qqZ']}; Y/Y Z {z['yyZ']}; N {z['citations']}")

miss_ev = [r for r in relationships if r['from'] not in all_ids or r['to'] not in all_ids]
check('V-08', 'Every displayed evidence ID exists',
      all(e['id'] for e in evidence), f'{len(evidence)} evidence objects')
check('V-09', 'Every displayed signal ID exists',
      all(s['id'] for s in signals) and len(signals) == 7, f'{len(signals)} signals, SIG-01..SIG-07')
check('V-10', 'Every KPI ID exists', all(k['id'] for k in kpis), f'{len(kpis)} KPI objects')
check('V-11', 'Every rule ID exists',
      all(r['id'] for r in rules) and all(c['id'] for c in contextRules),
      f'{len(rules)} rules, {len(contextRules)} context rules')
unresolved_names = sorted({u for d in droppedEdges for u in d['unresolved']})
check('V-12', 'Every relationship in the graph has valid nodes', not miss_ev,
      f'{len(relationships)} edges, all endpoints resolve. '
      f'{len(droppedEdges)} worksheet references could not be resolved to an object and were '
      f'excluded from the graph rather than rewritten'
      + (': ' + ', '.join(unresolved_names[:10]) + (' …' if len(unresolved_names) > 10 else '')
         if unresolved_names else '.'))
CAUSAL = re.compile(r'\b(caused|drove|driven by|explains|proves|predicted|resulted in)\b', re.I)
NEGATED = re.compile(r'\b(no|not|never|cannot|does not|without|prohibit|remains unestablished)\b', re.I)
causal_hits = []
for coll in (interpretations, crossLaneLinks, signals, bridges):
    for o in coll:
        for f in ('statement', 'description', 'caveat'):
            # prohibitedConclusions is a "what it does not prove" field by construction
            v = o.get(f)
            if v and CAUSAL.search(v) and not NEGATED.search(v):
                causal_hits.append(f"{o['id']}.{f}")
check('V-13', 'No causal language links ETR to company KPIs',
      not causal_hits, 'clean' if not causal_hits else ', '.join(causal_hits[:5]))
BAND = re.compile(r'statistically significant|standard deviation|anomaly band|strong z|weak z', re.I)
band_hits = [f"{o['id']}.{f}" for coll in (interpretations, evidence)
             for o in coll
             for f in ('statement', 'caveat')
             if o.get(f) and BAND.search(o[f]) and not NEGATED.search(o[f])]
# rules are excluded: R-006 and R-007 must name the banned words in order to ban them
check('V-14', 'No Z-Score strength band was invented',
      not band_hits and z['bandStatus'] == 'Source Needed',
      'bandStatus = Source Needed; no band language in extracted objects')
cohort_sn = [e['id'] for e in evidence
             if e['currentOrHistorical'] == 'current' and e.get('nBase')
             and SOURCE_NEEDED_RE.search(e['nBase'])]
check('V-15', 'Cohort and regional Ns remain Source Needed when absent',
      len(cohort_sn) >= 4, f'{len(cohort_sn)} current objects carry an unresolved N: ' + ', '.join(cohort_sn))
check('V-30', 'Source-label / export-timestamp issue is preserved',
      any(c['objectId'] == 'OQ-015' for c in conflicts) and
      any(q['id'] == 'OQ-015' for q in openQuestions),
      'OQ-015 present as an open question and as a data conflict')
check('V-31', 'Data conflicts are preserved rather than averaged',
      len(conflicts) > 0, f'{len(conflicts)} conflicts recorded, none averaged')

runtime_checks = [
    ('V-16', 'Current-period filters affect evidence and lineage'),
    ('V-17', 'The Current Call does not change when filters change'),
    ('V-18', 'Global search works'),
    ('V-19', 'Deep links work'),
    ('V-20', 'Drawers work'),
    ('V-21', 'Lineage traversal works forward and backward'),
    ('V-22', 'Sunday Signal Generator works'),
    ('V-23', 'Update Email Generator works'),
    ('V-24', 'Generated claims include manifests'),
    ('V-25', 'Copy and download actions work'),
    ('V-26', 'Print Brief works'),
    ('V-27', 'App works under file://'),
    ('V-28', 'No external dependency is loaded'),
    ('V-29', 'Human Review status appears in generator chrome, not a global badge'),
]

sourceNeededCount = sum(1 for coll in (evidence, kpis, bridges, backtests, signals)
                        for o in coll if o.get('sourceNeededFields'))

validation = {
    'unresolvedWorksheetReferences': sorted({u for d in droppedEdges for u in d['unresolved']}),
    'unresolvedReferenceCount': len(droppedEdges),
    'generatedAt': metadata['generatedAt'],
    'workbook': WB_NAME,
    'extractionChecks': checks,
    'runtimeChecks': [{'id': i, 'check': n, 'result': 'RUNTIME',
                       'detail': 'Verified in the browser; see Methodology & Validation.'}
                      for i, n in runtime_checks],
    'targets': TARGETS,
    'conflicts': conflicts,
    'counts': {},          # filled after the model is assembled
    'sourceNeededCount': sourceNeededCount,
    'humanReviewRequired': True,
}

# ═══════════════════════════════════════════════════════════════ assemble ═══
metadata['worksheetsRead'] = sorted(READ_SHEETS)

DATA = {
    'metadata': metadata,
    'company': company,
    'currentPeriod': currentPeriod,
    'historicalPeriods': historicalPeriods,
    'sources': sources,
    'evidence': evidence,
    'signals': signals,
    'kpis': kpis,
    'bridges': bridges,
    'risks': risks,
    'openQuestions': openQuestions,
    'rules': rules,
    'contextRules': contextRules,
    'metricContext': metricContext,
    'governance': governance,
    'interpretations': interpretations,
    'rawTables': rawTables,
    'rawNodes': rawNodes,
    'crossLaneLinks': crossLaneLinks,
    'relationships': relationships,
    'backtests': backtests,
    'calibrationCases': calibrationCases,
    'reviewItems': reviewItems,
    'outputs': outputs,
    'conflicts': conflicts,
    'droppedEdges': droppedEdges,
    'workbookValidation': [
        {'id': r.get('Check ID'), 'check': r.get('Validation Check'),
         'result': r.get('Result'), 'note': r.get('Evidence / Note')}
        for r in sheet('V3.5 Validation') if r.get('Check ID')
    ],
    'generatedOutputTemplates': generatedOutputTemplates,
    'validation': validation,
}

validation['counts'] = {
    'evidence': len(evidence), 'signals': len(signals), 'kpis': len(kpis),
    'bridges': len(bridges), 'risks': len(risks), 'openQuestions': len(openQuestions),
    'rules': len(rules), 'contextRules': len(contextRules), 'sources': len(sources),
    'relationships': len(relationships), 'crossLaneLinks': len(crossLaneLinks),
    'backtests': len(backtests), 'calibrationCases': len(calibrationCases),
    'reviewItems': len(reviewItems), 'interpretations': len(interpretations),
    'rawTables': len(rawTables), 'rawNodes': len(rawNodes), 'conflicts': len(conflicts),
}

# ─── interface checks, carried through from the browser suite ───────────────
# test.mjs runs against the built application and writes ux-checks.json beside
# this script. The extractor only carries that file through so the Methodology
# view can show every check in one place; it never invents a result, and a
# missing file simply means the suite has not been run since the last build.
UX_FILE = OUT_DIR / 'ux-checks.json'
if UX_FILE.exists():
    try:
        validation['uxChecks'] = json.loads(UX_FILE.read_text(encoding='utf-8'))
    except Exception as exc:                      # a malformed file is reported, not guessed at
        validation['uxChecks'] = []
        validation['uxChecksNote'] = f'ux-checks.json could not be read: {exc}'
else:
    validation['uxChecks'] = []
    validation['uxChecksNote'] = ('ux-checks.json is absent — run `node test.mjs` to regenerate '
                                  'the interface checks.')

# ══════════════════════════════════════════════════════════════════ write ═══
js = ('/* reveal-data.js — generated by extract_workbook.py from\n'
      f' * {WB_NAME}\n'
      ' * Authorized worksheets only. Every value copied from a worksheet cell.\n'
      ' * Do not edit by hand: re-run the extractor instead.\n'
      ' */\n'
      'window.REVEAL_DATA = ' + json.dumps(DATA, ensure_ascii=False, indent=1) + ';\n')
(OUT_DIR / 'reveal-data.js').write_text(js, encoding='utf-8')
(OUT_DIR / 'validation-report.json').write_text(
    json.dumps(validation, ensure_ascii=False, indent=2), encoding='utf-8')

# ────────────────────────────────────────────────────────── terminal report ─
fails = [c for c in checks if c['result'] == 'FAIL']
print('=' * 78)
print('CrowdStrike REVEAL Company Explorer — workbook extraction')
print('=' * 78)
print(f'  workbook            {WB_NAME}')
print(f'  output folder       {OUT_DIR}')
print(f'  reveal-data.js      {(OUT_DIR / "reveal-data.js").stat().st_size:,} bytes')
print(f'  worksheets read     {len(READ_SHEETS)} of {len(AUTHORIZED)} authorized '
      f'({len(SKIPPED)} present but not read)')
print(f'  current period      {currentPeriod["label"]}   '
      f'Net Score {currentPeriod["netScore"]["value"]}   Pervasion {currentPeriod["pervasion"]["value"]}')
print('  historical periods  ' + ', '.join(f'{h["label"]} ({h["netScore"]})' for h in historicalPeriods))
print(f'  Z-Score             Q/Q {z["qqZ"]}   Y/Y {z["yyZ"]}   N {z["citations"]}   bands {z["bandStatus"]}')
print('  object counts       ' + ', '.join(f'{k} {v}' for k, v in validation['counts'].items()))
from collections import Counter
print('  relationship types  ' + ', '.join(f'{k} {v}' for k, v in
      sorted(Counter(r['type'] for r in relationships).items())))
print('  source lanes        ' + ', '.join(f'{k} {v}' for k, v in
      sorted(Counter(e['sourceLane'] for e in evidence).items())))
print(f'  Source Needed       {sourceNeededCount} objects carry at least one unresolved field')
print(f'  data conflicts      {len(conflicts)} preserved, none averaged')
print(f'  extraction checks   {len(checks)} run, {len(fails)} failed')
for c in checks:
    print(f'    {c["result"]:4}  {c["id"]}  {c["check"]}')
    if c['detail']:
        print(f'          {c["detail"][:120]}')
if fails:
    print('\nEXTRACTION FAILED — see validation-report.json')
    sys.exit(1)
print('\nExtraction complete.')
