// Main Application Controller for CLN Questions
const app = {
  state: {
    currentView: 'home',
    user: null,
    courses: [],
    currentCourseId: null,
    currentChapterId: null,
    lastQuizResults: null,
    contentTree: { courses: [], chapters: [], quizzes: [], questions: [] }
  },

  async init() {
    this.setupEventListeners();
    this.checkAuth();
    await this.loadCourses();
    if (typeof arena !== 'undefined' && arena.init) {
      arena.init();
    }
    this.showView('home');
  },

  setupEventListeners() {
    window.addEventListener('cln:user-suspended', (e) => {
      this.showView('suspended');
    });
  },

  checkAuth() {
    const user = API.getUser();
    this.state.user = user;
    this.renderNavUserArea();
  },

  renderNavUserArea() {
    const area = document.getElementById('nav-user-area');
    const user = this.state.user;

    const studentNavs = document.querySelectorAll('.student-only');
    const adminNavs = document.querySelectorAll('.admin-only');

    if (user) {
      const isAdmin = user.email === 'admin@cln.edu.et';

      studentNavs.forEach(el => el.style.display = isAdmin ? 'none' : 'block');
      adminNavs.forEach(el => el.style.display = isAdmin ? 'block' : 'none');

      area.innerHTML = `
        <div class="user-pill">
          <span style="font-weight:700; font-size:0.9rem;">${user.fullName} ${isAdmin ? '(Admin)' : ''}</span>
          ${!isAdmin ? `<span class="xp-badge">⚡ ${user.totalXp || 0} XP</span>` : ''}
          <button class="btn btn-sm btn-secondary" style="color:#fff; border-color:rgba(255,255,255,0.4); padding:4px 10px;" onclick="app.handleLogout()">Log Out</button>
        </div>
      `;
    } else {
      studentNavs.forEach(el => el.style.display = 'none');
      adminNavs.forEach(el => el.style.display = 'none');

      area.innerHTML = `
        <div style="display:flex; gap:10px;">
          <button class="btn btn-sm btn-secondary" style="color:#fff; border-color:rgba(255,255,255,0.4);" onclick="app.showView('login')">Log In</button>
          <button class="btn btn-sm btn-primary" onclick="app.showView('register')">Register</button>
        </div>
      `;
    }
  },

  showView(viewName) {
    this.state.currentView = viewName;

    // Hide all sections
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');

    // Update active nav links
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) {
      targetSection.style.display = 'block';
    }

    // Stop arena polling if navigating away
    if (typeof arena !== 'undefined' && arena.stopPolling) {
      if (viewName !== 'arena') {
        arena.stopPolling();
      }
    }

    // Dismiss arena drawer if open and toggle trigger visibility
    if (typeof arena !== 'undefined' && arena.toggleSidebar) {
      arena.toggleSidebar(false);
    }
    const sideTrigger = document.getElementById('arena-sidebar-trigger');
    if (sideTrigger) {
      sideTrigger.style.display = viewName === 'arena' ? 'none' : 'flex';
    }

    // View specific logic
    if (viewName === 'home') {
      this.renderHomeCourses();
      this.loadCourses().then(() => this.renderHomeCourses());
    } else if (viewName === 'courses') {
      this.renderCoursesList();
      this.loadCourses().then(() => this.renderCoursesList());
    } else if (viewName === 'arena') {
      if (typeof arena !== 'undefined' && arena.startPolling) {
        arena.startPolling();
      }
    } else if (viewName === 'dashboard') {
      this.loadStudentDashboard();
    } else if (viewName === 'history') {
      this.loadStudentHistory();
    } else if (viewName === 'admin') {
      this.loadAdminPanel();
    }

    window.scrollTo(0, 0);
  },

  handleStartPracticingFree() {
    if (this.state.user) {
      if (this.state.user.email === 'admin@cln.edu.et') {
        this.showView('admin');
      } else {
        this.showView('courses');
      }
    } else {
      this.showView('register');
    }
  },

  // AUTH HANDLERS
  async handleRegister(e) {
    e.preventDefault();
    const errorEl = document.getElementById('reg-error');
    errorEl.style.display = 'none';

    const fullName = document.getElementById('reg-fullname').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const marketingConsent = document.getElementById('reg-marketing').checked;

    try {
      const res = await API.register(fullName, email, phone, password, marketingConsent);
      this.state.user = res.user;
      this.renderNavUserArea();
      this.showView('courses');
    } catch (err) {
      errorEl.innerText = err.message;
      errorEl.style.display = 'block';
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    const loginIdentifier = document.getElementById('login-identifier').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await API.login(loginIdentifier, password);
      this.state.user = res.user;
      this.renderNavUserArea();

      if (res.user.email === 'admin@cln.edu.et') {
        this.showView('admin');
      } else {
        this.showView('dashboard');
      }
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('suspend')) {
        errorEl.innerHTML = `${err.message}<br><a href="https://t.me/CLN_AAU_Admin" target="_blank" rel="noopener noreferrer" style="color:#229ED9; font-weight:700; text-decoration:underline; display:inline-block; margin-top:6px;">Contact Admin @CLN_AAU_Admin on Telegram ✈️</a>`;
      } else {
        errorEl.innerText = err.message;
      }
      errorEl.style.display = 'block';
    }
  },

  handleLogout() {
    API.clearToken();
    this.state.user = null;
    this.renderNavUserArea();
    this.showView('home');
  },

  // COURSES RENDERERS
  async loadCourses() {
    try {
      const data = await API.getCourses();
      this.state.courses = data.courses || [];
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    }
  },

  renderHomeCourses() {
    const grid = document.getElementById('home-courses-grid');
    if (!grid) return;

    const featured = this.state.courses.slice(0, 6);

    grid.innerHTML = featured.map(c => {
      const chCount = Number(c.chapter_count ?? 0);
      const chLabel = chCount <= 1 ? `${chCount} Chapter` : `${chCount} Chapters`;
      return `
      <div class="course-card">
        <img class="course-img" src="${c.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'}" alt="${c.name}">
        <div class="course-body">
          <h3 class="course-title">${c.name}</h3>
          <p class="course-desc">${c.description}</p>
          <div class="course-meta">
            <span>📚 ${chLabel}</span>
            <button class="btn btn-primary btn-sm" onclick="app.showCourseDetail('${c.id}')">Practice →</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
  },

  renderCoursesList() {
    const grid = document.getElementById('courses-list-grid');
    if (!grid) return;

    grid.innerHTML = this.state.courses.map(c => {
      const chCount = Number(c.chapter_count ?? 0);
      const chLabel = chCount <= 1 ? `${chCount} Chapter` : `${chCount} Chapters`;
      return `
      <div class="course-card">
        <img class="course-img" src="${c.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'}" alt="${c.name}">
        <div class="course-body">
          <h3 class="course-title">${c.name}</h3>
          <p class="course-desc">${c.description}</p>
          <div class="course-meta">
            <span>📚 ${chLabel}</span>
            <button class="btn btn-primary btn-sm" onclick="app.showCourseDetail('${c.id}')">Explore Chapters →</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
  },

  async showCourseDetail(courseId) {
    this.state.currentCourseId = courseId;
    try {
      const data = await API.getCourseDetails(courseId);
      const c = data.course;
      const chapters = data.chapters;

      const headerEl = document.getElementById('course-header-card');
      headerEl.innerHTML = `
        <img src="${c.image_url || ''}" style="width:120px; height:120px; object-fit:cover; border-radius:12px;" alt="${c.name}">
        <div style="flex:1;">
          <span class="brand-badge">FRESHMAN COURSE</span>
          <h2 style="font-size:1.8rem; font-weight:800; margin:6px 0;">${c.name}</h2>
          <p style="opacity:0.9; font-size:0.95rem;">${c.description}</p>
        </div>
      `;

      const gridEl = document.getElementById('chapters-list-grid');
      if (!chapters || chapters.length === 0) {
        gridEl.innerHTML = `
          <div class="card" style="text-align:center; padding:32px 16px; grid-column:1/-1;">
            <p style="color:var(--text-muted); font-size:1rem; margin-bottom:16px;">No chapters have been published for this course yet.</p>
            <button class="btn btn-secondary" onclick="app.showView('courses')">← Back to All Courses</button>
          </div>
        `;
      } else {
        gridEl.innerHTML = chapters.map(ch => `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:0;">
            ${ch.image_url ? `<img src="${ch.image_url}" style="width:68px; height:68px; object-fit:cover; border-radius:8px; border:1px solid var(--border);" alt="${ch.name}">` : ''}
            <div style="flex:1; min-width:200px;">
              <h4 style="font-size:1.1rem; font-weight:700; color:var(--navy);">${ch.name}</h4>
              <p style="color:var(--text-muted); font-size:0.88rem; margin-top:4px;">${ch.description}</p>
            </div>
            <button class="btn btn-primary" onclick="app.showChapterDetail('${ch.id}')">Explore Quizzes →</button>
          </div>
        `).join('');
      }

      this.showView('course-detail');
    } catch (err) {
      alert('Failed to load course details: ' + err.message);
    }
  },

  async showChapterDetail(chapterId) {
    this.state.currentChapterId = chapterId;
    try {
      const data = await API.getChapterDetails(chapterId);
      const ch = data.chapter;
      const quizzes = data.quizzes;

      const container = document.getElementById('chapter-detail-content');
      container.innerHTML = `
        <div class="card" style="margin-bottom:24px; display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
          ${ch.image_url ? `<img src="${ch.image_url}" style="width:80px; height:80px; object-fit:cover; border-radius:10px; border:1px solid var(--border);" alt="${ch.name}">` : ''}
          <div style="flex:1; min-width:220px;">
            <h2 style="font-size:1.5rem; font-weight:800; color:var(--navy);">${ch.name}</h2>
            <p style="color:var(--text-muted); margin-top:6px;">${ch.description}</p>
          </div>
        </div>

        <h3 style="font-size:1.2rem; font-weight:700; color:var(--navy); margin-bottom:16px;">Available Chapter Quizzes</h3>
        ${!quizzes || quizzes.length === 0 ? `
          <div class="card" style="text-align:center; padding:32px 16px;">
            <p style="color:var(--text-muted); font-size:1rem; margin-bottom:16px;">No quizzes have been published for this chapter yet.</p>
            <button class="btn btn-secondary" onclick="app.showCourseDetail('${ch.course_id}')">← Back to Course</button>
          </div>
        ` : quizzes.map(q => `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div style="flex:1; min-width:220px;">
              <h4 style="font-size:1.15rem; font-weight:700; color:var(--navy);">${q.title}</h4>
              <div style="font-size:0.88rem; color:var(--text-muted); margin-top:6px; display:flex; flex-wrap:wrap; gap:8px;">
                <span>⏱️ ${q.time_limit} Min</span> • 
                <span>❓ ${q.question_count} Questions</span> • 
                <span class="brand-badge" style="font-size:0.75rem; padding:2px 6px;">${q.difficulty}</span>
              </div>
            </div>
            <button class="btn btn-success btn-lg" onclick="app.startChapterQuiz('${q.id}')">Take Quiz 🚀</button>
          </div>
        `).join('')}
      `;

      this.showView('chapter-detail');
    } catch (err) {
      alert('Failed to load chapter quizzes: ' + err.message);
    }
  },

  startChapterQuiz(quizId) {
    if (!this.state.user) {
      alert('Please log in or register a student account to take timed practice quizzes.');
      this.showView('login');
      return;
    }
    quizEngine.start(quizId);
  },

  // RESULTS & REVIEW
  showQuizResults(results) {
    this.state.lastQuizResults = results;

    document.getElementById('results-score-main').innerText = `${results.score} / ${results.totalQuestions}`;
    document.getElementById('results-percentage').innerText = `${results.percentage}% Accuracy`;
    document.getElementById('results-xp-earned').innerText = `+${results.xpEarned} XP Earned!`;

    if (this.state.user) {
      this.state.user.totalXp = results.newTotalXp;
      API.setUser(this.state.user);
      this.renderNavUserArea();
    }

    document.getElementById('review-answers-container').style.display = 'none';
    this.showView('results');
  },

  retryCurrentQuiz() {
    if (quizEngine.quiz && quizEngine.quiz.id) {
      quizEngine.start(quizEngine.quiz.id);
    } else {
      this.showView('courses');
    }
  },

  reviewAnswers() {
    const results = this.state.lastQuizResults;
    if (!results || !results.review) return;

    const container = document.getElementById('review-questions-list');
    container.innerHTML = results.review.map((item, idx) => `
      <div class="card" style="border-left: 4px solid ${item.isCorrect ? 'var(--green)' : 'var(--red)'};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; color:var(--text-muted);">Question ${idx + 1}</span>
            <span class="difficulty-badge difficulty-${(item.difficulty || 'medium').toLowerCase()}">${item.difficulty || 'Medium'}</span>
          </div>
          <span class="status-badge ${item.isCorrect ? 'status-active' : 'status-suspended'}">
            ${item.isCorrect ? '✓ CORRECT (+10 XP)' : '✗ INCORRECT (0 XP)'}
          </span>
        </div>

        <h4 style="font-size:1.05rem; font-weight:700; color:var(--navy); margin-bottom:16px;">${item.questionText}</h4>

        <div style="font-size:0.9rem; margin-bottom:12px;">
          <div>Your Answer: <strong style="color:${item.isCorrect ? 'var(--green)' : 'var(--red)'};">${item.selectedAnswer}</strong></div>
          <div>Correct Answer: <strong style="color:var(--green);">${item.correctAnswer}</strong></div>
        </div>

        ${item.explanation ? `
          <div style="background:var(--blue-soft); padding:12px; border-radius:8px; border:1px solid var(--blue-light); font-size:0.88rem;">
            <strong>Explanation:</strong> ${item.explanation}
          </div>
        ` : ''}
      </div>
    `).join('');

    document.getElementById('review-answers-container').style.display = 'block';
  },

  // STUDENT DASHBOARD & HISTORY
  async loadStudentDashboard() {
    try {
      const data = await API.getStudentDashboard();
      const user = data.user;
      const stats = data.stats;
      const recent = data.recentAttempts || [];

      document.getElementById('dash-student-name').innerText = user.full_name;
      document.getElementById('dash-xp').innerText = `${stats.totalXp} XP`;
      document.getElementById('dash-quizzes-count').innerText = stats.quizzesCompleted;
      document.getElementById('dash-avg-score').innerText = `${stats.averageScore}%`;

      // Update Sunday Arena dashboard highlight
      try {
        const arenaData = await API.getArenaCurrent();
        if (arenaData && arenaData.hasSession) {
          const badgeEl = document.getElementById('dash-arena-badge');
          const titleEl = document.getElementById('dash-arena-title');
          const timeEl = document.getElementById('dash-arena-timing');
          const btnEl = document.getElementById('dash-arena-btn');

          if (titleEl) titleEl.innerText = arenaData.title;

          if (arenaData.status === 'ACTIVE') {
            if (badgeEl) { badgeEl.innerText = '🔴 LIVE ROUND NOW'; badgeEl.style.background = '#e63946'; badgeEl.style.color = '#fff'; }
            if (timeEl) timeEl.innerText = `Question ${arenaData.currentQuestionIndex + 1} of ${arenaData.totalQuestions} in progress!`;
            if (btnEl) btnEl.innerText = 'Join Live Round Now →';
          } else if (arenaData.status === 'LOBBY') {
            if (badgeEl) { badgeEl.innerText = '🟢 LOBBY OPEN'; badgeEl.style.background = '#10b981'; badgeEl.style.color = '#fff'; }
            if (timeEl) timeEl.innerText = `${arenaData.participantCount} Freshmen waiting in lobby`;
            if (btnEl) btnEl.innerText = 'Enter Lobby Now →';
          } else if (arenaData.status === 'ENDED') {
            if (badgeEl) { badgeEl.innerText = '🏆 RESULTS REVEALED'; badgeEl.style.background = '#2563eb'; badgeEl.style.color = '#fff'; }
            if (timeEl) timeEl.innerText = 'Official standings and podium published';
            if (btnEl) btnEl.innerText = 'View Grand Podium →';
          } else {
            const dateStr = new Date(arenaData.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            if (badgeEl) { badgeEl.innerText = '🏆 SUNDAY ARENA'; badgeEl.style.background = '#ffd166'; badgeEl.style.color = 'var(--navy)'; }
            if (timeEl) timeEl.innerText = `Starts: ${dateStr}`;
            if (btnEl) btnEl.innerText = 'View Arena Lobby →';
          }
        }
      } catch (e) {
        // Safe ignore
      }

      // Render Difficulty Mastery Cards
      const diffContainer = document.getElementById('dash-difficulty-stats');
      if (diffContainer) {
        const diffStats = stats.difficultyStats || {
          Easy: { attempted: 0, correct: 0, accuracy: 0 },
          Medium: { attempted: 0, correct: 0, accuracy: 0 },
          Hard: { attempted: 0, correct: 0, accuracy: 0 }
        };

        const levels = [
          { key: 'Easy', label: 'Foundation', badgeClass: 'difficulty-easy', subtitle: 'Core definitions & basics' },
          { key: 'Medium', label: 'Application', badgeClass: 'difficulty-medium', subtitle: 'Standard reasoning & scenarios' },
          { key: 'Hard', label: 'Challenge', badgeClass: 'difficulty-hard', subtitle: 'Complex multi-step problems' }
        ];

        diffContainer.innerHTML = levels.map(lvl => {
          const s = diffStats[lvl.key] || { attempted: 0, correct: 0, accuracy: 0 };
          return `
            <div class="diff-stat-card card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span class="difficulty-badge ${lvl.badgeClass}">${lvl.key} • ${lvl.label}</span>
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">${s.attempted} attempted</span>
              </div>
              <div style="font-size:2rem; font-weight:900; color:var(--navy); margin-bottom:4px;">
                ${s.accuracy}%
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">
                ${s.correct} of ${s.attempted} correct
              </div>
              <div style="background:var(--bg-main); height:7px; border-radius:4px; overflow:hidden;">
                <div style="background:var(--blue); width:${Math.min(100, Math.max(0, s.accuracy))}%; height:100%; border-radius:4px; transition:width 0.4s ease;"></div>
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">${lvl.subtitle}</div>
            </div>
          `;
        }).join('');
      }

      const recentEl = document.getElementById('dash-recent-attempts');
      if (recent.length === 0) {
        recentEl.innerHTML = `
          <div style="text-align:center; padding:32px 0;">
            <p style="color:var(--text-muted);">No quiz attempts yet. Take your first quiz to start building your progress!</p>
            <button class="btn btn-primary" style="margin-top:12px;" onclick="app.showView('courses')">Start Practicing</button>
          </div>
        `;
      } else {
        recentEl.innerHTML = `
          <div class="table-responsive">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Course</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>XP Earned</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${recent.map(r => `
                  <tr>
                    <td><strong>${r.quiz_title}</strong></td>
                    <td>${r.course_name}</td>
                    <td>${r.score}</td>
                    <td><span class="status-badge status-active">${r.percentage}%</span></td>
                    <td>+${r.xp_earned} XP</td>
                    <td>${new Date(r.completed_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  },

  async loadStudentHistory() {
    try {
      const data = await API.getStudentHistory();
      const history = data.history || [];
      const container = document.getElementById('history-table-container');

      if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">No quiz history recorded yet.</p>';
        return;
      }

      container.innerHTML = `
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Course</th>
                <th>Chapter / Quiz</th>
                <th>Score</th>
                <th>Accuracy</th>
                <th>XP Earned</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(h => `
                <tr>
                  <td>${new Date(h.completed_at).toLocaleString()}</td>
                  <td><strong>${h.course_name}</strong></td>
                  <td>${h.quiz_title}</td>
                  <td>${h.score}</td>
                  <td><span class="status-badge ${h.percentage >= 70 ? 'status-active' : 'status-suspended'}">${h.percentage}%</span></td>
                  <td>+${h.xp_earned} XP</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error('Error loading history:', err);
    }
  },

  // ADMIN PANEL
  async loadAdminPanel() {
    try {
      const statsData = await API.getAdminStats();
      const s = statsData.stats;

      document.getElementById('admin-stat-students').innerText = s.totalStudents;
      document.getElementById('admin-stat-attempts').innerText = s.totalAttempts;
      document.getElementById('admin-stat-suspended').innerText = s.suspendedStudents;

      // Platform-wide difficulty analytics
      const diffOverviewEl = document.getElementById('admin-difficulty-overview');
      if (diffOverviewEl && statsData.difficultyStats) {
        const ds = statsData.difficultyStats;
        const levels = [
          { key: 'Easy', label: 'Foundation', badgeClass: 'difficulty-easy' },
          { key: 'Medium', label: 'Application', badgeClass: 'difficulty-medium' },
          { key: 'Hard', label: 'Challenge', badgeClass: 'difficulty-hard' }
        ];

        diffOverviewEl.innerHTML = levels.map(lvl => {
          const st = ds[lvl.key] || { attempted: 0, correct: 0, accuracy: 0 };
          return `
            <div class="diff-stat-card card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span class="difficulty-badge ${lvl.badgeClass}">${lvl.key} • ${lvl.label}</span>
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">${st.attempted} attempts</span>
              </div>
              <div style="font-size:2rem; font-weight:900; color:var(--navy); margin-bottom:4px;">
                ${st.accuracy}%
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">
                ${st.correct} of ${st.attempted} answers correct
              </div>
              <div style="background:var(--bg-main); height:7px; border-radius:4px; overflow:hidden;">
                <div style="background:var(--blue); width:${Math.min(100, Math.max(0, st.accuracy))}%; height:100%; border-radius:4px;"></div>
              </div>
            </div>
          `;
        }).join('');
      }

      // Course-level difficulty breakdown table
      const courseDiffContainer = document.getElementById('admin-course-diff-container');
      const courseDiffWrapper = document.getElementById('admin-course-diff-table-wrapper');
      if (courseDiffContainer && courseDiffWrapper && statsData.courseDifficultyBreakdown) {
        const courses = Object.keys(statsData.courseDifficultyBreakdown);
        if (courses.length > 0) {
          courseDiffContainer.style.display = 'block';
          courseDiffWrapper.innerHTML = `
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Easy (Foundation)</th>
                  <th>Medium (Application)</th>
                  <th>Hard (Challenge)</th>
                  <th>Total Attempts</th>
                </tr>
              </thead>
              <tbody>
                ${courses.map(courseName => {
                  const cb = statsData.courseDifficultyBreakdown[courseName];
                  const easyAtt = cb.Easy ? cb.Easy.attempted : 0;
                  const medAtt = cb.Medium ? cb.Medium.attempted : 0;
                  const hardAtt = cb.Hard ? cb.Hard.attempted : 0;
                  const totalCourseAtt = easyAtt + medAtt + hardAtt;

                  const formatAcc = (diffObj) => {
                    if (!diffObj || diffObj.attempted === 0) return '<span style="color:var(--text-muted); font-size:0.82rem;">No attempts</span>';
                    const color = diffObj.accuracy >= 75 ? 'var(--green)' : (diffObj.accuracy >= 50 ? '#D97706' : 'var(--red)');
                    return `<strong style="color:${color}; font-size:0.95rem;">${diffObj.accuracy}%</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${diffObj.correct}/${diffObj.attempted})</span>`;
                  };

                  return `
                    <tr>
                      <td><strong>${this.escapeHtml(courseName)}</strong></td>
                      <td>${formatAcc(cb.Easy)}</td>
                      <td>${formatAcc(cb.Medium)}</td>
                      <td>${formatAcc(cb.Hard)}</td>
                      <td><strong>${totalCourseAtt}</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `;
        } else {
          courseDiffContainer.style.display = 'none';
        }
      }

      await this.loadAdminUsers();
      await this.loadAdminContentTree();

      // Populate Admin Arena Overview Card & Quick Banner
      try {
        const arenaData = await API.adminArenaMonitor();
        if (arenaData && arenaData.hasSession) {
          const pill = document.getElementById('admin-arena-badge-pill');
          const title = document.getElementById('admin-arena-stat-title');
          const sub = document.getElementById('admin-arena-stat-sub');
          const quickStatus = document.getElementById('admin-quick-arena-status');
          const quickTitle = document.getElementById('admin-quick-arena-title');

          if (title) title.innerText = arenaData.title;
          if (quickTitle) quickTitle.innerText = arenaData.title;

          if (pill) {
            pill.innerText = arenaData.status;
            if (arenaData.status === 'ACTIVE') pill.style.background = '#e63946';
            else if (arenaData.status === 'LOBBY') pill.style.background = '#10b981';
            else if (arenaData.status === 'ENDED') pill.style.background = '#2563eb';
            else pill.style.background = '#f59e0b';
          }
          if (quickStatus) quickStatus.innerText = `Status: ${arenaData.status} • ${arenaData.participantCount} Joined`;
          if (sub) sub.innerText = `${arenaData.status} • ${arenaData.totalQuestions} Qs • ${arenaData.participantCount} joined`;
        }
      } catch (e) {
        // Safe ignore
      }
    } catch (err) {
      alert('Failed to load admin panel: ' + err.message);
    }
  },

  showAdminTab(tabName) {
    document.getElementById('admin-tab-users').style.display = tabName === 'users' ? 'block' : 'none';
    document.getElementById('admin-tab-courses').style.display = tabName === 'courses' ? 'block' : 'none';
    const arenaTab = document.getElementById('admin-tab-arena');
    if (arenaTab) arenaTab.style.display = tabName === 'arena' ? 'block' : 'none';

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
    });
    if (event && event.target && event.target.classList.contains('admin-tab-btn')) {
      event.target.classList.remove('btn-secondary');
      event.target.classList.add('btn-primary');
    }

    if (tabName === 'courses') {
      this.loadAdminContentTree();
    } else if (tabName === 'arena') {
      this.loadAdminArenaTab();
    }
  },

  async loadAdminArenaTab() {
    try {
      const courseSelect = document.getElementById('m-arena-course');
      if (courseSelect && courseSelect.options.length <= 1) {
        courseSelect.innerHTML = '<option value="">All Freshman Courses (Comprehensive)</option>' + 
          this.state.courses.map(c => `<option value="${c.id}">${this.escapeHtml(c.title)}</option>`).join('');
      }

      const data = await API.adminArenaMonitor();
      const container = document.getElementById('admin-arena-live-monitor');
      if (!container) return;

      if (!data || !data.hasSession) {
        container.innerHTML = `
          <div style="text-align:center; padding:24px;">
            <p style="color:var(--text-muted);">No arena session exists currently. Use the form above to schedule one, or click the Quick Test button.</p>
          </div>
        `;
        return;
      }

      const leaderboard = data.leaderboard || [];

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
          <div>
            <span style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px;">Current Session</span>
            <h4 style="font-size:1.15rem; font-weight:800; color:var(--navy); margin:4px 0 2px;">${this.escapeHtml(data.title)}</h4>
            <div style="font-size:0.85rem; color:var(--text-muted);">
              Status: <strong style="color:#2563eb;">${data.status}</strong> • Questions: <strong>${data.totalQuestions}</strong> • Registered Students: <strong>${data.participantCount}</strong>
            </div>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${data.status === 'SCHEDULED' ? `
              <button class="btn btn-sm btn-primary" onclick="arena.adminSetStatus('LOBBY'); app.loadAdminArenaTab();">🟢 Open Lobby</button>
              <button class="btn btn-sm btn-success" style="background:#10b981; color:#fff;" onclick="arena.adminSetStatus('ACTIVE'); app.loadAdminArenaTab();">▶️ Start Contest</button>
            ` : ''}

            ${data.status === 'LOBBY' ? `
              <button class="btn btn-sm btn-success" style="background:#10b981; color:#fff;" onclick="arena.adminSetStatus('ACTIVE'); app.loadAdminArenaTab();">▶️ Start Question 1</button>
              <button class="btn btn-sm btn-secondary" onclick="arena.adminSetStatus('SCHEDULED'); app.loadAdminArenaTab();">Back to Scheduled</button>
            ` : ''}

            ${data.status === 'ACTIVE' ? `
              <button class="btn btn-sm btn-primary" onclick="arena.adminNextQuestion(); app.loadAdminArenaTab();">⏭️ Next Question (${data.currentQuestionIndex + 1}/${data.totalQuestions})</button>
              <button class="btn btn-sm btn-danger" onclick="arena.adminSetStatus('ENDED'); app.loadAdminArenaTab();">🏁 End & Reveal Podium</button>
            ` : ''}

            ${data.status === 'ENDED' ? `
              <button class="btn btn-sm btn-primary" onclick="app.showView('arena')">🏆 View Grand Podium</button>
            ` : ''}

            <button class="btn btn-sm btn-outline" onclick="app.loadAdminArenaTab()">🔄 Refresh Monitor</button>
          </div>
        </div>

        ${data.adminHeatmap ? `
          <div style="background:#fff; border:1px solid var(--border); border-radius:10px; padding:12px 16px; margin-bottom:16px;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--navy); margin-bottom:8px;">Live Question ${data.currentQuestionIndex + 1} Responses (${data.adminHeatmap.answered} / ${data.adminHeatmap.total} answered):</div>
            <div style="display:flex; gap:16px; font-size:0.85rem;">
              <span><strong>A:</strong> ${data.adminHeatmap.A}</span>
              <span><strong>B:</strong> ${data.adminHeatmap.B}</span>
              <span><strong>C:</strong> ${data.adminHeatmap.C}</span>
              <span><strong>D:</strong> ${data.adminHeatmap.D}</span>
            </div>
          </div>
        ` : ''}

        <div>
          <h5 style="font-size:0.92rem; font-weight:700; color:var(--navy); margin-bottom:8px;">Live Shadow Standings (${leaderboard.length} competitors)</h5>
          ${leaderboard.length === 0 ? `
            <p style="font-size:0.85rem; color:var(--text-muted);">No participants have joined yet.</p>
          ` : `
            <div style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead style="background:var(--bg-main); border-bottom:1px solid var(--border);">
                  <tr>
                    <th style="padding:6px 10px; text-align:left;">Rank</th>
                    <th style="padding:6px 10px; text-align:left;">Student</th>
                    <th style="padding:6px 10px; text-align:center;">Score</th>
                    <th style="padding:6px 10px; text-align:center;">Total Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${leaderboard.map(row => `
                    <tr style="border-bottom:1px solid var(--border);">
                      <td style="padding:6px 10px; font-weight:700;">#${row.rank}</td>
                      <td style="padding:6px 10px;">${this.escapeHtml(row.userName)}</td>
                      <td style="padding:6px 10px; text-align:center; font-weight:700; color:var(--blue);">${row.totalScore}/${data.totalQuestions}</td>
                      <td style="padding:6px 10px; text-align:center;">${row.totalTimeFormatted}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      // Also refresh the questions preview queue
      this.loadAdminArenaQuestionsPreview();
    } catch (err) {
      console.warn('Failed to load admin arena tab:', err.message);
    }
  },

  insertArenaSampleQuestions() {
    const sample = `**Q1.** Mercantilism's contemporary relevance is demonstrated by:

- **A.** The universal adoption of free trade without exception
- **B.** The global abolition of state intervention in economies
- **C.** The East Asian economies developmental state approach
- **D.** The disappearance of trade blocs

**✅ Correct Answer: C**
**📝 Explanation:** East Asian states fulfilled mercantilist roles through strategic industrial development.

---

**Q2.** The shift from comparative advantage to competitive advantage is driven by:

- **A.** The growth of MNCs and government and corporate policies
- **B.** The abandonment of trade theory by all economists
- **C.** The universal adoption of autarky
- **D.** The disappearance of multinational corporations

**✅ Correct Answer: A**
**📝 Explanation:** Multinational corporations and state policies influence trade flows.

---

**Q3.** The Bretton Woods institutions were created in 1944.
- **A.** True
- **B.** False
**✅ Correct Answer: A**
**📝 Explanation:** The conference took place at Bretton Woods, New Hampshire in July 1944.`;

    const txt = document.getElementById('arena-upload-text');
    if (txt) {
      txt.value = sample;
      txt.focus();
    }
  },

  async handleUploadArenaQuestions() {
    const txtArea = document.getElementById('arena-upload-text');
    const feedback = document.getElementById('arena-upload-feedback');
    const btn = document.getElementById('btn-arena-upload');

    if (!txtArea || !txtArea.value.trim()) {
      if (feedback) {
        feedback.innerHTML = `
          <div style="background:#fef2f2; border:1px solid #f87171; color:#991b1b; padding:10px 14px; border-radius:8px; font-size:0.88rem;">
            ⚠️ Please paste or type your questions first into the box above.
          </div>
        `;
      }
      return;
    }

    const rawText = txtArea.value.trim();

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Parsing & Attaching Questions...';
      }
      if (feedback) {
        feedback.innerHTML = `
          <div style="background:#eff6ff; border:1px solid #93c5fd; color:#1e40af; padding:10px 14px; border-radius:8px; font-size:0.88rem;">
            ⏳ Parsing questions and saving to database...
          </div>
        `;
      }

      const res = await API.adminArenaUploadQuestions(null, rawText);

      if (feedback) {
        feedback.innerHTML = `
          <div style="background:#ecfdf5; border:1px solid #34d399; color:#065f46; padding:12px 16px; border-radius:8px; font-size:0.9rem;">
            <strong>✅ Success!</strong> ${res.message || 'Questions successfully attached to Sunday Arena.'}
          </div>
        `;
      }

      // Refresh monitor and question list
      await this.loadAdminArenaTab();
      await this.loadAdminArenaQuestionsPreview();
    } catch (err) {
      console.error('Arena question upload failed:', err);
      if (feedback) {
        feedback.innerHTML = `
          <div style="background:#fef2f2; border:1px solid #f87171; color:#991b1b; padding:12px 16px; border-radius:8px; font-size:0.88rem;">
            <strong>❌ Error parsing questions:</strong> ${this.escapeHtml(err.message)}
          </div>
        `;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '📥 Parse & Attach Questions to Sunday Arena';
      }
    }
  },

  async loadAdminArenaQuestionsPreview() {
    const listContainer = document.getElementById('admin-arena-questions-list');
    const countBadge = document.getElementById('admin-arena-q-count');
    if (!listContainer) return;

    try {
      listContainer.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px;">⏳ Fetching arena questions...</p>';

      const data = await API.adminArenaGetQuestions();
      const questions = data.questions || [];

      if (countBadge) {
        countBadge.textContent = questions.length;
      }

      if (questions.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">
            No questions are currently queued for this Arena. Paste questions in the box above or schedule a new competition.
          </div>
        `;
        return;
      }

      listContainer.innerHTML = questions.map((q, idx) => {
        return `
          <div style="background:#fff; border:1px solid var(--border); border-radius:8px; padding:12px 14px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; gap:8px;">
              <div style="font-weight:700; color:var(--navy); font-size:0.92rem;">
                <span style="color:var(--blue); margin-right:6px;">Q${idx + 1}.</span> ${this.escapeHtml(q.question_text)}
              </div>
              <span style="font-size:0.75rem; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:4px; font-weight:700; white-space:nowrap;">
                ${this.escapeHtml(q.difficulty || 'Medium')}
              </span>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:6px; font-size:0.83rem; margin:8px 0;">
              <div style="padding:4px 8px; border-radius:4px; ${q.correct_answer === 'A' ? 'background:#ecfdf5; border:1px solid #10b981; font-weight:700; color:#065f46;' : 'background:var(--bg-main); color:var(--text-muted);'}">
                <strong>A.</strong> ${this.escapeHtml(q.option_a || '—')}
              </div>
              <div style="padding:4px 8px; border-radius:4px; ${q.correct_answer === 'B' ? 'background:#ecfdf5; border:1px solid #10b981; font-weight:700; color:#065f46;' : 'background:var(--bg-main); color:var(--text-muted);'}">
                <strong>B.</strong> ${this.escapeHtml(q.option_b || '—')}
              </div>
              ${q.option_c ? `
                <div style="padding:4px 8px; border-radius:4px; ${q.correct_answer === 'C' ? 'background:#ecfdf5; border:1px solid #10b981; font-weight:700; color:#065f46;' : 'background:var(--bg-main); color:var(--text-muted);'}">
                  <strong>C.</strong> ${this.escapeHtml(q.option_c)}
                </div>
              ` : ''}
              ${q.option_d ? `
                <div style="padding:4px 8px; border-radius:4px; ${q.correct_answer === 'D' ? 'background:#ecfdf5; border:1px solid #10b981; font-weight:700; color:#065f46;' : 'background:var(--bg-main); color:var(--text-muted);'}">
                  <strong>D.</strong> ${this.escapeHtml(q.option_d)}
                </div>
              ` : ''}
            </div>

            <div style="font-size:0.8rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-top:1px dashed var(--border); padding-top:6px; margin-top:6px;">
              <span style="color:#065f46; font-weight:700;">
                ✅ Correct Key: <strong>${this.escapeHtml(q.correct_answer)}</strong>
              </span>
              ${q.explanation ? `
                <span style="color:var(--text-muted); font-style:italic;">
                  📝 ${this.escapeHtml(q.explanation.length > 90 ? q.explanation.substring(0, 90) + '...' : q.explanation)}
                </span>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('Failed to load arena questions preview:', err.message);
      if (listContainer) {
        listContainer.innerHTML = `<p style="color:#ef4444; font-size:0.85rem; padding:12px;">Failed to load question preview: ${this.escapeHtml(err.message)}</p>`;
      }
    }
  },

  async handleCreateArenaSession(e) {
    e.preventDefault();
    const title = document.getElementById('m-arena-title').value.trim();
    const courseId = document.getElementById('m-arena-course').value || null;
    const dateVal = document.getElementById('m-arena-date').value;
    const questionCount = parseInt(document.getElementById('m-arena-count').value) || 25;
    const secondsPerQuestion = parseInt(document.getElementById('m-arena-sec').value) || 40;

    let scheduledAt = null;
    if (dateVal) {
      scheduledAt = new Date(dateVal).toISOString();
    }

    try {
      await API.adminArenaCreate({
        title,
        courseId,
        scheduledAt,
        questionCount,
        secondsPerQuestion
      });
      alert('New Arena session created and scheduled successfully!');
      this.loadAdminArenaTab();
    } catch (err) {
      alert('Failed to create arena session: ' + err.message);
    }
  },

  async loadAdminUsers() {
    try {
      const data = await API.getAdminUsers();
      const users = data.users || [];
      const tbody = document.getElementById('admin-users-tbody');

      tbody.innerHTML = users.map(u => `
        <tr>
          <td><strong>${u.full_name}</strong></td>
          <td>${u.email}</td>
          <td>${u.phone}</td>
          <td>⚡ ${u.total_xp} XP</td>
          <td>${u.quiz_attempts}</td>
          <td><span class="status-badge ${u.status === 'ACTIVE' ? 'status-active' : 'status-suspended'}">${u.status}</span></td>
          <td>
            ${u.status === 'ACTIVE' ? `
              <button class="btn btn-danger btn-sm" onclick="app.toggleUserStatus('${u.id}', 'SUSPENDED')">Suspend</button>
            ` : `
              <button class="btn btn-success btn-sm" onclick="app.toggleUserStatus('${u.id}', 'ACTIVE')">Reactivate</button>
            `}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load admin users:', err);
    }
  },

  async toggleUserStatus(userId, newStatus) {
    try {
      await API.updateUserStatus(userId, newStatus);
      await this.loadAdminUsers();
    } catch (err) {
      alert('Failed to update user status: ' + err.message);
    }
  },

  // HIERARCHICAL CONTENT TREE BUILDER & MANAGER
  async loadAdminContentTree() {
    try {
      const data = await API.getAdminContentTree();
      this.state.contentTree = data;
      this.renderAdminContentTree();
    } catch (err) {
      console.error('Failed to load content tree:', err);
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  handleImageFileInput(fileInput, targetInputId, previewContainerId) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WebP, etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.70);
        const targetInput = document.getElementById(targetInputId);
        if (targetInput) targetInput.value = dataUrl;

        this.updateImagePreview(dataUrl, previewContainerId);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  updateImagePreview(imageUrl, previewContainerId) {
    const previewEl = document.getElementById(previewContainerId);
    if (!previewEl) return;

    if (imageUrl && imageUrl.trim()) {
      previewEl.style.display = 'block';
      previewEl.innerHTML = `
        <div style="position:relative; display:inline-block; margin-top:8px;">
          <img src="${imageUrl}" alt="Preview" style="max-height:110px; max-width:100%; border-radius:8px; border:2px solid var(--blue); object-fit:cover; display:block;">
          <span style="font-size:0.75rem; color:var(--green); font-weight:700; margin-top:4px; display:block;">✓ Image selected & ready</span>
        </div>
      `;
    } else {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
    }
  },

  toggleQuestionsList(quizId) {
    if (!this.state.expandedQuizzes) this.state.expandedQuizzes = new Set();
    const el = document.getElementById(`quiz-questions-${quizId}`);
    if (!el) return;
    if (el.style.display === 'none' || !el.style.display) {
      el.style.display = 'block';
      this.state.expandedQuizzes.add(quizId);
    } else {
      el.style.display = 'none';
      this.state.expandedQuizzes.delete(quizId);
    }
  },

  renderAdminContentTree() {
    const container = document.getElementById('admin-content-tree');
    if (!container) return;

    if (!this.state.expandedQuizzes) this.state.expandedQuizzes = new Set();
    const { courses, chapters, quizzes, questions } = this.state.contentTree;

    if (courses.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No courses created yet.</p>';
      return;
    }

    container.innerHTML = courses.map(c => {
      const courseChapters = chapters.filter(ch => ch.course_id === c.id);

      return `
        <div class="card" style="margin-bottom:20px; border-left:4px solid var(--navy);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${c.image_url ? `<img src="${c.image_url}" style="width:46px; height:46px; object-fit:cover; border-radius:8px; border:1px solid var(--border);" alt="${this.escapeHtml(c.name)}">` : ''}
              <div>
                <span class="brand-badge">COURSE</span>
                <h3 style="font-size:1.25rem; font-weight:800; color:var(--navy); display:inline; margin-left:6px;">${this.escapeHtml(c.name)}</h3>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="app.openAddChapterModal('${c.id}')">+ Add Chapter</button>
              <button class="btn btn-outline btn-sm" onclick="app.openEditCourseModal('${c.id}')" title="Edit Course">✏️ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="app.handleDeleteCourse('${c.id}')" title="Delete Course">🗑️ Delete</button>
            </div>
          </div>
          <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:16px;">${this.escapeHtml(c.description || 'No description provided.')}</p>

          <!-- CHAPTERS UNDER THIS COURSE -->
          <div style="padding-left:16px; border-left:2px solid var(--border);">
            ${courseChapters.length === 0 ? `
              <div style="font-size:0.85rem; color:var(--text-muted); padding:8px 0;">No chapters under this course yet. Click "+ Add Chapter" to create one.</div>
            ` : courseChapters.map(ch => {
              const chapterQuizzes = quizzes.filter(q => q.chapter_id === ch.id);

              return `
                <div style="background:var(--bg-main); padding:16px; border-radius:8px; margin-bottom:14px; border:1px solid var(--border);">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      ${ch.image_url ? `<img src="${ch.image_url}" style="width:38px; height:38px; object-fit:cover; border-radius:6px; border:1px solid var(--border);" alt="${this.escapeHtml(ch.name)}">` : ''}
                      <div>
                        <span class="brand-badge" style="background:var(--blue);">CHAPTER</span>
                        <strong style="color:var(--navy); font-size:1.05rem; margin-left:6px;">${this.escapeHtml(ch.name)}</strong>
                      </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" onclick="app.openAddQuizModal('${c.id}', '${ch.id}')">+ Add Quiz</button>
                      <button class="btn btn-outline btn-sm" onclick="app.openEditChapterModal('${ch.id}')" title="Edit Chapter">✏️ Edit</button>
                      <button class="btn btn-danger btn-sm" onclick="app.handleDeleteChapter('${ch.id}')" title="Delete Chapter">🗑️ Delete</button>
                    </div>
                  </div>
                  <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">${this.escapeHtml(ch.description || '')}</p>

                  <!-- QUIZZES UNDER THIS CHAPTER -->
                  <div style="padding-left:12px;">
                    ${chapterQuizzes.length === 0 ? `
                      <div style="font-size:0.8rem; color:var(--text-muted); padding:6px 0;">No quizzes in this chapter yet. Click "+ Add Quiz" to create one.</div>
                    ` : chapterQuizzes.map(q => {
                      const quizQuestions = questions.filter(quest => quest.quiz_id === q.id);
                      const isExpanded = this.state.expandedQuizzes.has(q.id);

                      return `
                        <div style="background:#fff; padding:12px 16px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border);">
                          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                            <div>
                              <strong style="color:var(--navy); font-size:1rem;">${this.escapeHtml(q.title)}</strong>
                              <div style="font-size:0.82rem; color:var(--text-muted); margin-top:3px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                                <span>⏱️ ${q.time_limit} Mins</span> • 
                                <span>🎯 Serves: <strong>${q.question_count} Qs</strong></span> • 
                                <span>📚 Bank: <strong>${quizQuestions.length} Questions</strong></span> • 
                                <span class="brand-badge" style="font-size:0.72rem; padding:1px 6px;">${q.difficulty}</span>
                              </div>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                              <button class="btn btn-secondary btn-sm" onclick="app.toggleQuestionsList('${q.id}')">
                                👁️ Questions (${quizQuestions.length})
                              </button>
                              <button class="btn btn-success btn-sm" onclick="app.openAddQuestionModal('${c.id}', '${ch.id}', '${q.id}')">
                                + Add Q
                              </button>
                              <button class="btn btn-outline btn-sm" onclick="app.openEditQuizModal('${q.id}')" title="Edit Quiz">
                                ✏️ Edit
                              </button>
                              <button class="btn btn-danger btn-sm" onclick="app.handleDeleteQuiz('${q.id}')" title="Delete Quiz">
                                🗑️
                              </button>
                            </div>
                          </div>

                          <!-- COLLAPSIBLE QUESTION BANK LIST -->
                          <div id="quiz-questions-${q.id}" style="display:${isExpanded ? 'block' : 'none'}; margin-top:14px; padding-top:14px; border-top:1px dashed var(--border);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                              <span style="font-size:0.85rem; font-weight:700; color:var(--navy);">Question Bank (${quizQuestions.length} Questions)</span>
                              <button class="btn btn-success btn-sm" onclick="app.openAddQuestionModal('${c.id}', '${ch.id}', '${q.id}')">+ Add Question to Bank</button>
                            </div>
                            ${quizQuestions.length === 0 ? `
                              <p style="font-size:0.85rem; color:var(--text-muted); margin:0; padding:8px 0;">No questions added to this quiz bank yet.</p>
                            ` : quizQuestions.map((quest, idx) => `
                              <div style="background:var(--bg-main); padding:10px 14px; border-radius:6px; margin-bottom:8px; border:1px solid var(--border);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                                  <div style="flex:1;">
                                    <div style="font-size:0.9rem; font-weight:600; color:var(--navy); margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                      <span><strong>${idx + 1}.</strong> ${this.escapeHtml(quest.question_text)}</span>
                                      <span class="difficulty-badge difficulty-${(quest.difficulty || 'medium').toLowerCase()}" style="font-size:0.7rem; padding:2px 8px; flex-shrink:0;">${quest.difficulty || 'Medium'}</span>
                                    </div>
                                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:6px; font-size:0.82rem; margin-bottom:6px;">
                                      <div style="${quest.correct_answer === 'A' ? 'font-weight:700; color:var(--green); background:var(--green-soft); padding:3px 8px; border-radius:4px;' : 'color:var(--text-muted); padding:3px 8px;'}">
                                        <strong>A:</strong> ${this.escapeHtml(quest.option_a)} ${quest.correct_answer === 'A' ? '✓ (Correct)' : ''}
                                      </div>
                                      <div style="${quest.correct_answer === 'B' ? 'font-weight:700; color:var(--green); background:var(--green-soft); padding:3px 8px; border-radius:4px;' : 'color:var(--text-muted); padding:3px 8px;'}">
                                        <strong>B:</strong> ${this.escapeHtml(quest.option_b)} ${quest.correct_answer === 'B' ? '✓ (Correct)' : ''}
                                      </div>
                                      <div style="${quest.correct_answer === 'C' ? 'font-weight:700; color:var(--green); background:var(--green-soft); padding:3px 8px; border-radius:4px;' : 'color:var(--text-muted); padding:3px 8px;'}">
                                        <strong>C:</strong> ${this.escapeHtml(quest.option_c)} ${quest.correct_answer === 'C' ? '✓ (Correct)' : ''}
                                      </div>
                                      <div style="${quest.correct_answer === 'D' ? 'font-weight:700; color:var(--green); background:var(--green-soft); padding:3px 8px; border-radius:4px;' : 'color:var(--text-muted); padding:3px 8px;'}">
                                        <strong>D:</strong> ${this.escapeHtml(quest.option_d)} ${quest.correct_answer === 'D' ? '✓ (Correct)' : ''}
                                      </div>
                                    </div>
                                    ${quest.explanation ? `<div style="font-size:0.8rem; color:var(--navy); font-style:italic; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid var(--border);">💡 <strong>Explanation:</strong> ${this.escapeHtml(quest.explanation)}</div>` : ''}
                                  </div>
                                  <div style="display:flex; gap:6px; flex-shrink:0;">
                                    <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:0.8rem;" onclick="app.openEditQuestionModal('${quest.id}')" title="Edit Question">✏️ Edit</button>
                                    <button class="btn btn-danger btn-sm" style="padding:4px 8px; font-size:0.8rem;" onclick="app.handleDeleteQuestion('${quest.id}')" title="Delete Question">🗑️</button>
                                  </div>
                                </div>
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  // ==========================================
  // COURSE MODALS & CRUD
  // ==========================================
  openAddCourseModal() {
    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content';

    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Create New Course</h3>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <form id="form-add-course" onsubmit="app.handleCreateCourse(event)">
          <div class="form-group">
            <label class="form-label">Course Name</label>
            <input type="text" id="m-course-name" class="form-input" placeholder="e.g. Logic & Critical Thinking" required>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="m-course-desc" class="form-input" rows="3" placeholder="Course overview and syllabus..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight:700;">Course Cover Image (Upload or URL)</label>
            <div style="background:var(--bg-main); padding:12px; border-radius:8px; border:1.5px dashed var(--blue);">
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--navy); margin-bottom:6px;">
                📁 Choose Image from Device (PC/Phone):
              </label>
              <input type="file" id="m-course-file" class="form-input" accept="image/*" onchange="app.handleImageFileInput(this, 'm-course-img', 'm-course-preview')">
              <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin:8px 0;">— OR PASTE IMAGE URL —</div>
              <input type="text" id="m-course-img" class="form-input" placeholder="https://images.unsplash.com/..." oninput="app.updateImagePreview(this.value, 'm-course-preview')">
              <div id="m-course-preview" style="display:none;"></div>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-add-course" class="btn btn-primary">Create Course</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async handleCreateCourse(e) {
    e.preventDefault();
    const name = document.getElementById('m-course-name').value;
    const description = document.getElementById('m-course-desc').value;
    const imageUrl = document.getElementById('m-course-img').value;

    try {
      await API.createCourse({ name, description, imageUrl });
      this.closeModal();
      await this.loadCourses();
      await this.loadAdminContentTree();
      alert('Course created successfully!');
    } catch (err) {
      alert('Error creating course: ' + err.message);
    }
  },

  openEditCourseModal(courseId) {
    const course = this.state.contentTree.courses.find(c => c.id === courseId);
    if (!course) {
      alert('Course not found.');
      return;
    }

    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content';

    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit Course: ${this.escapeHtml(course.name)}</h3>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <form id="form-edit-course" onsubmit="app.handleUpdateCourse(event, '${course.id}')">
          <div class="form-group">
            <label class="form-label">Course Name</label>
            <input type="text" id="m-edit-course-name" class="form-input" value="${this.escapeHtml(course.name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="m-edit-course-desc" class="form-input" rows="3">${this.escapeHtml(course.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight:700;">Course Cover Image (Upload or URL)</label>
            <div style="background:var(--bg-main); padding:12px; border-radius:8px; border:1.5px dashed var(--blue);">
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--navy); margin-bottom:6px;">
                📁 Choose New Image from Device:
              </label>
              <input type="file" id="m-edit-course-file" class="form-input" accept="image/*" onchange="app.handleImageFileInput(this, 'm-edit-course-img', 'm-edit-course-preview')">
              <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin:8px 0;">— OR PASTE IMAGE URL —</div>
              <input type="text" id="m-edit-course-img" class="form-input" value="${this.escapeHtml(course.image_url || '')}" placeholder="https://..." oninput="app.updateImagePreview(this.value, 'm-edit-course-preview')">
              <div id="m-edit-course-preview">
                ${course.image_url ? `
                  <div style="position:relative; display:inline-block; margin-top:8px;">
                    <img src="${course.image_url}" alt="Preview" style="max-height:110px; max-width:100%; border-radius:8px; border:2px solid var(--blue); object-fit:cover; display:block;">
                    <span style="font-size:0.75rem; color:var(--green); font-weight:700; margin-top:4px; display:block;">Current cover image</span>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-edit-course" class="btn btn-primary">Update Course</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async handleUpdateCourse(e, courseId) {
    e.preventDefault();
    const name = document.getElementById('m-edit-course-name').value;
    const description = document.getElementById('m-edit-course-desc').value;
    const imageUrl = document.getElementById('m-edit-course-img').value;

    try {
      await API.updateCourse(courseId, { name, description, imageUrl, status: 'ACTIVE' });
      this.closeModal();
      await this.loadCourses();
      await this.loadAdminContentTree();
      alert('Course updated successfully!');
    } catch (err) {
      alert('Error updating course: ' + err.message);
    }
  },

  async handleDeleteCourse(courseId) {
    const course = this.state.contentTree.courses.find(c => c.id === courseId);
    const courseName = course ? course.name : 'this course';
    if (!confirm(`Are you sure you want to delete course "${courseName}" and ALL its chapters, quizzes, and questions? This action cannot be undone.`)) {
      return;
    }

    try {
      await API.deleteCourse(courseId);
      await this.loadCourses();
      await this.loadAdminContentTree();
      alert('Course deleted successfully.');
    } catch (err) {
      alert('Error deleting course: ' + err.message);
    }
  },

  // ==========================================
  // CHAPTER MODALS & CRUD
  // ==========================================
  openAddChapterModal(preselectedCourseId = null) {
    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content';
    const { courses } = this.state.contentTree;

    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Create New Chapter</h3>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <form id="form-add-chapter" onsubmit="app.handleCreateChapter(event)">
          <div class="form-group">
            <label class="form-label">Target Course</label>
            <select id="m-chap-course" class="form-input" required>
              ${courses.map(c => `<option value="${c.id}" ${preselectedCourseId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Chapter Name</label>
            <input type="text" id="m-chap-name" class="form-input" placeholder="e.g. Chapter 3: Deductive Reasoning" required>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="m-chap-desc" class="form-input" rows="2" placeholder="Chapter overview and topics covered..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight:700;">Chapter Cover Image (Upload or URL)</label>
            <div style="background:var(--bg-main); padding:12px; border-radius:8px; border:1.5px dashed var(--blue);">
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--navy); margin-bottom:6px;">
                📁 Choose Image from Device:
              </label>
              <input type="file" id="m-chap-file" class="form-input" accept="image/*" onchange="app.handleImageFileInput(this, 'm-chap-img', 'm-chap-preview')">
              <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin:8px 0;">— OR PASTE IMAGE URL —</div>
              <input type="text" id="m-chap-img" class="form-input" placeholder="https://images.unsplash.com/..." oninput="app.updateImagePreview(this.value, 'm-chap-preview')">
              <div id="m-chap-preview" style="display:none;"></div>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-add-chapter" class="btn btn-primary">Create Chapter</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async handleCreateChapter(e) {
    e.preventDefault();
    const courseId = document.getElementById('m-chap-course').value;
    const name = document.getElementById('m-chap-name').value;
    const description = document.getElementById('m-chap-desc').value;
    const imageUrl = document.getElementById('m-chap-img').value;

    try {
      await API.createChapter({ courseId, name, description, imageUrl });
      this.closeModal();
      await this.loadCourses();
      await this.loadAdminContentTree();
      alert('Chapter created successfully!');
    } catch (err) {
      alert('Error creating chapter: ' + err.message);
    }
  },

  openEditChapterModal(chapterId) {
    const chapter = this.state.contentTree.chapters.find(ch => ch.id === chapterId);
    if (!chapter) {
      alert('Chapter not found.');
      return;
    }

    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content';

    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit Chapter: ${this.escapeHtml(chapter.name)}</h3>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <form id="form-edit-chapter" onsubmit="app.handleUpdateChapter(event, '${chapter.id}')">
          <div class="form-group">
            <label class="form-label">Chapter Name</label>
            <input type="text" id="m-edit-chap-name" class="form-input" value="${this.escapeHtml(chapter.name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="m-edit-chap-desc" class="form-input" rows="2">${this.escapeHtml(chapter.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Chapter Order Index</label>
            <input type="number" id="m-edit-chap-order" class="form-input" value="${chapter.chapter_order || 1}" min="1">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight:700;">Chapter Cover Image (Upload or URL)</label>
            <div style="background:var(--bg-main); padding:12px; border-radius:8px; border:1.5px dashed var(--blue);">
              <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--navy); margin-bottom:6px;">
                📁 Choose New Image from Device:
              </label>
              <input type="file" id="m-edit-chap-file" class="form-input" accept="image/*" onchange="app.handleImageFileInput(this, 'm-edit-chap-img', 'm-edit-chap-preview')">
              <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin:8px 0;">— OR PASTE IMAGE URL —</div>
              <input type="text" id="m-edit-chap-img" class="form-input" value="${this.escapeHtml(chapter.image_url || '')}" placeholder="https://..." oninput="app.updateImagePreview(this.value, 'm-edit-chap-preview')">
              <div id="m-edit-chap-preview">
                ${chapter.image_url ? `
                  <div style="position:relative; display:inline-block; margin-top:8px;">
                    <img src="${chapter.image_url}" alt="Preview" style="max-height:110px; max-width:100%; border-radius:8px; border:2px solid var(--blue); object-fit:cover; display:block;">
                    <span style="font-size:0.75rem; color:var(--green); font-weight:700; margin-top:4px; display:block;">Current cover image</span>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-edit-chapter" class="btn btn-primary">Update Chapter</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async handleUpdateChapter(e, chapterId) {
    e.preventDefault();
    const name = document.getElementById('m-edit-chap-name').value;
    const description = document.getElementById('m-edit-chap-desc').value;
    const chapterOrder = document.getElementById('m-edit-chap-order').value;
    const imageUrl = document.getElementById('m-edit-chap-img').value;

    try {
      await API.updateChapter(chapterId, { name, description, chapterOrder, imageUrl, status: 'ACTIVE' });
      this.closeModal();
      await this.loadCourses();
      await this.loadAdminContentTree();
      alert('Chapter updated successfully!');
    } catch (err) {
      alert('Error updating chapter: ' + err.message);
    }
  },

  async handleDeleteChapter(chapterId) {
    const chapter = this.state.contentTree.chapters.find(ch => ch.id === chapterId);
    const chapterName = chapter ? chapter.name : 'this chapter';
    if (!confirm(`Are you sure you want to delete chapter "${chapterName}" and all its quizzes? This action cannot be undone.`)) {
      return;
    }

    try {
      await API.deleteChapter(chapterId);
      await this.loadCourses();
      await this.loadAdminContentTree();
      alert('Chapter deleted successfully.');
    } catch (err) {
      alert('Error deleting chapter: ' + err.message);
    }
  },

  // ==========================================
  // QUIZ MODALS & CRUD
  // ==========================================
  openAddQuizModal(preselectedCourseId = null, preselectedChapterId = null) {
    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content';
    const { courses, chapters } = this.state.contentTree;

    const initialCourseId = preselectedCourseId || (courses.length > 0 ? courses[0].id : '');
    const filteredChapters = chapters.filter(ch => ch.course_id === initialCourseId);

    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Create New Quiz</h3>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <form id="form-add-quiz" onsubmit="app.handleCreateQuiz(event)">
          <div class="form-group">
            <label class="form-label">Select Course</label>
            <select id="m-quiz-course" class="form-input" onchange="app.onQuizCourseChange()" required>
              ${courses.map(c => `<option value="${c.id}" ${initialCourseId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Select Chapter</label>
            <select id="m-quiz-chap" class="form-input" required>
              ${filteredChapters.map(ch => `<option value="${ch.id}" ${preselectedChapterId === ch.id ? 'selected' : ''}>${ch.name}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Quiz Title</label>
            <input type="text" id="m-quiz-title" class="form-input" placeholder="e.g. Informal Fallacies Chapter Test" required>
          </div>

          <div class="form-group">
            <label class="form-label">How Many Questions Should Each Quiz Have? (Served to Student)</label>
            <input type="number" id="m-quiz-qcount" class="form-input" value="10" min="1" max="100" required>
            <span style="font-size:0.75rem; color:var(--text-muted);">Admin can add as many questions to the bank as desired; this setting decides how many questions are served during a quiz attempt.</span>
          </div>

          <div class="grid-2-compact">
            <div class="form-group">
              <label class="form-label">Time Limit (Minutes)</label>
              <input type="number" id="m-quiz-timelimit" class="form-input" value="15" required>
            </div>

            <div class="form-group">
              <label class="form-label">Difficulty</label>
              <select id="m-quiz-diff" class="form-input">
                <option value="Easy">Easy</option>
                <option value="Medium" selected>Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-add-quiz" class="btn btn-primary">Create Quiz</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  onQuizCourseChange() {
    const selectedCourseId = document.getElementById('m-quiz-course').value;
    const { chapters } = this.state.contentTree;
    const filtered = chapters.filter(ch => ch.course_id === selectedCourseId);
    const chapSelect = document.getElementById('m-quiz-chap');

    chapSelect.innerHTML = filtered.map(ch => `<option value="${ch.id}">${ch.name}</option>`).join('');
  },

  async handleCreateQuiz(e) {
    e.preventDefault();
    const chapterId = document.getElementById('m-quiz-chap').value;
    const title = document.getElementById('m-quiz-title').value;
    const questionCount = parseInt(document.getElementById('m-quiz-qcount').value);
    const timeLimit = parseInt(document.getElementById('m-quiz-timelimit').value);
    const difficulty = document.getElementById('m-quiz-diff').value;

    try {
      await API.createQuiz({ chapterId, title, questionCount, timeLimit, difficulty });
      this.closeModal();
      await this.loadAdminContentTree();
      alert('Quiz created successfully!');
    } catch (err) {
      alert('Error creating quiz: ' + err.message);
    }
  },

  openEditQuizModal(quizId) {
    const quiz = this.state.contentTree.quizzes.find(q => q.id === quizId);
    if (!quiz) {
      alert('Quiz not found.');
      return;
    }

    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content';

    modalBody.innerHTML = `
      <div class="modal-header">
        <h3>Edit Quiz: ${this.escapeHtml(quiz.title)}</h3>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <form id="form-edit-quiz" onsubmit="app.handleUpdateQuiz(event, '${quiz.id}')">
          <div class="form-group">
            <label class="form-label">Quiz Title</label>
            <input type="text" id="m-edit-quiz-title" class="form-input" value="${this.escapeHtml(quiz.title)}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Description (Optional)</label>
            <textarea id="m-edit-quiz-desc" class="form-input" rows="2">${this.escapeHtml(quiz.description || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">How Many Questions Should Each Quiz Have? (Served to Student)</label>
            <input type="number" id="m-edit-quiz-qcount" class="form-input" value="${quiz.question_count || 10}" min="1" max="100" required>
            <span style="font-size:0.75rem; color:var(--text-muted);">Admin can add as many questions to the bank as desired; this setting decides how many questions are served during a quiz attempt.</span>
          </div>

          <div class="grid-2-compact">
            <div class="form-group">
              <label class="form-label">Time Limit (Minutes)</label>
              <input type="number" id="m-edit-quiz-timelimit" class="form-input" value="${quiz.time_limit || 15}" required>
            </div>

            <div class="form-group">
              <label class="form-label">Difficulty</label>
              <select id="m-edit-quiz-diff" class="form-input">
                <option value="Easy" ${quiz.difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                <option value="Medium" ${quiz.difficulty === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Hard" ${quiz.difficulty === 'Hard' ? 'selected' : ''}>Hard</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-edit-quiz" class="btn btn-primary">Update Quiz</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async handleUpdateQuiz(e, quizId) {
    e.preventDefault();
    const title = document.getElementById('m-edit-quiz-title').value;
    const description = document.getElementById('m-edit-quiz-desc').value;
    const questionCount = parseInt(document.getElementById('m-edit-quiz-qcount').value);
    const timeLimit = parseInt(document.getElementById('m-edit-quiz-timelimit').value);
    const difficulty = document.getElementById('m-edit-quiz-diff').value;

    try {
      await API.updateQuiz(quizId, { title, description, questionCount, timeLimit, difficulty, status: 'ACTIVE' });
      this.closeModal();
      await this.loadAdminContentTree();
      alert('Quiz updated successfully!');
    } catch (err) {
      alert('Error updating quiz: ' + err.message);
    }
  },

  async handleDeleteQuiz(quizId) {
    const quiz = this.state.contentTree.quizzes.find(q => q.id === quizId);
    const quizTitle = quiz ? quiz.title : 'this quiz';
    if (!confirm(`Are you sure you want to delete quiz "${quizTitle}" and all its questions? This action cannot be undone.`)) {
      return;
    }

    try {
      await API.deleteQuiz(quizId);
      await this.loadAdminContentTree();
      alert('Quiz deleted successfully.');
    } catch (err) {
      alert('Error deleting quiz: ' + err.message);
    }
  },

  // ==========================================
  // QUESTION MODALS & CRUD
  // ==========================================
  openAddQuestionModal(preselectedCourseId = null, preselectedChapterId = null, preselectedQuizId = null) {
    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content modal-content-lg';
    const { courses, chapters, quizzes } = this.state.contentTree;

    const initialCourseId = preselectedCourseId || (courses.length > 0 ? courses[0].id : '');
    const filteredChapters = chapters.filter(ch => ch.course_id === initialCourseId);
    const initialChapterId = preselectedChapterId || (filteredChapters.length > 0 ? filteredChapters[0].id : '');
    const filteredQuizzes = quizzes.filter(q => q.chapter_id === initialChapterId);

    modalBody.innerHTML = `
      <div class="modal-header">
        <div>
          <h3>Add MCQ Question to Bank</h3>
          <span style="color:var(--text-muted); font-size:0.8rem;">Input as many questions as you like into the quiz bank.</span>
        </div>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <div id="m-q-error" style="background:var(--red-soft); color:var(--red); padding:10px 14px; border-radius:6px; font-size:0.88rem; margin-bottom:12px; display:none; border:1px solid var(--red);"></div>
        <div id="m-q-success" style="background:var(--green-soft); color:var(--green); padding:10px 14px; border-radius:6px; font-size:0.88rem; margin-bottom:12px; display:none; border:1px solid var(--green);"></div>

        <form id="form-add-question" onsubmit="app.handleCreateQuestion(event)">
          <div class="grid-3-compact" style="margin-bottom:12px;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem;">Course</label>
              <select id="m-q-course" class="form-input" style="padding:6px 10px; font-size:0.88rem;" onchange="app.onQCourseChange()" required>
                ${courses.length === 0 ? '<option value="">-- No Courses --</option>' : courses.map(c => `<option value="${c.id}" ${initialCourseId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem;">Chapter</label>
              <select id="m-q-chap" class="form-input" style="padding:6px 10px; font-size:0.88rem;" onchange="app.onQChapChange()" required>
                ${filteredChapters.length === 0 ? '<option value="">-- No Chapters --</option>' : filteredChapters.map(ch => `<option value="${ch.id}" ${initialChapterId === ch.id ? 'selected' : ''}>${ch.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem;">Target Quiz</label>
              <select id="m-q-quizid" class="form-input" style="padding:6px 10px; font-size:0.88rem;" required>
                ${filteredQuizzes.length === 0 ? '<option value="">-- No Quizzes In Chapter --</option>' : filteredQuizzes.map(q => `<option value="${q.id}" ${preselectedQuizId === q.id ? 'selected' : ''}>${q.title}</option>`).join('')}
              </select>
            </div>
          </div>

          <span id="m-q-quiz-warning" style="color:var(--red); font-size:0.8rem; display:${filteredQuizzes.length === 0 ? 'block' : 'none'}; margin-bottom:10px;">No Quiz exists in this Chapter. Please create a Quiz first.</span>

          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" style="font-size:0.85rem;">Question Statement</label>
            <textarea id="m-q-text" class="form-input" rows="2" style="padding:8px 12px; font-size:0.9rem;" placeholder="Enter question statement..." required></textarea>
          </div>

          <div class="grid-2-compact" style="margin-bottom:12px;">
            <div>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option A</label>
                <input type="text" id="m-q-opta" class="form-input" style="padding:6px 10px; font-size:0.88rem;" placeholder="Option A text..." required>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option B</label>
                <input type="text" id="m-q-optb" class="form-input" style="padding:6px 10px; font-size:0.88rem;" placeholder="Option B text..." required>
              </div>
            </div>

            <div>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option C</label>
                <input type="text" id="m-q-optc" class="form-input" style="padding:6px 10px; font-size:0.88rem;" placeholder="Option C text..." required>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option D</label>
                <input type="text" id="m-q-optd" class="form-input" style="padding:6px 10px; font-size:0.88rem;" placeholder="Option D text..." required>
              </div>
            </div>
          </div>

          <div class="grid-3-compact" style="margin-bottom:0;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem; color:var(--green);">Correct Answer Choice</label>
              <select id="m-q-correct" class="form-input" style="padding:6px 10px; font-size:0.88rem;" required>
                <option value="A">Option A</option>
                <option value="B">Option B</option>
                <option value="C">Option C</option>
                <option value="D">Option D</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem; color:var(--blue); font-weight:700;">Difficulty *</label>
              <select id="m-q-diff" class="form-input" style="padding:6px 10px; font-size:0.88rem;" required>
                <option value="Easy">Easy — Foundation</option>
                <option value="Medium" selected>Medium — Application</option>
                <option value="Hard">Hard — Challenge</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem;">Explanation (Optional)</label>
              <input type="text" id="m-q-exp" class="form-input" style="padding:6px 10px; font-size:0.88rem;" placeholder="Explanation for student review...">
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Done / Close</button>
        <button type="submit" form="form-add-question" id="btn-save-question" class="btn btn-success btn-lg" ${filteredQuizzes.length === 0 ? 'disabled' : ''}>Save Question & Add Another 💾</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  onQCourseChange() {
    const courseId = document.getElementById('m-q-course').value;
    const { chapters } = this.state.contentTree;
    const filteredChaps = chapters.filter(ch => ch.course_id === courseId);
    const chapSelect = document.getElementById('m-q-chap');

    if (filteredChaps.length === 0) {
      chapSelect.innerHTML = '<option value="">-- No Chapters Available --</option>';
    } else {
      chapSelect.innerHTML = filteredChaps.map(ch => `<option value="${ch.id}">${ch.name}</option>`).join('');
    }
    this.onQChapChange();
  },

  onQChapChange() {
    const chapId = document.getElementById('m-q-chap').value;
    const { quizzes } = this.state.contentTree;
    const filteredQuizzes = quizzes.filter(q => q.chapter_id === chapId);
    const quizSelect = document.getElementById('m-q-quizid');
    const btnSubmit = document.getElementById('btn-save-question');
    const warningEl = document.getElementById('m-q-quiz-warning');

    if (filteredQuizzes.length === 0) {
      quizSelect.innerHTML = '<option value="">-- No Quizzes In This Chapter --</option>';
      if (btnSubmit) btnSubmit.disabled = true;
      if (warningEl) {
        warningEl.innerText = 'No Quiz exists in this Chapter. Please create a Quiz first.';
        warningEl.style.display = 'block';
      }
    } else {
      quizSelect.innerHTML = filteredQuizzes.map(q => `<option value="${q.id}">${q.title}</option>`).join('');
      if (btnSubmit) btnSubmit.disabled = false;
      if (warningEl) warningEl.style.display = 'none';
    }
  },

  async handleCreateQuestion(e) {
    e.preventDefault();
    const errorEl = document.getElementById('m-q-error');
    const successEl = document.getElementById('m-q-success');

    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    const quizId = document.getElementById('m-q-quizid').value;
    const questionText = document.getElementById('m-q-text').value;
    const optionA = document.getElementById('m-q-opta').value;
    const optionB = document.getElementById('m-q-optb').value;
    const optionC = document.getElementById('m-q-optc').value;
    const optionD = document.getElementById('m-q-optd').value;
    const correctAnswer = document.getElementById('m-q-correct').value;
    const difficulty = document.getElementById('m-q-diff').value;
    const explanation = document.getElementById('m-q-exp').value;

    if (!quizId) {
      if (errorEl) {
        errorEl.innerText = 'Please select a valid Target Quiz. If no quiz exists in this chapter, create one first.';
        errorEl.style.display = 'block';
      }
      return;
    }

    try {
      await API.createQuestion({
        quizId, questionText, optionA, optionB, optionC, optionD, correctAnswer, explanation, difficulty
      });

      // Ensure this quiz remains expanded
      if (!this.state.expandedQuizzes) this.state.expandedQuizzes = new Set();
      this.state.expandedQuizzes.add(quizId);

      // Update background content tree
      await this.loadAdminContentTree();

      // Show inline success message
      if (successEl) {
        successEl.innerText = '✓ Question saved to bank! You can enter another question below.';
        successEl.style.display = 'block';
      }

      // Reset question input fields for continuous fast entry!
      document.getElementById('m-q-text').value = '';
      document.getElementById('m-q-opta').value = '';
      document.getElementById('m-q-optb').value = '';
      document.getElementById('m-q-optc').value = '';
      document.getElementById('m-q-optd').value = '';
      document.getElementById('m-q-exp').value = '';
      document.getElementById('m-q-text').focus();

    } catch (err) {
      if (errorEl) {
        errorEl.innerText = 'Failed to save question: ' + err.message;
        errorEl.style.display = 'block';
      } else {
        alert('Error adding question: ' + err.message);
      }
    }
  },

  openEditQuestionModal(questionId) {
    const quest = this.state.contentTree.questions.find(q => q.id === questionId);
    if (!quest) {
      alert('Question not found.');
      return;
    }

    const modal = document.getElementById('modal-container');
    const modalBody = document.getElementById('modal-body');
    modalBody.className = 'modal-content modal-content-lg';

    modalBody.innerHTML = `
      <div class="modal-header">
        <div>
          <h3>Edit MCQ Question</h3>
          <span style="color:var(--text-muted); font-size:0.8rem;">Update question statement, choices, or explanation.</span>
        </div>
        <button type="button" class="modal-close-btn" onclick="app.closeModal()" title="Close (Esc)">✕</button>
      </div>

      <div class="modal-body-scroll">
        <div id="m-edit-q-error" style="background:var(--red-soft); color:var(--red); padding:10px 14px; border-radius:6px; font-size:0.88rem; margin-bottom:12px; display:none; border:1px solid var(--red);"></div>

        <form id="form-edit-question" onsubmit="app.handleUpdateQuestion(event, '${quest.id}')">
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" style="font-size:0.85rem;">Question Statement</label>
            <textarea id="m-edit-q-text" class="form-input" rows="2" style="padding:8px 12px; font-size:0.9rem;" required>${this.escapeHtml(quest.question_text)}</textarea>
          </div>

          <div class="grid-2-compact" style="margin-bottom:12px;">
            <div>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option A</label>
                <input type="text" id="m-edit-q-opta" class="form-input" style="padding:6px 10px; font-size:0.88rem;" value="${this.escapeHtml(quest.option_a)}" required>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option B</label>
                <input type="text" id="m-edit-q-optb" class="form-input" style="padding:6px 10px; font-size:0.88rem;" value="${this.escapeHtml(quest.option_b)}" required>
              </div>
            </div>

            <div>
              <div class="form-group" style="margin-bottom:10px;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option C</label>
                <input type="text" id="m-edit-q-optc" class="form-input" style="padding:6px 10px; font-size:0.88rem;" value="${this.escapeHtml(quest.option_c)}" required>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.8rem; color:var(--blue);">Option D</label>
                <input type="text" id="m-edit-q-optd" class="form-input" style="padding:6px 10px; font-size:0.88rem;" value="${this.escapeHtml(quest.option_d)}" required>
              </div>
            </div>
          </div>

          <div class="grid-3-compact" style="margin-bottom:0;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem; color:var(--green);">Correct Answer Choice</label>
              <select id="m-edit-q-correct" class="form-input" style="padding:6px 10px; font-size:0.88rem;" required>
                <option value="A" ${quest.correct_answer === 'A' ? 'selected' : ''}>Option A</option>
                <option value="B" ${quest.correct_answer === 'B' ? 'selected' : ''}>Option B</option>
                <option value="C" ${quest.correct_answer === 'C' ? 'selected' : ''}>Option C</option>
                <option value="D" ${quest.correct_answer === 'D' ? 'selected' : ''}>Option D</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem; color:var(--blue); font-weight:700;">Difficulty *</label>
              <select id="m-edit-q-diff" class="form-input" style="padding:6px 10px; font-size:0.88rem;" required>
                <option value="Easy" ${(quest.difficulty || 'Medium') === 'Easy' ? 'selected' : ''}>Easy — Foundation</option>
                <option value="Medium" ${(quest.difficulty || 'Medium') === 'Medium' ? 'selected' : ''}>Medium — Application</option>
                <option value="Hard" ${(quest.difficulty || 'Medium') === 'Hard' ? 'selected' : ''}>Hard — Challenge</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.8rem;">Explanation (Optional)</label>
              <input type="text" id="m-edit-q-exp" class="form-input" style="padding:6px 10px; font-size:0.88rem;" value="${this.escapeHtml(quest.explanation || '')}">
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button type="submit" form="form-edit-question" class="btn btn-primary">Update Question 💾</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async handleUpdateQuestion(e, questionId) {
    e.preventDefault();
    const errorEl = document.getElementById('m-edit-q-error');
    if (errorEl) errorEl.style.display = 'none';

    const questionText = document.getElementById('m-edit-q-text').value;
    const optionA = document.getElementById('m-edit-q-opta').value;
    const optionB = document.getElementById('m-edit-q-optb').value;
    const optionC = document.getElementById('m-edit-q-optc').value;
    const optionD = document.getElementById('m-edit-q-optd').value;
    const correctAnswer = document.getElementById('m-edit-q-correct').value;
    const difficulty = document.getElementById('m-edit-q-diff').value;
    const explanation = document.getElementById('m-edit-q-exp').value;

    try {
      await API.updateQuestion(questionId, {
        questionText, optionA, optionB, optionC, optionD, correctAnswer, explanation, difficulty
      });
      this.closeModal();
      await this.loadAdminContentTree();
    } catch (err) {
      if (errorEl) {
        errorEl.innerText = 'Failed to update question: ' + err.message;
        errorEl.style.display = 'block';
      } else {
        alert('Error updating question: ' + err.message);
      }
    }
  },

  async handleDeleteQuestion(questionId) {
    if (!confirm('Are you sure you want to delete this question from the quiz bank?')) {
      return;
    }
    try {
      await API.deleteQuestion(questionId);
      await this.loadAdminContentTree();
    } catch (err) {
      alert('Failed to delete question: ' + err.message);
    }
  },

  closeModal() {
    document.getElementById('modal-container').style.display = 'none';
  }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
