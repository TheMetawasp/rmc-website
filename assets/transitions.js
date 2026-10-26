(function(){
  function setActiveNav(){
    try{
      const path = (window.location.pathname.split('/').pop() || 'index.html');
      document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
      const direct = document.querySelector('.nav a[href="'+path+'"]');
      if(direct) direct.classList.add('active');
      // Mark parents for dropdowns
      document.querySelectorAll('.has-dropdown').forEach(d=>{
        const any = d.querySelector('.dropdown a.active');
        if(any) d.querySelector('.nav-link')?.classList.add('active');
      });
    }catch(e){}
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mobile hamburger menu
  (function(){
    const topbar = document.querySelector('.topbar');
    const btn = document.querySelector('.nav-toggle');
    if(!topbar || !btn) return;
    const setOpen = (open)=>{
      topbar.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    btn.addEventListener('click', ()=> setOpen(!topbar.classList.contains('nav-open')));
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', ()=>{ if(window.innerWidth > 980) setOpen(false); });
  })();

  // Footer world clocks (Nairobi / Lagos / New York)
  (function(){
    const clocks = document.querySelectorAll('.clock[data-tz]');
    if(!clocks.length) return;
    const tick = ()=>{
      const now = new Date();
      clocks.forEach(c=>{
        try{
          const tz = c.getAttribute('data-tz');
          c.querySelector('.clock-time').textContent = now.toLocaleTimeString('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit'});
          c.querySelector('.clock-day').textContent = now.toLocaleDateString('en-GB',{timeZone:tz,weekday:'short'});
        }catch(e){}
      });
    };
    tick(); setInterval(tick, 20000);
  })();

  // Page fade-in
  document.documentElement.classList.add('js');
  if(!prefersReduced){
    let shown=false;
    const show=()=>{ if(shown) return; shown=true; document.documentElement.classList.add('page-in'); setActiveNav(); };
    window.requestAnimationFrame(show);
    window.setTimeout(show, 120);              // fallback: frames can be paused in embedded/background views
    window.addEventListener('load', show);
  }else{
    document.documentElement.classList.add('page-in');
  setActiveNav();
  }

  window.addEventListener('pageshow', ()=>{
    document.documentElement.classList.remove('page-out');
    document.documentElement.classList.add('page-in');
  });

  // Email links: open the visitor's mail app without blanking the page, and
  // show the address as a fallback for visitors with no mail app set up.
  const inFrame = (()=>{ try{ return window.self !== window.top; }catch(e){ return true; } })();
  function showMailToast(addr){
    let t = document.getElementById('mail-toast');
    if(!t){
      t = document.createElement('div');
      t.id = 'mail-toast'; t.className = 'mail-toast'; t.setAttribute('role','status');
      t.innerHTML = '<div class="mail-toast-text"><strong>Opening your email app…</strong>'+
        '<span>If nothing opens, email us at <a class="mail-toast-addr"></a></span></div>'+
        '<button type="button" class="mail-toast-copy">Copy address</button>'+
        '<button type="button" class="mail-toast-close" aria-label="Close">×</button>';
      document.body.appendChild(t);
      t.querySelector('.mail-toast-close').addEventListener('click', ()=>t.classList.remove('show'));
      t.querySelector('.mail-toast-copy').addEventListener('click', function(){
        try{ navigator.clipboard.writeText(t.dataset.addr); }catch(e){}
        this.textContent = 'Copied';
      });
    }
    t.dataset.addr = addr;
    const a = t.querySelector('.mail-toast-addr'); a.textContent = addr; a.href = 'mailto:'+addr;
    t.querySelector('.mail-toast-copy').textContent = 'Copy address';
    t.classList.add('show');
    clearTimeout(showMailToast._t); showMailToast._t = setTimeout(()=>t.classList.remove('show'), 9000);
  }
  function handleMailto(e, href){
    const addr = decodeURIComponent(href.slice(7).split('?')[0]) || 'info@rmc-advocates.com';
    showMailToast(addr);
    if(inFrame){
      // Inside an embedded preview a mailto would replace the frame with a blank page
      e.preventDefault();
      try{ window.open(href, '_blank', 'noopener'); }catch(err){}
    }
  }

  window.rmcOpenMail = function(href){
    const addr = decodeURIComponent(href.slice(7).split('?')[0]) || 'info@rmc-advocates.com';
    showMailToast(addr);
    if(inFrame){ try{ window.open(href, '_blank', 'noopener'); }catch(err){} }
    else { window.location.href = href; }
  };

  // Crossfade on internal navigation (static site)
  document.addEventListener('click', function(e){
    const a = e.target.closest('a[href]');
    if(!a) return;

    const href = a.getAttribute('href') || '';
    if(a.target === '_blank' || a.hasAttribute('download')) return;
    if(href.startsWith('mailto:')){ handleMailto(e, href); return; }
    if(href.startsWith('https://wa.me')){
      e.preventDefault();
      const w = window.open(href, '_blank', 'noopener');
      if(!w) window.location.href = href;
      return;
    }
    if(href.startsWith('tel:')) return;

    // In-page anchors: smooth scroll
    if(href.startsWith('#')){
      const el = document.querySelector(href);
      if(el){
        e.preventDefault();
        el.scrollIntoView({behavior: prefersReduced ? 'auto' : 'smooth', block:'start'});
        history.pushState(null,'',href);
      }
      return;
    }

    // Only handle same-folder html navigation
    const isHtml = href.endsWith('.html') || (!href.includes(':') && !href.includes('/') && href.length);
    if(!isHtml) return;
    if(prefersReduced) return;

    e.preventDefault();
    document.documentElement.classList.add('page-out');
    window.setTimeout(()=>{ window.location.href = href; }, 180);
  }, true);

  if(prefersReduced) return;

  // Auto-tag common blocks for reveal (all pages)
  const autoSelectors = [
    'main > section',
    '.section',
    '.card',
    '.practice-card',
    '.people-card',
    '.feature',
    '.split',
    '.map-embed',
    'footer'
  ];

  const nodes = new Set();
  autoSelectors.forEach(sel=>{
    document.querySelectorAll(sel).forEach(n=>nodes.add(n));
  });

  // Apply reveal class + stagger delay
  let i = 0;
  nodes.forEach(el=>{
    if(el.classList.contains('hero') || el.closest('.hero')) return;
    // Very tall blocks (e.g. a full Gazette issue) can never be 12% visible, so show them straight away
    if(el.offsetHeight > window.innerHeight * 1.2 || el.closest('.gz-issue, .gz-hub')) return;
    el.classList.add('reveal');
    el.style.setProperty('--reveal-delay', (Math.min(i, 10) * 70) + 'ms');
    i++;
  });

  // Reveal observer
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, {threshold: 0.05, rootMargin: '0px 0px -5% 0px'});

  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  // Fallback: never leave content hidden if the observer doesn't fire
  window.setTimeout(()=>document.querySelectorAll('.reveal:not(.in)').forEach(el=>{
    const r=el.getBoundingClientRect(); if(r.top < window.innerHeight*1.5) el.classList.add('in');
  }), 1200);
  window.setTimeout(()=>document.querySelectorAll('.reveal:not(.in)').forEach(el=>el.classList.add('in')), 4000);

  // Header shadow on scroll
  const topbar = document.querySelector('.topbar');
  if(topbar){
    const onScroll = ()=>{
      if(window.scrollY > 8) topbar.classList.add('scrolled');
      else topbar.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
  }
})();