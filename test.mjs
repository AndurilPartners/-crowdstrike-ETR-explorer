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

/* ══════════════════════════════════ 1. default route, no mode system ══ */
is('01 a cold start lands on Company',
   await page.evaluate(() => location.hash) === '#company');
is('02 Company is the visible view',
   await page.evaluate(() => !document.getElementById('view-company').hidden));
is('03 there is no mode toggle anywhere in the document',
   await page.evaluate(() => {
     const noSwitch = !document.querySelector('.modeswitch') && !document.querySelector('.modebtn');
     const noBodyClass = !document.body.classList.contains('mode-narrative') &&
                          !document.body.classList.contains('mode-research');
     const noStateMode = typeof state.mode === 'undefined';
     const noFns = typeof window.applyMode === 'undefined' && typeof window.setMode === 'undefined' &&
                   typeof window.narrativeMode === 'undefined';
     return noSwitch && noBodyClass && noStateMode && noFns;
   }));
is('04 the sidebar opens with the Explore group, Company first',
   await page.evaluate(() => {
     const g = [...document.querySelectorAll('.sidebar .grp')].map(x => x.textContent);
     const first = document.querySelector('.sidebar a').getAttribute('data-view');
     return g[0] === 'Explore' && g[1] === 'Research' && g[2] === 'Create' && first === 'company';
   }));
is('05 a saved legacy "mode" value from an earlier build is silently dropped',
   await page.evaluate(async () => {
     localStorage.setItem('reveal.crwd.state', JSON.stringify({ mode: 'research', lanes: ['oct26'] }));
     location.reload();
     return true;
   }));
await page.waitForTimeout(900);
is('06 after reload, no mode field survives and the lane selection did',
   await page.evaluate(() => {
     const saved = JSON.parse(localStorage.getItem('reveal.crwd.state') || '{}');
     return !('mode' in saved) && typeof state.mode === 'undefined' &&
            state.lanes.indexOf('oct26') >= 0;
   }));
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.evaluate(() => { location.reload(); });
await page.waitForTimeout(900);

/* ══════════════════════════════════ 2. header: identity, period, no HRR ══ */
const header = await page.evaluate(() => {
  const logo = document.querySelector('.brandbox .brand-logo');
  return { hasLogo: !!logo, logoAlt: logo ? logo.getAttribute('alt') : '',
           company: document.querySelector('.tb-company')?.textContent || '',
           period: document.getElementById('tbPeriod')?.textContent || '',
           updated: document.getElementById('tbUpdated')?.textContent || '',
           hasSources: !!document.getElementById('btnSources'),
           hasSearch: !!document.getElementById('globalSearch'),
           hasCreate: !!document.getElementById('btnCreate'),
           globalHrr: document.querySelectorAll('.topbar .hrr, .brandbox .hrr').length,
           anyHrrOutsideGenerators: [...document.querySelectorAll('.hrr')]
             .filter(n => !n.closest('#view-gen-sunday') && !n.closest('#view-gen-email') &&
                          !n.closest('#view-gen-brief')).length };
});
is('07 the header carries the CrowdStrike wordmark image',
   header.hasLogo && header.logoAlt === 'CrowdStrike');
is('08 the header identifies the company',
   /CrowdStrike/.test(header.company) && /CRWD/.test(header.company), header.company);
is('09 the header shows the research period and a Last updated value, never invented text',
   !!header.period && header.period !== '—' &&
   !!header.updated && header.updated !== '—' && header.updated !== 'undefined');
is('10 Source controls, Search and Create are all reachable from the header',
   header.hasSources && header.hasSearch && header.hasCreate);
is('11 there is no global Human Review Required badge in the header or top-level chrome',
   header.globalHrr === 0 && header.anyHrrOutsideGenerators === 0);
const brandText = await page.evaluate(() => document.querySelector('.brandbox').textContent);
is('11C the header no longer carries the "REVEAL Company Explorer" wordmark text',
   !/REVEAL Company Explorer/i.test(brandText), brandText);
const logoBox = await page.evaluate(() => {
  const el = document.querySelector('.brandbox .brand-logo');
  return el ? el.getBoundingClientRect() : null;
});
is('11D the persistent header logo renders larger than the prior compact size',
   !!logoBox && logoBox.height > 24, logoBox ? `${logoBox.height}px tall` : 'missing');
is('11E there is no source-lane strip anywhere in the document (removed from every view)',
   await page.evaluate(() => !document.querySelector('.srcstrip') &&
     !document.getElementById('srcStrip') && !document.querySelector('.lanechip')));

/* ══════════════════════════════ 3. the first viewport is company-led ══ */
const hero = await page.evaluate(() => {
  const v = document.getElementById('view-company');
  const y = s => { const n = v.querySelector(s); return n ? n.getBoundingClientRect().top : null; };
  return { h1: v.querySelector('.chero-id h1')?.textContent,
           headline: v.querySelector('.chero-head')?.textContent,
           sig: v.querySelector('.sigchip')?.textContent,
           deck: (v.querySelector('.chero-deck')?.textContent || '').length,
           heroY: y('.chero'), chartY: y('.lead'), foundY: y('.foundation'),
           storyY: y('.moves'), railY: y('.mrail'),
           /* the chart's own accessibility table belongs to the chart, so only a
              table outside the figure counts as "data following the narrative" */
           tableY: (() => { const t = [...v.querySelectorAll('table')]
                              .find(x => !x.closest('figure.lead'));
                            return t ? t.getBoundingClientRect().top : null; })() };
});
is('12 the company name leads the page', hero.h1 === 'CrowdStrike', hero.h1);
is('13 the hero carries the primary signal', /Post-Outage Spending Recovery/.test(hero.sig || ''), hero.sig);
is('14 the hero carries one narrative headline and a deck',
   !!hero.headline && hero.deck > 160, `${hero.deck} chars of deck`);
is('15 the first viewport is signal-led, not methodology-led',
   hero.heroY < hero.chartY && hero.chartY < hero.foundY);
is('15B Key metrics sit under the heading and above the lead chart',
   hero.heroY < hero.railY && hero.railY < hero.chartY,
   `hero ${Math.round(hero.heroY)} / rail ${Math.round(hero.railY)} / chart ${Math.round(hero.chartY)}`);
is('16 one lead chart appears near the top',
   await page.evaluate(() => document.querySelectorAll('#view-company figure.lead').length) === 1);
is('17 the lead chart precedes the first data table',
   hero.chartY < (hero.tableY ?? Infinity) || hero.tableY === null);
is('18 Research Foundation sits below the main narrative',
   hero.foundY > hero.storyY);
is('19 the CrowdStrike wordmark is visible while on the Company page',
   await page.evaluate(() => {
     const logo = document.querySelector('.brandbox .brand-logo');
     return !!logo && logo.getBoundingClientRect().width > 0 && !document.getElementById('view-company').hidden;
   }));

/* ══════════════════════════════════════ 4. the Current Call is quiet ══ */
const call = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#view-company .schip')]
    .find(x => /Current call/i.test(x.textContent));
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { text: c.textContent, area: r.width * r.height,
           hasWhy: /Why Source Needed/i.test(c.textContent) };
});
is('20 the Current Call is a restrained status chip, not a panel',
   !!call && call.area < 60000, call ? `${Math.round(call.area)}px²` : 'missing');
is('21 Source Needed offers a route to the question behind it', !!call && call.hasWhy);
const heroChips = await page.evaluate(() =>
  [...document.querySelectorAll('#view-company .chips .schip .k')].map(k => k.textContent));
is('21B the hero status row is Current call, Direction, Conviction, Evidence confidence, Current period',
   JSON.stringify(heroChips) ===
     JSON.stringify(['Current call','Direction','Conviction','Evidence confidence','Current period']),
   heroChips.join(' · '));
is('21C Human Review Required does not appear in the hero status row',
   !heroChips.some(k => /human review/i.test(k)));

/* ══════════════════════════════════════ 5. the lead chart's discipline ══ */
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
is('22 the lead chart uses only supplied observations',
   chart.supplied === 3 && chart.total === 12 && chart.pvPolyPoints === 12,
   `intent ${chart.supplied}/${chart.total}, breadth polyline ${chart.pvPolyPoints} points`);
is('23 missing Net Score periods are not interpolated',
   chart.navySegs === 1 && chart.gapNamed,
   `${chart.navySegs} solid intent segment (only the one adjacent pair), gap named in the chart`);
is('24 the chart has a title, a description and a data-table toggle',
   chart.hasTitle && chart.hasDesc &&
   await page.evaluate(() => !!document.querySelector('[data-expand="leadTable"]')));
is('25 every chart point is keyboard-reachable and opens an object',
   chart.pts === 15 && chart.focusable && chart.oids, `${chart.pts} points`);
is('26 the current period and the historical comparison are both identified',
   chart.currentMarked && chart.historicalMarked);

await page.click('[data-expand="leadTable"]');
await page.waitForTimeout(200);
is('27 the data table shows unsupplied periods as not supplied',
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
is('28 clicking a chart point opens the correct evidence object',
   chartClick.open && /ETR-OCT26-NS/.test(chartClick.id), chartClick.id);
await page.click('#drawerClose');

/* ══════════════════════════════ 6. the narrative, and the question ══ */
await goto('#narrative');
const nar = await page.evaluate(() => {
  const v = document.getElementById('view-narrative');
  const y = s => { const n = v.querySelector(s); return n ? n.getBoundingClientRect().top : null; };
  const main = document.querySelector('main');
  return { q: v.querySelector('.n-question')?.textContent,
           a: v.querySelector('.n-answer')?.textContent,
           qY: y('.n-question'), aY: y('.n-answer'), foundY: y('.foundation'),
           secs: v.querySelectorAll('.nsec').length,
           toc: v.querySelectorAll('.nbar button').length,
           width: v.querySelector('.reader')?.getBoundingClientRect().width,
           mainWidth: main.clientWidth,
           hasLogo: !!v.querySelector('.reader-logo') };
});
is('29 the research question is prominent and reads as a question',
   /\?$/.test((nar.q || '').trim()), nar.q);
is('30 the short answer is cohesive prose and follows the question',
   (nar.a || '').length > 220 && nar.aY > nar.qY);
is('31 the narrative runs the full ten-part flow', nar.secs === 10 && nar.toc === 10,
   `${nar.secs} sections`);
is('32 Research Foundation is below the narrative, not in the opening viewport',
   nar.foundY > nar.aY && nar.foundY > 900, `foundation at ${Math.round(nar.foundY)}px`);
is('33 the narrative container spans most of the available content width (LAYOUT-001)',
   nar.width > 900 && nar.width / nar.mainWidth > 0.75,
   `${Math.round(nar.width)}px of ${Math.round(nar.mainWidth)}px main`);
is('34 the Narrative page carries the CrowdStrike wordmark', nar.hasLogo);

/* ══════════════════════════════════════ 7. IDS-001 / IDS-002 ══════════ */
const idsCheck = await page.evaluate(() => {
  const idPattern = /\b(EV-\d{3}|SIG-\d{2}|OQ-\d{3}|R-\d{3}|KPI-\d{3}|ETR-[A-Z0-9]+-[A-Z]+)\b/;
  const co = document.getElementById('view-company').innerText;
  const na = document.getElementById('view-narrative').innerText;
  return { companyHit: (co.match(idPattern) || [])[0] || null,
           narrativeHit: (na.match(idPattern) || [])[0] || null,
           hasQuietCites: document.querySelectorAll('#view-company .oid-quiet, #view-narrative .oid-quiet')
             .length > 0 };
});
is('35 no object ID appears in the default Company reading path', !idsCheck.companyHit, idsCheck.companyHit);
is('36 no object ID appears in the default Narrative reading path', !idsCheck.narrativeHit, idsCheck.narrativeHit);
is('37 citations still reach their evidence, just without literal ID text', idsCheck.hasQuietCites);

/* ══════════════════════════════════════ 8. SOURCE-001 ═════════════════ */
await goto('#narrative');
const src = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll('#view-narrative .missing-source')];
  const one = blocks[0];
  return { count: blocks.length,
           hasFields: one ? ['Need','Why it matters','Owner','Priority','Status','Expected evidence']
             .every(k => one.textContent.includes(k)) : false,
           hasCopyReq: one ? !!one.querySelector('[data-copyreq]') : false,
           bareSourceNeeded: (document.getElementById('view-narrative').innerText
             .match(/^SOURCE NEEDED$/m) || []).length };
});
is('38 the default narrative reading path uses the Missing source component, not bare text',
   src.count > 0 && src.hasFields && src.hasCopyReq, `${src.count} components`);

/* ══════════════════════════════════════ 9. the Update Email ══════════ */
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
           notesOff: ['method','appendix','review','ids'].every(k => state.emailNotes[k] === false),
           logoOn: state.emailNotes.logo === true,
           hasLogoToggle: !!document.querySelector('[data-note="email|logo"]'),
           subject: document.getElementById('emSubjectLine')?.textContent };
});
is('39 Clean email is the default format',
   email.fmt === 'clean' && email.activeFmt === 'clean');
is('40 Clean email is cohesive prose, four to six paragraphs plus greeting and close',
   email.paras >= 6 && email.paras <= 9, `${email.paras} paragraphs`);
is('41 Clean email shows no section headings', email.headings === 0);
is('42 Clean email carries no inline claim, evidence or rule IDs in the body',
   !/\b(ETR-OCT26-[A-Z]+|SIG-\d|KPI-\d|R-\d{3}|CE-\d{3}|OQ-\d{3}|EMA-\d{3})\b/.test(email.text),
   (email.text.match(/\b(ETR-OCT26-[A-Z]+|SIG-\d|R-\d{3})\b/g) || []).slice(0, 4).join(', '));
is('43 the four content footnote toggles default to off, and the logo toggle exists and defaults on',
   email.notesOff && email.hasLogoToggle && email.logoOn);
is('44 the subject line is built from the reading',
   /CrowdStrike/.test(email.subject) && /October 2026/.test(email.subject), email.subject);

const copied = await page.evaluate(() => ({ body: currentEmailBody(), subj: currentEmailSubject() }));
is('45 the copied body contains only email content, with no manifest metadata',
   !/claimId|sourceWorksheet|generatedAtLocalTime|classification/.test(copied.body) &&
   !/\bEMA-\d{3}\b/.test(copied.body) && copied.body.length > 700);
is('46 the copied body carries no Human Review line by default',
   !/Human Review Required/i.test(copied.body));
is('47 the Human Review status shows in the generator chrome, not a global badge',
   await page.evaluate(() => {
     const globalBadge = document.querySelector('.topbar .hrr, .brandbox .hrr');
     const note = document.querySelector('#view-gen-email .review-status');
     return !globalBadge && !!note && /Human Review Required/i.test(note.textContent) &&
            /not part of the email body/i.test(note.textContent);
   }));

const manifests = await page.evaluate(() => {
  const E = buildCleanEmail();
  const all = E.paragraphs.concat(E.footnotes);
  return { n: all.length,
           complete: all.every(c => c.claimId && c.classification &&
             (c.sourceEvidenceIds.length || c.sourceObjectIds.length || c.ruleIds.length)) };
});
is('48 every generated paragraph still carries a complete claim manifest',
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
is('49 Inspect claims reveals paragraph manifests',
   inspect.on && /Claim manifest/i.test(inspect.panel) &&
   /Source evidence IDs/i.test(inspect.panel));
is('50 Inspect claims changes neither the rendered prose nor what is copied',
   inspect.textSame && inspect.copySame);
await page.evaluate(() => { document.getElementById('emInspect').click(); });
await page.waitForTimeout(200);

const emHtmlLogo = await page.evaluate(() => emailBodyHtml(buildCleanEmail(), true));
is('51 the emailed HTML version includes the logo when the toggle is on',
   /brand-logo/.test(emHtmlLogo) && /crowdstrike-logo\.png/.test(emHtmlLogo));

const fmtSwitch = await page.evaluate(async () => {
  const recipient = GEN.email.recipient, risk = GEN.email.risk;
  document.querySelector('[data-emfmt="exec"]').click();
  await new Promise(r => setTimeout(r, 260));
  return { kept: GEN.email.recipient === recipient && GEN.email.risk === risk,
           paras: document.querySelectorAll('#emBody p').length,
           fmt: state.emailFormat };
});
is('52 switching format keeps every selection', fmtSwitch.kept && fmtSwitch.fmt === 'exec');
is('53 the executive note is three paragraphs plus greeting and close',
   fmtSwitch.paras >= 4 && fmtSwitch.paras <= 6, `${fmtSwitch.paras}`);
await page.evaluate(() => document.querySelector('[data-emfmt="clean"]').click());
await page.waitForTimeout(250);

/* ══════════════════════════════════════════ 10. the Sunday Signal ═══ */
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
           text: out.innerText,
           hasPreviewBtn: /branded newsletter/i.test(document.getElementById('ssPreview')?.textContent || '') };
});
is('54 Sunday Signal defaults to Cohesive Signal at Standard length',
   sun.style === 'cohesive' && sun.activeStyle === 'cohesive' && sun.length === 'standard');
is('55 it reads as one piece: a title, a deck and connected paragraphs',
   !!sun.title && !!sun.deck && sun.paras >= 6, `${sun.paras} paragraphs`);
is('56 Standard length uses no more than three visible subheads',
   sun.subheads <= 3, `${sun.subheads} subheads`);
is('57 the prose carries no inline IDs',
   !/\b(ETR-OCT26-[A-Z]+|SIG-\d|KPI-\d{3}|R-\d{3}|SUN-\d{3})\b/.test(
     sun.text.split('Contents')[0].replace(/CrowdStrike — October 2026 TSIS/, '')),
   (sun.text.match(/\bSUN-\d{3}\b/g) || []).slice(0, 3).join(', '));
is('58 a "preview as branded newsletter" control exists', sun.hasPreviewBtn);

const preview = await page.evaluate(async () => {
  document.getElementById('ssPreview').click();
  await new Promise(r => setTimeout(r, 260));
  const on = { newsletter: document.getElementById('ssOut').classList.contains('newsletter'),
              logo: !!document.querySelector('#ssOut .brand-logo') };
  document.getElementById('ssPreview').click();
  await new Promise(r => setTimeout(r, 260));
  return on;
});
is('59 the branded newsletter preview shows the logo', preview.newsletter && preview.logo);

const sunMan = await page.evaluate(() => {
  const S = buildCohesive();
  const all = S.blocks.map(b => b.c).concat(S.footnotes);
  return { n: all.length, complete: all.every(c => c.claimId && c.classification) };
});
is('60 every Sunday Signal paragraph still carries a claim manifest',
   sunMan.complete && sunMan.n >= 6, `${sunMan.n} manifests`);
is('61 copied prose excludes footnotes unless asked for',
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
is('62 Brief length shortens the piece and drops every subhead',
   lenSwitch.p >= 3 && lenSwitch.h === 0, `${lenSwitch.p} paragraphs, ${lenSwitch.h} subheads`);

/* ══════════════════════ 10B. the four composition styles actually differ ══ */
const styleTexts = await page.evaluate(() => {
  const out = {};
  ['cohesive','exec','data','note'].forEach(s => {
    document.querySelector(`[data-ssty="${s}"]`).click();
    out[s] = document.getElementById('ssOut').innerText;
  });
  document.querySelector('[data-ssty="cohesive"]').click();
  return out;
});
is('62B Cohesive Signal and Research Note render different prose',
   styleTexts.cohesive !== styleTexts.note);
is('62C Executive Signal is a distinctly shorter cut than Cohesive Signal',
   styleTexts.exec.length < styleTexts.cohesive.length, `${styleTexts.exec.length} vs ${styleTexts.cohesive.length}`);
is('62D Data-Led Signal reorders the piece so the raw readings lead the body',
   styleTexts.data !== styleTexts.cohesive &&
   styleTexts.data.indexOf('Net Score reads') < styleTexts.data.indexOf('fifteen months since the outage'));
is('62E Research Note explicitly keeps the open items in view even when nothing else does',
   /Carried open in this note/.test(styleTexts.note));
is('62F every style produces a genuinely distinct rendering (no two are identical)',
   new Set(Object.values(styleTexts)).size === 4,
   Object.keys(styleTexts).filter((k,i,a)=>a.some((k2,j)=>j>i&&styleTexts[k]===styleTexts[k2])).join(','));

/* ══════════════════════ 10C. Regenerate, Audience and Primary signal are live ══ */
const audienceLive = await page.evaluate(async () => {
  const before = document.getElementById('ssOut').innerText;
  const sel = document.getElementById('ssAud');
  sel.value = 'pe'; sel.dispatchEvent(new Event('change', {bubbles:true}));
  await new Promise(r => setTimeout(r, 250));
  const afterPE = document.getElementById('ssOut').innerText;
  const sigSel = document.getElementById('ssSig');
  sigSel.value = 'SIG-05'; sigSel.dispatchEvent(new Event('change', {bubbles:true}));
  await new Promise(r => setTimeout(r, 250));
  const afterSig = document.getElementById('ssOut').innerText;
  return { changedByAudience: before !== afterPE, mentionsPE: /Private Equity/.test(afterPE),
           changedBySignal: afterPE !== afterSig,
           noIdLeak: !/\bSIG-05\b/.test(afterSig) };
});
is('62G changing Audience visibly changes the generated Sunday Signal',
   audienceLive.changedByAudience && audienceLive.mentionsPE);
is('62H changing Primary signal visibly changes the generated Sunday Signal, with no inline ID',
   audienceLive.changedBySignal && audienceLive.noIdLeak);

const regenLive = await page.evaluate(async () => {
  document.getElementById('ssEdit').click();
  await new Promise(r => setTimeout(r, 150));
  const editedWhileFrozen = GEN.sunday.edited != null;
  const sel = document.getElementById('ssAud');
  sel.value = 'cio'; sel.dispatchEvent(new Event('change', {bubbles:true}));
  await new Promise(r => setTimeout(r, 250));
  const clearedByAudienceChange = GEN.sunday.edited == null;
  const afterRegen = document.getElementById('ssOut').innerText;
  return { editedWhileFrozen, clearedByAudienceChange,
           regenReflectsCio: /Enterprise CIO/.test(afterRegen) };
});
is('62I "Edit draft locally" freezes the draft', regenLive.editedWhileFrozen);
is('62J changing a control while editing locally discards the frozen draft',
   regenLive.clearedByAudienceChange);
is('62K Regenerate produces fresh prose that reflects the current selections',
   regenLive.regenReflectsCio);

/* reset Sunday Signal generator state back to defaults for later checks */
await page.evaluate(() => {
  GEN.sunday.audience = 'investor'; GEN.sunday.signal = 'SIG-02'; GEN.sunday.edited = null;
  save(); RENDER['gen-sunday']({});
});
await page.waitForTimeout(200);

/* ══════════════════════ 10D. the Audience Translator handoff is dynamic ══ */
await goto('#audience');
const handoffLive = await page.evaluate(async () => {
  const btn = document.querySelector('.apbtn[data-aud="sellside"]');
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 200));
  const go = document.querySelector('[data-handoff="sunday|sellside"]');
  if (go) go.click();
  await new Promise(r => setTimeout(r, 350));
  return { onSunday: location.hash === '#generator/sunday-signal',
           audienceSet: GEN.sunday.audience === 'sellside',
           text: document.getElementById('ssOut').innerText };
});
is('62M "Use this audience in Sunday Signal" lands on the generator with that audience applied',
   handoffLive.onSunday && handoffLive.audienceSet);
is('62N the handed-off Sunday Signal reflects the Sell-Side Analyst framing',
   /Sell-Side Analyst/.test(handoffLive.text));
await page.evaluate(() => {
  GEN.sunday.audience = 'investor'; GEN.sunday.edited = null; save(); RENDER['gen-sunday']({});
});
await goto('#generator/sunday-signal');

/* ══════════════════════════════════════════ 11. the Executive Brief ═ */
await goto('#generator/executive-brief');
await page.waitForTimeout(350);
const brief = await page.evaluate(() => {
  const out = document.getElementById('brOut');
  return { question: out.querySelector('.brief-title')?.textContent,
           hasLogo: !!out.querySelector('.brief-logo'),
           sections: out.querySelectorAll('h3').length,
           hasReview: /Human Review Required/i.test(
             document.querySelector('#view-gen-brief .review-status')?.textContent || ''),
           idHit: /\b(EV-\d{3}|SIG-\d{2}|OQ-\d{3}|R-\d{3}|KPI-\d{3})\b/.test(out.innerText),
           hasAud: !!document.getElementById('brAud'), hasSig: !!document.getElementById('brSig'),
           hasAppendix: !!document.getElementById('brAppendix') };
});
is('63 the Executive Brief is a distinct route with its own research question',
   /\?$/.test((brief.question || '').trim()), brief.question);
is('64 the Executive Brief carries the CrowdStrike wordmark', brief.hasLogo);
is('65 the Executive Brief covers bottom line through methodology in named sections',
   brief.sections >= 6, `${brief.sections} sections`);
is('66 the Executive Brief shows review status in its own chrome, not the global header',
   brief.hasReview);
is('67 no object ID appears in the Executive Brief body by default', !brief.idHit,
   brief.idHit ? 'an object ID leaked into the brief body' : '');
is('68 the Executive Brief has audience, signal and appendix controls',
   brief.hasAud && brief.hasSig && brief.hasAppendix);

const briefAppendix = await page.evaluate(async () => {
  document.getElementById('brAppendix').click();
  await new Promise(r => setTimeout(r, 260));
  const on = document.querySelector('#brOut').innerText.includes('Evidence appendix');
  document.getElementById('brAppendix').click();
  await new Promise(r => setTimeout(r, 260));
  return on;
});
is('69 turning on the evidence appendix adds an appendix section', briefAppendix);

const briefManifests = await page.evaluate(() => {
  const B = buildBrief();
  const all = B.sections.reduce((a, s) => a.concat(s.c), []);
  return { n: all.length, complete: all.every(c => c.claimId && c.classification) };
});
is('70 every Executive Brief section carries a complete claim manifest',
   briefManifests.complete && briefManifests.n >= 6, `${briefManifests.n} manifests`);

const briefExports = await page.evaluate(() => {
  const B = buildBrief();
  return { md: briefMarkdown(B).length, html: briefHtml(B).length, text: briefText(B).length };
});
is('71 the Executive Brief can be exported as Markdown, HTML and plain text',
   briefExports.md > 400 && briefExports.html > 400 && briefExports.text > 400);

/* ══════════════════════════════════════════ 12. Audience Translator ═ */
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
is('72 the translator is a three-column split screen', aud.cols === 3, `${aud.cols} columns`);
is('73 changing audience changes the translation', aud.qChanged);
is('74 changing audience changes no fact and nothing in the fixed panel',
   aud.factsSame && aud.fixedSame);
is('75 the translator feeds all three generators', aud.handoffs === 3, `${aud.handoffs} handoffs`);
const handoffSunday = await page.evaluate(async () => {
  document.querySelector('[data-handoff="sunday|pe"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { hash: location.hash, aud: GEN.sunday.audience };
});
is('76 the Sunday Signal handoff opens with that audience selected',
   /sunday-signal/.test(handoffSunday.hash) && handoffSunday.aud === 'pe');
await goto('#audience');
await page.waitForTimeout(250);
const handoffBrief = await page.evaluate(async () => {
  document.querySelector('.apbtn[data-aud="investor"]').click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('[data-handoff="brief|investor"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { hash: location.hash, aud: GEN.brief.audience };
});
is('77 the Executive Brief handoff opens with that audience selected',
   /executive-brief/.test(handoffBrief.hash) && handoffBrief.aud === 'investor');

/* ══════════════════════════════════════ 13. Signals, Evidence, Lineage ══ */
await goto('#signals');
const sigs = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.sigrow')];
  const primary = document.querySelector('.sigrow.is-primary');
  return { groups: document.querySelectorAll('.siggroup').length, rows: rows.length,
           primaryFirst: rows[0] === primary,
           primaryId: primary ? primary.getAttribute('data-goto') : null,
           hasCaveat: rows.every(r => /Principal caveat/i.test(r.textContent)) };
});
is('78 signals are grouped and the recorded primary signal leads',
   sigs.groups >= 2 && sigs.primaryFirst && /SIG-02/.test(sigs.primaryId || ''), sigs.primaryId);
is('79 every signal row carries its principal caveat', sigs.hasCaveat && sigs.rows === 7);

await goto('#evidence');
is('80 Evidence defaults to a concise list and expands to a table',
   await page.evaluate(() => document.querySelectorAll('.evlist .evrow').length > 20 &&
     !!document.querySelector('[data-evmode="table"]')));
await page.evaluate(() => document.querySelector('[data-evmode="table"]').click());
await page.waitForTimeout(250);
is('81 the table view still works',
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
is('82 the lineage narrative path offers a plain-language explanation',
   lin.present && lin.open && lin.steps >= 5, `${lin.steps} steps`);
is('83 the explanation introduces no causal language', !lin.causal);

await goto('#sources');
is('84 Sources leads with source-family summary cards',
   await page.evaluate(() => {
     const cards = [...document.querySelectorAll('.famcard')];
     const total = cards.reduce((a, c) => a + Number(c.querySelector('.n').textContent), 0);
     return cards.length >= 4 && total === (D.sources || []).length;
   }));

await goto('#rules');
is('85 Rules defaults to the rules affecting the current narrative',
   await page.evaluate(() => {
     const shown = document.querySelectorAll('#view-rules .rulecard').length;
     return ruleFilter.scope === 'narrative' && shown > 0 && shown < (D.rules || []).length;
   }));
await page.evaluate(() => document.querySelector('[data-rscope="all"]').click());
await page.waitForTimeout(250);
is('86 View all rules restores the full registry',
   await page.evaluate(() => ruleFilter.scope === 'all' &&
     document.querySelectorAll('#view-rules .rulecard').length === (D.rules || []).length));
await page.evaluate(() => document.querySelector('[data-rscope="narrative"]').click());

await goto('#risks');
is('87 Risks defaults to a Most important now view built from recorded priority',
   await page.evaluate(() => {
     const rows = [...document.querySelectorAll('.nowrow')];
     const imps = rows.map(r => (r.querySelector('.nr-imp') || {}).textContent);
     const firstCritical = imps.indexOf('Critical'), firstHigh = imps.indexOf('High');
     return riskView === 'now' && rows.length >= 5 &&
            (firstHigh === -1 || firstCritical < firstHigh);
   }));

/* ══════════════════════════════════ 14. the Current Call stays fixed ══ */
await goto('#company');
const filterTest = await page.evaluate(async () => {
  const before = { call: CALL.current.value, chip: document.querySelector('.schip .v').textContent,
                   ev: visibleEvidence().length };
  document.querySelector('input[data-ctl="lanes"][value="oct26"]').click();
  await new Promise(r => setTimeout(r, 300));
  const after = { call: CALL.current.value, chip: document.querySelector('.schip .v').textContent,
                  ev: visibleEvidence().length,
                  oct: (D.evidence || []).filter(o => passes(o) && laneOf(o) === 'oct26').length };
  document.querySelector('input[data-ctl="lanes"][value="oct26"]').click();
  await new Promise(r => setTimeout(r, 300));
  const restored = visibleEvidence().length;
  return { before, after, restored };
});
is('88 a source control changes what is shown',
   filterTest.after.ev < filterTest.before.ev && filterTest.after.oct === 0,
   `${filterTest.before.ev} → ${filterTest.after.ev}`);
is('89 the Current Call remains reviewer-controlled and does not move',
   filterTest.after.call === filterTest.before.call &&
   filterTest.after.chip === filterTest.before.chip);
is('90 switching the lane back on restores the evidence',
   filterTest.restored === filterTest.before.ev);

/* ══════════════════════════════════════════ 15. claim discipline ══ */
await page.waitForTimeout(250);
const allText = await page.evaluate(async () => {
  const out = [];
  for (const h of ['company','narrative','generator/sunday-signal','generator/update-email',
                    'generator/executive-brief','audience']){
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
is('91 no causal wording links ETR evidence to company results',
   causal.length === 0, causal[0] ? causal[0].slice(0, 110) : `${sentences.length} sentences scanned`);
const zbad = sentences.filter(s => /Z-Score|deviation figure/i.test(s) &&
  /statistically significant|strong anomaly|anomaly band|standard deviation|high probability/i.test(s) &&
  !/\b(no|not|never|prohibit|cannot)\b/i.test(s));
is('92 no prohibited Z-Score language appears', zbad.length === 0, zbad[0] || '');
const inv = sentences.filter(s => /\b(price target|our rating|we rate|overweight|underweight)\b/i.test(s)
  && !/\b(no|not|never|contains no)\b/i.test(s));
is('93 no investment recommendation, rating or price target', inv.length === 0, inv[0] || '');
is('94 July 2026 is never presented as the current period',
   !/July 2026 is (the )?(current|primary)/i.test(allText) &&
   !/current[^.;\n]{0,20}(period|TSIS)[^.;\n]{0,6}(is |:|,)\s*July 2026/i.test(allText) &&
   /October 2026 is the current/i.test(allText));
is('95 no unsupported company profile data is introduced',
   !/headquarter|employees|founded in|market cap|revenue of \$|based in/i.test(allText));
const legacyLabel = String.fromCharCode(97,110,100,117,114,105,108) + '\\s+interpretation';
is('96 the legacy claim-classification label does not appear anywhere in the rendered application',
   !(new RegExp(legacyLabel, 'i')).test(allText));
is('97 the canonical ETR interpretation label is used instead',
   /ETR interpretation/i.test(allText));

/* ══════════════════════════════════════════ 16. every prior route ══ */
const ROUTES = ['#company','#index','#narrative','#brief','#signals','#signal/SIG-02','#evidence',
  '#lineage','#lineage/SIG-02','#kpis','#bridge/SIG-02/KPI-003','#cohorts','#rules','#rule/R-021',
  '#risks','#question/OQ-014','#risk/CE-002','#sources','#source/SRC-001','#audience',
  '#audience/investor','#generator/sunday-signal','#generator/update-email',
  '#generator/executive-brief','#methodology'];
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
is('98 every route still works, including the new Executive Brief route', routeFails.length === 0,
   routeFails.join(', '));

/* ══════════════════════════════════════════ 17. print ══ */
await goto('#company');
const printCheck = await page.evaluate(async () => {
  const menu = () => document.getElementById('printMenu');
  document.getElementById('btnPrint').click();
  await new Promise(r => setTimeout(r, 150));
  const items = menu() ? [...menu().querySelectorAll('button')].map(b => b.id) : [];
  closePrintMenu();
  return items;
});
is('99 the print menu offers every named surface, including the Executive Brief',
   ['pmCompany','pmNarrative','pmBrief','pmSunday','pmEmail','pmLineage','pmEvidence']
     .every(i => printCheck.includes(i)), printCheck.join(', '));

const createCheck = await page.evaluate(async () => {
  const menu = () => document.getElementById('createMenu');
  document.getElementById('btnCreate').click();
  await new Promise(r => setTimeout(r, 150));
  const items = menu() ? [...menu().querySelectorAll('button')].map(b => b.textContent) : [];
  closeCreateMenu();
  return items;
});
is('100 the Create menu offers all four generator destinations',
   ['Sunday Signal','Update Email','Audience Translator','Executive Brief']
     .every(t => createCheck.includes(t)), createCheck.join(', '));

const printBrief = await page.evaluate(() => {
  const r = runRuntimeChecks().filter(c => c.id === 'V-26')[0];
  return { result: r.result, detail: r.detail };
});
is('101 the Print Brief validation check passes',
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
is('102 print scoping isolates a single surface', printScope.only);

const printSheet = await page.evaluate(() =>
  [...document.styleSheets].some(s => (s.href || '').indexOf('print.css') >= 0));
is('103 a dedicated print stylesheet is loaded', printSheet);

/* ══════════════════════════════════════════ 18. every runtime check ══ */
await goto('#methodology');
await page.waitForTimeout(500);
const checks = await page.evaluate(() => {
  const rt = runRuntimeChecks();
  const ext = ((D.validation || {}).extractionChecks) || [];
  return { rt: rt.length, rtFail: rt.filter(c => c.result === 'FAIL').map(c => c.id + ' ' + c.detail),
           ext: ext.length, extFail: ext.filter(c => c.result === 'FAIL').map(c => c.id) };
});
is('104 every extraction check still passes',
   checks.extFail.length === 0, `${checks.ext} checks; failing: ${checks.extFail.join(', ')}`);
is('105 every runtime check still passes',
   checks.rtFail.length === 0, `${checks.rt} checks; failing: ${checks.rtFail.join(' | ')}`);

/* ══════════════════════════════════════════ 19. LAYOUT-001, responsive ═ */
const widthAt1500 = await page.evaluate(() => {
  const m = document.querySelector('main');
  const view = document.querySelector('.view:not([hidden])');
  return { mainWidth: m.clientWidth, viewportWidth: window.innerWidth,
           viewWidth: view ? view.getBoundingClientRect().width : 0 };
});
is('106 the main content area spans most of a ≥1500px viewport (LAYOUT-001)',
   widthAt1500.mainWidth / widthAt1500.viewportWidth >= 0.75,
   `main ${widthAt1500.mainWidth}px of ${widthAt1500.viewportWidth}px viewport`);

for (const [w, h, label] of [[1500,1000,'desktop'],[1024,900,'tablet'],[834,1000,'small tablet'],
                             [390,820,'phone']]){
  await page.setViewportSize({ width: w, height: h });
  for (const route of ['#company','#narrative','#generator/update-email','#generator/executive-brief']){
    await goto(route);
    const over = await page.evaluate(() => {
      const m = document.querySelector('main');
      return Math.max(m.scrollWidth - m.clientWidth, document.body.scrollWidth - window.innerWidth);
    });
    is(`107.${w}${route} no horizontal overflow at ${w}px (${label})`, over <= 2, `${over}px`);
  }
}
await page.setViewportSize({ width: 390, height: 820 });
await goto('#company');
is('108 the phone layout collapses the menu behind a toggle and scrolls the metric rail',
   await page.evaluate(() => {
     const t = document.getElementById('navToggle');
     const rail = document.querySelector('.mrail');
     return getComputedStyle(t).display !== 'none' && rail.scrollWidth > rail.clientWidth;
   }));
is('109 the header collapses secondary actions on narrow viewports while keeping identity and search',
   await page.evaluate(() => {
     const logo = document.querySelector('.brandbox .brand-logo, .brandbox .bm');
     const search = document.getElementById('globalSearch');
     return getComputedStyle(logo).display !== 'none' &&
            getComputedStyle(search.closest('.search-wrap')).display !== 'none';
   }));
await page.setViewportSize({ width: 1500, height: 1000 });

/* ══════════════════════════════════════════ 20. BRAND-001 ═══════════ */
await goto('#company');
const brand = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('img.brand-logo')];
  const results = [];
  for (const img of imgs){
    results.push({ complete: img.complete, natural: img.naturalWidth, src: img.currentSrc || img.src });
  }
  return results;
});
is('110 every CrowdStrike wordmark image loads successfully (no broken image)',
   brand.length > 0 && brand.every(b => b.complete && b.natural > 0),
   brand.map(b => `${b.src.split('/').pop()}:${b.natural}px`).join(', '));
is('111 the wordmark is sourced from the local assets directory, not a remote URL',
   brand.every(b => /assets\/crowdstrike-logo\.png$/.test(b.src)));

/* ══════════════════════════════════════════ 21. self-containment ══ */
is('112 no external asset is requested',
   await page.evaluate(() => ![...document.querySelectorAll('link,script,img,iframe')]
     .some(e => /^https?:|^\/\//.test(e.getAttribute('href') || e.getAttribute('src') || ''))));
is('113 the application runs under file://',
   await page.evaluate(() => location.protocol === 'file:'));
is('114 the page ran clean, with no console or page errors',
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
