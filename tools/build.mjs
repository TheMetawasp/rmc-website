// RMC Advocates – site builder run by GitHub Actions (.github/workflows/site.yml).
// Processes files dropped into:
//   inbox/gazette/   Kenya Gazette PDFs  -> issue page, searchable text, issues list, sitemap
//   inbox/articles/  Word (.docx) articles -> article page, Insights listing, sitemap
// Run locally with:  node tools/build.mjs   (needs: npm i pdfjs-dist@3.11.174 mammoth@1.12.3)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const SITE = 'https://www.rmc-advocates.com/';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date()); // YYYY-MM-DD
const log = (...a) => console.log('[build]', ...a);
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const wr = (p, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true }); fs.writeFileSync(path.join(ROOT, p), s); };
const exists = p => fs.existsSync(path.join(ROOT, p));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const summary = [];

/* ---------- Shared helpers from the website itself ---------- */
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(rd('assets/gazette.js'), ctx);
const GZ = ctx.window.GZ;

/* Page shell: header + footer of contact.html, so new pages always match the live design */
function pageShell({ title, desc, canonical, body, scripts = '', jsonld = '' }){
  const s = rd('contact.html');
  const start = s.indexOf('<section'), end = s.indexOf('<footer');
  let out = s.slice(0, start) + body + '\n' + s.slice(end);
  const set = (re, val) => { out = out.replace(re, (m, a) => a + val); };
  out = out.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
  set(/(<link rel="canonical" href=")[^"]*/, canonical);
  set(/(<meta name="description" content=")[^"]*/, esc(desc));
  set(/(property="og:title" content=")[^"]*/g, esc(title));
  set(/(name="twitter:title" content=")[^"]*/g, esc(title));
  set(/(property="og:description" content=")[^"]*/g, esc(desc));
  set(/(name="twitter:description" content=")[^"]*/g, esc(desc));
  set(/(property="og:url" content=")[^"]*/g, canonical);
  if (jsonld) out = out.replace('</head>', jsonld + '\n</head>');
  if (scripts) out = out.replace('<script src="assets/transitions.js"></script>', '<script src="assets/transitions.js"></script>\n' + scripts);
  return out;
}

function addToSitemap(file, lastmod){
  if (!exists('sitemap.xml')) return;
  let sm = rd('sitemap.xml');
  const loc = SITE + file;
  if (sm.includes('<loc>' + loc + '</loc>')) return;
  sm = sm.replace('</urlset>', `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>\n</urlset>`);
  wr('sitemap.xml', sm);
}

function inboxFiles(dir, exts){
  if (!exists(dir)) return [];
  return fs.readdirSync(path.join(ROOT, dir))
    .filter(f => exts.some(e => f.toLowerCase().endsWith(e)) && !f.startsWith('.'))
    .map(f => path.join(dir, f));
}

/* ======================= KENYA GAZETTE ======================= */
async function extractPdf(buf){
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++){
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // Gazette PDFs split words into fragments ("G" + "AZETTE"); join by position on the page
    let s = '', prev = null;
    for (const it of tc.items){
      if (typeof it.str !== 'string') continue;
      if (it.str === ''){ if (it.hasEOL) s += '\n'; continue; }
      if (prev){
        const h = Math.max(Math.abs(it.transform[3]) || it.height || 0, Math.abs(prev.transform[3]) || prev.height || 0, 1);
        const dy = Math.abs(it.transform[5] - prev.transform[5]);
        const gap = it.transform[4] - (prev.transform[4] + prev.width);
        if (dy > h * 0.6 || gap < -h * 2){ if (!/\n$/.test(s)) s += '\n'; }
        else if (gap > h * 0.15 && !/\s$/.test(s) && !/^\s/.test(it.str)) s += ' ';
      }
      s += it.str;
      if (it.hasEOL) s += '\n';
      prev = it;
    }
    pages.push(s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
  }
  return pages;
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function detectIssue(pages, fileName){
  const front = (pages[0] || '') + '\n' + (pages[1] || '');
  const meta = { special: /SPECIAL\s+ISSUE/i.test(front) };
  const v = front.match(/Vol\.?\s*([CXLVI]+)\s*[—–\-]+\s*No\.?\s*(\d+)/i);
  if (v){ meta.vol = v[1].toUpperCase(); meta.no = v[2]; }
  const d = front.match(/NAIROBI,?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s*(\d{4})/i);
  if (d){ const m = MONTHS.indexOf(d[2].toLowerCase()); if (m >= 0) meta.date = `${d[3]}-${String(m + 1).padStart(2, '0')}-${String(+d[1]).padStart(2, '0')}`; }
  // fall back to the file name, e.g. Kenya_Gazette_dated_20261023_No_186.pdf
  const fd = fileName.match(/(20\d{2})(\d{2})(\d{2})/); if (!meta.date && fd) meta.date = `${fd[1]}-${fd[2]}-${fd[3]}`;
  const fn = fileName.match(/No[_\s.-]*(\d{1,4})/i); if (!meta.no && fn) meta.no = fn[1];
  return meta;
}

function loadIssues(){
  if (!exists('gazette/issues.js')) return [];
  const c = { window: {} }; vm.createContext(c); vm.runInContext(rd('gazette/issues.js'), c);
  return c.window.GAZETTE_ISSUES || [];
}
function saveIssues(list){
  list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (+b.no) - (+a.no));
  wr('gazette/issues.js', '/* Kenya Gazette issues list – updated automatically on ' + TODAY + '. */\nwindow.GAZETTE_ISSUES = ' + JSON.stringify(list, null, 2) + ';\n');
}

async function processGazettes(){
  const files = inboxFiles('inbox/gazette', ['.pdf']);
  if (!files.length) return;
  const issues = loadIssues();
  for (const f of files){
    const name = path.basename(f);
    try {
      const buf = fs.readFileSync(path.join(ROOT, f));
      const pages = await extractPdf(buf);
      const m = detectIssue(pages, name);
      if (!m.vol || !m.no || !m.date){
        wr(f + '.ERROR.txt', `Could not read the volume, number or date from "${name}" (found: ${JSON.stringify(m)}).\nRename the file like Kenya_Gazette_dated_YYYYMMDD_No_NNN.pdf and upload it again, or use gazette-admin.html.\n`);
        summary.push(`Gazette ${name}: could not read details (see ERROR file)`); continue;
      }
      const slug = `kenya-gazette-${m.date}-vol-${m.vol.toLowerCase()}-no-${m.no}${m.special ? '-special' : ''}`;
      if (issues.some(i => i.slug === slug)){
        fs.rmSync(path.join(ROOT, f));
        summary.push(`Gazette ${name}: already published as ${slug}, skipped`); continue;
      }
      const notices = GZ.splitNotices(pages);
      const nums = notices.filter(n => n.no);
      const meta = {
        slug, vol: m.vol, no: m.no, date: m.date, special: m.special,
        pdf: `gazette/pdf/${slug}.pdf`, page: `${slug}.html`, text: `gazette/text/${slug}.js`,
        pages: pages.length, notices: nums.length, size: buf.length, added: TODAY
      };
      const title = GZ.issueTitle(meta) + ' – ' + GZ.formatDate(meta.date) + ' (Searchable) | RMC Advocates';
      const desc = 'Read, search and download the Kenya Gazette of ' + GZ.formatDate(meta.date) + ' (Vol. ' + meta.vol + ' No. ' + meta.no + ')' +
        (nums.length ? ': ' + nums.length + ' gazette notices, Nos. ' + nums[0].no + ' to ' + nums[nums.length - 1].no : '') + '. Unofficial searchable copy.';
      wr(meta.page, pageShell({ title, desc, canonical: SITE + meta.page, body: GZ.renderIssueBody(meta, notices),
        scripts: '<script src="assets/gazette.js"></script>\n<script>GZ.initIssuePage();</script>' }));
      wr(meta.text, '(window.GZ_TEXT = window.GZ_TEXT || {})[' + JSON.stringify(slug) + '] = ' + JSON.stringify({ pages }) + ';\n');
      fs.mkdirSync(path.join(ROOT, 'gazette/pdf'), { recursive: true });
      fs.renameSync(path.join(ROOT, f), path.join(ROOT, meta.pdf));
      issues.push(meta);
      addToSitemap(meta.page, meta.date);
      summary.push(`Gazette Vol. ${meta.vol} No. ${meta.no} (${meta.date}): ${pages.length} pages, ${nums.length} notices`);
    } catch (e){
      wr(f + '.ERROR.txt', 'Could not process this PDF: ' + e.message + '\n');
      summary.push(`Gazette ${name}: error ${e.message}`);
    }
  }
  saveIssues(issues);
}

/* ======================= INSIGHTS ARTICLES ======================= */
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70).replace(/-$/, '');
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const longDate = iso => GZ.formatDate(iso);

function loadArticles(){ return exists('content/articles.json') ? JSON.parse(rd('content/articles.json')) : []; }

function renderArticleList(list){
  if (!list.length) return '<!-- ARTICLES:START -->\n<!-- ARTICLES:END -->';
  const cards = list.map(a => `      <a class="card article-card" href="${a.page}">
        <div class="ac-meta">${esc(longDate(a.date))}${a.minutes ? ' · ' + a.minutes + ' min read' : ''}</div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.summary)}</p>
        <span class="ac-more">Read article →</span>
      </a>`).join('\n');
  return `<!-- ARTICLES:START -->
<section class="section articles-section" id="articles">
  <div class="container">
    <div class="badge"><span class="dot"></span>Articles</div>
    <h2>Latest articles</h2>
    <div class="articles-grid">
${cards}
    </div>
  </div>
</section>
<!-- ARTICLES:END -->`;
}

async function processArticles(){
  const files = inboxFiles('inbox/articles', ['.docx']);
  if (!files.length) return;
  const mammoth = require('mammoth');
  const articles = loadArticles();
  for (const f of files){
    const name = path.basename(f);
    try {
      const res = await mammoth.convertToHtml({ path: path.join(ROOT, f) }, {
        styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p.lead:fresh", "p[style-name='Quote'] => blockquote:fresh"]
      });
      let html = res.value.trim();
      // Title: first Heading 1 / Title, otherwise the first short paragraph, otherwise the file name
      let title = '';
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      if (h1){ title = strip(h1[1]); html = html.replace(h1[0], ''); }
      else {
        const p1 = html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        if (p1 && strip(p1[1]).length <= 140){ title = strip(p1[1]); html = html.replace(p1[0], ''); }
      }
      if (!title) title = name.replace(/\.docx$/i, '').replace(/^\d{4}-\d{2}-\d{2}[_\s-]*/, '').replace(/[_-]+/g, ' ');
      html = html.replace(/<h1(\s[^>]*)?>/g, '<h2>').replace(/<\/h1>/g, '</h2>').trim();
      const dm = name.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dm ? dm[1] : TODAY;
      const firstP = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [, ''])[1];
      let sum = strip(firstP);
      if (sum.length > 190) sum = sum.slice(0, 187).replace(/\s+\S*$/, '') + '…';
      const words = strip(html).split(' ').length;
      const minutes = Math.max(1, Math.round(words / 220));
      let slug = slugify(title) || 'article';
      let page = `insight-${date}-${slug}.html`;
      const existing = articles.find(a => a.page === page);
      const canonical = SITE + page;
      const desc = sum || title;
      const jsonld = `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Article', headline: title, datePublished: date, dateModified: TODAY,
        author: { '@type': 'Organization', name: 'Rodgers Mwangi & Company Advocates' },
        publisher: { '@type': 'Organization', name: 'Rodgers Mwangi & Company Advocates' }, mainEntityOfPage: canonical, description: desc
      })}</script>`;
      const body = `<section class="page-hero">
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><a href="insights.html">Insights</a><span aria-hidden="true">/</span><span aria-current="page">Article</span></nav>
    <h1>${esc(title)}</h1>
    <div class="article-meta">${esc(longDate(date))} · Rodgers Mwangi &amp; Company Advocates · ${minutes} min read</div>
  </div>
</section>

<section class="section article-section">
  <div class="container article-wrap">
    <article class="article-body">
${html}
    </article>
    <div class="article-end">
      <h3>Need advice on this?</h3>
      <p>Speak to an advocate about how this applies to your circumstances.</p>
      <a class="btn primary" href="contact.html">Contact us</a>
      <p class="legal">This article is general information as at ${esc(longDate(date))} and is not legal advice.</p>
    </div>
    <a class="article-back" href="insights.html#articles">← All articles</a>
  </div>
</section>
`;
      wr(page, pageShell({ title: title + ' | RMC Advocates Insights', desc, canonical, body, jsonld }));
      const rec = { title, date, page, summary: sum, minutes, source: `content/articles/${page.replace(/\.html$/, '')}.docx` };
      if (existing) Object.assign(existing, rec); else articles.push(rec);
      fs.mkdirSync(path.join(ROOT, 'content/articles'), { recursive: true });
      fs.renameSync(path.join(ROOT, f), path.join(ROOT, rec.source));
      addToSitemap(page, date);
      summary.push(`Article "${title}" (${date}) -> ${page}${existing ? ' (updated)' : ''}`);
      if (res.messages.length) log('notes for', name, res.messages.map(m => m.message).slice(0, 5));
    } catch (e){
      wr(f + '.ERROR.txt', 'Could not process this Word file: ' + e.message + '\n');
      summary.push(`Article ${name}: error ${e.message}`);
    }
  }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  wr('content/articles.json', JSON.stringify(articles, null, 2) + '\n');
  const ins = rd('insights.html');
  wr('insights.html', ins.replace(/<!-- ARTICLES:START -->[\s\S]*?<!-- ARTICLES:END -->/, renderArticleList(articles)));
}

await processGazettes();
await processArticles();
log(summary.length ? summary.join('\n') : 'Nothing new in the inbox.');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Website update\n' + (summary.map(s => '- ' + s).join('\n') || 'Nothing new in the inbox.') + '\n');
fs.writeFileSync(path.join(ROOT, '.build-summary.txt'), summary.join('; ') || '');
