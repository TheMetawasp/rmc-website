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

  // Page fade-in
  document.documentElement.classList.add('js');
  if(!prefersReduced){
    window.requestAnimationFrame(()=>{document.documentElement.classList.add('page-in'); setActiveNav();});
  }else{
    document.documentElement.classList.add('page-in');
  setActiveNav();
  }

  // Crossfade on internal navigation (static site)
  document.addEventListener('click', function(e){
    const a = e.target.closest('a[href]');
    if(!a) return;

    const href = a.getAttribute('href') || '';
    if(a.target === '_blank' || a.hasAttribute('download')) return;
    if(href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('https://wa.me')) return;

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
  }, {threshold: 0.12, rootMargin: '0px 0px -10% 0px'});

  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

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