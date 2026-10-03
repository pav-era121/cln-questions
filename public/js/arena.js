// public/js/arena.js — Client-Side Controller for Sunday Live Arena
const arena = {
  state: {
    data: null,
    pollTimer: null,
    localTimer: null,
    timeRemaining: 0,
    lockedAnswer: null,
    lastQuestionIndex: -1,
    audioCtx: null
  },

  // Synthesize sound effects using Web Audio API (Zero external audio file dependencies!)
  playSound(type) {
    try {
      if (!this.state.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.state.audioCtx = new AudioContext();
      }
      const ctx = this.state.audioCtx;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      if (type === 'tick') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'chime') {
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.12, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.4);
        });
      } else if (type === 'lock') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'fanfare') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);
          gain.gain.setValueAtTime(0.2, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.65);
        });
      }
    } catch (e) {
      // Audio autoplay policy safe ignore
    }
  },

  async init() {
    this.updateNavBadge();
  },

  async updateNavBadge() {
    try {
      const data = await API.getArenaCurrent();
      const badge = document.getElementById('nav-arena-badge');
      if (!badge) return;

      if (!data || !data.hasSession) {
        badge.innerText = 'SUN 8PM';
        badge.style.background = 'rgba(255,255,255,0.2)';
        return;
      }

      if (data.status === 'ACTIVE') {
        badge.innerText = 'LIVE NOW';
        badge.style.background = '#e63946';
        badge.classList.add('pulse-red');
      } else if (data.status === 'LOBBY') {
        badge.innerText = 'LOBBY OPEN';
        badge.style.background = '#10b981';
      } else if (data.status === 'ENDED') {
        badge.innerText = 'RESULTS';
        badge.style.background = '#2563eb';
      } else {
        badge.innerText = 'SUN 8PM';
        badge.style.background = 'rgba(255,255,255,0.25)';
      }
    } catch (err) {
      // Quiet fail
    }
  },

  startPolling() {
    this.stopPolling();
    this.fetchAndRender();
    this.state.pollTimer = setInterval(() => {
      this.fetchAndRender();
    }, 1500);
  },

  stopPolling() {
    if (this.state.pollTimer) {
      clearInterval(this.state.pollTimer);
      this.state.pollTimer = null;
    }
    if (this.state.localTimer) {
      clearInterval(this.state.localTimer);
      this.state.localTimer = null;
    }
  },

  async fetchAndRender() {
    try {
      const data = await API.getArenaCurrent();
      this.state.data = data;
      this.render();
      this.updateNavBadge();
    } catch (err) {
      console.error('Arena poll error:', err.message);
    }
  },

  render() {
    const container = document.getElementById('arena-view-container');
    if (!container) return;

    const data = this.state.data;
    if (!data || !data.hasSession) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:48px 24px;">
          <span style="font-size:3rem; margin-bottom:12px; display:inline-block;">🏆</span>
          <h2 style="font-size:1.4rem; color:var(--navy); font-weight:800; margin-bottom:8px;">No Active Arena Session</h2>
          <p style="color:var(--text-muted); max-width:450px; margin:0 auto 20px;">
            The next official Sunday Arena will be announced soon. Check back before Sunday 8:00 PM!
          </p>
          ${app.state.user && app.state.user.email === 'admin@cln.edu.et' ? `
            <button class="btn btn-primary" onclick="arena.adminLaunchTestArena()">🚀 Launch Instant Test Session</button>
          ` : ''}
        </div>
      `;
      return;
    }

    const isAdmin = app.state.user && app.state.user.email === 'admin@cln.edu.et';
    let html = '';

    // 1. Admin Supervisor Floating Bar
    if (isAdmin) {
      html += this.renderSupervisorDock(data);
    }

    // 2. Render View State Based on Status
    if (data.status === 'SCHEDULED') {
      html += this.renderScheduledState(data);
    } else if (data.status === 'LOBBY') {
      html += this.renderLobbyState(data);
    } else if (data.status === 'ACTIVE') {
      html += this.renderActiveState(data);
    } else if (data.status === 'ENDED') {
      html += this.renderEndedState(data);
    }

    container.innerHTML = html;
  },

  // SUPERVISOR CONTROLLER (ADMIN ONLY)
  renderSupervisorDock(data) {
    return `
      <div class="arena-supervisor-dock">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <span style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:6px;">
              Admin Mission Control
            </span>
            <span style="font-size:0.95rem; font-weight:700; color:var(--navy); margin-left:8px;">
              Session: ${app.escapeHtml(data.title)} [Status: <strong style="color:#2563eb;">${data.status}</strong>]
            </span>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${data.status === 'SCHEDULED' ? `
              <button class="btn btn-sm btn-primary" onclick="arena.adminSetStatus('LOBBY')">🟢 Open Lobby</button>
              <button class="btn btn-sm btn-success" style="background:#10b981; color:#fff;" onclick="arena.adminSetStatus('ACTIVE')">▶️ Start Arena Now</button>
            ` : ''}

            ${data.status === 'LOBBY' ? `
              <button class="btn btn-sm btn-success" style="background:#10b981; color:#fff;" onclick="arena.adminSetStatus('ACTIVE')">▶️ Start First Question</button>
              <button class="btn btn-sm btn-secondary" onclick="arena.adminSetStatus('SCHEDULED')">Back to Scheduled</button>
            ` : ''}

            ${data.status === 'ACTIVE' ? `
              <button class="btn btn-sm btn-primary" onclick="arena.adminNextQuestion()">⏭️ Next Question (${data.currentQuestionIndex + 1}/${data.totalQuestions})</button>
              <button class="btn btn-sm btn-danger" onclick="arena.adminSetStatus('ENDED')">🏁 End & Reveal Podium</button>
            ` : ''}

            ${data.status === 'ENDED' ? `
              <button class="btn btn-sm btn-secondary" onclick="arena.adminLaunchTestArena()">🔄 Create New Test Arena</button>
            ` : ''}

            <button class="btn btn-sm btn-outline" onclick="arena.adminLaunchTestArena()" title="Re-randomizes a 5-question test contest">🚀 Quick 5-Q Test</button>
          </div>
        </div>

        ${data.adminHeatmap ? `
          <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--border); display:flex; align-items:center; gap:16px; font-size:0.85rem;">
            <span style="font-weight:700; color:var(--navy);">Live Responses (${data.adminHeatmap.answered} of ${data.adminHeatmap.total}):</span>
            <span><strong>A:</strong> ${data.adminHeatmap.A}</span>
            <span><strong>B:</strong> ${data.adminHeatmap.B}</span>
            <span><strong>C:</strong> ${data.adminHeatmap.C}</span>
            <span><strong>D:</strong> ${data.adminHeatmap.D}</span>
          </div>
        ` : ''}
      </div>
    `;
  },

  // STATE 1: SCHEDULED
  renderScheduledState(data) {
    const scheduledDate = new Date(data.scheduledAt);
    const dateFormatted = scheduledDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    setTimeout(() => this.startCountdownTimer(data.scheduledAt), 50);

    return `
      <div class="arena-hero-card">
        <div class="arena-badge-live" style="background:rgba(255,255,255,0.2);">NEXT COMPETITION</div>
        <h1 style="font-size:2rem; font-weight:900; margin:14px 0 8px;">${app.escapeHtml(data.title)}</h1>
        <p style="font-size:1rem; opacity:0.85; max-width:600px; margin:0 auto;">
          Synchronized Rapid-Fire Championship. Compete live against classmates nationwide at the exact same minute!
        </p>

        <div class="arena-countdown-grid" id="arena-countdown-grid">
          <div class="arena-countdown-unit"><div class="arena-countdown-num" id="cd-days">00</div><div class="arena-countdown-label">Days</div></div>
          <div class="arena-countdown-unit"><div class="arena-countdown-num" id="cd-hours">00</div><div class="arena-countdown-label">Hours</div></div>
          <div class="arena-countdown-unit"><div class="arena-countdown-num" id="cd-mins">00</div><div class="arena-countdown-label">Minutes</div></div>
          <div class="arena-countdown-unit"><div class="arena-countdown-num" id="cd-secs">00</div><div class="arena-countdown-label">Seconds</div></div>
        </div>

        <div style="font-size:0.95rem; font-weight:600; color:#ffd166; margin-bottom:24px;">
          🗓️ Event Time: ${dateFormatted} (East Africa Time)
        </div>

        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-lg btn-primary" style="background:#ffd166; color:var(--navy); font-weight:800; border:none;" onclick="arena.checkInLobby('${data.sessionId}')">
            🔔 Check In / Ready Up
          </button>
        </div>
      </div>

      <!-- RULES & PREVIEW CARD -->
      <div class="grid-3" style="gap:16px;">
        <div class="card" style="padding:20px;">
          <div style="font-size:1.8rem; margin-bottom:8px;">⚡</div>
          <h3 style="font-size:1.1rem; font-weight:700; color:var(--navy); margin-bottom:6px;">Synchronized Rapid-Fire</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);">
            ${data.totalQuestions} questions, ${data.secondsPerQuestion} seconds each. Everyone sees the exact same question at the exact same second.
          </p>
        </div>

        <div class="card" style="padding:20px;">
          <div style="font-size:1.8rem; margin-bottom:8px;">🎯</div>
          <h3 style="font-size:1.1rem; font-weight:700; color:var(--navy); margin-bottom:6px;">Score + Speed Ranking</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);">
            Highest accuracy ranks first. Fastest response time serves as the tie-breaker for identical scores.
          </p>
        </div>

        <div class="card" style="padding:20px;">
          <div style="font-size:1.8rem; margin-bottom:8px;">👑</div>
          <h3 style="font-size:1.1rem; font-weight:700; color:var(--navy); margin-bottom:6px;">Grand Podium Reveal</h3>
          <p style="font-size:0.88rem; color:var(--text-muted);">
            Ranks are kept secret during the contest to maintain suspense. The animated top-3 podium is revealed immediately upon finish!
          </p>
        </div>
      </div>
    `;
  },

  startCountdownTimer(targetIso) {
    if (this.state.localTimer) clearInterval(this.state.localTimer);

    const update = () => {
      const now = Date.now();
      const target = new Date(targetIso).getTime();
      const diff = Math.max(0, target - now);

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      const elD = document.getElementById('cd-days');
      const elH = document.getElementById('cd-hours');
      const elM = document.getElementById('cd-mins');
      const elS = document.getElementById('cd-secs');

      if (elD) elD.innerText = String(d).padStart(2, '0');
      if (elH) elH.innerText = String(h).padStart(2, '0');
      if (elM) elM.innerText = String(m).padStart(2, '0');
      if (elS) elS.innerText = String(s).padStart(2, '0');
    };

    update();
    this.state.localTimer = setInterval(update, 1000);
  },

  // STATE 2: LOBBY
  renderLobbyState(data) {
    const isJoined = data.isJoined;

    return `
      <div class="arena-hero-card">
        <div class="arena-badge-live" style="background:#10b981;">🟢 PRE-FLIGHT LOBBY OPEN</div>
        <h1 style="font-size:2.1rem; font-weight:900; margin:16px 0 8px;">${app.escapeHtml(data.title)}</h1>
        <p style="font-size:1rem; opacity:0.9; max-width:550px; margin:0 auto 20px;">
          The lobby is now open. Contest will begin promptly when the administrator fires the start cue!
        </p>

        <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.15); padding:8px 20px; border-radius:24px; font-weight:700; margin-bottom:24px;">
          <span>👥</span>
          <span>${data.participantCount} Students Checked In</span>
        </div>

        <div>
          ${!isJoined ? `
            <button class="btn btn-lg" style="background:#ffd166; color:var(--navy); font-weight:800; padding:14px 32px; border:none;" onclick="arena.checkInLobby('${data.sessionId}')">
              🚀 Enter Lobby & Ready Up
            </button>
          ` : `
            <div style="background:#10b981; color:#fff; display:inline-flex; align-items:center; gap:8px; padding:12px 24px; border-radius:30px; font-weight:800;">
              <span>✓</span> You Are Checked In! Waiting for Question 1...
            </div>
          `}
        </div>

        <div style="margin-top:28px;">
          <button class="btn btn-sm btn-secondary" style="color:#fff; border-color:rgba(255,255,255,0.3);" onclick="arena.playSound('chime')">
            🔊 Test Audio Cue
          </button>
        </div>
      </div>
    `;
  },

  // STATE 3: ACTIVE SYNCHRONIZED QUESTION
  renderActiveState(data) {
    const q = data.currentQuestion;
    if (!q) {
      return `
        <div class="card" style="text-align:center; padding:40px;">
          <h3>⏳ Preparing next question...</h3>
        </div>
      `;
    }

    // Play chime on question change
    if (this.state.lastQuestionIndex !== q.index) {
      this.state.lastQuestionIndex = q.index;
      this.state.lockedAnswer = data.myStatus && data.myStatus.answered ? data.myStatus.selectedAnswer : null;
      this.playSound('chime');
    }

    // Calculate synchronized clock
    const elapsedSec = Math.floor((data.serverTime - data.currentQuestionStartedAt) / 1000);
    const totalSec = data.secondsPerQuestion || 40;
    const remainingSec = Math.max(0, totalSec - elapsedSec);

    // Audio cue on last 5 seconds
    if (remainingSec <= 5 && remainingSec > 0) {
      this.playSound('tick');
    }

    const hasLocked = (this.state.lockedAnswer !== null) || (data.myStatus && data.myStatus.answered);
    const lockedChoice = this.state.lockedAnswer || (data.myStatus ? data.myStatus.selectedAnswer : null);

    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ].filter(o => o.text && o.text.trim() !== '');

    return `
      <!-- ARENA HUD -->
      <div class="arena-hud">
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="arena-badge-live">LIVE ROUND</span>
          <span style="font-weight:800; color:var(--navy); font-size:1.05rem;">
            Question ${q.index + 1} of ${q.totalQuestions}
          </span>
          <span class="difficulty-badge difficulty-${(q.difficulty || 'medium').toLowerCase()}" style="font-size:0.75rem;">
            ${q.difficulty || 'Medium'}
          </span>
        </div>

        <div style="display:flex; align-items:center; gap:16px;">
          <div class="arena-clock ${remainingSec <= 10 ? 'urgent' : ''}">
            ⏱️ ${remainingSec}s
          </div>
        </div>
      </div>

      <!-- QUESTION DISPLAY CARD -->
      <div class="card" style="padding:28px 24px; margin-bottom:20px; box-shadow:var(--shadow-lg);">
        <h2 style="font-size:1.25rem; font-weight:800; color:var(--navy); line-height:1.45; margin-bottom:20px;">
          ${app.escapeHtml(q.question_text)}
        </h2>

        ${q.image_url ? `
          <div style="margin:16px 0; text-align:center;">
            <img src="${q.image_url}" alt="Question Image" style="max-width:100%; max-height:300px; border-radius:8px;">
          </div>
        ` : ''}

        <!-- OPTIONS GRID -->
        <div style="display:grid; grid-template-columns:1fr; gap:12px; margin-top:20px;">
          ${options.map(opt => `
            <button 
              type="button"
              class="arena-option-btn ${lockedChoice === opt.key ? 'locked' : ''}" 
              ${hasLocked ? 'disabled' : ''}
              onclick="arena.handleSelectOption('${data.sessionId}', ${q.index}, '${opt.key}')"
            >
              <span class="opt-badge">${opt.key}</span>
              <span style="font-weight:600; line-height:1.4; flex:1;">${app.escapeHtml(opt.text)}</span>
              ${lockedChoice === opt.key ? `<span style="font-weight:800; color:var(--green); font-size:1.1rem;">🔒 Locked</span>` : ''}
            </button>
          `).join('')}
        </div>

        ${hasLocked ? `
          <div style="margin-top:20px; padding:12px 16px; background:var(--green-soft); border:1px solid rgba(54,147,84,0.3); border-radius:10px; color:var(--green); font-weight:700; text-align:center;">
            ✓ Your answer is locked in! Waiting for round countdown...
          </div>
        ` : `
          <div style="margin-top:16px; text-align:center; font-size:0.85rem; color:var(--text-muted);">
            ⚡ Click your answer as fast as you can. Speed determines tie-breakers!
          </div>
        `}
      </div>
    `;
  },

  async handleSelectOption(sessionId, questionIndex, answerKey) {
    if (this.state.lockedAnswer) return;

    this.state.lockedAnswer = answerKey;
    this.playSound('lock');
    this.render();

    try {
      await API.submitArenaAnswer(sessionId, questionIndex, answerKey);
    } catch (err) {
      console.warn('Answer submit error:', err.message);
    }
  },

  // STATE 4: ENDED & GRAND PODIUM REVEAL
  renderEndedState(data) {
    setTimeout(() => this.playSound('fanfare'), 300);

    const leaderboard = data.leaderboard || [];
    const top1 = leaderboard[0] || null;
    const top2 = leaderboard[1] || null;
    const top3 = leaderboard[2] || null;

    const myRank = data.myStatus ? data.myStatus.myRank : null;
    const myScore = data.myStatus ? data.myStatus.myScore : 0;
    const myTime = data.myStatus ? data.myStatus.myTotalTimeFormatted : '0s';

    return `
      <div class="arena-hero-card" style="background:linear-gradient(135deg, #1e3a8a 0%, #312e81 100%);">
        <div class="arena-badge-live" style="background:#ffd166; color:var(--navy);">CHAMPIONSHIP COMPLETE</div>
        <h1 style="font-size:2.2rem; font-weight:900; margin:14px 0 6px;">🏆 Grand Podium & Results</h1>
        <p style="font-size:0.95rem; opacity:0.85; max-width:500px; margin:0 auto;">
          The results are locked! Here are the champions of this week's Sunday Arena:
        </p>

        <!-- 3D OLYMPIC PODIUM -->
        <div class="arena-podium-wrap">
          <!-- 2nd Place (Left) -->
          <div class="podium-col">
            ${top2 ? `
              <div style="font-size:1.8rem; margin-bottom:4px;">🥈</div>
              <div class="podium-name">${app.escapeHtml(top2.userName)}</div>
              <div class="podium-stat">${top2.totalScore}/${data.totalQuestions} • ${top2.totalTimeFormatted}</div>
              <div class="podium-pedestal podium-2">
                <span style="font-size:2rem; font-weight:900;">2</span>
              </div>
            ` : '<div style="opacity:0.5; font-size:0.8rem;">--</div>'}
          </div>

          <!-- 1st Place (Center / Tallest) -->
          <div class="podium-col">
            ${top1 ? `
              <div style="font-size:2.4rem; margin-bottom:2px; animation:bounce 1s infinite alternate;">👑</div>
              <div class="podium-name" style="font-size:1.05rem; color:#ffd166;">${app.escapeHtml(top1.userName)}</div>
              <div class="podium-stat" style="color:#fef08a; font-weight:700;">${top1.totalScore}/${data.totalQuestions} • ${top1.totalTimeFormatted}</div>
              <div class="podium-pedestal podium-1">
                <span style="font-size:2.4rem; font-weight:900;">1</span>
                <span style="font-size:0.75rem; letter-spacing:1px; font-weight:800;">CHAMPION</span>
              </div>
            ` : '<div style="opacity:0.5; font-size:0.8rem;">--</div>'}
          </div>

          <!-- 3rd Place (Right) -->
          <div class="podium-col">
            ${top3 ? `
              <div style="font-size:1.8rem; margin-bottom:4px;">🥉</div>
              <div class="podium-name">${app.escapeHtml(top3.userName)}</div>
              <div class="podium-stat">${top3.totalScore}/${data.totalQuestions} • ${top3.totalTimeFormatted}</div>
              <div class="podium-pedestal podium-3">
                <span style="font-size:1.8rem; font-weight:900;">3</span>
              </div>
            ` : '<div style="opacity:0.5; font-size:0.8rem;">--</div>'}
          </div>
        </div>

        <!-- USER'S PERSONAL FINISH BADGE -->
        ${myRank ? `
          <div style="background:rgba(255,255,255,0.15); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.25); border-radius:14px; padding:16px 24px; max-width:480px; margin:0 auto; text-align:center;">
            <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; color:#ffd166; font-weight:800;">Your Official Standing</div>
            <div style="font-size:1.8rem; font-weight:900; margin:4px 0;">Rank #${myRank} of ${leaderboard.length}</div>
            <div style="font-size:0.9rem; opacity:0.9;">Score: <strong>${myScore}/${data.totalQuestions}</strong> • Total Response Time: <strong>${myTime}</strong></div>
          </div>
        ` : ''}
      </div>

      <!-- FULL LEADERBOARD TABLE -->
      <div class="card" style="padding:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="font-size:1.2rem; font-weight:800; color:var(--navy);">Complete Official Standings</h3>
            <p style="font-size:0.82rem; color:var(--text-muted); margin:0;">Ranked by Highest Score, with Fastest Cumulative Time as Tie-Breaker.</p>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="data-table" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid var(--border); text-align:left;">
                <th style="padding:10px 12px; font-size:0.82rem; color:var(--text-muted);">RANK</th>
                <th style="padding:10px 12px; font-size:0.82rem; color:var(--text-muted);">STUDENT</th>
                <th style="padding:10px 12px; font-size:0.82rem; color:var(--text-muted); text-align:center;">SCORE</th>
                <th style="padding:10px 12px; font-size:0.82rem; color:var(--text-muted); text-align:center;">TOTAL TIME</th>
                <th style="padding:10px 12px; font-size:0.82rem; color:var(--text-muted); text-align:right;">XP PRIZE</th>
              </tr>
            </thead>
            <tbody>
              ${leaderboard.map(row => {
                const isMe = app.state.user && app.state.user.id === row.userId;
                let medal = `#${row.rank}`;
                if (row.rank === 1) medal = '🥇 #1';
                else if (row.rank === 2) medal = '🥈 #2';
                else if (row.rank === 3) medal = '🥉 #3';

                let xp = 50 + (row.totalScore * 10);
                if (row.rank === 1) xp += 150;
                else if (row.rank === 2) xp += 75;
                else if (row.rank === 3) xp += 40;

                return `
                  <tr style="border-bottom:1px solid var(--border); ${isMe ? 'background:var(--blue-soft); font-weight:700;' : ''}">
                    <td style="padding:12px; font-weight:800; color:var(--navy);">${medal}</td>
                    <td style="padding:12px;">
                      ${app.escapeHtml(row.userName)} ${isMe ? '<span style="font-size:0.75rem; color:var(--blue);">(You)</span>' : ''}
                    </td>
                    <td style="padding:12px; text-align:center; font-weight:700; color:var(--blue);">
                      ${row.totalScore} / ${data.totalQuestions}
                    </td>
                    <td style="padding:12px; text-align:center; font-variant-numeric:tabular-nums; color:var(--text-muted);">
                      ${row.totalTimeFormatted}
                    </td>
                    <td style="padding:12px; text-align:right; font-weight:800; color:var(--green);">
                      +${xp} XP
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async checkInLobby(sessionId) {
    if (!app.state.user) {
      alert('Please log in or create an account to enter the Sunday Arena.');
      app.showView('login');
      return;
    }

    try {
      await API.joinArena(sessionId);
      this.playSound('chime');
      await this.fetchAndRender();
    } catch (err) {
      alert('Could not join lobby: ' + err.message);
    }
  },

  // ADMIN ACTION HANDLERS
  async adminSetStatus(status) {
    try {
      await API.adminArenaStatus({ status });
      await this.fetchAndRender();
    } catch (err) {
      alert('Admin action failed: ' + err.message);
    }
  },

  async adminNextQuestion() {
    try {
      await API.adminArenaStatus({ action: 'NEXT' });
      this.state.lockedAnswer = null;
      await this.fetchAndRender();
    } catch (err) {
      alert('Failed to advance question: ' + err.message);
    }
  },

  async adminLaunchTestArena() {
    if (!confirm('Launch a 5-question test Arena competition right now?')) return;

    try {
      await API.adminArenaCreate({
        title: 'Freshman Arena: Quick Test Battle',
        courseId: null,
        scheduledAt: new Date(Date.now() + 10000).toISOString(),
        secondsPerQuestion: 25,
        questionCount: 5
      });
      // Auto open lobby
      await API.adminArenaStatus({ status: 'LOBBY' });
      alert('Test Arena Created! Lobby is now open.');
      await this.fetchAndRender();
    } catch (err) {
      alert('Could not create test session: ' + err.message);
    }
  }
};
