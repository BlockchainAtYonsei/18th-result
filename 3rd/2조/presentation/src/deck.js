(() => {
  'use strict';
  const D=JSON.parse(document.getElementById('presentation-data').textContent);
  const notes=JSON.parse(document.getElementById('speaker-notes').textContent);
  const $=(id)=>document.getElementById(id);
  const put=(id,value)=>{$(id).textContent=String(value??'—');};
  const slides=[...document.querySelectorAll('.slide')];
  const counts=slides.map(s=>Number(s.dataset.builds));
  const total=counts.reduce((a,b)=>a+b,0);
  if(slides.length!==notes.length||notes.some((n,i)=>n.steps.length!==counts[i]))throw new Error('발표 전개와 메모의 수가 다릅니다.');
  let current=0,build=0;
  slides.forEach((slide,i)=>{slide.setAttribute('aria-label',(i+1)+'. '+slide.dataset.title);slide.setAttribute('aria-roledescription','슬라이드');slide.dataset.buildIndex='0';});
  const atEnd=()=>current===slides.length-1&&build===counts[current]-1;
  const canMove=(direction)=>direction>0?!atEnd():current>0||build>0;
  function navigate(index,focus=true,stage=0){
    current=Math.max(0,Math.min(slides.length-1,Math.trunc(index)));
    build=Math.max(0,Math.min(counts[current]-1,Math.trunc(stage)));
    slides.forEach((slide,i)=>{slide.hidden=i!==current;slide.classList.toggle('is-active',i===current);if(i===current){slide.dataset.buildIndex=String(build);slide.scrollTop=0;}});
    document.querySelectorAll('[data-chapter-marker]').forEach(n=>n.setAttribute('aria-current',String(n.dataset.chapterMarker===slides[current].dataset.chapter)));
    put('page-number',String(current+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0'));
    $('previous').disabled=!canMove(-1);$('next').disabled=!canMove(1);
    $('progress').style.width=((counts.slice(0,current).reduce((a,b)=>a+b,0)+build+1)/total*100)+'%';
    const hash='#'+(current+1)+(build?'.'+(build+1):'');if(location.hash!==hash)history.replaceState(null,'',hash);
    if(focus)slides[current].querySelector('h1,h2').focus({preventScroll:true});
    if(matchMedia('(max-width:650px)').matches)window.scrollTo(0,0);
    put('notes-time','목표 '+notes[current].time+' · 전개 '+(build+1)+' / '+counts[current]);
    $('notes-content').replaceChildren(...[notes[current].steps[build],...notes[current].paragraphs].map((t,i)=>{const p=document.createElement('p');p.textContent=t;if(i===0)p.className='step-cue';return p;}));
    put('status-message',(current+1)+' / '+slides.length+'. '+slides[current].dataset.title+'. '+notes[current].steps[build]);
    document.dispatchEvent(new CustomEvent('presentation:frame',{detail:{page:current,step:build}}));
  }
  function advance(direction){if(!canMove(direction))return;if(direction>0){if(build+1<counts[current])navigate(current,false,build+1);else navigate(current+1,true,0);}else if(build>0)navigate(current,false,build-1);else navigate(current-1,true,counts[current-1]-1);}
  function fromHash(){const match=location.hash.match(/^#(\d+)(?:\.(\d+))?$/);navigate(match?Number(match[1])-1:0,false,match?.[2]?Number(match[2])-1:0);}
  $('previous').addEventListener('click',()=>advance(-1));$('next').addEventListener('click',()=>advance(1));
  addEventListener('hashchange',fromHash);fromHash();
  const demoActive = () => Boolean(slides[current].querySelector('[data-interactive-demo]:not([hidden])'));
  const interactive = 'button,a,input,select,textarea,label,summary,details,[role="button"],[role="slider"],[contenteditable="true"]';
  const gestureBlocked = (event) => event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
    || document.querySelector('dialog[open]') || !(event.target instanceof Element)
    || event.target.closest(interactive+', [data-interactive-demo]')
    || demoActive();
  let lastAdvanceClick = -Infinity;
  $('deck').addEventListener('click', (event) => {
    if (gestureBlocked(event) || event.button !== 0 || event.detail > 1 || window.getSelection()?.toString()) return;
    const now = performance.now();
    if (now - lastAdvanceClick < 350 || atEnd()) return;
    lastAdvanceClick = now;
    advance(1);
  });
  function canScrollContent(target, direction) {
    // Let a long slide or nested scroll region consume the entire gesture first.
    for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (!/^(auto|scroll)$/.test(getComputedStyle(node).overflowY) || node.scrollHeight <= node.clientHeight + 2) continue;
      if (direction < 0 ? node.scrollTop > 1 : node.scrollTop + node.clientHeight < node.scrollHeight - 2) return true;
    }
    const root = document.scrollingElement;
    return root && (direction < 0 ? root.scrollTop > 1 : root.scrollTop + innerHeight < root.scrollHeight - 2);
  }
  let wheelAt = -Infinity;
  let wheelNavigationAt = -Infinity;
  let wheelMode = null;
  let wheelDistance = 0;
  window.addEventListener('wheel', (event) => {
    if (gestureBlocked(event) || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const now = performance.now();
    if (now - wheelAt > 200) { wheelMode = null; wheelDistance = 0; }
    wheelAt = now;
    if (wheelMode === 'native') return;
    if (wheelMode === 'navigate') { event.preventDefault(); return; }
    const direction = Math.sign(event.deltaY);
    if (canScrollContent(event.target, direction)) { wheelMode = 'native'; return; }
    event.preventDefault();
    if (now - wheelNavigationAt < 650) { wheelMode = 'navigate'; return; }
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (Math.sign(wheelDistance) !== direction) wheelDistance = 0;
    wheelDistance += pixels;
    if (Math.abs(wheelDistance) < 60) return;
    wheelMode = 'navigate';
    if (canMove(direction)) { wheelNavigationAt = now; advance(direction); }
  }, { passive: false });
  function open(id){if(!$(id).open)$(id).showModal();}
  document.querySelectorAll('[data-dialog]').forEach((b)=>b.addEventListener('click',()=>open(b.dataset.dialog)));
  document.querySelectorAll('.close-dialog').forEach((b)=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((dialog)=>dialog.addEventListener('click',(e)=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}));
  const records={pattern:['패턴 탐지의 근거',D.analyses.pattern],patternPolicy:['분산 송금의 정책 판단',D.comparisonReviews.pattern],sanctionPolicy:['제재 주소의 정책 판단',D.compliance]};
  function record(title,data){put('record-title',title);put('raw-record',JSON.stringify(data,null,2));open('record');}
  document.querySelectorAll('[data-record]').forEach((b)=>b.addEventListener('click',()=>record(...records[b.dataset.record])));
  $('show-all-data').addEventListener('click',()=>{$('sources').close();record('전체 서버 원본',D);});
  $('download-data').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(D,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='solana-compliance-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const a=D.analyses.pattern.result;
  const metadata=[['발표 데이터',D.generatedAt],['코드 기준',D.gitRevision],['패턴 수집',D.sources.pattern.provider+' / '+D.sources.pattern.capturedAt],['패턴 지갑',a.address],['수집 범위',a.coverage.fromTime+' ~ '+a.coverage.toTime+' (종료 제외)'],['데이터 범위','거래 '+a.coverage.transactionCount+'건 / 전송 '+a.coverage.transferCount+'건 / '+a.coverage.status],['제재 주소',D.analyses.recipient.result.address],['모델',D.scenarios[0].research.result.protocolModelVersion+' / team-research-40-60-v1'],['감사 기록','Gateway 2건 / Constellation 10건 · 원본 audit.recordId로 재조회']];
  metadata.forEach(([name,value])=>{const dt=document.createElement('dt');dt.textContent=name;const dd=document.createElement('dd');dd.textContent=value;$('source-metadata').append(dt,dd);});
  const outcomes={NO_SUBMISSION_PATH:'수락 경로 없음',INCLUSION_NOT_ENFORCED:'포함 의무 없음',INCLUSION_ENFORCED:'포함 의무 발생',BLOCK_SKIPPED:'블록 건너뛰기'};
  D.scenarios.forEach((s)=>{const tr=document.createElement('tr');const names={no_path:'전원 거절',below:'묶음 기준 미달',boundary:'두 기준 충족',fifty:'묶음 50%',skipped:'전체 참여 미달'};[names[s.key],s.scenario.attestationPercent+'%',s.scenario.attesterParticipationPercent+'%',outcomes[s.research.result.outcome],outcomes[s.baseline.result.outcome]].forEach((v)=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});$('print-results').append(tr);});
  let motion=!matchMedia('(prefers-reduced-motion:reduce)').matches;
  function applyMotion(){document.body.classList.toggle('no-motion',!motion);put('toggle-motion',motion?'모션 끄기 · M':'모션 켜기 · M');$('toggle-motion').setAttribute('aria-pressed',String(motion));}applyMotion();
  $('toggle-motion').addEventListener('click',()=>{motion=!motion;applyMotion();});
  async function fullscreen(){try{document.querySelectorAll('dialog[open]').forEach((d)=>d.close());if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{put('status-message','브라우저의 전체 화면 기능을 사용해 주세요.');}}
  $('fullscreen').addEventListener('click',fullscreen);$('open-notes').addEventListener('click',()=>{$('tools').close();open('notes');});
  let remaining=720,deadline=0,running=false,interval;
  function updateTimer(){const sec=running?Math.ceil((deadline-performance.now())/1000):remaining;put('timer',(sec<0?'+':'')+String(Math.floor(Math.abs(sec)/60)).padStart(2,'0')+':'+String(Math.abs(sec)%60).padStart(2,'0'));}
  function toggleTimer(){running=!running;if(running){deadline=performance.now()+remaining*1000;interval=setInterval(updateTimer,250);}else{remaining=Math.ceil((deadline-performance.now())/1000);clearInterval(interval);}$('timer').hidden=false;put('toggle-timer',running?'타이머 일시정지 · T':'타이머 계속 · T');updateTimer();}
  $('toggle-timer').addEventListener('click',toggleTimer);$('reset-timer').addEventListener('click',()=>{clearInterval(interval);running=false;remaining=720;$('timer').hidden=true;put('toggle-timer','12분 타이머 · T');updateTimer();});
  $('print-deck').addEventListener('click',()=>{$('tools').close();window.print();});
  document.addEventListener('keydown',(e)=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat||document.querySelector('dialog[open]'))return;if(demoActive()&&['ArrowRight','ArrowLeft','PageDown','PageUp',' ','Home','End'].includes(e.key))return;if(e.target.closest('input,select,textarea,[contenteditable=true]'))return;if(e.key===' '&&e.target.closest('button,a,summary'))return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();advance(1);}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();advance(-1);}else if(e.key==='Home'){e.preventDefault();navigate(0);}else if(e.key==='End'){e.preventDefault();navigate(slides.length-1,true,counts.at(-1)-1);}else if(e.key.toLowerCase()==='f')fullscreen();else if(e.key.toLowerCase()==='m'){motion=!motion;applyMotion();}else if(e.key.toLowerCase()==='n')open('notes');else if(e.key.toLowerCase()==='t')toggleTimer();else if(e.key==='?')open('tools');});
})();
