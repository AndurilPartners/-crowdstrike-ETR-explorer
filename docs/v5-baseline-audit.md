# V5 rebuild — baseline audit

Recorded before any V5 change was made, so the rebuild can be compared against
the application as it stood.

## Where the application lives

| | |
| --- | --- |
| Local application root | `~/Projects/ode-intelligence-lab/crowdstrike_reveal_explorer/` |
| Parent folder | `~/Projects/ode-intelligence-lab/` — the ODE Intelligence Lab working folder, which also holds `analysis/`, `data/`, `scripts/`, `sources/`, `outputs/` and its own `CLAUDE.md` |
| Git working tree | **No.** `git rev-parse` reports "not a repository" at the lab folder and at the Explorer folder. A `.gitignore` and a `CHANGELOG.md` exist, so the folder is prepared for Git but not initialised. Git was **not** initialised as part of this work. |
| Deployment configuration | None. No GitHub Pages workflow, no `CNAME`, no `.github/`, no base-path configuration anywhere in the folder. |

Because the folder is not a working tree, `git status --short`, `git branch
--show-current` and `git remote -v` have no output to record. The change summary
at the end of this rebuild lists every file added and modified instead.

## The stack, as found

| Question | Answer |
| --- | --- |
| Framework | None. Plain HTML, CSS and ES5-era JavaScript loaded with `<script>` tags. No React, Vue, Svelte or bundler. |
| Package manifest | None. No `package.json`, so no dependency tree, no scripts block. |
| Package manager / lockfile | None. No `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` or `bun.lock`. Nothing was added. |
| Chart library | None. The single chart is hand-written inline SVG in `app.js`. |
| CSS / component system | One hand-written stylesheet, `styles.css`, with CSS custom properties. Plus `print.css`, loaded `media="print"`. |
| Data loading | A generated `reveal-data.js` assigns `window.REVEAL_DATA` and is loaded by a plain `<script>` tag. **No `fetch()` anywhere** — deliberate, because the application must run from `file://`, where `fetch()` of a local JSON file is blocked by the browser. |
| Routing | Hash routing in `app.js` (`parseHash()` / `VIEWS` / `RENDER`), so deep links work without a server and without SPA fallback rules. |
| Local development command | None needed: open `index.html`. A static server is optional. |
| Production build command | None. The application *is* the source. The only build step is the Python data extraction. |
| Production output directory | Not applicable — the folder itself is what gets published. |
| Test command | `node test.mjs` — a Playwright suite driving Chromium against `file://`. |
| Lint / type-check | None configured. No ESLint, Prettier, TypeScript or `tsconfig.json`. `node --check` is the available syntax gate. |

## Existing CrowdStrike content, before the rebuild

- One chart, "The recovery profile": Pervasion for 12 periods drawn as a line;
  Net Score for **3 of 12** periods drawn as points, with the gap between
  October 2025 and July 2026 labelled *no intervening periods supplied*.
- Current period October 2026 with **Net Score 37.14** and **Pervasion 40.90**,
  N 420.
- 105 evidence objects, 7 signals, 26 rules, 41 sources, 477 relationships,
  from `CrowdStrike_REVEAL_V3_5_Oct2026_TSIS_Integrated.xlsx`.
- No Charlotte AI / AI Product Series content of any kind.
- Hard-coded values in `app.js`: the `CALL` object (current call, prior call,
  direction, conviction, evidence confidence) and the filter dimensions
  (`LANES`, `CLASSES`, `CONFS`) were written as literals rather than read from
  the workbook.

## Baseline runs

| Command | Result |
| --- | --- |
| install | Not applicable — no dependency manifest. |
| `node test.mjs` | **147 checks, 0 failed.** |
| `python3 extract_workbook.py …V3_5….xlsx` | Completed; 17 extraction checks passed; "Extraction complete." |
| lint | Not configured. |
| type-check | Not configured. |
| production build | Not applicable — no build step beyond extraction. |

## Workbook candidates found

Searched the application folder, the lab folder and the adjacent input folders
(`~/Downloads`, `~/Desktop`, `~/Documents`).

| Workbook | Where | Decision |
| --- | --- | --- |
| **`CrowdStrike_ETR_V5_Full_Rebuild.xlsx`** | `~/Downloads/`, and uploaded twice to this session | **Selected.** |
| `CrowdStrike_REVEAL_V3_9_Form_Based_Research_Workbench.xlsx` | `~/Downloads/` | Not used — pre-V5. |
| `CrowdStrike_REVEAL_V3_7_Guided_Research_Workbench.xlsx` (and `-2`) | `~/Downloads/` | Not used — pre-V5. |
| `CrowdStrike_REVEAL_V3_6_Simplified_Research_Workbench.xlsx` | `~/Downloads/` | Not used — pre-V5. |
| `CrowdStrike_REVEAL_V3_5_Oct2026_TSIS_Integrated.xlsx` | `~/Downloads/` | The previous canonical source; superseded. |
| `CrowdStrike_REVEAL_V3_1_Interpretation_Rule_Registry_Seed.xlsx` | `~/Downloads/` | Not used — pre-V5. |
| `CrowdStrike_REVEAL_Research_Workspace_v2_Merged 1.xlsx` | `~/Downloads/` | Not used — pre-V5. |
| `CrowdStrike (CRWD) — REVEAL Evidence Table From Reflexivity.xlsx` | `~/Downloads/` | Not used — a lane inside V5, not a rebuild source. |

All three copies of the V5 file are byte-identical
(`md5 ea8a72093cbafc1ab4db769331bd6eda`, 145,263 bytes), so there was no
ambiguity to resolve between V5 candidates.

Selection was made on **content, not filename or timestamp**: the workbook's
`Home` sheet states *"CrowdStrike REVEAL V5.0 — Research Lineage Workbench"*.

> **Discrepancy worth noting.** The file's embedded document title still reads
> *"CrowdStrike REVEAL V4.0 — Research Lineage Workbench"* while the `Home`
> sheet and the filename both say V5. The sheet content was treated as
> authoritative. This is listed as a human-review item.

## Worksheet inventory of the selected workbook

24 worksheets, 10 of them hidden. All were read — hidden sheets included.

Visible: Home · Workflow Guide · Evidence Intake Form · Add Evidence · Sources ·
Evidence Library · Signal Builder · Research Lineage · KPI Bridge ·
Research Queue · Rules & Methodology · Executive Brief · Sunday Signal ·
Update Email

Hidden: `_Legacy Evidence Relationships` · `_Lists` · `_Raw_Z_Score` ·
`_Raw_Pervasion_Trend` · `_Raw_Region` · `_Raw_Subsample_Cuts` ·
`_Raw_Vendor_View` · `_Raw_Peer_Trends` · `_Raw_Adoption_Reasons` ·
`_Raw_Job_Titles`
