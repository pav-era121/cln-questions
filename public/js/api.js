// CLN Questions Client API Service
const API_BASE = '/api';

const API = {
  getToken() {
    return localStorage.getItem('cln_jwt_token');
  },

  setToken(token) {
    localStorage.setItem('cln_jwt_token', token);
  },

  clearToken() {
    localStorage.removeItem('cln_jwt_token');
    localStorage.removeItem('cln_user');
  },

  getUser() {
    const raw = localStorage.getItem('cln_user');
    return raw ? JSON.parse(raw) : null;
  },

  setUser(user) {
    localStorage.setItem('cln_user', JSON.stringify(user));
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const text = await response.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status} (${response.statusText}).`);
        }
        throw new Error('Invalid response from server.');
      }

      if (!response.ok) {
        if (data && data.suspended) {
          window.dispatchEvent(new CustomEvent('cln:user-suspended', { detail: data }));
        }
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  },

  // Auth Methods
  async register(fullName, email, phone, password, marketingConsent) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, email, phone, password, marketingConsent })
    });
    this.setToken(res.token);
    this.setUser(res.user);
    return res;
  },

  async login(loginIdentifier, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginIdentifier, password })
    });
    this.setToken(res.token);
    this.setUser(res.user);
    return res;
  },

  async getProfile() {
    const res = await this.request('/auth/me');
    if (res.user) this.setUser(res.user);
    return res.user;
  },

  // Courses & Quizzes
  async getCourses() {
    return await this.request('/courses');
  },

  async getCourseDetails(id) {
    return await this.request(`/courses/${id}`);
  },

  async getChapterDetails(id) {
    return await this.request(`/chapters/${id}`);
  },

  async startQuiz(quizId) {
    return await this.request(`/quizzes/${quizId}/start`);
  },

  async submitQuiz(quizId, attemptId, userAnswers) {
    return await this.request(`/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ attemptId, userAnswers })
    });
  },

  // Student Dashboard & History
  async getStudentDashboard() {
    return await this.request('/student/dashboard');
  },

  async getStudentHistory() {
    return await this.request('/student/history');
  },

  // Admin Methods
  async getAdminStats() {
    return await this.request('/admin/stats');
  },

  async getAdminUsers() {
    return await this.request('/admin/users');
  },

  async getAdminContentTree() {
    return await this.request('/admin/content-tree');
  },

  async updateUserStatus(userId, status) {
    return await this.request(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  async createCourse(courseData) {
    return await this.request('/admin/courses', {
      method: 'POST',
      body: JSON.stringify(courseData)
    });
  },

  async updateCourse(id, courseData) {
    return await this.request(`/admin/courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(courseData)
    });
  },

  async deleteCourse(id) {
    return await this.request(`/admin/courses/${id}`, {
      method: 'DELETE'
    });
  },

  async createChapter(chapterData) {
    return await this.request('/admin/chapters', {
      method: 'POST',
      body: JSON.stringify(chapterData)
    });
  },

  async updateChapter(id, chapterData) {
    return await this.request(`/admin/chapters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(chapterData)
    });
  },

  async deleteChapter(id) {
    return await this.request(`/admin/chapters/${id}`, {
      method: 'DELETE'
    });
  },

  async createQuiz(quizData) {
    return await this.request('/admin/quizzes', {
      method: 'POST',
      body: JSON.stringify(quizData)
    });
  },

  async updateQuiz(id, quizData) {
    return await this.request(`/admin/quizzes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(quizData)
    });
  },

  async deleteQuiz(id) {
    return await this.request(`/admin/quizzes/${id}`, {
      method: 'DELETE'
    });
  },

  async createQuestion(questionData) {
    return await this.request('/admin/questions', {
      method: 'POST',
      body: JSON.stringify(questionData)
    });
  },

  async updateQuestion(id, questionData) {
    return await this.request(`/admin/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(questionData)
    });
  },

  async deleteQuestion(id) {
    return await this.request(`/admin/questions/${id}`, {
      method: 'DELETE'
    });
  },

  async uploadImage(formData) {
    return await this.request('/admin/upload', {
      method: 'POST',
      body: formData
    });
  },

  // SUNDAY LIVE ARENA
  async getArenaCurrent() {
    return await this.request('/arena/current');
  },

  async joinArena(sessionId) {
    return await this.request('/arena/join', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  },

  async submitArenaAnswer(sessionId, questionIndex, answerKey) {
    return await this.request('/arena/submit', {
      method: 'POST',
      body: JSON.stringify({ sessionId, questionIndex, answerKey })
    });
  },

  async getArenaLeaderboard(sessionId) {
    return await this.request(`/arena/leaderboard/${sessionId}`);
  },

  async adminArenaStatus(payload) {
    return await this.request('/admin/arena/status', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async adminArenaCreate(payload) {
    return await this.request('/admin/arena/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async adminArenaMonitor() {
    return await this.request('/admin/arena/monitor');
  }
};
