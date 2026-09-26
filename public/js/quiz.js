// CLN Questions Exam Engine Controller
const quizEngine = {
  attemptId: null,
  quiz: null,
  questions: [],
  currentIndex: 0,
  userAnswers: {}, // { questionId: "A" | "B" | "C" | "D" }
  timerInterval: null,
  timeRemainingSeconds: 0,

  async start(quizId) {
    try {
      const data = await API.startQuiz(quizId);
      this.attemptId = data.attemptId;
      this.quiz = data.quiz;
      this.questions = data.questions;
      this.currentIndex = 0;
      this.userAnswers = {};

      // Setup countdown timer
      this.timeRemainingSeconds = (this.quiz.timeLimit || 15) * 60;
      this.startTimer();

      // Render quiz UI
      app.showView('quiz');
      this.renderQuestion();
      this.renderNavGrid();
    } catch (err) {
      alert('Failed to start quiz: ' + err.message);
    }
  },

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const timerText = document.getElementById('quiz-timer-text');
    const timerContainer = document.getElementById('quiz-timer-container');

    const updateTimerDisplay = () => {
      const minutes = Math.floor(this.timeRemainingSeconds / 60);
      const seconds = this.timeRemainingSeconds % 60;
      const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (timerText) timerText.innerText = formatted;

      // Color rules
      if (timerContainer) {
        timerContainer.classList.remove('timer-warning', 'timer-critical');
        if (this.timeRemainingSeconds <= 60) {
          timerContainer.classList.add('timer-critical');
        } else if (this.timeRemainingSeconds <= 300) {
          timerContainer.classList.add('timer-warning');
        }
      }

      if (this.timeRemainingSeconds <= 0) {
        clearInterval(this.timerInterval);
        alert('Time is up! Submitting your quiz now.');
        this.submitQuiz();
      } else {
        this.timeRemainingSeconds--;
      }
    };

    updateTimerDisplay();
    this.timerInterval = setInterval(updateTimerDisplay, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  renderQuestion() {
    const q = this.questions[this.currentIndex];
    if (!q) return;

    document.getElementById('quiz-course-title').innerText = `${this.quiz.courseName || 'COURSE'} — ${this.quiz.chapterName || 'CHAPTER'}`;
    document.getElementById('quiz-title-display').innerText = this.quiz.title;
    document.getElementById('question-progress-text').innerText = `Question ${this.currentIndex + 1} of ${this.questions.length}`;

    const textEl = document.getElementById('question-text-display');
    textEl.innerText = q.question_text;

    // Optional Question Image
    const imgContainer = document.getElementById('question-image-container');
    const imgEl = document.getElementById('question-img');
    if (q.image_url) {
      imgEl.src = q.image_url;
      imgContainer.style.display = 'block';
    } else {
      imgContainer.style.display = 'none';
    }

    // Render Options A, B, C, D
    const optionsContainer = document.getElementById('quiz-options-container');
    optionsContainer.innerHTML = '';

    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ];

    const currentSelected = this.userAnswers[q.id];

    options.forEach(opt => {
      const card = document.createElement('div');
      card.className = `option-card ${currentSelected === opt.key ? 'selected' : ''}`;
      card.onclick = () => this.selectOption(q.id, opt.key);

      card.innerHTML = `
        <span class="option-letter">${opt.key}</span>
        <span style="font-weight:500; font-size:0.95rem;">${opt.text}</span>
      `;

      optionsContainer.appendChild(card);
    });

    // Button states
    const btnPrev = document.getElementById('btn-prev-q');
    const btnNext = document.getElementById('btn-next-q');
    const btnSubmit = document.getElementById('btn-submit-quiz');

    btnPrev.disabled = this.currentIndex === 0;
    btnPrev.style.opacity = this.currentIndex === 0 ? '0.5' : '1';

    if (this.currentIndex === this.questions.length - 1) {
      btnNext.style.display = 'none';
      btnSubmit.style.display = 'inline-flex';
    } else {
      btnNext.style.display = 'inline-flex';
      btnSubmit.style.display = 'none';
    }

    this.renderNavGrid();
  },

  selectOption(questionId, optionKey) {
    this.userAnswers[questionId] = optionKey;
    this.renderQuestion();
  },

  nextQuestion() {
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      this.renderQuestion();
    }
  },

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderQuestion();
    }
  },

  jumpToQuestion(index) {
    if (index >= 0 && index < this.questions.length) {
      this.currentIndex = index;
      this.renderQuestion();
    }
  },

  renderNavGrid() {
    const grid = document.getElementById('quiz-nav-grid');
    grid.innerHTML = '';

    this.questions.forEach((q, idx) => {
      const item = document.createElement('div');
      const isAnswered = !!this.userAnswers[q.id];
      const isActive = idx === this.currentIndex;

      item.className = `nav-grid-item ${isAnswered ? 'answered' : ''} ${isActive ? 'active' : ''}`;
      item.innerText = idx + 1;
      item.onclick = () => this.jumpToQuestion(idx);

      grid.appendChild(item);
    });
  },

  async submitQuiz() {
    this.stopTimer();

    try {
      const results = await API.submitQuiz(this.quiz.id, this.attemptId, this.userAnswers);
      app.showQuizResults(results);
    } catch (err) {
      alert('Error submitting quiz: ' + err.message);
    }
  }
};
