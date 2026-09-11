/* Interaction, discipline and UX suite for the CrowdStrike REVEAL Company Explorer.
   Run: node test.mjs        Exits non-zero on any failure. */
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'node:fs';
const { chromium } = pw;
const URL = 'file://' + process.cwd() + '/index.html';

const R = [];
const is = (n, cond, d = '') => R.push([cond ? 'PASS' : 'FAIL', n, d]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const goto = async (hash) => { await page.evaluate(h => { location.hash = h; }, hash);
                               await page.waitForTimeout(220); };

await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await page.goto(URL);
await page.waitForTimeout(800);

/* ══════════════════════════════════ 1. default route and default mode ══ */
is('01 a cold start lands on Company',
   await page.evaluate(() => location.hash) === '#company');
is('02 Company is the visible view',
   await page.evaluate(() => !document.getElementById('view-company').hidden));
is('03 Narrative Mode is the default mode',
   await page.evaluate(() => document.body.classList.contains('mode-narrative') &&
     document.querySelector('.modebtn[data-mode="narrative"]').classList.contains('on')));
is('04 the sidebar opens with the Primary group',
   await page.evaluate(() => {
     const g = [...document.querySelectorAll('.sidebar .grp')].map(x => x.textContent);
     const first = document.querySelector('.sidebar a').getAttribute('data-view');
     return g[0] === 'Primary' && g[1] === 'Research' && g[2] === 'Create' && first === 'company';
   }));

/* ══════════════════════════════ 2. the first viewport is company-led ══ */
const hero = await page.evaluate(() => {
  const v = document.getElementById('view-company');
  const y = s => { const n = v.querySelector(s); return n ? n.getBoundingClientRect().top : null; };
  return { h1: v.querySelector('.chero-id h1')?.textContent,
           headline: v.querySelector('.chero-head')?.textContent,
           sig: v.querySelector('.sigchip')?.textContent,
           deck: (v.querySelector('.chero-deck')?.textContent || '').length,
           heroY: y('.chero'), chartY: y('.lead'), foundY: y('.foundation'),
           storyY: y('.moves'),
           /* the chart's own accessibility table belongs to the chart, so only a
              table outside the figure counts as "data following the narrative" */
           tableY: (() => { const t = [...v.querySelectorAll('table')]
                              .find(x => !x.closest('figure.lead'));
                            return t ? t.getBoundingClientRect().top : null; })() };
});
is('05 the company name leads the page', hero.h1 === 'CrowdStrike', hero.h1);
is('06 the hero carries the primary signal', /Post-Outage Spending Recovery/.test(hero.sig || ''), hero.sig);
is('07 the hero carries one narrative headline and a deck',
   !!hero.headline && hero.deck > 160, `${hero.deck} chars of deck`);
is('08 the first viewport is signal-led, not methodology-led',
   hero.heroY < hero.chartY && hero.chartY < hero.foundY);
is('09 one lead chart appears near the top',
   await page.evaluate(() => document.querySelectorAll('#view-company figure.lead').length) === 1);
is('10 the lead chart precedes the first data table',
   hero.chartY < (hero.tableY ?? Infinity) || hero.tableY === null);
is('11 Research Foundation sits below the main narrative',
   hero.foundY > hero.storyY);

/* ══════════════════════════════════════ 3. the Current Call is quiet ══ */
const call = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#view-company .schip')]
    .find(x => /Current call/i.test(x.textContent));
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { text: c.textContent, area: r.width * r.height,
           hasWhy: /Why Source Needed/i.test(c.textContent) };
});
is('12 the Current Call is a restrained status chip, not a panel',
   !!call && call.area < 60000, call ? `${Math.round(call.area)}px²` : 'missing');
is('13 Source Needed offers a route to the question behind it', !!call && call.hasWhy);

/* ══════════════════════════════════════ 4. the lead chart's discipline ══ */
const chart = await page.evaluate(() => {
  const S = recoverySeries();
  const supplied = S.netScore.filter(Boolean).length;
  const svg = document.querySelector('#view-company .leadsvg');
  const poly = [...svg.querySelectorAll('polyline')];
  const navySegs = [...svg.querySelectorAll('line[stroke="#17365D"]')].length;
  return { supplied, total: S.total,
           pvPolyPoints: (poly[0]?.getAttribute('points') || '').trim().split(/\s+/).length,
           navySegs,
           gapNamed: /no intervening periods supplied/.test(svg.textContent),
           hasTitle: !!svg.querySelector('title'), hasDesc: !!svg.querySelector('desc'),
           pts: svg.querySelectorAll('.pt').length,
           focusable: [...svg.querySelectorAll('.pt')].every(p => p.getAttribute('tabindex') === '0'),
           oids: [...svg.querySelectorAll('.pt')].every(p => !!p.getAttribute('data-oid')),
           currentMarked: /current/.test(svg.textContent),
           historicalMarked: /historical/.test(svg.textContent) };
});
is('14 the lead chart uses only supplied observations',
   chart.supplied === 3 && chart.total === 12 && chart.pvPolyPoints === 12,
   `intent ${chart.supplied}/${chart.total}, breadth polyline ${chart.pvPolyPoints} points`);
is('15 missing Net Score periods are not interpolated',
   chart.navySegs === 1 && chart.gapNamed,
   `${chart.navySegs} solid intent segment (only the one adjacent pair), gap named in the chart`);
is('16 the chart has a title, a description and a data-table toggle',
   chart.hasTitle && chart.hasDesc &&
   await page.evaluate(() => !!document.querySelector('[data-expand="leadTable"]')));
is('17 every chart point is keyboard-reachable and opens an object',
   chart.pts === 15 && chart.focusable && chart.oids, `${chart.pts} points`);
is('18 the current period and the historical comparison are both identified',
   chart.currentMarked && chart.historicalMarked);

await page.click('[data-expand="leadTable"]');
await page.waitForTimeout(200);
is('19 the data table shows unsupplied periods as not supplied',
   await page.evaluate(() => {
     const t = document.getElementById('leadTable');
     return !t.hidden && (t.textContent.match(/not supplied/g) || []).length === 9;
   }));
await page.click('[data-expand="leadTable"]');

const chartClick = await page.evaluate(async () => {
  document.querySelector('#view-company .leadsvg .pt[data-oid="ETR-OCT26-NS"]').dispatchEvent(
    new MouseEvent('click', {bubbles:true}));
  await new Promise(r => setTimeout(r, 260));
  return { open: !document.getElementById('drawerScrim').hidden,
           id: document.getElementById('drawerId').textContent };
});
is('20 clicking a chart point opens the correct evidence object',
   chartClick.open && /ETR-OCT26-NS/.test(chartClick.id), chartClick.id);
await page.click('#drawerClose');

/* ══════════════════════════════ 5. the narrative, and the question ══ */
await goto('#narrative');
const nar = await page.evaluate(() => {
  const v = document.getElementById('view-narrative');
  const y = s => { const n = v.querySelector(s); return n ? n.getBoundingClientRect().top : null; };
  return { q: v.querySelector('.n-question')?.textContent,
           a: v.querySelector('.n-answer')?.textContent,
           qY: y('.n-question'), aY: y('.n-answer'), foundY: y('.foundation'),
           secs: v.querySelectorAll('.nsec').length,
           toc: v.querySelectorAll('.nbar button').length,
           width: v.querySelector('.reader')?.getBoundingClientRect().width };
});
is('21 the research question is prominent and reads as a question',
   /\?$/.test((nar.q || '').trim()), nar.q);
is('22 the short answer is cohesive prose and follows the question',
   (nar.a || '').length > 220 && nar.aY > nar.qY);
is('23 the narrative runs the full ten-part flow', nar.secs === 10 && nar.toc === 10,
   `${nar.secs} sections`);
is('24 Research Foundation is below the narrative, not in the opening viewport',
   nar.foundY > nar.aY && nar.foundY > 900, `foundation at ${Math.round(nar.foundY)}px`);
is('25 the narrative keeps a reading width', nar.width > 500 && nar.width < 820,
   `${Math.round(nar.width)}px`);

/* ══════════════════════════════════ 6. mode switching preserves route ══ */
await goto('#signals');
const modeSwitch = await page.evaluate(async () => {
  const before = { hash: location.hash, ns: CP.netScore.value, call: CALL.current.value,
                   evidence: visibleEvidence().length };
  document.querySelector('.modebtn[data-mode="research"]').click();
  await new Promise(r => setTimeout(r, 260));
  const after = { hash: location.hash, ns: CP.netScore.value, call: CALL.current.value,
                  evidence: visibleEvidence().length,
                  research: document.body.classList.contains('mode-research'),
                  strip: !!document.getElementById('srcStrip').offsetParent };
  return { before, after };
});
is('26 switching to Research Mode preserves the current route',
   modeSwitch.after.hash === modeSwitch.before.hash, modeSwitch.after.hash);
is('27 Research Mode changes nothing in the data',
   modeSwitch.after.ns === modeSwitch.before.ns &&
   modeSwitch.after.call === modeSwitch.before.call &&
   modeSwitch.after.evidence === modeSwitch.before.evidence);
is('28 Research Mode reveals the source strip that Narrative Mode hides',
   modeSwitch.after.research && modeSwitch.after.strip);
is('29 the mode is persisted for the next session',
   await page.evaluate(() => {
     try { return JSON.parse(localStorage.getItem('reveal.crwd.state')).mode === 'research'; }
     catch (e) { return false; }
   }));
await page.evaluate(() => { document.querySelector('.modebtn[data-mode="narrative"]').click(); });
await page.waitForTimeout(250);

/* ══════════════════════════════════════════ 7. the Update Email ══ */
await goto('#generator/update-email');
await page.waitForTimeout(300);
const email = await page.evaluate(() => {
  const body = document.getElementById('emBody');
  const paras = [...body.querySelectorAll('p')];
  return { fmt: state.emailFormat,
           activeFmt: document.querySelector('.fmt.on')?.getAttribute('data-emfmt'),
           paras: paras.length,
           text: body.innerText,
           headings: body.querySelectorAll('h1,h2,h3,h4,.gen-sec h4').length,
           notesOff: Object.values(state.emailNotes).every(v => v === false),
           subject: document.getElementById('emSubjectLine')?.textContent };
});
is('30 Clean email is the default format',
   email.fmt === 'clean' && email.activeFmt === 'clean');
is('31 Clean email is cohesive prose, four to six paragraphs plus greeting and close',
   email.paras >= 6 && email.paras <= 9, `${email.paras} paragraphs`);
is('32 Clean email shows no section headings', email.headings === 0);
is('33 Clean email carries no inline claim, evidence or rule IDs in the body',
   !/\b(ETR-OCT26-[A-Z]+|SIG-\d|KPI-\d|R-\d{3}|CE-\d{3}|OQ-\d{3}|EMA-\d{3})\b/.test(email.text),
   (email.text.match(/\b(ETR-OCT26-[A-Z]+|SIG-\d|R-\d{3})\b/g) || []).slice(0, 4).join(', '));
is('34 all four footnote toggles default to off', email.notesOff);
is('35 the subject line is built from the reading',
   /CrowdStrike/.test(email.subject) && /October 2026/.test(email.subject), email.subject);

const copied = await page.evaluate(() => ({ body: currentEmailBody(), subj: currentEmailSubject() }));
is('36 the copied body contains only email content, with no manifest metadata',
   !/claimId|sourceWorksheet|generatedAtLocalTime|classification/.test(copied.body) &&
   !/\bEMA-\d{3}\b/.test(copied.body) && copied.body.length > 700);
is('37 the copied body carries no Human Review line by default',
   !/Human Review Required/i.test(copied.body));
is('38 the Human Review status still shows in the application chrome',
   await page.evaluate(() => {
     const badge = document.querySelector('.hrr');
     const note = document.querySelector('#view-gen-email .chrome-note');
     return !!badge && badge.offsetParent !== null && !!note &&
            /not part of the email body/i.test(note.textContent);
   }));

const manifests = await page.evaluate(() => {
  const E = buildCleanEmail();
  const all = E.paragraphs.concat(E.footnotes);
  return { n: all.length,
           complete: all.every(c => c.claimId && c.classification &&
             (c.sourceEvidenceIds.length || c.sourceObjectIds.length || c.ruleIds.length)) };
});
is('39 every generated paragraph still carries a complete claim manifest',
   manifests.complete && manifests.n >= 5, `${manifests.n} manifests`);

const inspect = await page.evaluate(async () => {
  const before = document.getElementById('emBody').innerText;
  const beforeCopy = currentEmailBody();
  document.getElementById('emInspect').click();
  await new Promise(r => setTimeout(r, 260));
  const p = document.querySelector('#emBody p.cp');
  p.click();
  await new Promise(r => setTimeout(r, 240));
  return { on: document.getElementById('emOut').classList.contains('inspect'),
           panel: document.getElementById('emManifestPanel').innerText,
           textSame: document.getElementById('emBody').innerText === before,
           copySame: currentEmailBody() === beforeCopy };
});
is('40 Inspect claims reveals paragraph manifests',
   inspect.on && /Claim manifest/i.test(inspect.panel) &&
   /Source evidence IDs/i.test(inspect.panel));
is('41 Inspect claims changes neither the rendered prose nor what is copied',
   inspect.textSame && inspect.copySame);
await page.evaluate(() => { document.getElementById('emInspect').click(); });
await page.waitForTimeout(200);

const fmtSwitch = await page.evaluate(async () => {
  const recipient = GEN.email.recipient, risk = GEN.email.risk;
  document.querySelector('[data-emfmt="exec"]').click();
  await new Promise(r => setTimeout(r, 260));
  return { kept: GEN.email.recipient === recipient && GEN.email.risk === risk,
           paras: document.querySelectorAll('#emBody p').length,
           fmt: state.emailFormat };
});
is('42 switching format keeps every selection', fmtSwitch.kept && fmtSwitch.fmt === 'exec');
is('43 the executive note is three paragraphs plus greeting and close',
   fmtSwitch.paras >= 4 && fmtSwitch.paras <= 6, `${fmtSwitch.paras}`);
await page.evaluate(() => document.querySelector('[data-emfmt="clean"]').click());
await page.waitForTimeout(250);

/* ══════════════════════════════════════════ 8. the Sunday Signal ══ */
await goto('#generator/sunday-signal');
await page.waitForTimeout(350);
const sun = await page.evaluate(() => {
  const out = document.getElementById('ssOut');
  return { style: state.sundayStyle, length: state.sundayLength,
           activeStyle: document.querySelector('.fmt.on')?.getAttribute('data-ssty'),
           paras: out.querySelectorAll('p.cp').length,
           subheads: out.querySelectorAll('h3').length,
           title: out.querySelector('.essay-title')?.textContent,
           deck: out.querySelector('.essay-deck')?.textContent,
           text: out.innerText };
});
is('44 Sunday Signal defaults to Cohesive Signal at Standard length',
   sun.style === 'cohesive' && sun.activeStyle === 'cohesive' && sun.length === 'standard');
is('45 it reads as one piece: a title, a deck and connected paragraphs',
   !!sun.title && !!sun.deck && sun.paras >= 6, `${sun.paras} paragraphs`);
is('46 Standard length uses no more than three visible subheads',
   sun.subheads <= 3, `${sun.subheads} subheads`);
is('47 the prose carries no inline IDs',
   !/\b(ETR-OCT26-[A-Z]+|SIG-\d|KPI-\d{3}|R-\d{3}|SUN-\d{3})\b/.test(
     sun.text.split('Contents')[0].replace(/CrowdStrike — October 2026 TSIS/, '')),
   (sun.text.match(/\bSUN-\d{3}\b/g) || []).slice(0, 3).join(', '));
const sunMan = await page.evaluate(() => {
  const S = buildCohesive();
  const all = S.blocks.map(b => b.c).concat(S.footnotes);
  return { n: all.length, complete: all.every(c => c.claimId && c.classification) };
});
is('48 every Sunday Signal paragraph still carries a claim manifest',
   sunMan.complete && sunMan.n >= 6, `${sunMan.n} manifests`);
is('49 copied prose excludes footnotes unless asked for',
   await page.evaluate(() => {
     const plain = essayText(buildCohesive(), false);
     const withNotes = essayText(buildCohesive(), true);
     return !/Human Review Required/.test(plain) && plain.length <= withNotes.length;
   }));
const lenSwitch = await page.evaluate(async () => {
  document.querySelector('[data-sslen="brief"]').click();
  await new Promise(r => setTimeout(r, 300));
  const brief = { p: document.querySelectorAll('#ssOut p.cp').length,
                  h: document.querySelectorAll('#ssOut h3').length };
  document.querySelector('[data-sslen="standard"]').click();
  await new Promise(r => setTimeout(r, 300));
  return brief;
});
is('50 Brief length shortens the piece and drops every subhead',
   lenSwitch.p >= 3 && lenSwitch.h === 0, `${lenSwitch.p} paragraphs, ${lenSwitch.h} subheads`);

/* ══════════════════════════════════════════ 9. Audience Translator ══ */
await goto('#audience');
await page.waitForTimeout(300);
const aud = await page.evaluate(async () => {
  const fixedBefore = document.querySelector('.af-kv').innerText;
  const factsBefore = { ns: CP.netScore.value, z: CP.zScore.qqZ, call: CALL.current.value,
                        stmt: (OBJ['SIG-02'] || {}).statement };
  const qBefore = document.querySelector('.am-q').textContent;
  document.querySelector('.apbtn[data-aud="pe"]').click();
  await new Promise(r => setTimeout(r, 300));
  return { cols: document.querySelectorAll('.aud3 > *').length,
           fixedSame: document.querySelector('.af-kv').innerText === fixedBefore,
           factsSame: CP.netScore.value === factsBefore.ns && CP.zScore.qqZ === factsBefore.z &&
                      CALL.current.value === factsBefore.call &&
                      (OBJ['SIG-02'] || {}).statement === factsBefore.stmt,
           qChanged: document.querySelector('.am-q').textContent !== qBefore,
           handoffs: document.querySelectorAll('[data-handoff]').length };
});
is('51 the translator is a three-column split screen', aud.cols === 3, `${aud.cols} columns`);
is('52 changing audience changes the translation', aud.qChanged);
is('53 changing audience changes no fact and nothing in the fixed panel',
   aud.factsSame && aud.fixedSame);
is('54 the translator can feed both generators', aud.handoffs === 2);
const handoff = await page.evaluate(async () => {
  document.querySelector('[data-handoff="sunday|pe"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { hash: location.hash, aud: GEN.sunday.audience };
});
is('55 the handoff opens the Sunday Signal with that audience selected',
   /sunday-signal/.test(handoff.hash) && handoff.aud === 'pe');

/* ══════════════════════════════════════ 10. Signals, Evidence, Lineage ══ */
await goto('#signals');
const sigs = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.sigrow')];
  const primary = document.querySelector('.sigrow.is-primary');
  return { groups: document.querySelectorAll('.siggroup').length, rows: rows.length,
           primaryFirst: rows[0] === primary,
           primaryId: primary ? primary.getAttribute('data-goto') : null,
           hasCaveat: rows.every(r => /Principal caveat/i.test(r.textContent)) };
});
is('56 signals are grouped and the recorded primary signal leads',
   sigs.groups >= 2 && sigs.primaryFirst && /SIG-02/.test(sigs.primaryId || ''), sigs.primaryId);
is('57 every signal row carries its principal caveat', sigs.hasCaveat && sigs.rows === 7);

await goto('#evidence');
is('58 Evidence defaults to a concise list and expands to a table',
   await page.evaluate(() => document.querySelectorAll('.evlist .evrow').length > 20 &&
     !!document.querySelector('[data-evmode="table"]')));
await page.evaluate(() => document.querySelector('[data-evmode="table"]').click());
await page.waitForTimeout(250);
is('59 the table view still works',
   await page.evaluate(() => document.querySelectorAll('#view-evidence table tbody tr').length > 20));
await page.evaluate(() => document.querySelector('[data-evmode="list"]').click());

await goto('#lineage');
await page.waitForTimeout(400);
const lin = await page.evaluate(async () => {
  const tell = document.querySelector('[data-expand="pathTell"]');
  tell.click();
  await new Promise(r => setTimeout(r, 240));
  const panel = document.getElementById('pathTell');
  const lines = panel.innerText.split(/(?<=[.;])\s+|\n/);
  return { present: !!tell, open: !panel.hidden, steps: panel.querySelectorAll('li').length,
           text: panel.innerText,
           /* a sentence that denies causation is not a causal claim */
           causal: lines.some(l => /\b(caused|drove|proves|predicted|resulted in)\b/i.test(l) &&
                                   !/\b(no|not|never|nothing|cannot|prohibit)\b/i.test(l)) };
});
is('60 the lineage narrative path offers a plain-language explanation',
   lin.present && lin.open && lin.steps >= 5, `${lin.steps} steps`);
is('61 the explanation introduces no causal language', !lin.causal);

await goto('#sources');
is('62 Sources leads with source-family summary cards',
   await page.evaluate(() => {
     const cards = [...document.querySelectorAll('.famcard')];
     const total = cards.reduce((a, c) => a + Number(c.querySelector('.n').textContent), 0);
     return cards.length >= 4 && total === (D.sources || []).length;
   }));

await goto('#rules');
is('63 Rules defaults to the rules affecting the current narrative',
   await page.evaluate(() => {
     const shown = document.querySelectorAll('#view-rules .rulecard').length;
     return ruleFilter.scope === 'narrative' && shown > 0 && shown < (D.rules || []).length;
   }));
await page.evaluate(() => document.querySelector('[data-rscope="all"]').click());
await page.waitForTimeout(250);
is('64 View all rules restores the full registry',
   await page.evaluate(() => ruleFilter.scope === 'all' &&
     document.querySelectorAll('#view-rules .rulecard').length === (D.rules || []).length));
await page.evaluate(() => document.querySelector('[data-rscope="narrative"]').click());

await goto('#risks');
is('65 Risks defaults to a Most important now view built from recorded priority',
   await page.evaluate(() => {
     const rows = [...document.querySelectorAll('.nowrow')];
     const imps = rows.map(r => (r.querySelector('.nr-imp') || {}).textContent);
     const firstCritical = imps.indexOf('Critical'), firstHigh = imps.indexOf('High');
     return riskView === 'now' && rows.length >= 5 &&
            (firstHigh === -1 || firstCritical < firstHigh);
   }));

/* ══════════════════════════════════ 11. the Current Call stays fixed ══ */
await goto('#company');
const filterTest = await page.evaluate(async () => {
  const before = { call: CALL.current.value, chip: document.querySelector('.schip .v').textContent,
                   ev: visibleEvidence().length };
  document.querySelector('.modebtn[data-mode="research"]').click();
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('.lanechip[data-lane="oct26"]').click();
  await new Promise(r => setTimeout(r, 300));
  const after = { call: CALL.current.value, chip: document.querySelector('.schip .v').textContent,
                  ev: visibleEvidence().length,
                  oct: (D.evidence || []).filter(o => passes(o) && laneOf(o) === 'oct26').length };
  document.querySelector('.lanechip[data-lane="oct26"]').click();
  await new Promise(r => setTimeout(r, 300));
  const restored = visibleEvidence().length;
  document.querySelector('.modebtn[data-mode="narrative"]').click();
  return { before, after, restored };
});
is('66 a source control changes what is shown',
   filterTest.after.ev < filterTest.before.ev && filterTest.after.oct === 0,
   `${filterTest.before.ev} → ${filterTest.after.ev}`);
is('67 the Current Call remains reviewer-controlled and does not move',
   filterTest.after.call === filterTest.before.call &&
   filterTest.after.chip === filterTest.before.chip);
is('68 switching the lane back on restores the evidence',
   filterTest.restored === filterTest.before.ev);

/* ══════════════════════════════════════════ 12. claim discipline ══ */
await page.waitForTimeout(250);
const allText = await page.evaluate(async () => {
  const out = [];
  for (const h of ['company','narrative','generator/sunday-signal','generator/update-email','audience']){
    location.hash = '#' + h;
    await new Promise(r => setTimeout(r, 300));
    const v = document.querySelector('.view:not([hidden])');
    out.push(v ? v.innerText : '');
  }
  return out.join('\n\n');
});
const sentences = allText.split(/(?<=[.;])\s+/);
const causal = sentences.filter(s =>
  /\b(caused|drove|driven by|explains|proves|proven|predicted|resulted in)\b/i.test(s) &&
  !/\b(no|not|never|cannot|prohibit|does not|without|prohibits)\b/i.test(s));
is('69 no causal wording links ETR evidence to company results',
   causal.length === 0, causal[0] ? causal[0].slice(0, 110) : `${sentences.length} sentences scanned`);
const zbad = sentences.filter(s => /Z-Score|deviation figure/i.test(s) &&
  /statistically significant|strong anomaly|anomaly band|standard deviation|high probability/i.test(s) &&
  !/\b(no|not|never|prohibit|cannot)\b/i.test(s));
is('70 no prohibited Z-Score language appears', zbad.length === 0, zbad[0] || '');
const inv = sentences.filter(s => /\b(price target|our rating|we rate|overweight|underweight)\b/i.test(s)
  && !/\b(no|not|never|contains no)\b/i.test(s));
is('71 no investment recommendation, rating or price target', inv.length === 0, inv[0] || '');
/* The earlier form of this check matched the correct sentence "October 2026 is
   the current TSIS period and July 2026 is historical comparison", because the
   window it scanned ran straight past the clause boundary. The claim to test is
   whether July is ever *called* current, and whether October is. */
is('72 July 2026 is never presented as the current period',
   !/July 2026 is (the )?(current|primary)/i.test(allText) &&
   !/current[^.;\n]{0,20}(period|TSIS)[^.;\n]{0,6}(is |:|,)\s*July 2026/i.test(allText) &&
   /October 2026 is the current/i.test(allText));
is('73 Source Needed is shown rather than filled',
   (allText.match(/Source Needed/g) || []).length >= 4);
is('74 no unsupported company profile data is introduced',
   !/headquarter|employees|founded in|market cap|revenue of \$|based in/i.test(allText));

/* ══════════════════════════════════════════ 13. every prior route ══ */
const ROUTES = ['#company','#index','#narrative','#brief','#signals','#signal/SIG-02','#evidence',
  '#lineage','#lineage/SIG-02','#kpis','#bridge/SIG-02/KPI-003','#cohorts','#rules','#rule/R-021',
  '#risks','#question/OQ-014','#risk/CE-002','#sources','#source/SRC-001','#audience',
  '#audience/investor','#generator/sunday-signal','#generator/update-email','#methodology'];
let routeFails = [];
for (const r of ROUTES){
  await goto(r);
  const okv = await page.evaluate(() => {
    const v = document.querySelector('.view:not([hidden])');
    return !!v && v.innerHTML.length > 400;
  });
  if (!okv) routeFails.push(r);
  if (!(await page.evaluate(() => document.getElementById('drawerScrim').hidden)))
    await page.click('#drawerClose');
}
is('75 every prior route still works', routeFails.length === 0, routeFails.join(', '));

/* ══════════════════════════════════════════ 14. print ══ */
await goto('#company');
const printCheck = await page.evaluate(async () => {
  const menu = () => document.getElementById('printMenu');
  document.getElementById('btnPrint').click();
  await new Promise(r => setTimeout(r, 150));
  const items = menu() ? [...menu().querySelectorAll('button')].map(b => b.id) : [];
  closePrintMenu();
  return items;
});
is('76 the print menu offers every named surface',
   ['pmCompany','pmNarrative','pmSunday','pmEmail','pmLineage','pmEvidence']
     .every(i => printCheck.includes(i)), printCheck.join(', '));

const printBrief = await page.evaluate(() => {
  const r = runRuntimeChecks().filter(c => c.id === 'V-26')[0];
  return { result: r.result, detail: r.detail };
});
is('77 the Print Brief validation check passes',
   printBrief.result === 'PASS', printBrief.detail);

const printScope = await page.evaluate(async () => {
  RENDER.company({view:'company'});
  document.querySelectorAll('.view').forEach(v => v.classList.remove('print-target'));
  document.getElementById('view-company').classList.add('print-target');
  document.body.classList.add('print-scope');
  await new Promise(r => setTimeout(r, 120));
  const shown = [...document.querySelectorAll('.view')].filter(v =>
    getComputedStyle(v).display !== 'none');
  const res = { only: shown.length === 1 && shown[0].id === 'view-company' };
  document.body.classList.remove('print-scope');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('print-target'));
  return res;
});
is('78 print scoping isolates a single surface', printScope.only);

const printSheet = await page.evaluate(() =>
  [...document.styleSheets].some(s => (s.href || '').indexOf('print.css') >= 0));
is('79 a dedicated print stylesheet is loaded', printSheet);

/* ══════════════════════════════════════════ 15. every runtime check ══ */
await goto('#methodology');
await page.waitForTimeout(500);
const checks = await page.evaluate(() => {
  const rt = runRuntimeChecks();
  const ext = ((D.validation || {}).extractionChecks) || [];
  return { rt: rt.length, rtFail: rt.filter(c => c.result === 'FAIL').map(c => c.id + ' ' + c.detail),
           ext: ext.length, extFail: ext.filter(c => c.result === 'FAIL').map(c => c.id) };
});
is('80 every extraction check still passes',
   checks.extFail.length === 0, `${checks.ext} checks; failing: ${checks.extFail.join(', ')}`);
is('81 every runtime check still passes',
   checks.rtFail.length === 0, `${checks.rt} checks; failing: ${checks.rtFail.join(' | ')}`);

/* ══════════════════════════════════════════ 16. responsive & shell ══ */
for (const [w, h, label] of [[1500,1000,'desktop'],[1024,900,'tablet'],[834,1000,'small tablet'],
                             [390,820,'phone']]){
  await page.setViewportSize({ width: w, height: h });
  for (const route of ['#company','#narrative','#generator/update-email']){
    await goto(route);
    const over = await page.evaluate(() => {
      const m = document.querySelector('main');
      return Math.max(m.scrollWidth - m.clientWidth, document.body.scrollWidth - window.innerWidth);
    });
    is(`82.${w}${route} no horizontal overflow at ${w}px (${label})`, over <= 2, `${over}px`);
  }
}
await page.setViewportSize({ width: 390, height: 820 });
await goto('#company');
is('83 the phone layout collapses the menu behind a toggle and scrolls the metric rail',
   await page.evaluate(() => {
     const t = document.getElementById('navToggle');
     const rail = document.querySelector('.mrail');
     return getComputedStyle(t).display !== 'none' && rail.scrollWidth > rail.clientWidth;
   }));
await page.setViewportSize({ width: 1500, height: 1000 });

/* ══════════════════════════════════════════ 17. self-containment ══ */
is('84 no external asset is requested',
   await page.evaluate(() => ![...document.querySelectorAll('link,script,img,iframe')]
     .some(e => /^https?:|^\/\//.test(e.getAttribute('href') || e.getAttribute('src') || ''))));
is('85 the application runs under file://',
   await page.evaluate(() => location.protocol === 'file:'));
is('86 the page ran clean, with no console or page errors',
   errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const fails = R.filter(r => r[0] === 'FAIL');
R.forEach(([s, n, d]) => console.log(`${s}  ${n}${d ? '  — ' + d : ''}`));
console.log(`\n${R.length} checks, ${fails.length} failed`);

/* Results are written where the extractor can pick them up, so the Methodology
   view shows extraction, runtime and interface checks in one place. */
fs.writeFileSync('ux-checks.json', JSON.stringify(
  R.map(([result, name, detail]) => {
    const m = name.match(/^(\S+)\s+(.*)$/);
    return { id: 'UX-' + (m ? m[1] : name), check: m ? m[2] : name, result, detail: detail || '' };
  }), null, 2));
console.log('ux-checks.json written — re-run extract_workbook.py to carry it into the app.');

process.exit(fails.length ? 1 : 0);
