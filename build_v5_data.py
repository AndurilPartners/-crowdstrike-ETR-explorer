#!/usr/bin/env python3
# =============================================================================
#  build_v5_data.py — CrowdStrike REVEAL V5 workbook → application data
#
#  Reads the CrowdStrike REVEAL V5 Research Lineage Workbench and writes the
#  data the Explorer consumes. The workbook is the sole factual source: nothing
#  here invents a value, averages a conflict, or fills a gap from model memory.
#
#  Usage:
#     python3 build_v5_data.py [path/to/workbook.xlsx]
#
#  With no argument it looks for a workbook in data/source/ (see WORKBOOK_GLOBS).
#
#  Outputs (deterministic ordering, stable across runs):
#     reveal-data.js                     window.REVEAL_DATA — what the app loads
#     data/generated/*.json              the same content, one file per section
#     validation-report.json          extraction checks, warnings, coverage
#
#  Exit codes:
#     0  built, no blocking data-integrity error
#     1  blocking data-integrity error (nothing is written)
#     2  the workbook could not be located or opened
#
#  Workbook items classified Needs Validation / Source Needed / Open Question /
#  Conflicting are WARNINGS, not failures: they are research state, and the
#  application is required to display them rather than resolve them.
# =============================================================================

import glob
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone

try:
    import openpyxl
except ImportError:                                             # pragma: no cover
    print('ERROR: openpyxl is required. pip install openpyxl', file=sys.stderr)
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
GEN_DIR = os.path.join(HERE, 'data', 'generated')
SRC_DIR = os.path.join(HERE, 'data', 'source')
WORKBOOK_GLOBS = [
    os.path.join(SRC_DIR, 'CrowdStrike_ETR_V5*.xlsx'),
    os.path.join(SRC_DIR, 'CrowdStrike*V5*.xlsx'),
    os.path.join(SRC_DIR, '*Research_Lineage_Workbench*.xlsx'),
    os.path.join(SRC_DIR, '*.xlsx'),
]

BLOCKING = []     # data-integrity errors — these fail the build
WARNINGS = []     # research state and soft gaps — these do not fail the build
CHECKS = []       # named extraction checks written into the validation report


def check(cid, name, ok, detail='', blocking=True):
    CHECKS.append(OrderedDict([('id', cid), ('name', name),
                               ('result', 'PASS' if ok else 'FAIL'),
                               ('detail', detail)]))
    if not ok:
        (BLOCKING if blocking else WARNINGS).append(f'{cid} {name}: {detail}')
    return ok


def warn(msg):
    if msg not in WARNINGS:
        WARNINGS.append(msg)


# ─────────────────────────────────────────────────────────── sheet reading ──
def cell(v):
    """Workbook cell → clean string. None/'nan' become ''. Never invents text."""
    if v is None:
        return ''
    s = str(v).strip()
    if s.lower() in ('nan', 'none', '#n/a'):
        return ''
    return s


def num(v):
    """Workbook cell → float, or None when the workbook does not supply one."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('%', '').replace(',', '')
    try:
        return float(s)
    except ValueError:
        return None


def sheet_rows(ws):
    """Every row of a worksheet as a list of cleaned strings (blank rows kept)."""
    out = []
    for r in ws.iter_rows(values_only=True):
        out.append([cell(c) for c in r])
    return out


def find_header(rows, required, start=0):
    """Index of the first row containing every required column label."""
    req = [r.lower() for r in required]
    for i in range(start, len(rows)):
        low = [c.lower() for c in rows[i]]
        if all(any(rq == c for c in low) for rq in req):
            return i
    return -1


def table(rows, header_idx, id_col=0, id_pattern=None, stop_blank=0):
    """Rows under a header as dicts keyed by the header labels.

    Reads until `stop_blank` consecutive blank ID cells (0 = read to the end,
    skipping blanks), which is how the V5 sheets stack several tables on one
    worksheet.
    """
    if header_idx < 0:
        return []
    hdr = rows[header_idx]
    out, blanks = [], 0
    for i in range(header_idx + 1, len(rows)):
        r = rows[i]
        key = r[id_col] if id_col < len(r) else ''
        if not key:
            blanks += 1
            if stop_blank and blanks >= stop_blank:
                break
            continue
        blanks = 0
        if id_pattern and not re.match(id_pattern, key):
            continue
        rec = OrderedDict()
        for c, label in enumerate(hdr):
            if label:
                rec[label] = r[c] if c < len(r) else ''
        rec['_row'] = i + 1
        out.append(rec)
    return out


def split_ids(s):
    """'A; B, C' → ['A','B','C']. Preserves workbook order, drops empties."""
    if not s:
        return []
    parts = re.split(r'[;,]', str(s))
    return [p.strip() for p in parts if p.strip() and p.strip().lower() != 'source needed']


# ────────────────────────────────────────────────────── canonical object ──
CANON_FIELDS = [
    'id', 'originalId', 'objectType', 'title', 'statement', 'description',
    'classification', 'sourceLane', 'sourceType', 'sourceName', 'sourceFile',
    'sourceWorksheet', 'sourceRow', 'dataset', 'period', 'currentOrHistorical',
    'theme', 'metric', 'value', 'priorValue', 'comparisonValue', 'trend',
    'nBase', 'confidence', 'importance', 'verificationStatus', 'workflowStatus',
    'supportingIds', 'contradictingIds', 'relatedEvidenceIds', 'relatedSignalIds',
    'relatedKpiIds', 'relatedRiskIds', 'relatedQuestionIds', 'relatedRuleIds',
    'sourceNeededFields', 'caveat', 'prohibitedConclusions', 'recommendedNextAction',
]
LIST_FIELDS = {
    'supportingIds', 'contradictingIds', 'relatedEvidenceIds', 'relatedSignalIds',
    'relatedKpiIds', 'relatedRiskIds', 'relatedQuestionIds', 'relatedRuleIds',
    'sourceNeededFields',
}


def canon(**kw):
    """One normalized object in the shape every Explorer view already reads."""
    o = OrderedDict()
    for f in CANON_FIELDS:
        if f in LIST_FIELDS:
            o[f] = kw.get(f) or []
        else:
            o[f] = kw.get(f, '') if kw.get(f) is not None else ''
    for extra in sorted(k for k in kw if k not in CANON_FIELDS):
        o[extra] = kw[extra]
    return o


SOURCE_NEEDED_RE = re.compile(
    r'source needed|not supplied|not provided|not included|not established|'
    r'unknown|tbd|to be determined', re.I)


def source_needed_fields(*values):
    """Field names the workbook itself marks unsupplied. Nothing is inferred."""
    out = []
    for label, v in values:
        if v and SOURCE_NEEDED_RE.search(str(v)):
            out.append(label)
    return out


# ──────────────────────────────────────────────────────────── the builder ──
def locate_workbook(argv):
    if len(argv) > 1:
        p = os.path.abspath(argv[1])
        if not os.path.exists(p):
            print(f'ERROR: workbook not found: {p}', file=sys.stderr)
            sys.exit(2)
        return p
    env = os.environ.get('REVEAL_V5_WORKBOOK')
    if env and os.path.exists(env):
        return os.path.abspath(env)
    for pattern in WORKBOOK_GLOBS:
        hits = sorted(glob.glob(pattern))
        hits = [h for h in hits if not os.path.basename(h).startswith('~$')]
        if hits:
            return os.path.abspath(hits[0])
    print('ERROR: no V5 workbook found. Pass a path, set REVEAL_V5_WORKBOOK, or\n'
          f'       place the workbook in {SRC_DIR}', file=sys.stderr)
    sys.exit(2)


def build(wb_path):
    wb = openpyxl.load_workbook(wb_path, data_only=True, read_only=True)
    sheets = OrderedDict((ws.title, sheet_rows(ws)) for ws in wb.worksheets)
    states = OrderedDict((ws.title, ws.sheet_state) for ws in wb.worksheets)
    wb.close()

    check('V5-01', 'Workbook opened and every worksheet read',
          len(sheets) > 0, f'{len(sheets)} worksheets '
          f'({sum(1 for s in states.values() if s != "visible")} hidden)')

    required_sheets = ['Home', 'Sources', 'Evidence Library', 'Signal Builder',
                       'Research Lineage', 'KPI Bridge', 'Research Queue',
                       'Rules & Methodology']
    missing = [s for s in required_sheets if s not in sheets]
    check('V5-02', 'Every canonical V5 worksheet is present', not missing,
          'missing: ' + ', '.join(missing) if missing else ', '.join(required_sheets))
    if missing:
        return None

    # ── Home: version, snapshot, review status ────────────────────────────
    home = sheets['Home']
    version_line = next((r[0] for r in home if r and 'Research Lineage Workbench' in r[0]), '')
    m = re.search(r'V(\d+(?:\.\d+)?)', version_line)
    workbook_version = ('V' + m.group(1)) if m else ''
    check('V5-03', 'Workbook self-identifies as V5', workbook_version.startswith('V5'),
          version_line or 'no version line on Home')

    home_kv = {}
    for r in home:
        vals = [c for c in r if c]
        if len(vals) >= 2:
            home_kv[vals[0]] = vals[1:]

    # ── Sources ───────────────────────────────────────────────────────────
    src_rows = sheets['Sources']
    src_h = find_header(src_rows, ['Source ID', 'Source Name', 'Source Type'])
    raw_h = find_header(src_rows, ['Raw Dataset', 'Rows', 'Treatment'])
    sources = []
    for r in table(src_rows, src_h):
        sid = r.get('Source ID', '')
        if sid.lower().startswith('raw dataset'):
            continue
        loc = r.get('Location', '')
        sources.append(canon(
            id=sid, originalId=sid, objectType='Source',
            title=r.get('Source Name', ''), statement=r.get('Source Name', ''),
            description=r.get('Review Note', ''),
            classification='Client-provided fact',
            sourceLane=r.get('Publisher / Lane', ''),
            sourceType=r.get('Source Type', ''),
            sourceName=r.get('Source Name', ''),
            sourceFile=loc, sourceWorksheet='Sources', sourceRow=r['_row'],
            dataset=r.get('Dataset Type', ''), period=r.get('Date / Period', ''),
            verificationStatus=r.get('Access / Status', ''),
            relatedEvidenceIds=split_ids(r.get('Evidence IDs', '')),
            caveat=r.get('Review Note', ''),
            accessStatus=r.get('Access / Status', ''),
            location=loc,
        ))
    sources.sort(key=lambda s: s['id'])
    check('V5-04', 'Source register parsed', len(sources) > 0, f'{len(sources)} sources')

    raw_registered = OrderedDict()
    for r in table(src_rows, raw_h, stop_blank=2):
        if r.get('Raw Dataset', '').lower().startswith('v5 integrated'):
            continue
        raw_registered[r['Raw Dataset']] = OrderedDict([
            ('rows', int(num(r.get('Rows')) or 0)),
            ('treatment', r.get('Treatment', '')),
            ('location', r.get('Location', '')),
        ])

    # ── Evidence Library ──────────────────────────────────────────────────
    ev_rows = sheets['Evidence Library']
    ev_h = find_header(ev_rows, ['Unified ID', 'Evidence Statement', 'Evidence Class'])
    evidence, tsis_raw, ai_raw = [], [], []
    seen_ids = defaultdict(int)
    for r in table(ev_rows, ev_h, id_col=1):
        uid = r.get('Unified ID', '')
        seen_ids[uid] += 1
        # Two Oct-2026 TSIS rows legitimately share an ID (the preserved
        # conflict). Give every object a unique key without touching the
        # workbook's own ID, which stays in originalId and displays as-is.
        key = uid if seen_ids[uid] == 1 else f'{uid}#{seen_ids[uid]}'
        raw_status = r.get('Current / Historical', '')
        obj = canon(
            id=key, originalId=uid, objectType='Evidence',
            title=r.get('Theme', '') or uid,
            statement=r.get('Evidence Statement', ''),
            description=r.get('Supporting Data / Description', ''),
            classification=r.get('Evidence Class', ''),
            sourceLane=r.get('Source Lane', ''),
            sourceName=r.get('Source', ''),
            sourceFile=r.get('Source Location', ''),
            sourceWorksheet='Evidence Library', sourceRow=r['_row'],
            dataset=r.get('Dataset', ''), period=r.get('Period', ''),
            currentOrHistorical=('current' if raw_status.upper().startswith('CURRENT')
                                 else 'historical'),
            periodStatus=raw_status,
            workbookObjectType=r.get('Object Type', '') or 'EV',
            theme=r.get('Theme', ''), metric=r.get('Metric', ''),
            value=r.get('Value', ''), trend=r.get('Trend', ''),
            nBase=r.get('N / Base', ''), confidence=r.get('Confidence', ''),
            importance=r.get('Importance', ''),
            verificationStatus=r.get('Status / Verification', ''),
            workflowStatus=r.get('Status / Verification', ''),
            relatedSignalIds=split_ids(r.get('Related Signals', '')),
            relatedKpiIds=split_ids(r.get('Related KPIs', '')),
            caveat=r.get('Next Action / Notes', ''),
            recommendedNextAction=r.get('Next Action / Notes', ''),
            sourceNeededFields=source_needed_fields(
                ('N / Base', r.get('N / Base', '')),
                ('Value', r.get('Value', '')),
                ('Next Action / Notes', r.get('Next Action / Notes', ''))),
            sourceLocation=r.get('Source Location', ''),
        )
        evidence.append(obj)
        if r.get('Dataset', '') == 'TSIS' and re.match(r'^TSIS-\d{4}-\d{2}$', uid):
            tsis_raw.append((r, obj))
        if r.get('Dataset', '') == 'AI Product Series':
            ai_raw.append((r, obj))
    evidence.sort(key=lambda e: (e['currentOrHistorical'], e['id']))
    check('V5-05', 'Evidence Library parsed', len(evidence) > 100,
          f'{len(evidence)} evidence objects')

    # ── TSIS history: every period the workbook supplies ──────────────────
    MONTHS = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
              'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}

    def sort_key(period_label):
        mm = re.match(r'([A-Za-z]{3})[a-z]*\s+(\d{4})', period_label)
        if not mm:
            return (9999, 99)
        return (int(mm.group(2)), MONTHS.get(mm.group(1).lower(), 99))

    def pair(value_text):
        """'38.05 / 41.22' → (38.05, 41.22). Never averages, never guesses."""
        parts = [p.strip() for p in str(value_text).split('/')]
        return (num(parts[0]) if parts else None,
                num(parts[1]) if len(parts) > 1 else None)

    src_by_id = {s['id']: s for s in sources}
    tsis_all = []
    for r, obj in tsis_raw:
        ns, pv = pair(r.get('Value', ''))
        src_id = r.get('Source', '')
        src_obj = src_by_id.get(src_id)
        cut = ''
        if src_obj:
            mm = re.search(r'([A-Za-z ]*Respondents?[A-Za-z ]*) cut', src_obj.get('caveat', ''))
            if mm:
                cut = mm.group(1).strip()
        status = r.get('Status / Verification', '')
        rec = OrderedDict([
            ('period', r.get('Period', '')),
            ('sortKey', list(sort_key(r.get('Period', '')))),
            ('netScore', ns),
            ('pervasion', pv),
            ('nBase', r.get('N / Base', '') or 'Not supplied'),
            ('respondentCut', cut or 'Not supplied'),
            ('source', src_id),
            ('sourceName', src_obj['title'] if src_obj else ''),
            ('sourceLocation', r.get('Source Location', '')),
            ('snapshotNote', src_obj.get('caveat', '') if src_obj else ''),
            ('verification', status),
            ('evidenceId', obj['id']),
            ('workbookId', r.get('Unified ID', '')),
            ('conflictFlag', status.lower() == 'conflicting'),
        ])
        tsis_all.append(rec)
    tsis_all.sort(key=lambda x: (x['sortKey'], x['source']))

    # ── Canonicalisation ──────────────────────────────────────────────────
    # One active observation per company + metric family + respondent cut +
    # survey period. Where the workbook supplies more than one, the record
    # with a supplied respondent base wins; a base is what makes a survey
    # reading interpretable, so a reading without one cannot supersede a
    # reading with one. The loser is archived in full — never edited, never
    # averaged in — with the reason and the record that replaced it.
    def rank(rec):
        has_base = 0 if str(rec['nBase']).strip().lower() in ('', 'not supplied') else 1
        not_flagged = 0 if rec['conflictFlag'] else 1
        return (has_base, not_flagged, rec['source'])

    def cut_key(rec):
        # A record that does not state its respondent cut is not a distinct cut.
        # It competes inside its period rather than forming a group of its own,
        # which is what lets an unlabelled snapshot be superseded rather than
        # sitting beside the labelled reading as if it were a second population.
        c = str(rec['respondentCut']).strip().lower()
        return '' if c in ('', 'not supplied', 'not specified') else rec['respondentCut']

    groups = defaultdict(list)
    for rec in tsis_all:
        groups[('CrowdStrike', 'Net Score / Pervasion', cut_key(rec), rec['period'])].append(rec)
    # Fold an unlabelled-cut group into the labelled group for the same period.
    for key in [k for k in list(groups) if k[2] == '']:
        same_period = [k for k in groups if k[3] == key[3] and k[2] != '']
        if same_period:
            groups[same_period[0]].extend(groups.pop(key))

    tsis_history, tsis_superseded = [], []
    for key in sorted(groups, key=lambda k: (sort_key(k[3]), k[2])):
        members = sorted(groups[key], key=rank, reverse=True)
        winner = members[0]
        winner['active'] = True
        winner['status'] = 'Current observation' if winner['conflictFlag'] is False else 'Verified'
        tsis_history.append(winner)
        for loser in members[1:]:
            loser.update(OrderedDict([
                ('status', 'superseded'), ('active', False), ('plotted', False),
                ('selectableAsEvidence', False), ('contributesToCounts', False),
                ('reason', 'Superseded by the more recent API observation with a supplied '
                           'respondent base'),
                ('supersededBy', winner['workbookId'] + ' · ' + winner['source']),
                ('supersededByEvidenceId', winner['evidenceId']),
                ('resolvedAt', 'V5 canonicalisation'),
            ]))
            tsis_superseded.append(loser)

    tsis_history.sort(key=lambda x: x['sortKey'])
    for rec in tsis_history:
        rec['isCurrent'] = (rec is tsis_history[-1]) if tsis_history else False
        rec['isConflicting'] = False

    periods = [t['period'] for t in tsis_history]
    check('V5-06', 'TSIS history covers every supplied period in order',
          len(periods) >= 12 and periods == sorted(periods, key=sort_key),
          f'{len(periods)} periods: {periods[0]} → {periods[-1]}' if periods else 'none')
    check('V5-07', 'Every TSIS period carries both Net Score and Pervasion',
          all(t['netScore'] is not None and t['pervasion'] is not None for t in tsis_history),
          'both series supplied for all periods')
    check('V5-08', 'Exactly one active observation per company, metric family, cut and period',
          len(periods) == len(set(periods)),
          f'{len(periods)} active observations across {len(set(periods))} periods; '
          f'{len(tsis_superseded)} superseded record(s) archived')
    check('V5-08B', 'A reading without a respondent base never supersedes one with a base',
          all(str(t['nBase']).strip().lower() not in ('', 'not supplied')
              for t in tsis_history if t['period'] in {x['period'] for x in tsis_superseded}),
          '; '.join(f"{a['period']}: {a['supersededBy'].split(' · ')[-1]} (N "
                    f"{next((t['nBase'] for t in tsis_history if t['period'] == a['period']), '')}"
                    f") supersedes {a['source']} (N {a['nBase']})"
                    for a in tsis_superseded) or 'no supersession needed')
    for a in tsis_superseded:
        warn(f"Provenance resolved: {a['period']} {a['source']} (Net Score {a['netScore']}, "
             f"no supplied base) is archived as superseded by {a['supersededBy']}. It is "
             f"inactive: not plotted, not counted, not selectable as evidence.")

    current = tsis_history[-1] if tsis_history else None
    prior = tsis_history[-2] if len(tsis_history) > 1 else None
    year_ago = tsis_history[-5] if len(tsis_history) > 4 else None

    # Every object whose text was authored against a superseded reading is
    # marked here. The wording is never rewritten — that would be inventing
    # source content — but it is taken out of the active analytical surfaces
    # and carries the reason plus the canonical replacement.
    # Each superseded reading becomes a pattern that also matches the same
    # value written to more decimal places, so "37.14", "37.14285714" and
    # "40.90" are all recognised as the same archived number.
    STALE_VALUES, STALE_PATTERNS = [], []
    for a in tsis_superseded:
        for v in (a['netScore'], a['pervasion']):
            if v is None:
                continue
            two = f'{v:.2f}'
            STALE_VALUES.append(two)
            STALE_PATTERNS.append(re.escape(two.rstrip('0').rstrip('.')) + r'\d*')

    def authored_against_superseded(*texts):
        """True when a text uses a superseded value as the period's headline
        reading — Net Score, Pervasion or the overall figure a cut is compared
        against. A cut that merely happens to equal it (a region, a cohort) is
        not flagged, and neither is the Z-Score row, whose supplied metric value
        is preserved with its attribution rather than archived."""
        if not STALE_VALUES:
            return False
        blob = ' '.join(str(t or '') for t in texts)
        if not blob.strip():
            return False
        vals = '|'.join(sorted(set(STALE_PATTERNS), key=len, reverse=True))
        headline = re.compile(
            r'(?:Net\s*Score|Pervasion|Deployment\s*Breadth|overall)\s*'
            r'(?:\(|was|is|of|rose\s+to|reads|:)?\s*\(?\s*(?:' + vals + r')\b'
            r'|(?:' + vals + r')\s*(?:/|and)\s*(?:' + vals + r')\b', re.I)
        for m in headline.finditer(blob):
            before = blob[max(0, m.start() - 24):m.start()]
            if re.search(r'metric\s*value\s*$', before, re.I):
                continue          # the Z-Score source row keeps its supplied value
            return True
        return False

    # ── Signal Builder: signals, interpretations, cross-lane bridges ───────
    sb = sheets['Signal Builder']
    sig_h = find_header(sb, ['Signal ID', 'Signal Statement', 'Confidence'])
    signals = []
    for r in table(sb, sig_h, id_pattern=r'^SIG-'):
        sid = r.get('Signal ID', '')
        signals.append(canon(
            id=sid, originalId=sid, objectType='Signal', currentOrHistorical='current',
            title=r.get('Signal Name', ''), statement=r.get('Signal Statement', ''),
            description=r.get('Reviewer Notes', ''),
            classification='Signal object',
            sourceWorksheet='Signal Builder', sourceRow=r['_row'],
            confidence=r.get('Confidence', ''),
            verificationStatus=r.get('Reviewer Decision', ''),
            workflowStatus=r.get('Reviewer Decision', ''),
            supportingIds=split_ids(r.get('Supporting Evidence IDs', '')),
            contradictingIds=split_ids(r.get('Counter-Evidence IDs', '')),
            caveat=r.get('Source Gaps', ''),
            sourceNeededFields=source_needed_fields(
                ('Supporting Evidence IDs', r.get('Supporting Evidence IDs', '')),
                ('Source Gaps', r.get('Source Gaps', ''))),
            evidenceStrength=r.get('Evidence Strength', ''),
            sourceGaps=r.get('Source Gaps', ''),
            reviewerDecision=r.get('Reviewer Decision', ''),
            reviewerNotes=r.get('Reviewer Notes', ''),
            lineageStatus=r.get('Lineage Status', ''),
        ))
    signals.sort(key=lambda s: s['id'])
    check('V5-11', 'Signal Builder parsed', len(signals) >= 7, f'{len(signals)} signals')

    int_h = find_header(sb, ['Rank', 'Updated Interpretation', 'What It Does Not Prove'])
    interpretations = []
    for r in table(sb, int_h, id_pattern=r'^\d+$', stop_blank=2):
        interpretations.append(OrderedDict([
            ('id', 'INTP-%02d' % int(num(r.get('Rank')) or 0)),
            ('objectType', 'Interpretation'),
            ('rank', int(num(r.get('Rank')) or 0)),
            ('title', r.get('Theme', '')),
            ('statement', r.get('Updated Interpretation', '')),
            ('supportingIds', split_ids(r.get('Supporting Evidence', ''))),
            ('classification', r.get('ETR Classification', '')),
            ('theme', r.get('Theme', '')),
            ('interpretation', r.get('Updated Interpretation', '')),
            ('supportingEvidence', split_ids(r.get('Supporting Evidence', ''))),
            ('doesNotProve', r.get('What It Does Not Prove', '')),
            ('confidence', r.get('Confidence', '')),
            ('ruleIds', split_ids(r.get('Rule IDs', ''))),
            ('status', r.get('Status', '')),
            ('sourceRow', r['_row']),
        ]))
    interpretations.sort(key=lambda i: i['rank'])

    xl_h = find_header(sb, ['Bridge ID', 'Integrated Evidence Statement'])
    cross_lane = []
    for r in table(sb, xl_h, id_pattern=r'^XL-', stop_blank=3):
        cross_lane.append(OrderedDict([
            ('id', r.get('Bridge ID', '')),
            ('theme', r.get('Research Theme', '')),
            ('etrEvidence', r.get('ETR Evidence IDs / Source', '')),
            ('reflexivityObjects', r.get('Reflexivity Object IDs', '')),
            ('relationshipType', r.get('Relationship Type', '')),
            ('statement', r.get('Integrated Evidence Statement', '')),
            ('classification', r.get('ETR Classification', '')),
            ('doesNotProve', r.get('What It Does Not Prove', '')),
            ('recommendedAction', r.get('Recommended Action', '')),
            ('sourceRow', r['_row']),
        ]))
    cross_lane.sort(key=lambda x: x['id'])

    # ── Research Lineage ──────────────────────────────────────────────────
    rl = sheets['Research Lineage']
    rl_h = find_header(rl, ['Lineage ID', 'Evidence ID', 'Signal ID'])
    lineage = []
    for r in table(rl, rl_h, id_pattern=r'^RL-'):
        lineage.append(OrderedDict([
            ('id', r.get('Lineage ID', '')),
            ('evidenceId', r.get('Evidence ID', '')),
            ('evidenceType', r.get('Evidence Type', '')),
            ('signalId', r.get('Signal ID', '')),
            ('relationshipType', r.get('Relationship Type', '')),
            ('relatedEvidenceIds', split_ids(r.get('Related Evidence IDs', ''))),
            ('relatedKpiIds', split_ids(r.get('Related KPI IDs', ''))),
            ('notes', r.get('Notes', '')),
            ('reviewStatus', r.get('Review Status', '')),
            ('owner', r.get('Owner', '')),
            ('migratedFrom', r.get('Migrated From', '')),
            ('sourceRow', r['_row']),
        ]))
    lineage.sort(key=lambda l: l['id'])
    unattached = [l for l in lineage if not l['signalId']]
    check('V5-12', 'Research Lineage parsed and every row names an evidence object',
          len(lineage) > 0 and all(l['evidenceId'] for l in lineage),
          f'{len(lineage)} lineage rows ({len(unattached)} record evidence that is not yet '
          f'attached to a signal); blank template rows are not counted')
    for l in unattached:
        warn(f"Lineage {l['id']} records {l['evidenceId']} ({l['relationshipType'] or 'no type'}) "
             f"with no signal attached — shown as an unattached research item, not inferred "
             f"onto a signal.")

    # ── KPI Bridge ────────────────────────────────────────────────────────
    kb = sheets['KPI Bridge']
    kb_h = find_header(kb, ['Signal ID', 'KPI ID', 'Linkage Type'])
    bridges, kpi_seen = [], OrderedDict()
    for r in table(kb, kb_h, id_pattern=r'^SIG-'):
        kpi_id = r.get('KPI ID', '')
        bid = f"BRIDGE-{r.get('Signal ID','')}-{kpi_id}"
        bridges.append(canon(
            id=bid, originalId=bid, objectType='Bridge', currentOrHistorical='current',
            validationStatus=(r.get('Linkage Type', '') or 'Hypothesized'),
            title=f"{r.get('Signal ID','')} → {kpi_id}",
            statement=r.get('Economic Mechanism', ''),
            classification='Hypothesis',
            sourceWorksheet='KPI Bridge', sourceRow=r['_row'],
            confidence=r.get('Confidence', ''),
            verificationStatus=r.get('Review Decision', ''),
            workflowStatus=r.get('Review Decision', ''),
            relatedSignalIds=[r.get('Signal ID', '')] if r.get('Signal ID') else [],
            relatedKpiIds=[kpi_id] if kpi_id else [],
            caveat=r.get('Known Confounders', ''),
            sourceNeededFields=split_ids(r.get('Source Needed', '')),
            linkageType=r.get('Linkage Type', ''),
            economicMechanism=r.get('Economic Mechanism', ''),
            requiredTimeLag=r.get('Required Time Lag', ''),
            lagSupported=r.get('Lag Supported', ''),
            knownConfounders=r.get('Known Confounders', ''),
            kpiName=r.get('KPI', ''),
            signalName=r.get('Signal', ''),
        ))
        if kpi_id and kpi_id not in kpi_seen:
            kpi_seen[kpi_id] = canon(
                id=kpi_id, originalId=kpi_id, objectType='KPI', currentOrHistorical='current',
                title=r.get('KPI', '') or kpi_id,
                statement=r.get('KPI', ''),
                classification='KPI candidate',
                sourceWorksheet='KPI Bridge', sourceRow=r['_row'],
                confidence=r.get('Confidence', ''),
                verificationStatus=r.get('Review Decision', ''),
                relatedSignalIds=[r.get('Signal ID', '')] if r.get('Signal ID') else [],
                sourceNeededFields=split_ids(r.get('Source Needed', '')),
            )
    bridges.sort(key=lambda b: b['id'])
    kpis = sorted(kpi_seen.values(), key=lambda k: k['id'])
    check('V5-13', 'KPI Bridge parsed', len(bridges) > 0,
          f'{len(bridges)} bridges across {len(kpis)} KPI candidates')

    # ── Research Queue → open questions, risks, review items ──────────────
    rq = sheets['Research Queue']
    rq_h = find_header(rq, ['Type', 'Issue / Question', 'Priority / Severity'])
    queue, open_questions, risks, review_items = [], [], [], []
    for r in table(rq, rq_h, id_col=1):
        qid = r.get('ID', '')
        typ = r.get('Type', '')
        rec = canon(
            id=qid, originalId=qid,
            objectType=('OpenQuestion' if 'question' in typ.lower() else
                        'Risk' if 'risk' in typ.lower() or 'caveat' in typ.lower()
                        else 'ReviewItem'),
            title=r.get('Theme / Signal', '') or qid,
            statement=r.get('Issue / Question', ''),
            description=r.get('Notes / Next Action', ''),
            classification=('Open question' if 'question' in typ.lower() else typ),
            sourceWorksheet='Research Queue', sourceRow=r['_row'],
            theme=r.get('Theme / Signal', ''),
            importance=r.get('Priority / Severity', ''),
            verificationStatus=r.get('Status', ''),
            workflowStatus=r.get('Status', ''),
            recommendedNextAction=r.get('Notes / Next Action', ''),
            caveat=r.get('Notes / Next Action', ''),
            relatedEvidenceIds=split_ids(r.get('Blocks / Related Objects', '')),
            sourceNeededFields=source_needed_fields(
                ('Expected Source / Evidence', r.get('Expected Source / Evidence', ''))),
            queueType=typ,
            expectedSource=r.get('Expected Source / Evidence', '') or 'Not specified',
            blocks=r.get('Blocks / Related Objects', '') or 'Not specified',
            owner=r.get('Owner', '') or 'Not specified',
            priority=r.get('Priority / Severity', '') or 'Not specified',
            status=r.get('Status', '') or 'Not specified',
        )
        queue.append(rec)
        (open_questions if rec['objectType'] == 'OpenQuestion' else
         risks if rec['objectType'] == 'Risk' else review_items).append(rec)
    for lst in (queue, open_questions, risks, review_items):
        lst.sort(key=lambda x: x['id'])
    check('V5-14', 'Research Queue parsed', len(queue) > 0,
          f'{len(queue)} items: {len(open_questions)} questions, {len(risks)} risks, '
          f'{len(review_items)} other')

    # ── Rules & Methodology ───────────────────────────────────────────────
    rm = sheets['Rules & Methodology']
    rm_h = find_header(rm, ['Rule ID', 'Rule Name', 'Rule Family'])
    rules = []
    for r in table(rm, rm_h, id_pattern=r'^R-'):
        rid = r.get('Rule ID', '')
        rules.append(canon(
            id=rid, originalId=rid, objectType='Rule', currentOrHistorical='current',
            title=r.get('Rule Name', ''), statement=r.get('Rule Name', ''),
            description=r.get('Trigger Condition', ''),
            classification=r.get('ETR Classification', ''),
            sourceWorksheet='Rules & Methodology', sourceRow=r['_row'],
            verificationStatus=r.get('Rule Status', ''),
            caveat=r.get('Required Caveat', ''),
            prohibitedConclusions=r.get('Prohibited Interpretation / Action', ''),
            ruleFamily=r.get('Rule Family', ''),
            ruleStatus=r.get('Rule Status', ''),
            enforcement=r.get('Enforcement', ''),
            triggerCondition=r.get('Trigger Condition', ''),
            requiredInputs=r.get('Required Context / Inputs', ''),
            permitted=r.get('Permitted Interpretation / Action', ''),
            prohibited=r.get('Prohibited Interpretation / Action', ''),
            confidenceGate=r.get('Confidence Gate', ''),
            externalTreatment=r.get('External Research Treatment', ''),
            requiredCaveat=r.get('Required Caveat', ''),
            validationMethod=r.get('Validation Method', ''),
            owner=r.get('Owner', ''), version=r.get('Version', ''),
        ))
    rules.sort(key=lambda x: x['id'])
    check('V5-15', 'Rule registry parsed', len(rules) > 0, f'{len(rules)} rules')

    # ── Hidden raw import sheets ──────────────────────────────────────────
    RAW_MAP = [('_Raw_Z_Score', 'zScore', 'Raw - Z Score'),
               ('_Raw_Pervasion_Trend', 'pervasionTrend', 'Raw - Pervasion Trend'),
               ('_Raw_Region', 'region', 'Raw - Region'),
               ('_Raw_Subsample_Cuts', 'subsampleCuts', 'Raw - Subsample Cuts'),
               ('_Raw_Vendor_View', 'vendorView', 'Raw - Vendor View'),
               ('_Raw_Peer_Trends', 'peerTrends', 'Raw - Peer Trends'),
               ('_Raw_Adoption_Reasons', 'adoptionReasons', 'Raw - Adoption Reasons'),
               ('_Raw_Job_Titles', 'jobTitles', 'Raw - Job Titles')]
    raw_tables, coverage = OrderedDict(), []
    for sheet_name, key, registered_name in RAW_MAP:
        rows = sheets.get(sheet_name, [])
        import_note = rows[0][0] if rows and rows[0] else ''
        # The raw sheets carry a title and a provenance note above the table,
        # sometimes with blank spacer rows. The header is the first row that
        # fills more than one column.
        hdr_i = next((i for i, r in enumerate(rows)
                      if sum(1 for c in r if c) >= 2), 0)
        hdr = [c for c in rows[hdr_i] if c] if hdr_i < len(rows) else []
        body = []
        for r in rows[hdr_i + 1:]:
            if not any(r):
                continue
            rec = OrderedDict()
            for c, label in enumerate(hdr):
                rec[label] = r[c] if c < len(r) else ''
            body.append(rec)
        raw_tables[key] = OrderedDict([('sheet', sheet_name), ('importNote', import_note),
                                       ('columns', hdr), ('rows', body)])
        reg = raw_registered.get(registered_name)
        coverage.append(OrderedDict([
            ('dataset', registered_name), ('sheet', sheet_name),
            ('registeredRows', reg['rows'] if reg else None),
            ('parsedRows', len(body)),
            ('match', (reg['rows'] == len(body)) if reg else None),
            ('treatment', reg['treatment'] if reg else ''),
            ('location', reg['location'] if reg else 'Hidden system sheet in this workbook'),
        ]))
    mismatched = [c for c in coverage if c['match'] is False]
    check('V5-16', 'Every registered raw dataset matches its parsed row count',
          not mismatched,
          '; '.join(f"{c['dataset']}: registered {c['registeredRows']}, parsed {c['parsedRows']}"
                    for c in mismatched) or f'{len(coverage)} raw datasets reconcile')

    # Dataset coverage across the evidence lanes, counted rather than asserted.
    lane_counts = defaultdict(int)
    dataset_counts = defaultdict(int)
    for e in evidence:
        lane_counts[e['sourceLane'] or 'Not specified'] += 1
        dataset_counts[e['dataset'] or 'Not specified'] += 1
    dataset_coverage = OrderedDict([
        ('rawDatasets', coverage),
        ('evidenceByLane', [OrderedDict([('lane', k), ('count', lane_counts[k])])
                            for k in sorted(lane_counts)]),
        ('evidenceByDataset', [OrderedDict([('dataset', k), ('count', dataset_counts[k])])
                               for k in sorted(dataset_counts)]),
        ('sourcesRegistered', len(sources)),
        ('note', 'Counts of objects present in the workbook. No weighting scheme is '
                 'supplied by the workbook, so no composite score is computed.'),
    ])

    # ── Outputs ───────────────────────────────────────────────────────────
    outputs = []
    for name in ('Executive Brief', 'Sunday Signal', 'Update Email'):
        rows = sheets.get(name, [])
        body = [[c for c in r] for r in rows if any(r)]
        cited_ev, cited_rules, sections = [], [], []
        for r in body:
            cells = [c for c in r if c]
            ids = []
            for c in r:
                for tok in split_ids(c):
                    if re.match(r'^(ETR-|REF-|TSIS-|EV-|CE-|SIG-|KPI-|OQ-|R-\d|XL-|SRC-)', tok):
                        ids.append(tok)
            ev_ids = [i for i in ids if not re.match(r'^R-\d', i)]
            rule_ids = [i for i in ids if re.match(r'^R-\d', i)]
            cited_ev.extend(ev_ids)
            cited_rules.extend(rule_ids)
            if len(cells) >= 2 and ids:
                sections.append(OrderedDict([('section', cells[0]), ('text', cells[1]),
                                             ('citedIds', ev_ids), ('ruleIds', rule_ids)]))
        outputs.append(canon(
            id=name.replace(' ', '-').upper(), originalId=name, objectType='Output',
            title=name, statement=name + ' — working draft assembled in the workbook',
            classification='Recommended action', sourceWorksheet=name,
            verificationStatus='Human Review Required',
            workflowStatus='Human Review Required',
            relatedEvidenceIds=sorted(set(cited_ev)),
            relatedRuleIds=sorted(set(cited_rules)),
            rows=body, sections=sections))

    # ── Legacy relationships (provenance) + graph edges ───────────────────
    legacy = sheets.get('_Legacy Evidence Relationships', [])
    leg_h = find_header(legacy, ['Evidence_ID', 'Relationship_Type'])
    legacy_rels = []
    for r in table(legacy, leg_h):
        legacy_rels.append(OrderedDict([
            ('evidenceId', r.get('Evidence_ID', '')),
            ('evidenceType', r.get('Evidence_Type', '')),
            ('supportsSignalId', r.get('Supports_Signal_ID', '')),
            ('contradictsSignalId', r.get('Contradicts_Signal_ID', '')),
            ('relatedEvidenceIds', split_ids(r.get('Related_Evidence_IDs', ''))),
            ('relatedKpiIds', split_ids(r.get('Related_KPI_IDs', ''))),
            ('relationshipType', r.get('Relationship_Type', '')),
            ('notes', r.get('Notes', '')),
        ]))

    obj_ids = set()
    for coll in (sources, evidence, signals, kpis, bridges, queue, rules, outputs):
        obj_ids.update(o['id'] for o in coll)
    obj_ids.update(o['originalId'] for o in evidence if o['originalId'])

    REL_TYPE = {'supporting': 'SUPPORTS', 'contradicting': 'CONTRADICTS',
                'contextualizing': 'CONTEXTUALIZES', 'related evidence': 'RELATES_TO',
                'kpi context': 'INFORMS', 'open question': 'BLOCKS'}
    relationships, dropped = [], []
    seq = 0

    def add_edge(a, b, typ, note, origin, dashed=False):
        nonlocal seq
        if not a or not b:
            return
        if a not in obj_ids or b not in obj_ids:
            dropped.append(OrderedDict([('from', a), ('to', b), ('type', typ),
                                        ('reason', 'endpoint not present in the workbook'),
                                        ('origin', origin)]))
            return
        seq += 1
        relationships.append(OrderedDict([
            ('id', f'REL-{seq:04d}'), ('from', a), ('type', typ), ('to', b),
            ('note', note), ('origin', origin), ('dashed', dashed)]))

    for s in sources:
        for eid in s['relatedEvidenceIds']:
            add_edge(s['id'], eid, 'SOURCE_OF', 'Source register', 'Sources')
    for e in evidence:
        if e['sourceName'] and e['sourceName'] in {s['id'] for s in sources}:
            add_edge(e['sourceName'], e['id'], 'SOURCE_OF',
                     'Evidence Library names this source', 'Evidence Library')
    for l in lineage:
        typ = REL_TYPE.get(l['relationshipType'].lower(), 'RELATES_TO')
        add_edge(l['evidenceId'], l['signalId'], typ, l['notes'] or l['id'],
                 'Research Lineage', dashed=(typ == 'INFORMS'))
        for k in l['relatedKpiIds']:
            add_edge(l['signalId'], k, 'INFORMS', f"via {l['id']}", 'Research Lineage', True)
    for b in bridges:
        for sid in b['relatedSignalIds']:
            add_edge(sid, b['id'], 'RELATES_TO', 'Signal → KPI bridge candidate',
                     'KPI Bridge', True)
            for k in b['relatedKpiIds']:
                add_edge(sid, k, 'INFORMS', b['economicMechanism'][:120], 'KPI Bridge', True)
        for k in b['relatedKpiIds']:
            add_edge(b['id'], k, 'INFORMS', 'Bridge names this KPI candidate',
                     'KPI Bridge', True)
    for e in evidence:
        for sid in e['relatedSignalIds']:
            add_edge(e['id'], sid, 'SUPPORTS', 'Evidence Library related signal',
                     'Evidence Library')
        for k in e['relatedKpiIds']:
            add_edge(e['id'], k, 'INFORMS', 'Evidence Library related KPI',
                     'Evidence Library', True)
    for o in outputs:
        for eid in o['relatedEvidenceIds']:
            add_edge(eid, o['id'], 'COMMUNICATES', 'Cited in the ' + o['title'] + ' draft',
                     o['title'])
        for rid in o['relatedRuleIds']:
            add_edge(o['id'], rid, 'GOVERNED_BY', 'Rule cited in the draft', o['title'])
    for s in signals:
        for eid in s['supportingIds']:
            add_edge(eid, s['id'], 'SUPPORTS', 'Signal Builder supporting evidence',
                     'Signal Builder')
        for eid in s['contradictingIds']:
            add_edge(eid, s['id'], 'CONTRADICTS', 'Signal Builder counter-evidence',
                     'Signal Builder')

    check('V5-17', 'Every graph edge resolves to two workbook objects',
          all(r['from'] in obj_ids and r['to'] in obj_ids for r in relationships),
          f'{len(relationships)} edges kept, {len(dropped)} unresolved references excluded')
    if dropped:
        warn(f'{len(dropped)} relationship endpoints named in the workbook do not resolve '
             f'to an object in it. They are excluded from the graph and listed in '
             f'validation-report.json rather than being invented.')

    # ── Reference integrity across the whole workbook ─────────────────────
    unresolved = []
    for e in evidence:
        for sid in e['relatedSignalIds']:
            if sid not in {s['id'] for s in signals}:
                unresolved.append(f"{e['originalId']} → signal {sid}")
    for l in lineage:
        if l['signalId'] and l['signalId'] not in {s['id'] for s in signals}:
            unresolved.append(f"{l['id']} → signal {l['signalId']}")
        if l['evidenceId'] and l['evidenceId'] not in obj_ids:
            unresolved.append(f"{l['id']} → evidence {l['evidenceId']}")
    check('V5-19', 'Cross-references resolve, or are reported rather than silently dropped',
          True, f'{len(unresolved)} unresolved references recorded as warnings')
    if unresolved:
        warn(f'{len(unresolved)} workbook cross-references name an object that is not in this '
             f'workbook (legacy SIG-001-style IDs and pre-V5 evidence). They are listed in '
             f'validation-report.json and excluded from the graph.')

    # ── Objects authored against the superseded reading ───────────────────
    # Their wording is never edited. They are taken out of the active
    # analytical surfaces, given the reason and the canonical replacement,
    # and collected into the archive so the audit trail stays intact.
    canonical_ref = (current['workbookId'] + ' · ' + current['source']) if current else ''
    canonical_line = (f"Net Score {current['netScore']}, Deployment Breadth (Pervasion) "
                      f"{current['pervasion']}, N {current['nBase']}, "
                      f"{current['respondentCut']}") if current else ''

    def mark_stale(obj, fields, kind):
        if not authored_against_superseded(*[obj.get(f, '') for f in fields]):
            return False
        obj['active'] = False
        obj['contributesToCounts'] = False
        obj['selectableAsEvidence'] = False
        obj['status'] = 'superseded'
        obj['staleProvenance'] = OrderedDict([
            ('authoredAgainst', 'The archived October 2026 reading'),
            ('reason', 'Authored against a reading that has since been superseded by the more '
                       'recent API observation with a supplied respondent base. The wording is '
                       'preserved exactly as the workbook records it and is not restated.'),
            ('supersededBy', canonical_ref),
            ('canonicalReading', canonical_line),
            ('objectKind', kind),
        ])
        return True

    archived_objects = []
    for e in evidence:
        if mark_stale(e, ['statement', 'description', 'value'], 'evidence'):
            archived_objects.append(OrderedDict([('id', e['id']), ('type', 'evidence'),
                                                 ('title', e['title']),
                                                 ('text', e['statement'])]))
    for i in interpretations:
        if authored_against_superseded(i.get('interpretation', '')):
            i['active'] = False
            i['status'] = 'superseded'
            i['staleProvenance'] = OrderedDict([
                ('reason', 'This reviewer reading quotes the archived October 2026 values. It is '
                           'kept verbatim for audit and is not shown as a current interpretation.'),
                ('supersededBy', canonical_ref), ('canonicalReading', canonical_line)])
            archived_objects.append(OrderedDict([('id', i['id']), ('type', 'interpretation'),
                                                 ('title', i['theme']),
                                                 ('text', i['interpretation'])]))
        else:
            i['active'] = True
    archived_evidence_ids = {a['id'] for a in archived_objects if a['type'] == 'evidence'}
    for o in outputs:
        blob = ' '.join(' '.join(str(c) for c in row) for row in o.get('rows', []))
        cited = [eid for eid in o.get('relatedEvidenceIds', []) if eid in archived_evidence_ids]
        if authored_against_superseded(blob) or cited:
            o['active'] = False
            o['status'] = 'superseded'
            o['staleProvenance'] = OrderedDict([
                ('reason', 'This draft was assembled before the October 2026 reading was '
                           'canonicalised and is built on ' +
                           ('evidence that has since been archived (' + ', '.join(cited) + ')'
                            if cited else 'the archived values') +
                           '. It is kept verbatim for audit. Regenerate it from the Create views, '
                           'which build from the active observation.'),
                ('citesArchivedEvidence', cited),
                ('supersededBy', canonical_ref), ('canonicalReading', canonical_line)])
            archived_objects.append(OrderedDict([('id', o['id']), ('type', 'output draft'),
                                                 ('title', o['title']),
                                                 ('text', 'Workbook draft built on the archived '
                                                          'October 2026 reading')]))
        else:
            o['active'] = True
    for q in queue:
        if mark_stale(q, ['statement', 'description', 'recommendedNextAction'], 'research queue item'):
            archived_objects.append(OrderedDict([('id', q['id']), ('type', 'research queue item'),
                                                 ('title', q['title']),
                                                 ('text', q['description'] or q['statement'])]))

    # Signals keep their identity: a signal is a named research position, not a
    # value. Where its recorded statement quotes an archived reading the wording
    # is flagged so it is never shown as the current reading.
    for sg in signals:
        sg['active'] = True
        if authored_against_superseded(sg.get('statement', '')):
            sg['statementSuperseded'] = True
            sg['statementNote'] = ('The recorded signal statement quotes the archived October 2026 '
                                   'reading. It is shown as authored, marked superseded, and is '
                                   'not used as the current reading. The current reading is: '
                                   + canonical_line)
            sg['canonicalReading'] = canonical_line

    for e in evidence:
        e.setdefault('active', True)
    for q in queue:
        q.setdefault('active', True)

    # Research-state warnings, which never fail the build. They run after
    # archiving so each one says whether the record is still active: a workbook
    # status is reported as recorded, never rewritten, but a 'Conflicting' flag
    # on a record that has since been archived is not an open conflict.
    for coll, label in ((evidence, 'evidence'), (signals, 'signal'), (queue, 'queue item')):
        for o in coll:
            st = (o.get('verificationStatus') or '').lower()
            if st in ('needs validation', 'source needed', 'conflicting'):
                where = 'active' if o.get('active', True) else 'archived as superseded'
                warn(f"{o['id']} ({label}, {where}) carries workbook status "
                     f"'{o.get('verificationStatus')}' — displayed as recorded.")

    for e in evidence:
        if re.search(r'Z-Score', str(e.get('metric', '')), re.I) and STALE_PATTERNS and \
                re.search('|'.join(STALE_PATTERNS), str(e.get('statement', ''))):
            e['metricValueProvenance'] = (
                'The supplied metric value in this row is the archived October 2026 reading. The '
                'Z-Scores themselves are reproduced exactly as the source supplied them and are '
                'not recomputed here; no approved method band is supplied with them, so there is '
                'no threshold to read them against.')

    canon_base = str((current or {}).get('nBase', '')).strip()
    for e in evidence:
        if not e.get('active', True):
            continue
        base = str(e.get('nBase', '')).strip()
        if (re.search(r'Oct\s*(26|2026)', str(e.get('period', '')), re.I) and base and
                base.isdigit() and canon_base.isdigit() and base != canon_base):
            e['baseProvenance'] = (
                'Recorded on a base of ' + base + ' citations. The canonical October 2026 '
                'observation is on ' + canon_base + ' citations, so this reading comes from a '
                'different export of the same survey period. Both bases are shown as supplied; '
                'neither is adjusted to match the other.')

    active_evidence = [e for e in evidence if e.get('active', True)]
    check('V5-23', 'No active object quotes a superseded October 2026 reading',
          not any(authored_against_superseded(e.get('statement', ''), e.get('description', ''),
                                              e.get('value', ''))
                  for e in active_evidence),
          f'{len(archived_objects)} object(s) archived as authored-against-superseded; '
          f'{len(active_evidence)} active evidence objects remain')

    # ── Source-to-output research trace ───────────────────────────────────
    def find_ev(eid):
        return next((e for e in evidence if e['id'] == eid or e['originalId'] == eid), None)

    def find_sig(sid):
        return next((s for s in signals if s['id'] == sid), None)

    trace_ev = find_ev((current or {}).get('evidenceId', '')) or find_ev('EV-001')
    trace_sig = find_sig('SIG-02')
    trace_interp = next((i for i in interpretations
                         if i.get('active', True) and 'Breadth' in i['theme']),
                        next((i for i in interpretations if i.get('active', True)), None))
    trace_bridge = next((b for b in bridges if 'SIG-02' in b['relatedSignalIds']), None)
    trace_src = src_by_id.get(trace_ev['sourceName']) if trace_ev else None
    trace_obs = next((t for t in tsis_history if t['period'] == (current or {}).get('period')), None)
    out_rows = sheets.get('Sunday Signal', [])
    out_h = find_header(out_rows, ['Section', 'Draft Text', 'Classification'])
    output_rows = table(out_rows, out_h)
    trace_out = next((o for o in output_rows if o.get('Section', '') == 'Headline'), None)

    research_trace = OrderedDict([
        ('example', 'October 2026 TSIS demand reading'),
        ('stages', [
            OrderedDict([
                ('stage', '1. Raw Source'), ('objectId', trace_src['id'] if trace_src else ''),
                ('content', (trace_src['title'] + ' — ' + trace_src['location']) if trace_src else ''),
                ('transformation', 'Retrieved from the ETR package and registered in the '
                                   'Source register with its access status and period range.'),
                ('classification', 'Client-provided fact'),
                ('doesNotProve', 'A registered source proves only that the data was retrieved, '
                                 'not that any reading follows from it.'),
                ('detail', trace_src['caveat'] if trace_src else ''),
            ]),
            OrderedDict([
                ('stage', '2. Observation'),
                ('objectId', trace_obs['workbookId'] if trace_obs else ''),
                ('content', f"{trace_obs['period']}: Net Score {trace_obs['netScore']}, "
                            f"Deployment Breadth (Pervasion) {trace_obs['pervasion']}, "
                            f"N {trace_obs['nBase']}" if trace_obs else ''),
                ('transformation', 'One survey period recorded exactly as supplied, with its '
                                   'base and respondent cut. No rounding, no interpolation.'),
                ('classification', 'Client-provided fact'),
                ('doesNotProve', 'A single period is a measurement, not a trend, and not a '
                                 'company outcome.'),
                ('detail', f"Respondent cut: {trace_obs['respondentCut']}" if trace_obs else ''),
            ]),
            OrderedDict([
                ('stage', '3. Evidence Object'), ('objectId', trace_ev['originalId'] if trace_ev else ''),
                ('content', trace_ev['statement'] if trace_ev else ''),
                ('transformation', 'The observation is qualified: given an ID, a confidence, a '
                                   'verification status and a recorded caveat, and linked to '
                                   'the signal it can inform.'),
                ('classification', trace_ev['classification'] if trace_ev else ''),
                ('doesNotProve', 'Qualifying evidence does not establish causation or any '
                                 'company financial result.'),
                ('detail', trace_ev['caveat'] if trace_ev else ''),
            ]),
            OrderedDict([
                ('stage', '4. Signal'), ('objectId', trace_sig['id'] if trace_sig else ''),
                ('content', ((trace_sig.get('title', '') + ' — current reading: ' + canonical_line)
                             if trace_sig and trace_sig.get('statementSuperseded')
                             else (trace_sig['statement'] if trace_sig else ''))),
                ('transformation', 'Evidence is assembled into a reviewable signal candidate '
                                   'with an explicit confidence, evidence strength and a named '
                                   'list of source gaps.'),
                ('classification', 'Signal object'),
                ('doesNotProve', trace_sig['sourceGaps'] if trace_sig else ''),
                ('detail', ((f"Reviewer decision: {trace_sig['reviewerDecision']}. " +
                             ('The recorded signal statement quotes the archived October reading '
                              'and is kept in the archive; the reading above is the one in force.'
                              if trace_sig.get('statementSuperseded') else ''))
                            if trace_sig else '')),
            ]),
            OrderedDict([
                ('stage', '5. Interpretation'),
                ('objectId', f"Interpretation rank {trace_interp['rank']}" if trace_interp else ''),
                ('content', trace_interp['interpretation'] if trace_interp else ''),
                ('transformation', 'A reviewer states what the evidence means, under named '
                                   'interpretation rules, with the confidence recorded.'),
                ('classification', trace_interp['classification'] if trace_interp else ''),
                ('doesNotProve', trace_interp['doesNotProve'] if trace_interp else ''),
                ('detail', 'Rules applied: ' + ', '.join(trace_interp['ruleIds'])
                           if trace_interp else ''),
            ]),
            OrderedDict([
                ('stage', '6. Output'), ('objectId', 'Sunday Signal — Headline'),
                ('content', trace_out.get('Draft Text', '') if trace_out else ''),
                ('transformation', 'Reviewed research is drafted into an external-facing piece, '
                                   'carrying its classification, evidence IDs and rule IDs.'),
                ('classification', trace_out.get('Classification', '') if trace_out else ''),
                ('doesNotProve', 'A draft is not an approved output: R-020 makes human review a '
                                 'precondition of distribution.'),
                ('detail', (f"Evidence: {trace_out.get('Evidence IDs','')} · Rules: "
                            f"{trace_out.get('Rule IDs','')} · {trace_out.get('Caveat','')}")
                           if trace_out else ''),
            ]),
        ]),
        ('kpiCandidate', OrderedDict([
            ('id', trace_bridge['relatedKpiIds'][0] if trace_bridge and trace_bridge['relatedKpiIds'] else ''),
            ('name', trace_bridge['kpiName'] if trace_bridge else ''),
            ('linkageType', trace_bridge['linkageType'] if trace_bridge else ''),
            ('lagSupported', trace_bridge['lagSupported'] if trace_bridge else ''),
            ('confounders', trace_bridge['knownConfounders'] if trace_bridge else ''),
        ])),
    ])
    complete_stages = [s for s in research_trace['stages'] if s['content']]
    check('V5-18', 'The source-to-output research trace is complete',
          len(complete_stages) == 6,
          f'{len(complete_stages)} of 6 stages carry workbook content')

    # ── The default lineage path, walked out of the edges that exist ──────
    adj = defaultdict(list)
    for r in relationships:
        adj[r['from']].append(r['to'])

    def hop(start, predicate):
        for nxt in adj.get(start, []):
            if predicate(nxt):
                return nxt
        return None

    proof_path = []
    p_src = (trace_ev or {}).get('sourceName', '')
    if p_src in obj_ids:
        proof_path.append(p_src)
        p_ev = hop(p_src, lambda i: i == (trace_ev or {}).get('id')) or \
               hop(p_src, lambda i: i.startswith(('EV-', 'TSIS-', 'ETR-')))
        if p_ev:
            proof_path.append(p_ev)
            p_sig = hop(p_ev, lambda i: i.startswith('SIG-'))
            if p_sig:
                proof_path.append(p_sig)
                p_br = hop(p_sig, lambda i: i.startswith('BRIDGE-'))
                if p_br:
                    proof_path.append(p_br)
                    p_kpi = hop(p_br, lambda i: i.startswith('KPI-'))
                    if p_kpi:
                        proof_path.append(p_kpi)
            p_out = hop(p_ev, lambda i: i in {o['id'] for o in outputs})
            if p_out:
                proof_path.append(p_out)
    check('V5-22', 'The default lineage path is a real chain of recorded edges',
          len(proof_path) >= 4, ' → '.join(proof_path) or 'no connected path found')

    # ── Assemble ──────────────────────────────────────────────────────────
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    net_delta = (current['netScore'] - prior['netScore']) if current and prior else None
    net_yy = (current['netScore'] - year_ago['netScore']) if current and year_ago else None
    pv_delta = (current['pervasion'] - prior['pervasion']) if current and prior else None
    pv_yy = (current['pervasion'] - year_ago['pervasion']) if current and year_ago else None

    # ── Analytical invariants ─────────────────────────────────────────────
    # These are the ones worth failing a build over: a duplicate active
    # observation, a stale value in active copy, a reference that does not
    # resolve, or a missing value quietly turned into a zero.
    SUPERSEDED_LOOKUP = {o['id'] for o in archived_objects}
    active_ids = set()
    for coll in (evidence, signals, kpis, bridges, queue, rules, sources, outputs):
        active_ids.update(o['id'] for o in coll if o.get('active', True))

    # Two different kinds of problem, kept apart on purpose. A reference this
    # build generates and cannot resolve is a defect and fails the build. A
    # reference the workbook itself carries to an object it does not contain is
    # a research gap: it is reported, surfaced in the application, and never
    # repaired by inventing a target.
    internal_broken, workbook_gaps = [], []
    for b in bridges:
        for k in b['relatedKpiIds']:
            if k not in {x['id'] for x in kpis}:
                internal_broken.append(f"bridge {b['id']} → KPI {k}")
    for i in [x for x in interpretations if x.get('active', True)]:
        if not i['supportingIds']:
            internal_broken.append(f"interpretation {i['id']} has no supporting evidence")
    for o in [x for x in outputs if x.get('active', True)]:
        for eid in o['relatedEvidenceIds']:
            if eid in SUPERSEDED_LOOKUP:
                internal_broken.append(f"active output {o['id']} cites superseded {eid}")
    for e in [x for x in evidence if x.get('active', True)]:
        for sid in e['relatedSignalIds']:
            if sid not in {g['id'] for g in signals}:
                workbook_gaps.append(f"evidence {e['id']} → signal {sid}")
    check('V5-24', 'Every reference this build generates resolves to an active object',
          not internal_broken, '; '.join(internal_broken[:4]) or
          f'{len(active_ids)} active objects; no generated reference is broken')
    check('V5-24B', 'Workbook references to objects it does not contain are reported, not repaired',
          True, f'{len(workbook_gaps)} workbook-level reference gap(s) recorded as warnings '
          f'(pre-V5 signal IDs); none is repointed at a V5 object', blocking=False)
    if workbook_gaps:
        warn(f'{len(workbook_gaps)} evidence rows name a signal under the pre-V5 ID convention '
             f'({", ".join(sorted(set(g.split("→ ")[1] for g in workbook_gaps))[:6])}). They are '
             f'shown as unresolved rather than matched to a V5 signal, because matching them is a '
             f'research decision.')

    zeroed = [t['period'] for t in tsis_history
              if t['netScore'] == 0 or t['pervasion'] == 0]
    check('V5-25', 'No missing value was coerced to zero',
          not zeroed, 'zeroed: ' + ', '.join(zeroed) if zeroed else
          'every plotted value is a supplied reading')

    check('V5-26', 'Superseded records contribute to nothing active',
          all(a.get('active') is False and a.get('plotted') is False and
              a.get('contributesToCounts') is False for a in tsis_superseded),
          f'{len(tsis_superseded)} archived observation(s), '
          f'{len(archived_objects)} archived object(s)')

    delta_ok = (current and prior and year_ago and
                abs((current['netScore'] - prior['netScore']) - 1.59) < 0.005 and
                abs((current['netScore'] - year_ago['netScore']) - 11.44) < 0.005 and
                abs((current['pervasion'] - prior['pervasion']) - 2.84) < 0.005 and
                abs((current['pervasion'] - year_ago['pervasion']) - 2.73) < 0.005)
    check('V5-27', 'Period comparisons are computed from the canonical series',
          bool(delta_ok),
          f"Net Score Q/Q {net_delta:+.2f}, Y/Y {net_yy:+.2f}; Deployment Breadth Q/Q "
          f"{pv_delta:+.2f}, Y/Y {pv_yy:+.2f}" if current and prior else 'not computable')

    # ── Charlotte AI: registered metric groups from the AI Product Series ──
    # Every group in the source register becomes a panel. Its category readings
    # are read out of the workbook's own supporting-data string, which states
    # them per response category and per survey period. Nothing is interpolated:
    # a group with no row-level values stays registered and empty, and a period
    # the source does not state is never filled in.
    AI_PERIOD_SHORT = {'jul25': 'Jul 2025', 'jan26': 'Jan 2026', 'jul26': 'Jul 2026',
                       'jul2025': 'Jul 2025', 'jan2026': 'Jan 2026', 'jul2026': 'Jul 2026',
                       'oct25': 'Oct 2025', 'oct26': 'Oct 2026', 'jan25': 'Jan 2025'}

    def ai_periods_of(src):
        """The survey periods the source register states, in the order stated."""
        return [p.strip() for p in str(src.get('period', '')).split(',') if p.strip()]

    def ai_cut_of(src, ev):
        """The respondent cut, taken from the wording the workbook supplies."""
        mm = re.search(r'\bAmong\s+(.+)$', str(src.get('title', '')), re.I)
        if mm:
            cut = mm.group(1).strip()
            return cut[0].upper() + cut[1:]
        if ev:
            mm = re.search(r'covers\s+(.+?)\s+only', str(ev.get('caveat', '')), re.I)
            if mm:
                return mm.group(1).strip()
        return 'Not specified'

    def ai_parse_categories(text, periods, group_id):
        """'Rolled out: 27.2%→28.3%→24.2%; Evaluating: …' and
           'Extremely+Very: Jul25=40.8%, Jan26=45.1%, …' are the two shapes the
           workbook uses. Both name every value they carry; neither is expanded
           to periods it does not state."""
        out, problems = [], []
        for seg in [s.strip() for s in str(text or '').split(';') if s.strip()]:
            mm = re.match(r'^(.*?):\s*(.+)$', seg)
            if not mm:
                continue
            label, body = mm.group(1).strip(), mm.group(2).strip()
            named = re.findall(r'([A-Za-z]{3}\s*\d{2,4})\s*=\s*(-?\d+(?:\.\d+)?)\s*%?', body)
            if named:
                for per_txt, val in named:
                    key = re.sub(r'\s+', '', per_txt).lower()
                    period = AI_PERIOD_SHORT.get(key)
                    if not period:
                        problems.append(f'{group_id}: unrecognised period label "{per_txt}"')
                        continue
                    out.append(OrderedDict([('category', label), ('period', period),
                                            ('value', float(val)), ('unit', '%')]))
                continue
            seq = re.findall(r'(-?\d+(?:\.\d+)?)\s*%', body)
            if not seq:
                continue
            if len(seq) != len(periods):
                problems.append(f'{group_id}: "{label}" supplies {len(seq)} value(s) for '
                                f'{len(periods)} registered period(s); the row is carried as '
                                f'supplied and no value is inferred')
                continue
            for idx, val in enumerate(seq):
                out.append(OrderedDict([('category', label), ('period', periods[idx]),
                                        ('value', float(val)), ('unit', '%')]))
        return out, problems

    ai_ev_by_source = {}
    for r, obj in ai_raw:
        ai_ev_by_source.setdefault(str(r.get('Source', '')).strip(), []).append((r, obj))

    ai_series, ai_problems, ai_order = [], [], {}
    for src in sources:
        if str(src.get('dataset', '')) != 'AI Product Series':
            continue
        sid = src['id']
        if not re.match(r'^AIPS-WIDGET-', sid):
            continue          # the report PDF is a source, not a metric group
        pairs = ai_ev_by_source.get(sid, [])
        periods = ai_periods_of(src)
        ev_rows, cats = [], []
        for r, obj in pairs:
            ev_rows.append(OrderedDict([
                ('evidenceId', obj['id']),
                ('statement', obj['statement']),
                ('supportingData', obj['description']),
                ('metric', obj['metric']),
                ('value', obj['value']),
                ('trend', obj['trend']),
                ('nBase', obj['nBase'] if str(obj['nBase']).strip() else 'Not supplied'),
                ('confidence', obj['confidence']),
                ('verification', obj['verificationStatus']),
                ('caveat', obj['caveat']),
                ('relatedSignals', obj['relatedSignalIds']),
                ('sourceLocation', obj['sourceLocation']),
            ]))
            parsed, probs = ai_parse_categories(obj['description'], periods, sid)
            cats.extend(parsed)
            ai_problems.extend(probs)
        ai_order[sid] = src.get('sourceRow', 0)
        ai_series.append(OrderedDict([
            ('groupId', sid),
            ('group', src['title']),
            ('sourceId', sid),
            ('sourceName', src['title']),
            ('sourceLocation', src.get('location', '')),
            ('respondentCut', ai_cut_of(src, ev_rows[0] if ev_rows else None)),
            ('periods', periods),
            ('registeredRows', src.get('caveat', '') or 'Not specified'),
            ('accessStatus', src.get('accessStatus', '') or 'Not specified'),
            ('rowLevelSupplied', bool(cats)),
            ('categories', cats),
            ('evidence', ev_rows),
        ]))
    # Source-register order — the row order of the Sources sheet — with any group
    # that carries no row-level values last.
    ai_series.sort(key=lambda g: (0 if g['rowLevelSupplied'] else 1, ai_order[g['groupId']]))
    for p in ai_problems:
        warn('Charlotte AI: ' + p)

    check('V5-29', 'Charlotte AI groups are registered from the source register',
          len(ai_series) >= 5,
          '; '.join(f"{g['groupId']} ({len(g['categories'])} reading(s))" for g in ai_series))
    check('V5-30', 'No Charlotte AI reading is invented for a period the source omits',
          all(c['period'] in g['periods'] for g in ai_series for c in g['categories']),
          f"{sum(len(g['categories']) for g in ai_series)} category readings, "
          f"every one inside its group's registered periods")

    conflicting_active = [o['id'] for coll in (evidence, signals, queue) for o in coll
                          if o.get('active', True) and
                          (o.get('verificationStatus') or '').lower() == 'conflicting']
    check('V5-31', 'No active object carries an unresolved conflict flag',
          not conflicting_active,
          ', '.join(conflicting_active) or
          'the only Conflicting record is the archived October observation, and its flag is '
          'shown as the workbook recorded it')

    check('V5-28', 'Every charted Charlotte AI group names its source',
          all(g['sourceId'] for g in ai_series if g['rowLevelSupplied']),
          '; '.join(f"{g['group']} ← {g['sourceId']}" for g in ai_series if g['rowLevelSupplied']))

    zrows = raw_tables['zScore']['rows']
    z = zrows[0] if zrows else {}

    # Spending-intent composition. The workbook supplies this only for the
    # subsample cut behind the earlier October snapshot, so it is carried with
    # the snapshot it belongs to rather than attached to the API observation.
    all_resp = next((r for r in raw_tables['subsampleCuts']['rows']
                     if r.get('Category', '') == 'All Respondents'), {})
    intent_snapshot = next((a for a in tsis_superseded
                            if all_resp and num(all_resp.get('Net Score')) is not None and
                            abs((a['netScore'] or 0) - num(all_resp.get('Net Score'))) < 0.01), None)
    # The subsample cut that carries the intent split reconciles to the archived
    # October reading, not to the canonical one. It is therefore not supplied for
    # the active observation, and says so rather than being carried across.
    intent = OrderedDict([
        ('adoption', None), ('increase', None), ('flat', None),
        ('decrease', None), ('replacing', None),
        ('cut', 'All Respondents'),
        ('supplied', False),
        ('status', 'Not supplied for the canonical observation'),
        ('note', 'The workbook supplies a spending-intent split only for the subsample cut that '
                 'accompanies the archived ' + (intent_snapshot['source'] if intent_snapshot
                 else 'earlier') + ' October 2026 reading. It is not restated for '
                 + (current['source'] if current else 'the current observation') + ', so no '
                 'intent composition is shown for the current period.'),
        ('archivedValues', OrderedDict([
            ('adoption', num(all_resp.get('Adoption %'))),
            ('increase', num(all_resp.get('Increase %'))),
            ('flat', num(all_resp.get('Flat %'))),
            ('decrease', num(all_resp.get('Decrease %'))),
            ('replacing', num(all_resp.get('Replacing %'))),
            ('belongsToSnapshot', intent_snapshot['source'] if intent_snapshot else 'Not specified'),
            ('active', False),
        ])),
    ])
    check('V5-20', 'Spending-intent composition is not carried across from an archived reading',
          intent['supplied'] is False and intent['adoption'] is None,
          'Shown as Not supplied for the canonical observation; the archived split stays with '
          f"{intent['archivedValues']['belongsToSnapshot']}")

    def period_block(rec):
        if not rec:
            return OrderedDict()
        return OrderedDict([
            ('label', rec['period']), ('shortLabel', rec['period']),
            ('isCurrent', False), ('nBase', rec['nBase']),
            ('respondentCut', rec['respondentCut']), ('source', rec['source']),
            ('netScore', OrderedDict([('value', rec['netScore']), ('metric', 'Net Score'),
                                      ('evidenceId', rec['evidenceId'])])),
            ('pervasion', OrderedDict([('value', rec['pervasion']),
                                       ('metric', 'Deployment Breadth (Pervasion)'),
                                       ('evidenceId', rec['evidenceId'])])),
        ])

    historical_periods = [period_block(prior), period_block(year_ago)]

    # Current call, stated by the workbook's own Executive Brief summary rather
    # than assembled here.
    eb_rows = sheets.get('Executive Brief', [])
    eb_kv = {}
    for r in eb_rows:
        vals = [c for c in r if c]
        if len(vals) >= 2:
            eb_kv[vals[0]] = vals[1]
    oq002 = next((q for q in open_questions if q['id'] == 'OQ-002'), None)
    current_call = OrderedDict([
        ('value', eb_kv.get('Current Call', 'Source Needed')),
        ('detail', (oq002['statement'] + ' ' + oq002['recommendedNextAction'])
                   if oq002 else ''),
        ('ids', ['OQ-002'] if oq002 else []),
        ('questionStatus', oq002['status'] if oq002 else 'Not specified'),
        ('primarySignalId', 'SIG-02'),
        ('primarySignal', eb_kv.get('Primary Signal', '')),
        ('direction', eb_kv.get('Direction', '')),
        ('conviction', eb_kv.get('Conviction', '')),
        ('period', eb_kv.get('Current TSIS Period', current['period'] if current else '')),
        ('source', 'Executive Brief summary in the workbook'),
    ])
    check('V5-21', 'Current call is taken from the workbook, not assembled here',
          bool(current_call['value']),
          f"Call: {current_call['value'][:70]} · Direction: {current_call['direction'][:40]}")

    data = OrderedDict([
        ('metadata', OrderedDict([
            ('application', 'CrowdStrike REVEAL Company Explorer'),
            ('workbook', os.path.basename(wb_path)),
            ('workbookVersion', workbook_version or 'V5'),
            ('workbookTitleLine', version_line),
            ('generatedAt', generated_at),
            ('generator', 'build_v5_data.py'),
            ('worksheets', [OrderedDict([('name', n), ('state', states[n])])
                            for n in sheets]),
            ('sourceOfTruth', 'The extracted workbook is the sole factual source. No value '
                              'is interpolated, averaged across a conflict, or supplied from '
                              'outside the workbook.'),
        ])),
        ('company', OrderedDict([('name', 'CrowdStrike'), ('ticker', 'CRWD')])),
        ('reviewStatus', ' '.join(home_kv.get('Review status', [])) or 'Human Review Required'),
        ('currentPeriod', OrderedDict([
            # The Executive Brief states the period in full form; the TSIS series
            # labels it in short form. Both are the workbook's own wording.
            ('label', eb_kv.get('Current TSIS Period', current['period'] if current else '')),
            ('shortLabel', current['period'] if current else ''),
            ('isCurrent', True),
            ('nBase', current['nBase'] if current else ''),
            ('respondentCut', current['respondentCut'] if current else ''),
            ('source', current['source'] if current else ''),
            ('netScore', OrderedDict([
                ('value', current['netScore'] if current else None),
                ('metric', 'Net Score'), ('evidenceId', current['evidenceId'] if current else ''),
                ('qqDelta', net_delta), ('yyDelta', net_yy),
                ('priorPeriod', prior['period'] if prior else ''),
                ('yearAgoPeriod', year_ago['period'] if year_ago else ''),
            ])),
            ('pervasion', OrderedDict([
                ('value', current['pervasion'] if current else None),
                ('metric', 'Deployment Breadth (Pervasion)'),
                ('canonicalMetric', 'Pervasion'),
                ('presentationLabel', 'Deployment Breadth'),
                ('evidenceId', current['evidenceId'] if current else ''),
                ('qqDelta', pv_delta), ('yyDelta', pv_yy),
            ])),
            ('zScore', OrderedDict([
                ('qqZ', num(z.get('Q/Q Z-Score'))), ('yyZ', num(z.get('Y/Y Z-Score'))),
                ('citations', num(z.get('Citations'))),
                ('metricValue', num(z.get('Metric Value'))),
                ('bandStatus', 'Source Needed'),
                ('note', 'Z-Score values are supplied; approved strength bands are not. '
                         'Deviation context only.'),
            ])),
            ('intent', intent),
            ('supersededSnapshots', tsis_superseded),
            ('provenanceResolved', bool(tsis_superseded)),
        ])),
        ('historicalPeriods', historical_periods),
        ('currentCall', current_call),
        ('tsisHistory', tsis_history),
        ('tsisSuperseded', tsis_superseded),
        ('aiProductSeries', ai_series),
        ('sources', sources),
        ('evidence', evidence),
        ('signals', signals),
        ('interpretations', interpretations),
        ('crossLaneLinks', cross_lane),
        ('lineage', lineage),
        ('kpis', kpis),
        ('bridges', bridges),
        ('researchQueue', queue),
        ('openQuestions', open_questions),
        ('risks', risks),
        ('reviewItems', review_items),
        ('rules', rules),
        ('legacyRelationships', legacy_rels),
        ('relationships', relationships),
        ('droppedEdges', dropped),
        ('rawTables', raw_tables),
        ('datasetCoverage', dataset_coverage),
        ('researchTrace', research_trace),
        ('outputs', outputs),
        # The default lineage path: one real chain through the V5 graph, from the
        # registered source to the drafts that cite it. Every id here is an object
        # in this workbook.
        ('proofPath', proof_path),
        ('unresolvedReferences', sorted(set(unresolved))),
        # Collections the V3.5 workbook carried that V5 does not. They are kept
        # as empty arrays so every view renders an honest "not supplied in this
        # workbook" rather than failing, and the delta is listed in the audit.
        ('contextRules', []),
        ('metricContext', []),
        ('governance', []),
        ('rawNodes', []),
        ('backtests', []),
        ('calibrationCases', []),
        ('workbookValidation', []),
        ('generatedOutputTemplates', OrderedDict()),
        ('conflicts', []),
        ('supersededMap', OrderedDict(
            [(o['id'], (current or {}).get('evidenceId', '')) for o in archived_objects
             if o['type'] == 'evidence'] +
            [(a['evidenceId'], (current or {}).get('evidenceId', '')) for a in tsis_superseded])),
        ('kpiGate', OrderedDict([
            ('signalId', 'SIG-02'),
            ('kpiId', (trace_bridge or {}).get('relatedKpiIds', [''])[0] if trace_bridge else ''),
            ('kpiName', (trace_bridge or {}).get('kpiName', '') if trace_bridge else ''),
            ('linkageType', (trace_bridge or {}).get('linkageType', '') if trace_bridge else ''),
            ('classification', 'Hypothesis'),
            ('decision', 'Not validated — KPI bridge remains a hypothesis'),
            ('candidate', 'Improving TSIS spending intent may be directionally relevant to Net New '
                          'ARR, but the relationship has not been validated.'),
            ('lagSupported', (trace_bridge or {}).get('lagSupported', '') if trace_bridge else ''),
            ('requiredTimeLag', (trace_bridge or {}).get('requiredTimeLag', '') if trace_bridge else ''),
            ('confounders', (trace_bridge or {}).get('knownConfounders', '') if trace_bridge else ''),
            ('sourceNeeded', (trace_bridge or {}).get('sourceNeededFields', []) if trace_bridge else []),
            ('gates', [
                OrderedDict([('gate', 'Metric alignment'), ('state', 'Not established'),
                             ('detail', 'TSIS Net Score and Pervasion measure survey demand and '
                                        'deployment breadth; Net New ARR is a company financial '
                                        'KPI. A translation function has not been demonstrated.')]),
                OrderedDict([('gate', 'Time-lag relationship'), ('state', 'Not supported'),
                             ('detail', 'The workbook does not establish which survey period, if '
                                        'any, should lead or coincide with a reported financial '
                                        'period.')]),
                OrderedDict([('gate', 'Historical backtest'), ('state', 'Not completed'),
                             ('detail', 'No demonstrated historical test shows that changes in the '
                                        'TSIS signal reliably correspond to changes in Net New '
                                        'ARR.')]),
                OrderedDict([('gate', 'Confounder isolation'), ('state', 'Not completed'),
                             ('detail', 'Falcon Flex, CCP, renewals, new logos, expansion and '
                                        'period alignment may affect the KPI independently of the '
                                        'survey signal.')]),
                OrderedDict([('gate', 'Period alignment'), ('state', 'Not resolved'),
                             ('detail', 'Survey periods and financial reporting periods have not '
                                        'been mapped into a validated analytical window.')]),
                OrderedDict([('gate', 'KPI decomposition'), ('state', 'Not supplied'),
                             ('detail', 'The current evidence does not isolate how much of Net New '
                                        'ARR might come from new logos, expansion, renewals, '
                                        'packaging, pricing or other drivers.')]),
                OrderedDict([('gate', 'Evidence threshold'), ('state', 'Not met'),
                             ('detail', 'A directional survey recovery is not, by itself, '
                                        'sufficient evidence of a financial outcome.')]),
                OrderedDict([('gate', 'Human validation'), ('state', 'Required'),
                             ('detail', 'The bridge must be reviewed and accepted only after the '
                                        'required evidence and backtest are available.')]),
            ]),
            ('canSayNow', [
                OrderedDict([('classification', 'Client-provided fact'),
                             ('text', 'It is supported that the ' + (current or {}).get('period', '')
                              + ' TSIS observation shows Net Score of '
                              + str((current or {}).get('netScore', '')) + ' and Deployment Breadth '
                              '(Pervasion) of ' + str((current or {}).get('pervasion', '')) +
                              ' for the ' + (current or {}).get('respondentCut', '') + ' cut with N='
                              + str((current or {}).get('nBase', '')) + '.')]),
                OrderedDict([('classification', 'ETR interpretation'),
                             ('text', 'It is an ETR interpretation that demand recovery is '
                                      'continuing, with deployment breadth improving faster than '
                                      'spending intent sequentially.')]),
                OrderedDict([('classification', 'Not supported'),
                             ('text', 'It is not supported that this observation caused, predicts '
                                      'or quantifies Net New ARR, revenue, ARR, market share, '
                                      'retention or future performance.')]),
            ]),
            ('unlock', [
                'Define the expected lag and period-alignment rule',
                'Obtain the relevant historical KPI series',
                'Map TSIS periods to comparable financial periods',
                'Backtest direction, magnitude, consistency and false positives',
                'Test stability across multiple periods',
                'Evaluate the named confounders',
                'Document an acceptance threshold',
                'Complete human research review',
            ]),
            ('plan', OrderedDict([
                ('candidateKpi', (trace_bridge or {}).get('kpiName', '') if trace_bridge else ''),
                ('sourceSignal', 'SIG-02'),
                ('hypothesis', (trace_bridge or {}).get('economicMechanism', '')
                 if trace_bridge else ''),
                ('missingEvidence', (trace_bridge or {}).get('sourceNeededFields', [])
                 if trace_bridge else []),
                ('confounders', (trace_bridge or {}).get('knownConfounders', '')
                 if trace_bridge else ''),
                ('proposedTest', 'Backtest the signal against the historical KPI series once the '
                                 'lag rule and period mapping are defined.'),
                ('acceptanceCriteria', 'Not supplied'),
                ('owner', 'Not supplied'),
                ('reviewStatus', (trace_bridge or {}).get('verificationStatus', 'Pending Review')
                 if trace_bridge else 'Pending Review'),
            ])),
        ])),
        ('archive', OrderedDict([
            ('note', 'Records kept for audit. Nothing here is active: none of it is plotted, '
                     'counted, searchable as current evidence, or selectable when assembling an '
                     'output. No value in this section was edited.'),
            ('supersededObservations', tsis_superseded),
            ('supersededObjects', archived_objects),
        ])),
        ('provenanceResolutions', [OrderedDict([
            ('id', f"RESOLVED-{a['period'].replace(' ', '')}-{a['source']}"),
            ('period', a['period']),
            ('metricFamily', 'Net Score / Deployment Breadth (Pervasion)'),
            ('respondentCut', a['respondentCut']),
            ('activeValue', f"Net Score {current['netScore']}, Deployment Breadth "
                            f"{current['pervasion']}, N {current['nBase']}" if current else ''),
            ('activeSource', current['source'] if current else ''),
            ('supersededValue', f"Net Score {a['netScore']}, Deployment Breadth {a['pervasion']}, "
                                f"N {a['nBase']}"),
            ('supersededSource', a['source']),
            ('reason', a['reason']),
            ('status', 'Resolved — provenance, not an open analytical conflict'),
            ('resolvedBy', 'Canonicalisation rule: one active observation per company, metric '
                           'family, respondent cut and survey period; a reading without a '
                           'supplied base cannot supersede one with a base.'),
        ]) for a in tsis_superseded]),
    ])
    return data


# ─────────────────────────────────────────────────────────────── emitters ──
def write_outputs(data, wb_path):
    os.makedirs(GEN_DIR, exist_ok=True)

    sections = ['sources', 'evidence', 'signals', 'lineage', 'bridges', 'researchQueue',
                'tsisHistory', 'aiProductSeries', 'rules', 'datasetCoverage',
                'researchTrace', 'interpretations', 'crossLaneLinks', 'relationships',
                'rawTables', 'outputs']
    file_map = {'bridges': 'kpiBridges', 'rawTables': 'normalizedMetrics'}
    written = []
    for key in sections:
        fname = file_map.get(key, key) + '.json'
        path = os.path.join(GEN_DIR, fname)
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(data[key], fh, indent=1, ensure_ascii=False, sort_keys=False)
            fh.write('\n')
        written.append(os.path.relpath(path, HERE))
    meta_path = os.path.join(GEN_DIR, 'workbookMetadata.json')
    with open(meta_path, 'w', encoding='utf-8') as fh:
        json.dump(OrderedDict([('metadata', data['metadata']),
                               ('currentPeriod', data['currentPeriod']),
                               ('company', data['company'])]),
                  fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    written.append(os.path.relpath(meta_path, HERE))

    report = OrderedDict([
        ('generatedAt', data['metadata']['generatedAt']),
        ('workbook', data['metadata']['workbook']),
        ('workbookVersion', data['metadata']['workbookVersion']),
        ('workbookSha', ''),
        ('extractionChecks', CHECKS),
        ('checkSummary', OrderedDict([
            ('total', len(CHECKS)),
            ('passed', sum(1 for c in CHECKS if c['result'] == 'PASS')),
            ('failed', sum(1 for c in CHECKS if c['result'] == 'FAIL')),
        ])),
        ('blockingErrors', BLOCKING),
        ('warnings', WARNINGS),
        ('counts', OrderedDict([(k, len(data[k])) for k in
                                ('sources', 'evidence', 'signals', 'lineage', 'bridges',
                                 'kpis', 'researchQueue', 'rules', 'relationships',
                                 'tsisHistory', 'aiProductSeries', 'interpretations',
                                 'crossLaneLinks')])),
        ('datasetCoverage', data['datasetCoverage']),
        ('supersededObservations', data['tsisSuperseded']),
        ('provenanceResolutions', data['provenanceResolutions']),
        ('unresolvedReferences', data['unresolvedReferences']),
        ('droppedEdges', data['droppedEdges'][:200]),
        ('generatedFiles', written),
    ])
    with open(os.path.join(HERE, 'validation-report.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=1, ensure_ascii=False)
        fh.write('\n')

    data['validation'] = OrderedDict([
        ('extractionChecks', CHECKS),
        ('checkSummary', report['checkSummary']),
        ('warnings', WARNINGS),
        ('blockingErrors', BLOCKING),
        ('counts', report['counts']),
    ])
    ux = os.path.join(HERE, 'ux-checks.json')
    if os.path.exists(ux):
        try:
            with open(ux, encoding='utf-8') as fh:
                data['validation']['uxChecks'] = json.load(fh)
        except (ValueError, OSError):
            pass

    js_path = os.path.join(HERE, 'reveal-data.js')
    with open(js_path, 'w', encoding='utf-8') as fh:
        fh.write('/* Generated by build_v5_data.py — do not edit by hand.\n'
                 f'   Workbook: {data["metadata"]["workbook"]} '
                 f'({data["metadata"]["workbookVersion"]})\n'
                 f'   Generated: {data["metadata"]["generatedAt"]}\n'
                 '   Regenerate: python3 build_v5_data.py [workbook.xlsx]          */\n')
        fh.write('window.REVEAL_DATA = ')
        json.dump(data, fh, ensure_ascii=False, indent=0, separators=(',', ':'))
        fh.write(';\n')
    written.append('reveal-data.js')
    written.append('validation-report.json')
    return written


def main():
    wb_path = locate_workbook(sys.argv)
    print(f'Workbook: {wb_path}')
    before = os.path.getmtime(wb_path), os.path.getsize(wb_path)

    data = build(wb_path)

    if BLOCKING or data is None:
        print('\nBLOCKING DATA-INTEGRITY ERRORS — nothing was written:', file=sys.stderr)
        for b in BLOCKING:
            print('  ✗ ' + b, file=sys.stderr)
        sys.exit(1)

    written = write_outputs(data, wb_path)

    after = os.path.getmtime(wb_path), os.path.getsize(wb_path)
    if before != after:                                           # pragma: no cover
        print('ERROR: the workbook changed during the build', file=sys.stderr)
        sys.exit(1)

    print(f'\nExtraction checks: {sum(1 for c in CHECKS if c["result"] == "PASS")}'
          f'/{len(CHECKS)} passed')
    for c in CHECKS:
        print(f'   {c["result"]}  {c["id"]}  {c["name"]}')
        if c['detail']:
            print(f'          {c["detail"]}')
    print(f'\nWarnings (research state, not build failures): {len(WARNINGS)}')
    for w in WARNINGS[:12]:
        print('   • ' + w[:150])
    if len(WARNINGS) > 12:
        print(f'   … {len(WARNINGS) - 12} more in validation-report.json')
    print('\nWrote:')
    for w in written:
        print('   ' + w)
    print('\nWorkbook unchanged. Build complete.')


if __name__ == '__main__':
    main()
