(() => {
  'use strict';
  const D=JSON.parse(document.getElementById('presentation-data').textContent);
  const $=(id)=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
  const n=(tag,attrs={},text)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(text!==undefined)el.textContent=text;return el;};
  const text=(x,y,value,cls='',anchor='middle')=>n('text',{x,y,class:cls,'text-anchor':anchor},value);
  const path=(d,cls='wire')=>n('path',{d,class:cls});
  const circle=(x,y,r=35,cls='node')=>n('circle',{cx:x,cy:y,r,class:cls});
  const box=(x,y,w,h,cls='node')=>n('rect',{x,y,width:w,height:h,rx:7,class:cls});
  function conceptGraph(canvas,kind,width,visible=3){
    canvas.replaceChildren();const left=110,right=width-130,mid=width*.43;
    canvas.append(box(left-90,99,180,82,'node wallet-card'),text(left,148,kind==='exact'?'분석 주소 A':'지갑 A'));
    if(kind==='fan'||kind==='repeat'){
      [50,140,230].slice(0,visible).forEach(y=>canvas.append(path(`M${left+90} 140H${mid}V${y}H${right-100}`,'rail flow')));
      [50,140,230].slice(0,visible).forEach((y,i)=>{canvas.append(box(right-100,y-34,200,68,'node wallet-card'),text(right,y+8,kind==='repeat'?'수신자 B':['수신자 B','수신자 C','수신자 D'][i]));if(width>800)canvas.append(text((mid+right)/2,y-13,(kind==='repeat'?['00:00','00:20','00:40']:['00:00','00:30','01:00'])[i],'svg-caption'));});
    }else if(kind==='direct'){
      canvas.append(path(`M${left+90} 140H${right-100}`,'rail flow'),box(right-100,99,200,82,'node red-node wallet-card'),text(right,148,'제재 주소','red-text'));
    }else{
      canvas.append(path(`M${left+90} 140H${right-100}`,'wire-muted'),box(right-100,99,200,82,'node red-node wallet-card'),text(right,148,'제재 목록 A','red-text'));
    }
  }
  const pending=(node,hide)=>{if(!node)return;node.classList.toggle('pending',hide);if(hide)node.setAttribute('aria-hidden','true');else node.removeAttribute('aria-hidden');};
  const stageCaptions=['규칙 · 점수 · 근거','허용 · 경고 · 검토 · 차단','정책 적용 경로의 제출 통제'];
  function showRule(key){conceptGraph($('rule-figure'),key,760);const r=D.ruleset.rules;const labels={exact:'제재 목록의 주소와 직접 일치',direct:'제재 주소와의 직접 자금 이동',fan:r.RAPID_FAN_OUT.windowSeconds+'초 · '+r.RAPID_FAN_OUT.minRecipients+'명 이상의 수신자',repeat:r.RAPID_REPEAT.windowSeconds+'초 · 동일 상대·자산 '+r.RAPID_REPEAT.minTransactions+'거래 이상'};$('rule-name').textContent={exact:'주소 일치',direct:'직접 거래',fan:'분산 송금',repeat:'반복 송금'}[key];$('rule-caption').textContent=labels[key];}
  const a=D.analyses.pattern,rule=a.result.evaluation.detectedRules.find(r=>r.ruleId==='RAPID_FAN_OUT');
  const evidence=a.result.evaluation.evidences.find(e=>rule.evidenceIds.includes(e.evidenceId));
  $('capture-counts').textContent=a.result.coverage.transactionCount+'거래 · '+a.result.coverage.transferCount+'전송';
  const rows=a.transfers.filter(t=>evidence.transferIds.includes(t.id)).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id)).slice(0,4);
  $('pattern-score').textContent=a.result.evaluation.riskScore;$('pattern-level').textContent=a.result.evaluation.riskLevel;
  function evidenceStep(step){
    const plot=$('evidence-figure'),start=Date.parse(rows[0].timestamp),visible=Math.min(4,step+1);plot.replaceChildren();
    plot.append(path('M50 185H700','wire-muted'));
    for(let t=0;t<=300;t+=60){const x=50+t/300*650;plot.append(path(`M${x} 178V192`,'wire-muted'),text(x,226,t+'s','svg-caption'));}
    const end=50+(Date.parse(rows[visible-1].timestamp)-start)/1000/300*650;
    plot.append(path(`M50 185H${end}`,'wire'));
    rows.slice(0,visible).forEach((row,i)=>{const x=50+(Date.parse(row.timestamp)-start)/1000/300*650,y=i===2?65:125;plot.append(path(`M${x} ${y+8}V185`,'wire-muted'),circle(x,y,8,'evidence-point'+(i===visible-1?' selected':'')),text(x,y-22,'수신자 '+(i+1),'svg-caption'));});
    if(step>=3)plot.append(text(end+38,179,'111초','svg-caption','start'));
    pending(document.querySelector('.risk-reading'),step<4);
    $('evidence-caption').textContent=step<4?'수집한 전송 근거의 누적':'111초 · 서로 다른 4개 수신자';
  }
  $('pattern-action').textContent=D.comparisonReviews.pattern.result.decision.action;$('sanction-action').textContent=D.compliance.result.decision.action;
  $('gateway-blocked').textContent=D.gateway.enforced.result.outcome==='SUBMISSION_REJECTED'?'제출 중단':D.gateway.enforced.result.outcome;
  $('gateway-open').textContent=D.gateway.unenforced.result.outcome==='SUBMISSION_ALLOWED'?'모의 제출 허용':D.gateway.unenforced.result.outcome;
  const cases=Object.fromEntries(D.scenarios.map(s=>[s.key,s]));
  function pathCase(key){const s=cases[key],r=s.research.result,canvas=$('path-figure');canvas.replaceChildren();canvas.append(text(55,148,'요청'),path('M110 140H175','rail flow'));
    for(let i=0;i<16;i++){const accepted=i>=s.scenario.rejectingProposerCount;canvas.append(circle(220+i%4*48,68+Math.floor(i/4)*48,12,accepted?'node accept-node':'node red-node'));}
    canvas.append(path('M405 140H635',r.proposerPathAvailable?'rail flow':'wire-muted'),box(635,105,75,70,r.proposerPathAvailable?'node':'node muted-node'),text(672,150,'경로'),text(290,268,s.scenario.rejectingProposerCount+' / 16 거절','svg-caption'));
    $('path-result').textContent=r.proposerPathAvailable?'있음':'없음';$('path-result').className=r.proposerPathAvailable?'':'alert';}
  function proofCase(key){const s=cases[key],r=s.research.result,canvas=$('proof-figure');canvas.replaceChildren();canvas.append(text(65,148,'묶음'),path('M115 140H240','rail flow'),n('circle',{cx:300,cy:140,r:56,class:'ring-bg'}));
    const circumference=2*Math.PI*56;canvas.append(n('circle',{cx:300,cy:140,r:56,class:'ring-progress','stroke-dasharray':(circumference*s.scenario.attestationPercent/100)+' '+circumference}),text(300,151,s.scenario.attestationPercent+'%','proof-value'),text(300,240,'묶음 증명','svg-caption'),path('M360 140H465','wire'),circle(510,140,40),text(510,148,'리더'),path('M555 140H650','wire-muted'),box(650,100,70,80,r.leaderExclusionValid===false?'node red-node':'node'));
    canvas.append(text(685,151,r.leaderExclusionValid===false?'×':'✓',r.leaderExclusionValid===false?'red-text':'green-text'));
    $('proof-result').textContent=r.leaderExclusionValid===false?'무효':'허용';$('proof-result').className=r.leaderExclusionValid===false?'danger':'';
}
  function blockCase(key){const s=cases[key],r=s.research.result,canvas=$('block-figure');canvas.replaceChildren();const skipped=r.blockStatus==='SKIPPED';
    canvas.append(text(335,92,s.scenario.attesterParticipationPercent+'%','ring-value'),n('line',{x1:80,y1:150,x2:620,y2:150,class:'participation-base'}),n('line',{x1:80,y1:150,x2:80+540*s.scenario.attesterParticipationPercent/100,y2:150,class:'participation-bar'}),n('line',{x1:404,y1:122,x2:404,y2:193,class:'threshold-tick'}),text(404,224,'60% 기준','svg-caption'),text(80,190,'0','svg-caption'),text(620,190,'100','svg-caption'),box(662,113,62,78,skipped?'node muted-node':'node'),text(693,163,skipped?'−':'✓',skipped?'amber-text':'blue-text'));
    $('block-result').previousElementSibling.textContent='참여 조건';$('block-result').textContent=skipped?'블록 건너뛰기':'기준 충족';$('block-result').className=skipped?'alert':'';}
  const coverCanvas=document.querySelector('.cover-auto');
  let coverReplayTimer=null;
  function stopCoverReplay(){clearTimeout(coverReplayTimer);coverReplayTimer=null;}
  function coverStep(){
    stopCoverReplay();
    const canvas=coverCanvas;
    canvas.classList.remove('running');void canvas.getBoundingClientRect();canvas.classList.add('running');
  }
  coverCanvas.addEventListener('animationend',event=>{
    if(event.target!==coverCanvas.querySelector('.trace-alternate')||event.animationName!=='cover-trace')return;
    stopCoverReplay();
    coverReplayTimer=setTimeout(()=>{
      coverReplayTimer=null;
      if(!coverCanvas.closest('.slide').classList.contains('is-active')||document.body.classList.contains('no-motion')||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
      coverStep();
    },3000);
  });
  function closingStep(step){
    const c=document.querySelector('.boundary-figure');c.querySelector('.ghost').setAttribute('d',step===0?'M95 155H340':step===1?'M95 155H580':'M95 155H580M355 155V280H780V155H860');
    pending(c.querySelector('.stop'),step<1);pending(c.querySelector('.scope-border'),step<2);pending(c.querySelector('.model-box'),step<2);
    c.querySelectorAll('text').forEach((el,i)=>pending(el,i===3?step<1:i>=4?step<2:false));
    $('closing-caption').textContent=['위험 신호의 탐지와 판단','우리 서비스의 정책 적용 경로','서비스의 통제와 네트워크 포함의 구분'][step];
  }
  const explanations=JSON.parse(document.getElementById('speaker-notes').textContent).map(n=>n.screen);
  function activeDemoFrame(){return document.querySelector('.slide.is-active [data-interactive-demo]:not([hidden]) iframe');}
  function showServiceDemo(frameId='service-demo-frame',reset=false){
    const frame=$(frameId);
    if(reset||!frame.hasAttribute('srcdoc'))frame.srcdoc=$('offline-demo-document').content.textContent.replace('<body data-demo-stage="analysis">','<body data-demo-stage="'+frame.dataset.demoStage+'">');
  }
  $('reset-offline-demo').addEventListener('click',()=>{const frame=activeDemoFrame();if(frame)showServiceDemo(frame.id,true);});
  let previousPage=-1;
  function render(page,step){
    const slide=document.querySelectorAll('.slide')[page];slide.dataset.buildIndex=String(step);
    // Keep established diagram elements still; animate only the next visible information.
    slide.querySelectorAll('.motion-arrive,.motion-draw,.motion-reveal').forEach(el=>{el.classList.remove('motion-arrive','motion-draw','motion-reveal');if(el.getAttribute('pathLength')==='1'&&el.closest('.figure'))el.removeAttribute('pathLength');});
    const samePage=previousPage===page;
    const established=new Set(samePage?[...slide.querySelectorAll('.figure > *')].map(el=>el.outerHTML):[]);
    const visibleBefore=new Set(samePage?[...slide.querySelectorAll('[data-stage],.policy-path,.policy-path strong,.policy-path small,.risk-reading,.route-outcome,.boundary-figure > *')].filter(el=>!el.classList.contains('pending')):[]);
    if(page!==0){stopCoverReplay();coverCanvas.classList.remove('running');}
    if(page===7){$('gateway-explanation-surface').hidden=step===3;$('gateway-demo-surface').hidden=step!==3;$('gateway-caption').hidden=step===3;}
    if(page===10){$('block-explanation-surface').hidden=step===2;$('network-demo-surface').hidden=step!==2;}
    $('reset-offline-demo').hidden=!activeDemoFrame();
    switch(page){
      case 5:showServiceDemo();break;
      case 0:coverStep(step);break;
      case 1:conceptGraph($('concept-figure'),'fan',1040,step+1);$('concept-caption').textContent=['한 지갑의 전송 기록','서로 다른 수신자로의 전송','시간과 수신자를 묶은 흐름 분석'][step];break;
      case 2:document.querySelectorAll('[data-stage]').forEach((el,i)=>{pending(el,i>step);el.classList.toggle('current',i===step);});document.querySelectorAll('.stage-trace>i').forEach((el,i)=>pending(el,i>=step));$('stage-caption').textContent=stageCaptions[step];break;
      case 3:showRule(['exact','direct','fan','repeat'][step]);break;
      case 4:evidenceStep(step);break;
      case 6:pending(document.querySelector('.policy-path.block'),step<2);document.querySelectorAll('.policy-path.warn strong,.policy-path.warn small').forEach(el=>pending(el,step<1));document.querySelectorAll('.policy-path.block strong,.policy-path.block small').forEach(el=>pending(el,step<3));break;
      case 7:pending(document.querySelector('.gateway-track.open'),step<2);pending($('gateway-blocked'),step<1);pending(document.querySelector('.gateway-track.blocked em'),step<1);document.querySelectorAll('.gateway-track.blocked .track-wire b').forEach(el=>pending(el,step<1));$('gateway-caption').textContent=['정책 결과의 전달','정책 적용 경로의 제출 중단','다른 경로의 모의 제출'][Math.min(step,2)];if(step===3)showServiceDemo('gateway-demo-frame');break;
      case 8:pathCase(step===0?'no_path':'below');break;
      case 9:proofCase(step===0?'below':'boundary');break;
      case 10:if(step===2)showServiceDemo('network-demo-frame');else blockCase(step===0?'boundary':'skipped');break;
      case 11:closingStep(step);break;
    }
    slide.querySelectorAll('.figure > *').forEach(el=>{
      if(established.has(el.outerHTML)||el.classList.contains('pending'))return;
      if(el.tagName.toLowerCase()==='path'&&el.classList.contains('flow')){
        el.setAttribute('pathLength','1');el.classList.add('motion-draw');
      }else if(['text','circle','rect'].includes(el.tagName.toLowerCase())&&!el.classList.contains('ring-bg')){
        el.classList.add('motion-arrive');
      }
    });
    slide.querySelectorAll('[data-stage],.policy-path,.policy-path strong,.policy-path small,.risk-reading,.route-outcome,.boundary-figure > *').forEach(el=>{
      if(!visibleBefore.has(el)&&!el.closest('.pending'))el.classList.add('motion-reveal');
    });
    previousPage=page;
    const interpretation=document.getElementById('scene-explanation-'+page);if(interpretation)interpretation.textContent=explanations[page][step];
    slide.classList.remove('frame-enter');void slide.offsetWidth;slide.classList.add('frame-enter');
  }
  document.addEventListener('presentation:frame',e=>render(e.detail.page,e.detail.step));
  const active=document.querySelector('.slide.is-active');render([...document.querySelectorAll('.slide')].indexOf(active),Number(active.dataset.buildIndex));
  let printState;
  addEventListener('beforeprint',()=>{printState=[...document.querySelectorAll('.slide')].map(s=>Number(s.dataset.buildIndex));document.querySelectorAll('.slide').forEach((s,i)=>render(i,Number(s.dataset.builds)-([7,10].includes(i)?2:1)));});
  addEventListener('afterprint',()=>{if(printState)document.querySelectorAll('.slide').forEach((s,i)=>render(i,printState[i]));if(coverCanvas.closest('.slide').classList.contains('is-active'))coverStep();});
})();
