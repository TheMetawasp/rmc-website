/* RMC Advocates – Kenya Gazette library
   Shared by gazette.html (hub), gazette issue pages and gazette-admin.html. */
(function(){
  const GZ = window.GZ = window.GZ || {};

  const esc = GZ.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  // Heading of a notice, e.g. "GAZETTE NOTICE NO. 12345" (but not "Gazette Notice No. 123 of 2026" references)
  const NOTICE_RE = /GAZETTE\s+NOTICE\s+NO\.?\s*(\d{1,6})(?!\d)(?!\s*(?:of|OF|dated|published)\b)/g;

  /* Split page texts into notices. Returns [{id,no,page,text}] */
  GZ.splitNotices = function(pages){
    const out = [];
    let cur = { no:null, page:1, text:'' };
    (pages || []).forEach((txt, i) => {
      txt = String(txt || '');
      let last = 0, m;
      NOTICE_RE.lastIndex = 0;
      while ((m = NOTICE_RE.exec(txt))){
        cur.text += txt.slice(last, m.index);
        out.push(cur);
        cur = { no:m[1], page:i + 1, text:'' };
        last = m.index;
      }
      cur.text += txt.slice(last) + '\n';
    });
    out.push(cur);
    const seen = {};
    return out.filter(n => n.no || n.text.trim()).map(n => {
      let id = n.no ? 'gn-' + n.no : 'gz-front-' + n.page;
      if (seen[id]) { seen[id]++; id += '-' + seen[id]; } else seen[id] = 1;
      n.id = id;
      n.text = n.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      return n;
    });
  };

  GZ.formatDate = function(iso){
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    const day = d.getDate();
    const sfx = (day % 10 === 1 && day !== 11) ? 'st' : (day % 10 === 2 && day !== 12) ? 'nd' : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    return day + sfx + ' ' + d.toLocaleString('en-GB', { month:'long' }) + ' ' + d.getFullYear();
  };
  GZ.issueTitle = i => 'Kenya Gazette Vol. ' + i.vol + ' No. ' + i.no + (i.special ? ' (Special Issue)' : '');
  GZ.OFFICIAL_URL = 'https://kenyalaw.org';
  GZ.REMOVED_NOTE = '[This notice has been removed from this online copy following a request under the Data Protection Act, 2019. Please refer to the official Kenya Gazette.]';
  GZ.pdfHref = (i, page) => i.pdf ? i.pdf + (page ? '#page=' + page : '') : '';
  GZ.removalHref = function(i, n, short){
    const what = n && n.no ? 'Gazette Notice No. ' + n.no + ', ' : '';
    const subj = 'Gazette removal or correction request: ' + what + 'Vol. ' + i.vol + ' No. ' + i.no;
    const body = 'Good day,\n\nI request the following for ' + what + GZ.issueTitle(i) + ' (' + GZ.formatDate(i.date) + ') on your website:\n' +
      '[ ] Remove the notice\n[ ] Correct the text (please describe the error)\n[ ] I object to this notice being shown\n\n' +
      'Reason:\n\nMy full name:\nMy connection to the notice (e.g. the person named, or acting for them):\nPhone:\n\n' +
      'Page: https://www.rmc-advocates.com/' + i.page + (n ? '#' + n.id : '') + '\n';
    return 'mailto:info@rmc-advocates.com?subject=' + encodeURIComponent(subj) + (short ? '' : '&body=' + encodeURIComponent(body));
  };
  GZ.fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  /* Replace the text of one notice (by number) across the page texts. Used for removal and
     correction requests. replacement = full new text, starting with its heading. */
  GZ.replaceNotice = function(pages, no, replacement){
    let inTarget = false, done = false, found = false;
    const out = (pages || []).map(txt => {
      txt = String(txt || '');
      const marks = []; let m;
      NOTICE_RE.lastIndex = 0;
      while ((m = NOTICE_RE.exec(txt))) marks.push({ idx:m.index, no:m[1] });
      let res = '';
      for (let k = 0; k <= marks.length; k++){
        const start = k === 0 ? 0 : marks[k - 1].idx;
        const end = k < marks.length ? marks[k].idx : txt.length;
        if (k > 0){
          if (inTarget) done = true;
          inTarget = !done && marks[k - 1].no === String(no);
          if (inTarget){ found = true; res += replacement.trim() + '\n'; continue; }
        } else if (inTarget){ continue; }
        res += txt.slice(start, end);
      }
      return res.trim();
    });
    return found ? out : null;
  };

  /* ---------- Search ---------- */
  function terms(q){ return norm(q).toLowerCase().split(' ').filter(Boolean); }
  function highlight(text, ts){
    let h = esc(text);
    ts.filter(t => t.length > 1).sort((a,b) => b.length - a.length).forEach(t => {
      const re = new RegExp('(' + esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      h = h.replace(re, '<mark>$1</mark>');
    });
    return h;
  }
  function snippet(text, pos, len, ts){
    let a = Math.max(0, pos - 110), b = Math.min(text.length, pos + len + 160);
    if (a > 0){ const sp = text.indexOf(' ', a); if (sp > -1 && sp < pos) a = sp + 1; }
    if (b < text.length){ const sp = text.lastIndexOf(' ', b); if (sp > pos + len) b = sp; }
    return (a > 0 ? '… ' : '') + highlight(text.slice(a, b), ts) + (b < text.length ? ' …' : '');
  }
  GZ.highlight = highlight;

  /* Returns hits [{notice, snippet, score}] for one issue's text */
  GZ.searchIssue = function(data, q){
    const ql = norm(q).toLowerCase();
    if (!ql) return [];
    const ts = terms(q);
    const numM = ql.match(/^(?:g\.?\s*n\.?|gazette\s+notice|notice)?\s*(?:no\.?)?\s*(\d{2,6})$/);
    const notices = data._notices || (data._notices = GZ.splitNotices(data.pages));
    const hits = [];
    notices.forEach(n => {
      const t = norm(n.text), tl = t.toLowerCase();
      if (numM && n.no === numM[1]) { hits.push({ notice:n, snippet:snippet(t, 0, 0, ts), score:1000 }); return; }
      let pos = tl.indexOf(ql);
      if (pos >= 0){
        let count = 0, p = pos;
        while (p >= 0 && count < 50){ count++; p = tl.indexOf(ql, p + ql.length); }
        hits.push({ notice:n, snippet:snippet(t, pos, ql.length, ts), score:100 + count });
      } else if (ts.length > 1 && ts.every(x => tl.indexOf(x) >= 0)){
        pos = tl.indexOf(ts[0]);
        hits.push({ notice:n, snippet:snippet(t, pos, ts[0].length, ts), score:10 });
      }
    });
    return hits.sort((a,b) => b.score - a.score);
  };

  GZ.loadText = function(issue){
    window.GZ_TEXT = window.GZ_TEXT || {};
    if (window.GZ_TEXT[issue.slug]) return Promise.resolve(window.GZ_TEXT[issue.slug]);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = issue.text;
      s.onload = () => window.GZ_TEXT[issue.slug] ? resolve(window.GZ_TEXT[issue.slug]) : reject(new Error('empty'));
      s.onerror = () => reject(new Error('Could not load ' + issue.text));
      document.head.appendChild(s);
    });
  };

  /* ---------- Hub page (gazette.html) ---------- */
  GZ.initHub = function(){
    const issues = (window.GAZETTE_ISSUES || []).slice().sort((a,b) => (b.date || '').localeCompare(a.date || '') || (+b.no) - (+a.no));
    const $ = id => document.getElementById(id);
    const latestBox = $('gz-latest'), list = $('gz-list'), form = $('gz-search'), input = $('gz-q'),
          scope = $('gz-scope'), results = $('gz-results'), status = $('gz-status');

    if (!issues.length){
      latestBox.innerHTML = '<div class="gz-empty"><h3>The first issue is being prepared</h3><p class="muted">We upload each new issue of the Kenya Gazette shortly after publication. Please check back soon, or contact us if you are looking for a specific notice.</p></div>';
      list.innerHTML = '';
      form.querySelectorAll('input,select,button').forEach(el => el.disabled = true);
      return;
    }

    const L = issues[0];
    latestBox.innerHTML =
      '<div class="gz-latest-card">' +
        '<div><div class="gz-kicker">Latest issue</div>' +
        '<h3>' + esc(GZ.issueTitle(L)) + '</h3>' +
        '<p class="muted">' + esc(GZ.formatDate(L.date)) + ' · ' + (L.pages || '?') + ' pages · ' + (L.notices || 0) + ' notices</p></div>' +
        '<div class="gz-latest-ctas">' +
          '<a class="btn primary" href="' + esc(L.page) + '">Read &amp; search online</a>' +
          (L.pdf ? '<a class="btn btn-outline" href="' + esc(L.pdf) + '" download>Download PDF' + (L.size ? ' (' + GZ.fmtSize(L.size) + ')' : '') + '</a>' : '') +
        '</div>' +
      '</div>';

    list.innerHTML =
      '<table class="gz-table"><thead><tr><th>Date</th><th>Issue</th><th class="gz-hide-sm">Pages</th><th class="gz-hide-sm">Notices</th><th></th></tr></thead><tbody>' +
      issues.map(i =>
        '<tr><td>' + esc(GZ.formatDate(i.date)) + '</td>' +
        '<td><a href="' + esc(i.page) + '">' + esc('Vol. ' + i.vol + ' No. ' + i.no) + (i.special ? ' <span class="gz-tag">Special</span>' : '') + '</a></td>' +
        '<td class="gz-hide-sm">' + (i.pages || '') + '</td><td class="gz-hide-sm">' + (i.notices || '') + '</td>' +
        '<td class="gz-row-ctas"><a href="' + esc(i.page) + '">View</a>' + (i.pdf ? '<a href="' + esc(i.pdf) + '" download>PDF</a>' : '') + '</td></tr>'
      ).join('') + '</tbody></table>';

    const pre = new URLSearchParams(location.search).get('q');
    if (pre){ input.value = pre; }

    let runId = 0;
    async function run(){
      const q = input.value.trim();
      const my = ++runId;
      results.innerHTML = '';
      if (!q){ status.textContent = ''; return; }
      const pool = scope.value === 'all' ? issues : [issues[0]];
      let total = 0, html = [];
      for (let k = 0; k < pool.length; k++){
        if (my !== runId) return;
        status.textContent = 'Searching ' + GZ.issueTitle(pool[k]) + '… (' + (k + 1) + ' of ' + pool.length + ')';
        let data;
        try { data = await GZ.loadText(pool[k]); } catch(e){ continue; }
        const hits = GZ.searchIssue(data, q);
        total += hits.length;
        hits.slice(0, 60).forEach(h => {
          const n = h.notice, i = pool[k];
          html.push('<article class="gz-hit">' +
            '<div class="gz-hit-head"><h3>' + (n.no ? 'Gazette Notice No. ' + esc(n.no) : 'Contents / front matter') + '</h3>' +
            '<span class="gz-hit-meta">' + esc(GZ.issueTitle(i)) + ' · ' + esc(GZ.formatDate(i.date)) + ' · page ' + n.page + '</span></div>' +
            '<p>' + h.snippet + '</p>' +
            '<div class="gz-hit-ctas"><a href="' + esc(i.page) + '#' + n.id + '">Read full notice</a>' +
            (i.pdf ? '<a href="' + esc(GZ.pdfHref(i, n.page)) + '" target="_blank" rel="noopener">Open PDF at page ' + n.page + '</a>' : '') +
            '<a class="gz-req" href="' + esc(GZ.removalHref(i, n)) + '">Request removal or correction</a></div>' +
          '</article>');
        });
        results.innerHTML = html.join('');
      }
      if (my !== runId) return;
      status.textContent = total ? (total + ' matching notice' + (total === 1 ? '' : 's') + ' found' + (total > html.length ? ' (showing the first ' + html.length + ')' : '')) :
        (scope.value === 'all' ? 'No matches. Try fewer words or a different spelling.' : 'No matches in the latest issue. Try searching all issues.');
      if (!total) results.innerHTML = '<div class="gz-nohit">Can’t find the notice you need? <a href="contact.html">Contact us</a> and we will help you trace it.</div>';
      try { history.replaceState(null, '', '?q=' + encodeURIComponent(q)); } catch(e){}
    }
    form.addEventListener('submit', e => { e.preventDefault(); run(); });
    scope.addEventListener('change', () => { if (input.value.trim()) run(); });
    if (pre) run();
  };

  /* ---------- Issue page ---------- */
  GZ.renderIssueBody = function(meta, notices){
    const nums = notices.filter(n => n.no);
    return '' +
'<section class="section gz-issue">\n  <div class="container">\n' +
'    <div class="badge"><span class="dot"></span><a href="gazette.html">Kenya Gazette</a></div>\n' +
'    <h1 class="gz-issue-title">' + esc(GZ.issueTitle(meta)) + '</h1>\n' +
'    <p class="muted gz-issue-meta">Published ' + esc(GZ.formatDate(meta.date)) + ' · ' + meta.pages + ' pages · ' + nums.length + ' gazette notices</p>\n' +
'    <div class="gz-issue-ctas">\n' +
(meta.pdf ? '      <a class="btn primary" href="' + esc(meta.pdf) + '" download>Download PDF (' + GZ.fmtSize(meta.size) + ')</a>\n'
  : '      <a class="btn primary" href="' + GZ.OFFICIAL_URL + '" target="_blank" rel="noopener">Official Gazette (Kenya Law)</a>\n') +
'      <a class="btn btn-outline" href="gazette.html">All issues &amp; search</a>\n' +
'    </div>\n' +
'    <form class="gz-search gz-search-inline" id="gz-issue-search" role="search">\n' +
'      <input type="search" id="gz-issue-q" placeholder="Search this issue: notice number, name, title number, keyword…" aria-label="Search this issue">\n' +
'      <button class="btn primary" type="submit">Search</button>\n' +
'    </form>\n' +
'    <p class="gz-status" id="gz-issue-status" aria-live="polite"></p>\n' +
(nums.length ? '    <details class="gz-index"><summary>Index of notice numbers (' + nums.length + ')</summary><div class="gz-index-list">' +
  nums.map(n => '<a href="#' + n.id + '">' + esc(n.no) + '</a>').join('') + '</div></details>\n' : '') +
'    <div class="gz-notices" id="gz-notices">\n' +
notices.map(n =>
'      <article class="gz-notice" id="' + n.id + '">\n' +
'        <h2>' + (n.no ? 'Gazette Notice No. ' + esc(n.no) : 'Contents and front matter') + '<span class="gz-page">Page ' + n.page + '</span></h2>\n' +
'        <div class="gz-text">' + esc(n.text) + '</div>\n' +
'        <div class="gz-notice-ctas">' + (meta.pdf ? '<a href="' + esc(GZ.pdfHref(meta, n.page)) + '" target="_blank" rel="noopener">View in PDF</a>' : '') +
  '<a href="#" data-gz-copy="' + n.id + '">Copy link</a><a class="gz-req" href="' + esc(GZ.removalHref(meta, n, true)) + '">Request removal or correction</a></div>\n' +
'      </article>\n').join('') +
'    </div>\n' +
'    <p class="legal gz-disclaimer">This is an unofficial, text-searchable copy of the Kenya Gazette published by the Government Printer, provided by Rodgers Mwangi &amp; Company Advocates for convenience. Text was extracted automatically and may contain errors; always rely on the official Gazette. ' + (meta.pdf ? '' : 'The PDF of this issue has been withdrawn from this website. ') + 'Named in a notice and want it removed or corrected? <a href="' + esc(GZ.removalHref(meta, null)) + '">Request removal or correction</a> (see our <a href="privacy.html#gazette">Privacy Notice</a>); we respond within 14 days. Need help acting on a notice (a lost title, a succession cause or an objection)? <a href="contact.html">Contact us</a>.</p>\n' +
'  </div>\n</section>\n';
  };

  GZ.initIssuePage = function(){
    const form = document.getElementById('gz-issue-search');
    if (!form) return;
    const input = document.getElementById('gz-issue-q'), status = document.getElementById('gz-issue-status');
    const arts = Array.from(document.querySelectorAll('.gz-notice'));
    arts.forEach(a => { const t = a.querySelector('.gz-text'); t.dataset.raw = t.textContent; });
    function run(){
      const q = input.value.trim(), ql = norm(q).toLowerCase(), ts = terms(q);
      const numM = ql.match(/^(?:g\.?\s*n\.?|gazette\s+notice|notice)?\s*(?:no\.?)?\s*(\d{2,6})$/);
      let shown = 0;
      arts.forEach(a => {
        const t = a.querySelector('.gz-text'), raw = t.dataset.raw, rl = norm(raw).toLowerCase();
        let ok = !q || (numM && a.id === 'gn-' + numM[1]) || rl.indexOf(ql) >= 0 || (ts.length > 1 && ts.every(x => rl.indexOf(x) >= 0));
        a.hidden = !ok;
        t.innerHTML = (q && ok) ? highlight(raw, numM ? [] : ts) : esc(raw);
        if (ok) shown++;
      });
      status.textContent = q ? (shown + ' matching notice' + (shown === 1 ? '' : 's')) : '';
      if (q && shown){ const first = arts.find(a => !a.hidden); first && first.scrollIntoView({ behavior:'smooth', block:'start' }); }
    }
    form.addEventListener('submit', e => { e.preventDefault(); run(); });
    input.addEventListener('search', run);
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-gz-copy]');
      if (!c) return;
      e.preventDefault();
      const url = location.href.split('#')[0] + '#' + c.getAttribute('data-gz-copy');
      try { navigator.clipboard.writeText(url); } catch(err){}
      c.textContent = 'Link copied';
      setTimeout(() => c.textContent = 'Copy link', 2000);
    });
    const q = new URLSearchParams(location.search).get('q');
    if (q){ input.value = q; run(); }
  };
})();
