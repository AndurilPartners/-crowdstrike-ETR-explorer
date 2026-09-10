/* Interaction and invariant suite for the CrowdStrike REVEAL Company Explorer.
   Run: node test.mjs      Exits non-zero on any failure. */
import pw from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pw;
const URL = 'file://' + process.cwd() + '/index.html';

const R = [];
const ok  = (n, d='') => R.push(['PASS', n, d]);
const bad = (n, d='') => R.push(['FAIL', n, d]);
const is  = (n, cond, d='') => cond ? ok(n, d) : bad(n, d);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const goto = async (hash = '') => {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(180);
};

/* ── landing ─────────────────────────────────────────────────────────────── */
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await page.goto(URL);
await page.waitForTimeout(700);

is('01 a cold start lands on the Vendor Signal Brief',
   await page.evaluate(() => location.hash) === '#brief');
is('02 the brief section is the visible view',
   await page.evaluate(() => !document.getElementById('view-brief').hidden &&
                             document.getElementById('view-index').hidden));
is('03 the sidebar lists the brief first',
   await page.evaluate(() => document.querySelector('.sidebar a').getAttribute('data-view')) === 'brief');
is('04 the brief link is marked current',
   await page.evaluate(() => document.querySelector('.sidebar a[data-view="brief"]')
     .getAttribute('aria-current')) === 'page');

/* ── narrative leads, data follows ───────────────────────────────────────── */
const order = await page.evaluate(() => {
  const v = document.getElementById('view-brief');
  const q = v.querySelector('.q-head'), s = v.querySelector('.short'),
        t = v.querySelector('.toc'),    tb = v.querySelector('table');
  const y = n => n ? n.getBoundingClientRect().top + v.scrollTop : null;
  return { q: y(q), s: y(s), t: y(t), tb: y(tb), qtext: q && q.textContent };
});
is('05 a question headline opens the brief', !!order.qtext && /\?$/.test(order.qtext.trim()), order.qtext);
is('06 the short answer precedes the contents table', order.s < order.t);
is('07 every narrative element precedes the first data table', order.t < order.tb);
is('08 the headline is set in the serif display face',
   await page.evaluate(() => /serif|Georgia|Charter|Iowan/i.test(
     getComputedStyle(document.querySelector('.q-head')).fontFamily)));

/* ── the call rail ───────────────────────────────────────────────────────── */
const rail = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.call-pills .cpill')].map(e => e.textContent);
  return { pills: p, metrics: document.querySelectorAll('.rail-grid button').length,
           foot: !!document.querySelector('.rail-foot') };
});
is('09 the rail carries prior call, current call and both confidences',
   rail.pills.length >= 4 && /Prior call/.test(rail.pills[0]), rail.pills.join(' | ').slice(0, 90));
is('10 the current call still reads Source Needed',
   rail.pills.some(t => /Current call/.test(t) && /Source Needed/.test(t)));
is('11 the rail metric grid is six clickable objects', rail.metrics === 6, String(rail.metrics));
is('12 the rail closes with what to monitor next', rail.foot);

/* ── contents table scrolls the reader ───────────────────────────────────── */
const before = await page.evaluate(() => document.querySelector('main').scrollTop);
await page.click('[data-scroll="brief-counter"]');
await page.waitForTimeout(800);
const after = await page.evaluate(() => document.querySelector('main').scrollTop);
is('13 a contents entry scrolls to its section', after > before + 200, `${before} → ${after}`);
is('14 every contents entry resolves to a section that exists',
   await page.evaluate(() => [...document.querySelectorAll('.toc a')]
     .every(a => !!document.getElementById(a.getAttribute('data-scroll')))));
is('15 the contents table lists eight sections',
   await page.evaluate(() => document.querySelectorAll('.toc a').length) === 8);

/* ── source strip ────────────────────────────────────────────────────────── */
await goto('#brief');
const strip0 = await page.evaluate(() => document.getElementById('srcStrip').textContent);
is('16 the strip states a complete view when every lane is on',
   /Complete ETR view/.test(strip0) && /10 of 10/.test(strip0), strip0.slice(0, 60));
const ev0 = await page.evaluate(() => visibleEvidence().length);
await page.click('.lanechip[data-lane="oct26"]');
await page.waitForTimeout(300);
const after1 = await page.evaluate(() => ({
  strip: document.getElementById('srcStrip').textContent,
  off: document.querySelector('.lanechip[data-lane="oct26"]').classList.contains('off'),
  ev: visibleEvidence().length,
  call: CALL.current.value,
  chrome: document.getElementById('tbCall').textContent,
  oct: (D.evidence || []).filter(o => passes(o) && laneOf(o) === 'oct26').length
}));
is('17 switching a lane off marks its chip off', after1.off);
is('18 the strip drops to a partial view',
   /Partial ETR view/.test(after1.strip) && /9 of 10/.test(after1.strip));
is('19 switching a lane off removes its evidence', after1.ev < ev0, `${ev0} → ${after1.ev}`);
is('20 no October-lane object survives the filter', after1.oct === 0, String(after1.oct));
is('21 the approved Current Call does not move when a lane is switched off',
   after1.call === 'Source Needed' && after1.chrome === 'Source Needed');
await page.click('.lanechip[data-lane="oct26"]');
await page.waitForTimeout(300);
is('22 switching the lane back on restores the evidence',
   await page.evaluate(() => visibleEvidence().length) === ev0);

/* ── the objects behind the story ────────────────────────────────────────── */
await page.click('.rail-grid button');
await page.waitForTimeout(350);
is('23 a rail metric opens its evidence record',
   await page.evaluate(() => !document.getElementById('drawerScrim').hidden &&
     /ETR-OCT26-NS/.test(document.getElementById('drawerId').textContent)));
await page.click('#drawerClose');
await page.waitForTimeout(200);
is('24 the drawer closes', await page.evaluate(() => document.getElementById('drawerScrim').hidden));

const cited = await page.evaluate(() => {
  const ids = [...document.querySelectorAll('#view-brief [data-oid]')]
    .map(e => e.getAttribute('data-oid'));
  return { total: ids.length, unresolved: [...new Set(ids)].filter(i => !OBJ[i]) };
});
is('25 every id cited in the brief resolves to a workbook object',
   cited.unresolved.length === 0, cited.unresolved.slice(0, 6).join(', ') || `${cited.total} citations`);

const blocks = await page.evaluate(() => {
  const bs = [...document.querySelectorAll('#view-brief .nblock')];
  return { n: bs.length, uncited: bs.filter(b => !b.querySelector('[data-oid]')).length };
});
is('26 every narrative block names the objects behind it',
   blocks.n > 0 && blocks.uncited === 0, `${blocks.n} blocks, ${blocks.uncited} uncited`);

/* ── discipline the restyle must not have loosened ───────────────────────── */
const text = await page.evaluate(() => document.getElementById('view-brief').innerText);
const sentences = text.split(/(?<=[.;])\s+/);
const causal = sentences.filter(s =>
  /\b(caused|drove|driven by|explains|proves|proven|predicted|resulted in)\b/i.test(s) &&
  !/\b(no|not|never|cannot|prohibit|does not|without|prohibits)\b/i.test(s));
is('27 no causal wording links ETR evidence to company results',
   causal.length === 0, causal[0] ? causal[0].slice(0, 110) : `${sentences.length} sentences scanned`);
const zbad = sentences.filter(s => /Z-Score/i.test(s) &&
  /statistically significant|extreme|strong anomaly|standard deviation|anomaly band/i.test(s) &&
  !/\b(no|not|never|prohibit|cannot)\b/i.test(s));
is('28 no prohibited Z-Score band language appears', zbad.length === 0, zbad[0] || '');
is('29 the scope disclaimer states what ETR does not measure',
   /does not measure revenue/i.test(text));
is('30 Source Needed is still shown, not silently filled',
   (text.match(/Source Needed/g) || []).length >= 3);
const inv = sentences.filter(s => /\b(price target|our rating|we rate|overweight|underweight)\b/i.test(s)
  && !/\b(no|not|never|contains no)\b/i.test(s));
is('31 no investment recommendation, rating or price target', inv.length === 0, inv[0] || '');
is('32 July 2026 is never presented as the current period',
   !/current[^.;\n]{0,30}July 2026/i.test(text) && /October 2026/.test(text));

/* ── every view still renders under the new chrome ───────────────────────── */
const VIEWS = ['index', 'brief', 'signals', 'evidence', 'lineage', 'kpis', 'cohorts',
               'rules', 'risks', 'sources', 'audience', 'methodology'];
for (const v of VIEWS) {
  await goto('#' + v);
  const st = await page.evaluate(id => {
    const n = document.getElementById('view-' + id);
    return { shown: !n.hidden, len: n.innerHTML.length,
             strip: document.getElementById('srcStrip').textContent.length };
  }, v);
  is(`33.${v} renders with the source strip present`, st.shown && st.len > 400 && st.strip > 40,
     `${st.len} bytes`);
}
await goto('#generator/sunday-signal');
is('34 the Sunday Signal generator renders',
   await page.evaluate(() => document.getElementById('view-gen-sunday').innerHTML.length > 400));

/* ── the warm ground, not the dark one ───────────────────────────────────── */
const paint = await page.evaluate(() => {
  const rgb = s => getComputedStyle(document.querySelector(s)).backgroundColor;
  const lum = c => { const m = c.match(/\d+/g); return m ? (+m[0] + +m[1] + +m[2]) / 3 : null; };
  return { top: lum(rgb('.topbar')), side: lum(rgb('.sidebar')), body: lum(rgb('body')) };
});
is('35 the top bar is light, not dark navy', paint.top > 200, String(paint.top));
is('36 the sidebar is light, not dark navy', paint.side > 200, String(paint.side));
is('37 the page sits on a warm paper ground', paint.body > 200 && paint.body < 252, String(paint.body));

/* ── responsive and print ────────────────────────────────────────────────── */
await goto('#brief');
for (const [w, h] of [[1500, 1000], [1024, 900], [834, 1000]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => {
    const m = document.querySelector('main');
    return m.scrollWidth - m.clientWidth;
  });
  is(`38.${w} the brief does not scroll sideways at ${w}px`, overflow <= 2, `${overflow}px`);
}
await page.setViewportSize({ width: 1500, height: 1000 });
is('39 no external asset is requested',
   await page.evaluate(() => ![...document.querySelectorAll('link,script,img,iframe')]
     .some(e => /^https?:/.test(e.getAttribute('href') || e.getAttribute('src') || ''))));
is('40 the page ran clean, with no console or page errors',
   errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const fails = R.filter(r => r[0] === 'FAIL');
R.forEach(([s, n, d]) => console.log(`${s}  ${n}${d ? '  — ' + d : ''}`));
console.log(`\n${R.length} checks, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
