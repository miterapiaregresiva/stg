const updateStickyHeaderOffset=()=>{
  const header=document.querySelector('.site-header');
  if(!header)return;
  const gap=16;
  document.documentElement.style.setProperty('--sticky-header-offset',`${Math.ceil(header.getBoundingClientRect().height+gap)}px`);
};

updateStickyHeaderOffset();
window.addEventListener('resize',updateStickyHeaderOffset,{passive:true});
if('ResizeObserver' in window){
  const stickyHeader=document.querySelector('.site-header');
  if(stickyHeader)new ResizeObserver(updateStickyHeaderOffset).observe(stickyHeader);
}


const scrollToAnchoredSection=(hash,{behavior='smooth',focusTarget=false}={})=>{
  if(!hash||hash==='#')return false;
  let id;
  try{id=decodeURIComponent(hash.slice(1));}catch{id=hash.slice(1)}
  const target=document.getElementById(id);
  const header=document.querySelector('.site-header');
  if(!target||!header)return false;
  updateStickyHeaderOffset();
  const headerHeight=Math.ceil(header.getBoundingClientRect().height);
  const breathingRoom=28;
  const top=Math.max(0,target.getBoundingClientRect().top+window.scrollY-headerHeight-breathingRoom);
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({top,behavior:reduceMotion?'auto':behavior});
  if(focusTarget){
    const focusNode=target.matches('h1,h2,h3,h4,h5,h6')?target:target.querySelector('h1,h2,h3,h4,h5,h6');
    if(focusNode){
      if(!focusNode.hasAttribute('tabindex'))focusNode.setAttribute('tabindex','-1');
      requestAnimationFrame(()=>focusNode.focus({preventScroll:true}));
    }
  }
  return true;
};

document.addEventListener('DOMContentLoaded',()=>{
  updateStickyHeaderOffset();

  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link)return;
    const hash=link.getAttribute('href');
    if(!hash||hash==='#'||!document.getElementById(hash.slice(1)))return;
    event.preventDefault();
    if(location.hash!==hash)history.pushState(null,'',hash);
    requestAnimationFrame(()=>scrollToAnchoredSection(hash,{behavior:'smooth',focusTarget:event.detail===0}));
  });

  if(location.hash){
    requestAnimationFrame(()=>requestAnimationFrame(()=>scrollToAnchoredSection(location.hash,{behavior:'auto'})));
  }
  document.querySelectorAll('.site-header').forEach(header=>{
    const nav=header.querySelector('.nav');
    const menu=header.querySelector('.menu');
    const button=header.querySelector('.mobile-menu-toggle');
    if(!nav||!menu||!button)return;

    nav.classList.add('mobile-nav-enhanced');

    const setOpen=open=>{
      nav.classList.toggle('mobile-menu-open',open);
      button.setAttribute('aria-expanded',String(open));
      const label=button.querySelector('.mobile-menu-label');
      const icon=button.querySelector('.mobile-menu-icon');
      if(label)label.textContent=open?'Cerrar':'Menú';
      if(icon)icon.textContent=open?'×':'☰';
    };
    const close=(restoreFocus=false)=>{
      if(!nav.classList.contains('mobile-menu-open'))return;
      setOpen(false);
      if(restoreFocus)button.focus();
    };

    button.addEventListener('click',()=>setOpen(!nav.classList.contains('mobile-menu-open')));
    menu.addEventListener('click',e=>{if(e.target.closest('a'))close(false)});
    document.addEventListener('click',e=>{if(!nav.contains(e.target))close(false)});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close(true)});
  });
});

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  document.querySelectorAll('.image-credit[open]').forEach(panel=>{
    const restoreFocus=panel.contains(document.activeElement);
    panel.open=false;
    if(restoreFocus)panel.querySelector('summary')?.focus();
  });
});

document.addEventListener('toggle',event=>{
  const opened=event.target;
  if(!(opened instanceof HTMLDetailsElement)||!opened.matches('.image-credit')||!opened.open)return;
  document.querySelectorAll('.image-credit[open]').forEach(panel=>{
    if(panel!==opened)panel.open=false;
  });
},true);

window.addEventListener('hashchange',()=>{
  requestAnimationFrame(()=>scrollToAnchoredSection(location.hash,{behavior:'auto'}));
});
window.addEventListener('load',()=>{
  if(location.hash)requestAnimationFrame(()=>scrollToAnchoredSection(location.hash,{behavior:'auto'}));
});
