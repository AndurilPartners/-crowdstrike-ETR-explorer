# CrowdStrike REVEAL Company Explorer

An interactive research operating surface built over one governed evidence workbook.

It opens on the **Vendor Signal Brief**, which answers one question in plain words before
it shows a single table: *is CrowdStrike's post-outage recovery still building, or has it
flattened out a year on?* A short answer, the reason it matters now, the scope of what ETR
does and does not measure, and a contents table naming the eight sections that follow. The
call rail beside it carries the prior call, the current call, both confidences and the six
numbers the answer rests on. Every figure in the narrative is a button that opens the
workbook object behind it.

The data follows: evidence explorer, lineage graph, KPI-bridge workspace, rule explorer,
cohort and region cuts, audience translator and two deterministic draft generators — all
reading the same objects, with the same classifications and the same source lineage.

---

## How to open it

Double-click **`index.html`**. It lands on the Vendor Signal Brief.

No server, no npm, no build step, no internet connection. The application runs under
`file://` with plain HTML, CSS and JavaScript. There is no React, no CDN, no external
font, no API and no `fetch()`. Python is used only during the build, to read the workbook.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Application shell — top bar, sidebar, view containers, drawer, source pane |
| `styles.css` | The whole visual system, including print rules |
| `reveal-data.js` | Generated. Assigns the normalized object model to `window.REVEAL_DATA` |
| `app.js` | The application. Consumes `window.REVEAL_DATA`; no other input |
| `extract_workbook.py` | Build step. Reads the workbook with openpyxl and writes `reveal-data.js` |
| `validation-report.json` | Extraction checks, targets, conflicts and counts |
| `README.md` | This file |

Rebuild after a workbook change:

```
python3 extract_workbook.py path/to/CrowdStrike_REVEAL_V3_5_Oct2026_TSIS_Integrated.xlsx
```

The extractor exits non-zero if any check fails, so a bad extraction cannot silently ship.

## Source workbook

`CrowdStrike_REVEAL_V3_5_Oct2026_TSIS_Integrated.xlsx` is the sole factual source. No web
retrieval, no parametric knowledge, no gap-filling. Where the workbook is silent the
application displays **Source Needed** rather than a plausible value.

### Authorized worksheets (31)

*Current October evidence* — V3.5 Update Summary · OCT26 Current TSIS · Updated
Interpretations v3.5 · Current ETR Addendum
*Signals, KPI, narrative* — Signal Canvas · Signal Inventory · KPI Bridge · KPI Inventory ·
Cross-Lane Synthesis · Risks · Open Questions
*Evidence and lineage* — Combined Evidence Library · Evidence Relationships · Signal
Relationships · Source Register
*Rules and context* — Interpretation Rules · Metric Context Matrix · MCP Context Export ·
Rule Governance
*Validation and measurement* — Backtest Protocol · Analyst Calibration · Review Queue ·
V3.5 Validation
*Raw source tables* — Raw - Z Score · Raw - Pervasion Trend · Raw - Region · Raw - Subsample
Cuts · Raw - Vendor View · Raw - Peer Trends · Raw - Adoption Reasons · Raw - Job Titles

`extract_workbook.py` raises if any other sheet is requested. Ten sheets present in the
workbook are never opened; Methodology & Validation lists them.

### Source precedence

OCT26 Current TSIS → raw worksheets → Current ETR Addendum → Combined Evidence Library →
Updated Interpretations → Signal Canvas / Inventory → KPI Bridge / Inventory → Cross-Lane
Synthesis → Risks / Open Questions → rules → Source Register → relationship sheets →
backtest, calibration and review sheets.

When two authorized worksheets disagree the higher-precedence value is displayed **and the
disagreement is recorded**: both values, both worksheets, both rows, both periods, whether
rounding could explain it, and the resolution. Nothing is averaged and nothing is silently
chosen. See **Risks & Questions → Data Conflicts**.

## Period treatment

* **October 2026 is the current TSIS period.** July 2026 is historical comparison; October
  2025 is the year-over-year frame. R-025 makes the promotion a hard rule and July is never
  presented as current.
* Every metric displays its period. "Current" never means "as of the document date".
* The workbook preserves a discrepancy: survey labels read October 2026 while the source
  export filenames are dated 2026-09-10. **OQ-015** is open and the application does not
  reconcile it — both labels are shown wherever the exports are named.


## Reading order

The brief is built to be read top to bottom, and the contents table under the short answer
scrolls to any section directly.

| | Section | What it carries |
| --- | --- | --- |
| 01 | Signal scorecard | All seven signals, with evidence confidence and outcome linkage kept in separate columns |
| 02 | What changed | October against July and against October last year — supplied periods only, nothing interpolated |
| 03 | Demand and breadth | What Net Score and Pervasion each measure, and what neither measures |
| 04 | Enterprise and geography | Where the reading is strong, and where the base thins out |
| 05 | Three drivers | The story compressed to what the evidence can hold at usable confidence |
| 06 | Signal to KPI | The one relationship worth formal testing, stated in full so it can be attacked |
| 07 | What argues against it | Counter-evidence and the Z-Score gap |
| 08 | What would change it | Open questions and the next step |

## The source strip

Beneath the top bar, a strip states how much of the evidence base is switched on —
*Complete ETR view · 10 of 10 ETR sources on*. Each lane chip toggles that lane. Switching
one off changes every reading, count and graph in the application, and says so. It never
changes the approved Current Call: that is a reviewer decision recorded in the workbook,
not a consequence of what a reader is looking at.

## Views

| View | What it does |
| --- | --- |
| Vendor Signal Brief | **The landing view.** Question, short answer, scope and contents, then eight sections of evidence. Printable on its own |
| Company Overview | Call strip, primary signal, clickable metric strip, three drivers, evidence balance |
| Signals | All seven Signal Canvas objects; each opens a ten-tab Signal Workspace |
| Evidence | Card and table views, fourteen quick filters, free-text search, 2–4 object comparison, CSV export |
| Lineage | Interactive SVG graph; proof-case path by default, full graph on demand |
| KPI Bridges | Signal × KPI matrix; every populated cell opens a Bridge Workspace |
| Cohorts & Regions | October cohort cuts, regional cuts, adoption reasons, respondent composition, peer trends |
| Rules | All 26 interpretation rules and 13 MCP context objects, filterable, with governance |
| Risks & Questions | Risks, counter-evidence, open questions, Source Needed, data conflicts, output blockers |
| Sources | The 41 source objects, October exports separated from historical |
| Audience Translator | Eight audiences over one fixed signal |
| Sunday Signal | Deterministic draft with a claim manifest per paragraph |
| Update Email | Five output types, same manifest system |
| Methodology & Validation | Extraction checks, live runtime checks, workbook self-validation, counts |

## Object model

`window.REVEAL_DATA` carries `metadata`, `company`, `currentPeriod`, `historicalPeriods`,
`sources`, `evidence`, `signals`, `kpis`, `bridges`, `risks`, `openQuestions`, `rules`,
`contextRules`, `metricContext`, `governance`, `interpretations`, `rawTables`, `rawNodes`,
`crossLaneLinks`, `relationships`, `backtests`, `calibrationCases`, `reviewItems`,
`outputs`, `conflicts`, `workbookValidation`, `generatedOutputTemplates` and `validation`.

Every object carries the full field set — id, originalId, objectType, title, statement,
classification, source lane and file, worksheet and row, period, current/historical, metric,
value, comparison, N, confidence, verification and workflow status, related-ID arrays,
`sourceNeededFields`, caveat, prohibited conclusions and recommended next action. **Absent
values are `null`, never an empty string that could read as resolved.**

## Claim classification

Every material rendered statement is exactly one of: **Client-provided fact**, **Anduril
interpretation**, **Hypothesis**, **Open question**, **Recommended action**. Each is shown
with a labelled badge — colour is never the only indicator — alongside its evidence IDs,
confidence, source status, period and applicable rule IDs.

## Source controls

Fourteen source-lane toggles, five claim-class toggles, eight evidence-state toggles, five
confidence toggles and eight quick controls. They update evidence lists, signal counts,
lineage nodes and edges, KPI-bridge evidence, risks, questions, generator selections and
every visible count. Active filters appear as removable chips and persist in `localStorage`.

**They never change the approved Current Call.** The Current Call is a reviewer decision
recorded in the workbook, not a computation over the filtered set. Turning off the October
lane shows a filtered-view banner and leaves the call exactly where it was.

Note that the Z-Score, cohort, regional, adoption and composition lanes are *separate* from
the October TSIS lane, so switching October off leaves those lanes visible by design.

## Lineage

Node types: Source, Raw Record, Evidence, Signal, Interpretation, KPI, Bridge, Risk, Open
Question, Rule, Context Rule, Output — each with its own shape as well as its own colour.
Relationship types: SOURCE_OF, NORMALIZES_TO, SUPPORTS, CONTRADICTS, CONTEXTUALIZES,
INFORMS, RELATES_TO, IMPACTS, BLOCKS, GOVERNED_BY, COMMUNICATES, GENERATED_FROM,
HISTORICAL_COMPARISON.

Every edge is derived from a relationship worksheet, a bridge row, a rule reference, a
Source Register row or an output manifest. **No edge is inferred.** A worksheet reference
that does not resolve to an object is excluded from the graph and listed in Methodology &
Validation rather than rewritten to something that does resolve.

Default view is the proof-case path: raw October source → ETR-OCT26-NS → SIG-02 → KPI-003 →
R-021 / R-026 → Vendor Signal Brief → Sunday Signal and Update Email. The SIG-02 → KPI-003
edge is **dashed**, because it is a hypothesis and not a validated relationship.

Click a node to highlight its paths, double-click to open its record, click an edge for its
detail. Expand upstream and downstream, collapse branches, switch one-hop / two-hop / full
graph, change orientation, zoom, fit, centre, reset, toggle node and relationship types,
export the current graph as SVG, print it, or copy a deep link.

## Z-Score treatment

The actual values are in the workbook and are displayed exactly: metric value 37.14285714,
Q/Q change 0.68664533, Y/Y change 10.53571429, Q/Q Z-Score 0.129243494, Y/Y Z-Score
0.892193894, N 420.

The application says only that both Z-Scores are positive, that Y/Y is higher than Q/Q,
that this is consistent with the larger Y/Y base-metric change, and that Z-Score supplies
deviation or unusualness context while Net Score determines direction.

It never says statistically significant, extreme, strong, weak, high probability, predicts
revenue, proves a beat, validates the vendor call, greater or less than one standard
deviation, or anomaly band. **Raw Z-Score values are available. Approved interpretation
bands remain Source Needed** (OQ-005, R-007). Z-Score alone can never create or change the
Current Call.

## KPI bridge treatment

Every Signal → KPI relationship is a hypothesis unless the workbook marks it otherwise. The
only definitional cell is SIG-03 → KPI-002, which is an accounting identity. Each bridge
shows mechanism, expected direction, expected lag, lag support, confidence, supporting and
contradicting evidence, confounders, Source Needed fields, confirming and disconfirming
conditions, rule IDs, backtest protocol and review status.

SIG-02 → KPI-003 is the named proof-case candidate and is labelled **Hypothesis — Backtest
Required** wherever it appears. No lag is established for the pairing.

## Generators

Both generators assemble prose deterministically from selected workbook objects using
JavaScript templates. **No external model is called.** Every paragraph carries a claim
manifest: claim ID, rendered text, classification, source evidence IDs, source object IDs,
source worksheets, rule IDs, confidence, caveat, Source Needed fields and local generation
time. Click any paragraph to open its manifest and jump to its lineage. "Inspect claims"
outlines each paragraph by classification.

Sunday Signal: title, audience, primary signal, KPI bridge, evidence, counter-evidence,
open questions, tone, length, and three include toggles. Regenerate, reorder sections, edit
locally, restore the generated text, copy, download Markdown or HTML, download the manifest
JSON, print.

Update Email: five output types, recipient label, subject style, audience, signal, evidence,
risk, open question, next action, length and two include toggles. Copy subject, body or the
full email; download `.txt` or `.html`; download the manifest; print; open the supporting
lineage; reset. **The prototype does not create or send email.**

## Deep links

`#index` `#brief` `#signals` `#signal/SIG-02` `#signal/SIG-07` `#evidence`
`#evidence/ETR-OCT26-NS` `#evidence/ETR-OCT26-ZS` `#kpi/KPI-003` `#bridge/SIG-02/KPI-003`
`#rule/R-026` `#question/OQ-014` `#lineage/SIG-02` `#cohorts` `#sources`
`#audience/investor` `#generator/sunday-signal` `#generator/update-email` `#methodology`

Keyboard: `/` focuses search · `Escape` closes a drawer, panel or dialog · `g` then `l`, `s`
or `e` opens Lineage, Signals or Evidence.

## localStorage

Source controls, audience, active view, card/table preference, graph orientation, selected
generator evidence, unsent local drafts and dismissed tips are stored under
`reveal.crwd.state`. **Methodology & Validation → Reset application state** clears them.

## Exports

Print the Brief, the current object, the current lineage or an evidence comparison;
download the Sunday Signal as Markdown or HTML; the update email as TXT or HTML; the claim
manifest as JSON; the filtered evidence as CSV; the current lineage as SVG. All generated
locally in the browser.

## Validation

`validation-report.json` holds the extraction checks. Methodology & Validation renders both
those and a set of runtime checks that execute in the browser each time the view opens —
filter behaviour, Current Call stability, search, deep links, drawers, bidirectional lineage
traversal, both generators, manifests, copy and download, print, `file://` operation,
external-dependency absence and the persistent human-review badge.

## Known limitations

1. **No October data outlook exists.** The Current Call reads **Source Needed** because the
   workbook records no October 2026 ETR data outlook. OQ-002 is Critical and Open. The Prior
   Call resolves precisely: the JUL26 report states a step up to Positive (ETR-CUR-005).
2. **No October cut carries an N.** Every cohort and regional value is displayed without a
   citation base (OQ-014). R-009 and R-010 therefore cap what any cohort or regional
   statement can carry, and the application shows the missing base rather than omitting it.
3. **Z-Score bands are absent.** Values are resolved; the formula, sign convention, lookback,
   normalization population and thresholds are not.
4. **Two signal ID spaces.** The Signal Canvas uses SIG-01…SIG-07; the Combined Evidence
   Library's Related Signals column uses SIG-001…SIG-011. They are not joinable without a
   mapping, so those references are excluded from the graph and listed, not guessed (R-001).
5. **Five rule rows appear column-shifted.** In R-014, R-017, R-021, R-022 and R-023 the
   fields from *Enforcement* rightward sit one column left of their headers, so the
   *Permitted* cell holds prohibition text. The Rule Explorer flags each one and applies the
   canonical prohibition in R-015. Flagged for workbook repair; not repaired here.
6. **Residual "current-period" wording.** Several ETR-CUR objects still describe themselves
   as current-period in their caveat text while V3.5 relabels them historical. Both states
   are preserved and recorded as data conflicts.
7. The prototype does not edit rule status, promote signals, resolve questions or write back
   to the workbook. Rules are human-maintained in the workbook.

## Human review required

R-020 makes analyst approval a precondition of external distribution: mechanical rules can
be automated, publication judgement cannot. The badge is present in the top bar on every
view and is not dismissible. Every reviewer decision on the Signal Canvas reads *Pending
Review*, and no item has been signed off as a validated Signal-to-KPI relationship.

Nothing in this application is an investment recommendation. It contains no rating, price
target, valuation opinion or forecast. ETR evidence and company evidence are presented as
parallel lanes; no causal relationship between them is asserted or established.
