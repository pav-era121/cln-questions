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

    // View specific logic
    if (viewName === 'home') {
      this.renderHomeCourses();
    } else if (viewName === 'courses') {
      this.renderCoursesList();
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
      errorEl.innerText = err.message;
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

    grid.innerHTML = featured.map(c => `
      <div class="course-card">
        <img class="course-img" src="${c.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'}" alt="${c.name}">
        <div class="course-body">
          <h3 class="course-title">${c.name}</h3>
          <p class="course-desc">${c.description}</p>
          <div class="course-meta">
            <span>📚 ${c.chapter_count || 1} Chapters</span>
            <button class="btn btn-primary btn-sm" onclick="app.showCourseDetail('${c.id}')">Practice →</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderCoursesList() {
    const grid = document.getElementById('courses-list-grid');
    if (!grid) return;

    grid.innerHTML = this.state.courses.map(c => `
      <div class="course-card">
        <img class="course-img" src="${c.image_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'}" alt="${c.name}">
        <div class="course-body">
          <h3 class="course-title">${c.name}</h3>
          <p class="course-desc">${c.description}</p>
          <div class="course-meta">
            <span>📚 ${c.chapter_count || 1} Chapters</span>
            <button class="btn btn-primary btn-sm" onclick="app.showCourseDetail('${c.id}')">Explore Chapters →</button>
          </div>
        </div>
      </div>
    `).join('');
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
      gridEl.innerHTML = chapters.map(ch => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0;">
          <div>
            <h4 style="font-size:1.1rem; font-weight:700; color:var(--navy);">${ch.name}</h4>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-top:4px;">${ch.description}</p>
          </div>
          <button class="btn btn-primary" onclick="app.showChapterDetail('${ch.id}')">Start Quiz →</button>
        </div>
      `).join('');

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
        <div class="card" style="margin-bottom:24px;">
          <h2 style="font-size:1.5rem; font-weight:800; color:var(--navy);">${ch.name}</h2>
          <p style="color:var(--text-muted); margin-top:6px;">${ch.description}</p>
        </div>

        <h3 style="font-size:1.2rem; font-weight:700; color:var(--navy); margin-bottom:16px;">Available Chapter Quizzes</h3>
        ${quizzes.map(q => `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="font-size:1.1rem; font-weight:700; color:var(--navy);">${q.title}</h4>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                ⏱️ ${q.time_limit} Minutes • ❓ ${q.question_count} Questions Served • 📈 ${q.difficulty} Difficulty
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
      alert('Please log in or register to take timed practice quizzes.');
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
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <span style="font-weight:700; color:var(--text-muted);">Question ${idx + 1}</span>
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

      await this.loadAdminUsers();
      await this.loadAdminContentTree();
    } catch (err) {
      alert('Failed to load admin panel: ' + err.message);
    }
  },

  showAdminTab(tabName) {
    document.getElementById('admin-tab-users').style.display = tabName === 'users' ? 'block' : 'none';
    document.getElementById('admin-tab-courses').style.display = tabName === 'courses' ? 'block' : 'none';
    if (tabName === 'courses') {
      this.loadAdminContentTree();
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

  renderAdminContentTree() {
    const container = document.getElementById('admin-content-tree');
    if (!container) return;

    const { courses, chapters, quizzes, questions } = this.state.contentTree;

    if (courses.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No courses created yet.</p>';
      return;
    }

    container.innerHTML = courses.map(c => {
      const courseChapters = chapters.filter(ch => ch.course_id === c.id);

      return `
        <div class="card" style="margin-bottom:20px; border-left:4px solid var(--navy);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <span class="brand-badge">COURSE</span>
              <h3 style="font-size:1.2rem; font-weight:800; color:var(--navy); display:inline; margin-left:8px;">${c.name}</h3>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="app.openAddChapterModal('${c.id}')">+ Add Chapter to ${c.name}</button>
          </div>
          <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:16px;">${c.description || 'No description'}</p>

          <!-- CHAPTERS UNDER THIS COURSE -->
          <div style="padding-left:16px; border-left:2px solid var(--border);">
            ${courseChapters.length === 0 ? `
              <div style="font-size:0.85rem; color:var(--text-muted);">No chapters under this course yet.</div>
            ` : courseChapters.map(ch => {
              const chapterQuizzes = quizzes.filter(q => q.chapter_id === ch.id);

              return `
                <div style="background:var(--bg-main); padding:16px; border-radius:8px; margin-bottom:12px; border:1px solid var(--border);">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div>
                      <span class="brand-badge" style="background:var(--blue);">CHAPTER</span>
                      <strong style="color:var(--navy); font-size:1rem; margin-left:6px;">${ch.name}</strong>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="app.openAddQuizModal('${c.id}', '${ch.id}')">+ Add Quiz to Chapter</button>
                  </div>
                  <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">${ch.description || ''}</p>

                  <!-- QUIZZES UNDER THIS CHAPTER -->
                  <div style="padding-left:16px;">
                    ${chapterQuizzes.length === 0 ? `
                      <div style="font-size:0.8rem; color:var(--text-muted);">No quizzes in this chapter.</div>
                    ` : chapterQuizzes.map(q => {
                      const quizQuestions = questions.filter(quest => quest.quiz_id === q.id);

                      return `
                        <div style="background:#fff; padding:12px 16px; border-radius:6px; margin-bottom:8px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                          <div>
                            <strong style="color:var(--navy); font-size:0.95rem;">${q.title}</strong>
                            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                              ⏱️ ${q.time_limit} Mins • 🎯 Quiz Configured Question Count: <strong>${q.question_count}</strong> • 📚 Bank Total: <strong>${quizQuestions.length} Questions</strong>
                            </div>
                          </div>
                          <button class="btn btn-success btn-sm" onclick="app.openAddQuestionModal('${c.id}', '${ch.id}', '${q.id}')">+ Add Question to Quiz</button>
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

  // ADMIN CONTENT CREATION MODALS WITH CASCADING DROPDOWNS
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
            <textarea id="m-course-desc" class="form-input" rows="3" placeholder="Course description..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Image URL</label>
            <input type="text" id="m-course-img" class="form-input" placeholder="https://images.unsplash.com/...">
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
            <textarea id="m-chap-desc" class="form-input" rows="2" placeholder="Chapter overview..."></textarea>
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

    try {
      await API.createChapter({ courseId, name, description });
      this.closeModal();
      await this.loadAdminContentTree();
      alert('Chapter created successfully!');
    } catch (err) {
      alert('Error creating chapter: ' + err.message);
    }
  },

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

          <div class="grid-2-compact" style="margin-bottom:0;">
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
    const explanation = document.getElementById('m-q-exp').value;

    if (!quizId) {
      if (errorEl) {
        errorEl.innerText = 'Please select a valid Target Quiz. If no quiz exists in this chapter, create one first.';
        errorEl.style.display = 'block';
      }
      return;
    }

    try {
      const res = await API.createQuestion({
        quizId, questionText, optionA, optionB, optionC, optionD, correctAnswer, explanation
      });

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

  closeModal() {
    document.getElementById('modal-container').style.display = 'none';
  }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
