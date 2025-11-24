// ui.js - UI/UX enhancements for DECODER
// - Adds floating stock icons, circular timer syncing, confetti, modal animations,
//   leaderboard entry animations, and button micro-interactions.

(function(){
  // wait until DOM ready
  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onReady(() => {
    addFloatingIcons();
    addConfettiCanvas();
    enhanceButtons();
    enhanceModals();
    observeLeaderboard();
    enhanceTimerUI();
    observeSummaryForConfetti();
  });

  /* 8. Floating stock market SVG icons */
  function addFloatingIcons(){
    const container = document.createElement('div');
    container.className = 'floating-icons';
    container.innerHTML = `
      <svg style="left:6%; top:10%; animation:floatUpDown 9s ease-in-out infinite; transform-origin:center;" viewBox="0 0 64 64"><g fill="#fff"><path d="M40 8l8 8 8-8 8 8v40H8V16l8-8 8 8 8-8z"/></g></svg>
      <svg style="right:6%; bottom:14%; animation:floatUpDown 11s ease-in-out infinite; transform-origin:center;" viewBox="0 0 64 64"><g fill="#fff"><path d="M16 48l8-8 8 8 8-24 8 12v20H16z"/></g></svg>
      <svg style="left:20%; bottom:8%; animation:floatUpDown 8s ease-in-out infinite; transform-origin:center;" viewBox="0 0 64 64"><g fill="#fff"><circle cx="32" cy="32" r="10"/></g></svg>
    `;
    document.body.appendChild(container);
  }

  /* 6. Confetti canvas */
  let confettiCanvas, confettiCtx, confettiPieces=[];
  function addConfettiCanvas(){
    confettiCanvas = document.createElement('canvas');
    confettiCanvas.className = 'confetti-canvas';
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    document.body.appendChild(confettiCanvas);
    confettiCtx = confettiCanvas.getContext('2d');
    window.addEventListener('resize', ()=>{
      confettiCanvas.width = window.innerWidth; confettiCanvas.height = window.innerHeight;
    });
  }

  function launchConfetti(){
    confettiPieces = [];
    const count = 120;
    for(let i=0;i<count;i++){
      confettiPieces.push({
        x: Math.random()*confettiCanvas.width,
        y: Math.random()*-confettiCanvas.height,
        r: 6+Math.random()*10,
        c: ['#FFD700','#FF6B6B','#7C3AED','#06B6D4','#34D399'][Math.floor(Math.random()*5)],
        d: Math.random()*60+40
      });
    }
    requestAnimationFrame(tick);
    function tick(){
      confettiCtx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
      for(let p of confettiPieces){
        p.y += Math.sin(p.d*0.01) + 2;
        p.x += Math.cos(p.d*0.03);
        p.d += 0.5;
        confettiCtx.fillStyle = p.c;
        confettiCtx.beginPath();
        confettiCtx.ellipse(p.x, p.y, p.r, p.r*0.6, p.d*0.01, 0, Math.PI*2);
        confettiCtx.fill();
      }
      // stop when off-screen
      if (confettiPieces.some(p=>p.y < confettiCanvas.height + 50)) requestAnimationFrame(tick);
      else confettiCtx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    }
  }

  /* 5. Button micro-animations: add classes to buttons for nicer hover */
  function enhanceButtons(){
    document.querySelectorAll('button').forEach(btn=>{
      if(!btn.classList.contains('btn-animated')) btn.classList.add('btn-animated');
      if(btn.classList.contains('bg-gradient-to-r') || btn.classList.contains('bg-blue-500')) btn.classList.add('btn-primary');
    });
  }

  /* 9. Modal enhancements */
  function enhanceModals(){
    // Add modal-scale class to modals for scale-in effect
    document.querySelectorAll('.fixed.inset-0.bg-black.bg-opacity-50').forEach(m=>{
      const inner = m.querySelector('.bg-white');
      if(inner) inner.classList.add('modal-scale');
    });
  }

  /* 7. Leaderboard observer: add slide-in-item class with stagger */
  function observeLeaderboard(){
    const modal = document.getElementById('leaderboard-modal');
    if(!modal) return;
    const list = document.getElementById('leaderboard-list');
    const observer = new MutationObserver(()=>{
      const items = Array.from(list.children);
      items.forEach((it, idx)=>{
        it.classList.add('slide-in-item');
        it.style.animationDelay = (idx*60)+'ms';
      });
    });
    observer.observe(list, {childList:true, subtree:false});
  }

  /* 4. Circular timer: inject a circular SVG near the existing timer bar and poll quizApp.timeLeft */
  function enhanceTimerUI(){
    const timerContainer = document.getElementById('timer-text')?.parentElement;
    if(!timerContainer) return;

    const wrap = document.createElement('div');
    wrap.className = 'timer-wrap';
    const circle = document.createElement('div');
    circle.className = 'circular-timer';
    circle.innerHTML = `
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <circle class="timer-track" cx="50" cy="50" r="40" fill="none"></circle>
        <circle class="timer-progress" cx="50" cy="50" r="40" fill="none" stroke-dasharray="251.2" stroke-dashoffset="0"></circle>
      </svg>
      <div class="timer-text">15s</div>
    `;
    wrap.appendChild(circle);
    // move existing timer into wrap
    const timerBox = document.getElementById('timer-text').parentElement;
    timerBox.parentElement.insertBefore(wrap, timerBox);
    wrap.appendChild(timerBox);

    // Poll quizApp.timeLeft and update circle
    setInterval(()=>{
      try{
        if(window.quizApp && typeof window.quizApp.timeLeft === 'number'){
          const t = Math.max(0, Math.min(15, window.quizApp.timeLeft));
          const pct = t/15;
          const circleEl = circle.querySelector('.timer-progress');
          const length = 2*Math.PI*40; // r=40
          circleEl.style.strokeDashoffset = String((1 - pct) * length);
          const text = circle.querySelector('.timer-text');
          if(text) text.textContent = `${t}s`;
          // color change when low
          if(t <= 5) circleEl.style.stroke = '#ef4444'; else circleEl.style.stroke = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#6366f1';
        }
      }catch(e){}
    }, 120);
  }

  /* 6b / 3b Observe summary screen to trigger confetti and animations */
  function observeSummaryForConfetti(){
    const summary = document.getElementById('summary-screen');
    const observer = new MutationObserver(()=>{
      const visible = !summary.classList.contains('hidden');
      if(visible){
        try{
          const percentEl = document.getElementById('score-percentage');
          const percent = parseInt((percentEl?.textContent||'0').replace('%',''))||0;
          if(percent === 100) launchConfetti();
        }catch(e){}
      }
    });
    observer.observe(summary, {attributes:true, attributeFilter:['class']});
  }

  /* When leaderboard modal opens, animate its children (sometimes added dynamically) */
  document.addEventListener('click', (e)=>{
    if(e.target.closest('#leaderboard-modal') || e.target.closest('[onclick="showLeaderboard()"]')){
      const list = document.getElementById('leaderboard-list');
      if(list) setTimeout(()=>{
        Array.from(list.children).forEach((it, i)=>{ it.classList.add('slide-in-item'); it.style.animationDelay = (i*60)+'ms'; });
      }, 140);
    }
  });

})();
