const fs = require('fs');
const path = require('path');

const arenaJsPath = path.join(__dirname, '..', 'public', 'js', 'arena.js');
let code = fs.readFileSync(arenaJsPath, 'utf8');

// 1. Update state object
const oldState = `  state: {
    data: null,
    pollTimer: null,
    localTimer: null,
    timeRemaining: 0,
    lockedAnswer: null,
    lastQuestionIndex: -1,
    audioCtx: null
  },`;

const newState = `  state: {
    data: null,
    pollTimer: null,
    localTimer: null,
    timeRemaining: 0,
    lockedAnswer: null,
    lastQuestionIndex: -1,
    lastSessionId: null,
    lastStatus: null,
    audioCtx: null
  },`;

if (code.includes(oldState)) {
  code = code.replace(oldState, newState);
  console.log('✅ Updated state object');
} else {
  console.log('⚠️ oldState not exact match, checking normalized');
  code = code.replace(/lastQuestionIndex:\s*-1,\s*audioCtx:\s*null/, `lastQuestionIndex: -1,\n    lastSessionId: null,\n    lastStatus: null,\n    audioCtx: null`);
}

// 2. Update fetchAndRender and updateActiveClockOnly
const fetchAndRenderRegex = /async fetchAndRender\(\)\s*\{[\s\S]*?render\(\)\s*\{/;

const newFetchAndRender = `async fetchAndRender() {
    try {
      const data = await API.getArenaCurrent();
      if (!data || !data.hasSession) {
        this.state.data = data;
        this.render();
        this.updateNavBadge();
        return;
      }

      // Check if session changed or status changed
      const isNewSession = (this.state.lastSessionId && this.state.lastSessionId !== data.sessionId);
      const isStatusChanged = (this.state.lastStatus && this.state.lastStatus !== data.status);

      if (isNewSession || isStatusChanged) {
        this.state.lastQuestionIndex = -1;
        this.state.lockedAnswer = null;
        this.state.lastSessionId = data.sessionId;
        this.state.lastStatus = data.status;
      } else {
        this.state.lastSessionId = data.sessionId;
        this.state.lastStatus = data.status;
      }

      // JITTER & REVERSE PROTECTION:
      // If we are currently showing an ACTIVE question in the same session:
      if (data.status === 'ACTIVE' && data.currentQuestion) {
        // Reject stale out-of-order packets with a lower index
        if (this.state.lastQuestionIndex !== -1 && data.currentQuestion.index < this.state.lastQuestionIndex) {
          return;
        }

        // SMOOTH CLOCK UPDATE:
        // If we are already on this exact question, ONLY update timer and stats without replacing DOM!
        if (data.currentQuestion.index === this.state.lastQuestionIndex) {
          this.state.data = data;
          this.updateActiveClockOnly(data);
          this.updateNavBadge();
          return;
        }
      }

      this.state.data = data;
      this.render();
      this.updateNavBadge();
    } catch (err) {
      console.error('Arena poll error:', err.message);
    }
  },

  updateActiveClockOnly(data) {
    const elapsedSec = Math.floor((data.serverTime - data.currentQuestionStartedAt) / 1000);
    const totalSec = data.secondsPerQuestion || 40;
    const remainingSec = Math.max(0, totalSec - elapsedSec);

    const clockEl = document.querySelector('.arena-clock');
    if (clockEl) {
      clockEl.innerText = \`⏱️ \${remainingSec}s\`;
      if (remainingSec <= 10) {
        clockEl.classList.add('urgent');
      } else {
        clockEl.classList.remove('urgent');
      }
    }

    if (remainingSec <= 5 && remainingSec > 0) {
      this.playSound('tick');
    }

    // Sync locked state if confirmed by server
    if (data.myStatus && data.myStatus.answered && (!this.state.lockedAnswer || this.state.lockedAnswer !== data.myStatus.selectedAnswer)) {
      this.state.lockedAnswer = data.myStatus.selectedAnswer;
      const buttons = document.querySelectorAll('.arena-option-btn');
      buttons.forEach(btn => {
        btn.disabled = true;
        const keySpan = btn.querySelector('.opt-badge');
        if (keySpan && keySpan.innerText.trim() === this.state.lockedAnswer) {
          btn.classList.add('locked');
        }
      });
      const statusMsg = document.getElementById('arena-answer-status-msg');
      if (statusMsg) {
        statusMsg.innerHTML = \`
          <div style="margin-top:20px; padding:12px 16px; background:var(--green-soft); border:1px solid rgba(54,147,84,0.3); border-radius:10px; color:var(--green); font-weight:700; text-align:center;">
            ✓ Your answer (\${this.state.lockedAnswer}) is locked in! Waiting for round countdown...
          </div>
        \`;
      }
    }

    const heatmapEl = document.getElementById('arena-live-heatmap');
    if (heatmapEl && data.adminHeatmap) {
      heatmapEl.innerHTML = \`
        <span style="font-weight:700; color:var(--navy);">Live Responses (\${data.adminHeatmap.answered} of \${data.adminHeatmap.total}):</span>
        <span><strong>A:</strong> \${data.adminHeatmap.A}</span>
        <span><strong>B:</strong> \${data.adminHeatmap.B}</span>
        <span><strong>C:</strong> \${data.adminHeatmap.C}</span>
        <span><strong>D:</strong> \${data.adminHeatmap.D}</span>
      \`;
    }
  },

  render() {`;

code = code.replace(fetchAndRenderRegex, newFetchAndRender);

fs.writeFileSync(arenaJsPath, code, 'utf8');
console.log('✅ arena.js updated successfully!');
