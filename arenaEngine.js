// arenaEngine.js — Synchronized Live Competition Engine for CLN Questions
// Designed for Sunday Weekly Grand Arena & Competitive Contests

class ArenaEngine {
  constructor() {
    this.db = null;
    this.activeSession = null;
    this.questions = []; // Cached question details for current session
    this.participants = new Map(); // userId -> { userId, userName, totalScore, totalTimeMs, answers: {} }
    this.timerInterval = null;
    this.autoAdvance = true;
  }

  async init(database) {
    this.db = database;

    try {
      // 1. Create Tables if they don't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS arena_sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          course_id TEXT,
          scheduled_at TEXT NOT NULL,
          seconds_per_question INTEGER DEFAULT 40,
          question_ids TEXT NOT NULL,
          status TEXT DEFAULT 'SCHEDULED',
          current_question_index INTEGER DEFAULT 0,
          current_question_started_at INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS arena_participants (
          session_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          joined_at INTEGER NOT NULL,
          total_score INTEGER DEFAULT 0,
          total_time_ms INTEGER DEFAULT 0,
          answers TEXT DEFAULT '{}',
          PRIMARY KEY (session_id, user_id)
        );
      `);

      // 2. Load latest active, lobby, or scheduled session
      await this.loadActiveSession();

      // 3. If no session exists, initialize an upcoming Sunday Arena
      if (!this.activeSession) {
        await this.ensureUpcomingSundaySession();
      }

      console.log('✅ Arena Engine initialized successfully.');
    } catch (err) {
      console.error('❌ Arena Engine initialization error:', err.message);
    }
  }

  // Calculate next Sunday at 8:00 PM (East Africa Time / Local time)
  getNextSunday8PM() {
    const now = new Date();
    const nextSun = new Date(now);
    const day = now.getDay(); // 0 is Sunday
    const diff = (7 - day) % 7;
    
    // If today is Sunday and it's already past 20:00 (8 PM), set to next Sunday
    if (diff === 0 && (now.getHours() > 20 || (now.getHours() === 20 && now.getMinutes() > 0))) {
      nextSun.setDate(now.getDate() + 7);
    } else {
      nextSun.setDate(now.getDate() + diff);
    }
    nextSun.setHours(20, 0, 0, 0);
    return nextSun.toISOString();
  }

  async ensureUpcomingSundaySession() {
    try {
      const scheduledAt = this.getNextSunday8PM();
      const sessionId = `arena_sun_${Date.now()}`;
      
      // Select 25 high-quality random questions across available courses
      const randomQuestions = await this.db.prepare(`
        SELECT id FROM questions 
        WHERE question_text IS NOT NULL AND option_a IS NOT NULL AND option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT 25
      `).all();

      if (!randomQuestions || randomQuestions.length === 0) {
        console.warn('⚠️ No questions found in database to create arena session.');
        return;
      }

      const qIds = randomQuestions.map(q => q.id);

      await this.db.prepare(`
        INSERT INTO arena_sessions (id, title, course_id, scheduled_at, seconds_per_question, question_ids, status, current_question_index, current_question_started_at)
        VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', 0, 0)
      `).run(
        sessionId,
        'Sunday Grand Arena: Freshman Championship',
        null,
        scheduledAt,
        40,
        JSON.stringify(qIds)
      );

      await this.loadActiveSession();
      console.log(`🏆 Created official upcoming Sunday Arena session: ${sessionId}`);
    } catch (err) {
      console.error('Error ensuring Sunday session:', err.message);
    }
  }

  async loadActiveSession() {
    try {
      // Find session in 'ACTIVE', 'LOBBY', or most recent 'SCHEDULED' / 'ENDED'
      let session = await this.db.prepare(`
        SELECT * FROM arena_sessions 
        WHERE status IN ('ACTIVE', 'LOBBY')
        ORDER BY created_at DESC LIMIT 1
      `).get();

      if (!session) {
        session = await this.db.prepare(`
          SELECT * FROM arena_sessions 
          ORDER BY created_at DESC LIMIT 1
        `).get();
      }

      if (!session) {
        this.activeSession = null;
        this.questions = [];
        this.participants.clear();
        return;
      }

      this.activeSession = session;
      const qIds = JSON.parse(session.question_ids || '[]');

      if (qIds.length > 0) {
        // Fetch question details in exact order
        const placeholders = qIds.map(() => '?').join(',');
        const rows = await this.db.prepare(`
          SELECT id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty 
          FROM questions WHERE id IN (${placeholders})
        `).all(qIds);

        const rowMap = new Map(rows.map(r => [r.id, r]));
        this.questions = qIds.map(id => rowMap.get(id)).filter(Boolean);
      } else {
        this.questions = [];
      }

      // Load participants from DB
      this.participants.clear();
      const parts = await this.db.prepare(`
        SELECT session_id, user_id, user_name, joined_at, total_score, total_time_ms, answers
        FROM arena_participants WHERE session_id = ?
      `).all(session.id);

      parts.forEach(p => {
        let answers = {};
        try { answers = JSON.parse(p.answers || '{}'); } catch(e) {}
        this.participants.set(p.user_id, {
          userId: p.user_id,
          userName: p.user_name,
          totalScore: p.total_score || 0,
          totalTimeMs: p.total_time_ms || 0,
          answers
        });
      });

      // If active, manage question timer loop
      if (this.activeSession.status === 'ACTIVE') {
        this.startTickLoop();
      }
    } catch (err) {
      console.error('Error loading active arena session:', err.message);
    }
  }

  startTickLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (!this.activeSession || this.activeSession.status !== 'ACTIVE') {
        clearInterval(this.timerInterval);
        return;
      }

      const elapsedMs = Date.now() - (this.activeSession.current_question_started_at || 0);
      const limitMs = (this.activeSession.seconds_per_question || 40) * 1000;

      // When time for question expires + 3 second breather grace period
      if (elapsedMs >= limitMs + 3000) {
        if (this.autoAdvance) {
          this.advanceNextQuestion();
        }
      }
    }, 1000);
  }

  async advanceNextQuestion() {
    if (!this.activeSession || this.activeSession.status !== 'ACTIVE') return;

    const nextIdx = this.activeSession.current_question_index + 1;

    if (nextIdx >= this.questions.length) {
      // Reached the end of questions -> END & REVEAL
      await this.endSession();
    } else {
      this.activeSession.current_question_index = nextIdx;
      this.activeSession.current_question_started_at = Date.now();

      await this.db.prepare(`
        UPDATE arena_sessions 
        SET current_question_index = ?, current_question_started_at = ?
        WHERE id = ?
      `).run(nextIdx, this.activeSession.current_question_started_at, this.activeSession.id);
    }
  }

  async endSession() {
    if (!this.activeSession) return;
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.activeSession.status = 'ENDED';

    await this.db.prepare(`
      UPDATE arena_sessions 
      SET status = 'ENDED' 
      WHERE id = ?
    `).run(this.activeSession.id);

    // Finalize rewards & XP for participants
    const leaderboard = this.getLeaderboard();

    for (let i = 0; i < leaderboard.length; i++) {
      const p = leaderboard[i];
      let bonusXp = 50 + (p.totalScore * 10);
      if (i === 0) bonusXp += 150; // 🥇 1st place bonus
      else if (i === 1) bonusXp += 75; // 🥈 2nd place bonus
      else if (i === 2) bonusXp += 40; // 🥉 3rd place bonus

      try {
        await this.db.prepare(`
          UPDATE users SET total_xp = total_xp + ? WHERE id = ?
        `).run(bonusXp, p.userId);
      } catch (e) {
        // Safe ignore
      }
    }

    console.log(`🏁 Sunday Arena ended. Final leaderboard computed for ${leaderboard.length} competitors.`);
  }

  // Submit Answer with High-Precision Server Timestamp
  async submitAnswer(sessionId, userId, questionIndex, answerKey) {
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      throw new Error('No active arena session matching this ID.');
    }

    if (this.activeSession.status !== 'ACTIVE') {
      throw new Error('Arena is not currently accepting answers.');
    }

    if (questionIndex !== this.activeSession.current_question_index) {
      throw new Error('Question time has expired or does not match current question.');
    }

    const currentQ = this.questions[questionIndex];
    if (!currentQ) {
      throw new Error('Invalid question index.');
    }

    let participant = this.participants.get(userId);
    if (!participant) {
      throw new Error('You have not joined this arena session.');
    }

    // Anti-cheat: Check if already answered this question
    if (participant.answers[questionIndex]) {
      return {
        success: true,
        alreadySubmitted: true,
        selectedAnswer: participant.answers[questionIndex].answer
      };
    }

    const startedAt = this.activeSession.current_question_started_at || Date.now();
    const rawTimeMs = Date.now() - startedAt;
    const maxLimitMs = (this.activeSession.seconds_per_question || 40) * 1000;
    const timeMs = Math.max(100, Math.min(maxLimitMs, rawTimeMs));

    const isCorrect = (answerKey.toUpperCase() === currentQ.correct_answer.toUpperCase());

    // Update in-memory participant stats
    if (isCorrect) {
      participant.totalScore += 1;
    }
    participant.totalTimeMs += timeMs;
    participant.answers[questionIndex] = {
      answer: answerKey.toUpperCase(),
      timeMs,
      isCorrect
    };

    // Save to database asynchronously
    await this.db.prepare(`
      UPDATE arena_participants 
      SET total_score = ?, total_time_ms = ?, answers = ?
      WHERE session_id = ? AND user_id = ?
    `).run(
      participant.totalScore,
      participant.totalTimeMs,
      JSON.stringify(participant.answers),
      sessionId,
      userId
    );

    return {
      success: true,
      questionIndex,
      selectedAnswer: answerKey.toUpperCase(),
      timeMs,
      timeFormatted: (timeMs / 1000).toFixed(2) + 's'
    };
  }

  async joinSession(sessionId, user) {
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      throw new Error('Session not found.');
    }

    if (this.activeSession.status === 'ENDED') {
      throw new Error('This session has already ended.');
    }

    if (!this.participants.has(user.id)) {
      const newPart = {
        userId: user.id,
        userName: user.fullName || user.email.split('@')[0],
        totalScore: 0,
        totalTimeMs: 0,
        answers: {}
      };
      this.participants.set(user.id, newPart);

      await this.db.prepare(`
        INSERT OR REPLACE INTO arena_participants (session_id, user_id, user_name, joined_at, total_score, total_time_ms, answers)
        VALUES (?, ?, ?, ?, 0, 0, '{}')
      `).run(sessionId, user.id, newPart.userName, Date.now());
    }

    return { success: true, participantCount: this.participants.size };
  }

  getLeaderboard() {
    const list = Array.from(this.participants.values()).map(p => ({
      userId: p.userId,
      userName: p.userName,
      totalScore: p.totalScore,
      totalTimeMs: p.totalTimeMs,
      totalTimeFormatted: this.formatTime(p.totalTimeMs),
      answersCount: Object.keys(p.answers).length
    }));

    // Primary: Score DESC; Secondary (Tie-Breaker): Total Time ASC
    list.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.totalTimeMs - b.totalTimeMs;
    });

    return list.map((item, idx) => ({
      rank: idx + 1,
      ...item
    }));
  }

  formatTime(ms) {
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  // Get Client State (Sanitized for User vs Admin)
  getPublicState(user = null, isAdmin = false) {
    if (!this.activeSession) {
      return { hasSession: false };
    }

    const sess = this.activeSession;
    const now = Date.now();
    const currentQIdx = sess.current_question_index;
    const currentQ = this.questions[currentQIdx] || null;

    let myAnswer = null;
    let myRank = null;
    let myScore = 0;
    let myTotalTime = 0;
    let isJoined = false;

    if (user && this.participants.has(user.id)) {
      isJoined = true;
      const part = this.participants.get(user.id);
      myScore = part.totalScore;
      myTotalTime = part.totalTimeMs;
      if (part.answers && part.answers[currentQIdx]) {
        myAnswer = part.answers[currentQIdx];
      }
    }

    // Build Current Question Payload (STRICTLY OMIT correct_answer & explanation from student!)
    let currentQuestionPayload = null;
    if (sess.status === 'ACTIVE' && currentQ) {
      currentQuestionPayload = {
        index: currentQIdx,
        id: currentQ.id,
        question_text: currentQ.question_text,
        image_url: currentQ.image_url,
        option_a: currentQ.option_a,
        option_b: currentQ.option_b,
        option_c: currentQ.option_c,
        option_d: currentQ.option_d,
        difficulty: currentQ.difficulty || 'Medium',
        totalQuestions: this.questions.length
      };

      // Admin gets correct answer for live supervision
      if (isAdmin) {
        currentQuestionPayload.correct_answer = currentQ.correct_answer;
        currentQuestionPayload.explanation = currentQ.explanation;
      }
    }

    // Heatmap of current question choices (Admin only)
    let adminHeatmap = null;
    if (isAdmin && sess.status === 'ACTIVE') {
      const counts = { A: 0, B: 0, C: 0, D: 0, answered: 0, total: this.participants.size };
      for (const p of this.participants.values()) {
        const a = p.answers[currentQIdx];
        if (a && a.answer) {
          counts[a.answer] = (counts[a.answer] || 0) + 1;
          counts.answered++;
        }
      }
      adminHeatmap = counts;
    }

    // Leaderboard logic:
    // Only revealed to students when session is 'ENDED', but ALWAYS available to admin
    let leaderboard = null;
    if (sess.status === 'ENDED' || isAdmin) {
      leaderboard = this.getLeaderboard();
      if (user) {
        const found = leaderboard.find(l => l.userId === user.id);
        if (found) myRank = found.rank;
      }
    }

    return {
      hasSession: true,
      sessionId: sess.id,
      title: sess.title,
      courseId: sess.course_id,
      status: sess.status, // 'SCHEDULED', 'LOBBY', 'ACTIVE', 'ENDED'
      scheduledAt: sess.scheduled_at,
      secondsPerQuestion: sess.seconds_per_question,
      totalQuestions: this.questions.length,
      currentQuestionIndex: currentQIdx,
      currentQuestionStartedAt: sess.current_question_started_at,
      serverTime: now,
      participantCount: this.participants.size,
      isJoined,
      myStatus: {
        answered: !!myAnswer,
        selectedAnswer: myAnswer ? myAnswer.answer : null,
        myScore,
        myTotalTimeFormatted: this.formatTime(myTotalTime),
        myRank
      },
      currentQuestion: currentQuestionPayload,
      leaderboard,
      adminHeatmap
    };
  }

  // Admin Controls
  async adminSetStatus(status) {
    if (!this.activeSession) throw new Error('No session active.');

    this.activeSession.status = status;

    if (status === 'ACTIVE') {
      this.activeSession.current_question_index = 0;
      this.activeSession.current_question_started_at = Date.now();
      this.startTickLoop();
    } else if (status === 'ENDED') {
      await this.endSession();
      return;
    } else {
      if (this.timerInterval) clearInterval(this.timerInterval);
    }

    await this.db.prepare(`
      UPDATE arena_sessions 
      SET status = ?, current_question_index = ?, current_question_started_at = ?
      WHERE id = ?
    `).run(
      status,
      this.activeSession.current_question_index,
      this.activeSession.current_question_started_at,
      this.activeSession.id
    );
  }

  async adminCreateSession({ title, courseId, scheduledAt, secondsPerQuestion = 40, questionCount = 20 }) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const sessionId = `arena_${Date.now()}`;
    let randomQuestions;

    if (courseId) {
      randomQuestions = await this.db.prepare(`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        JOIN chapters ch ON qz.chapter_id = ch.id
        WHERE ch.course_id = ? AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      `).all(courseId, questionCount);
    } else {
      randomQuestions = await this.db.prepare(`
        SELECT id FROM questions 
        WHERE question_text IS NOT NULL AND option_a IS NOT NULL AND option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      `).all(questionCount);
    }

    if (!randomQuestions || randomQuestions.length === 0) {
      throw new Error('No questions found to create arena session.');
    }

    const qIds = randomQuestions.map(q => q.id);

    await this.db.prepare(`
      INSERT INTO arena_sessions (id, title, course_id, scheduled_at, seconds_per_question, question_ids, status, current_question_index, current_question_started_at)
      VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', 0, 0)
    `).run(
      sessionId,
      title || 'Sunday Grand Arena: Freshman Championship',
      courseId || null,
      scheduledAt || this.getNextSunday8PM(),
      secondsPerQuestion,
      JSON.stringify(qIds)
    );

    await this.loadActiveSession();
    return { sessionId, title, questionCount: qIds.length };
  }

  parseQuestionsText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const blocks = [];
    let currentBlock = [];

    for (let line of lines) {
      const trimmed = line.trim();
      const isNewQ = /^(\*{0,2}Q\s*\d+[\.\:\)]\*{0,2}|\d+[\.\)])\s+/i.test(trimmed);
      if (isNewQ && currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'));
    }

    const parsedQuestions = [];

    for (let block of blocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;

      const optAMatch = trimmedBlock.match(/(?:^|\n)\s*(?:[-*•]\s*)?(?:\*{0,2}A\.?\*{0,2}|\(A\)|A[\.\)])\s+/i);
      if (!optAMatch) continue;

      let stem = trimmedBlock.substring(0, optAMatch.index).trim();
      stem = stem.replace(/^(\*{0,2}Q\s*\d+[\.\:\)]\*{0,2}|\d+[\.\)])\s*/i, '').trim();
      stem = stem.replace(/^---\s*/, '').trim();

      let difficulty = 'Medium';
      const diffMatch = stem.match(/^\[(Easy|Medium|Hard)\]\s*/i);
      if (diffMatch) {
        difficulty = diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase();
        stem = stem.replace(/^\[(Easy|Medium|Hard)\]\s*/i, '').trim();
      }

      const rest = trimmedBlock.substring(optAMatch.index);

      let correctAnswer = '';
      const ansMatch = rest.match(/(?:Correct Answer|✅ Correct Answer|Answer|Ans|Key)\s*[:：\-]\s*\*{0,2}([A-D])/i);
      if (ansMatch) {
        correctAnswer = ansMatch[1].toUpperCase();
      }

      let explanation = '';
      const expMatch = rest.match(/(?:Explanation|📝 Explanation|Explain)\s*[:：\-]\s*([\s\S]*)$/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        explanation = explanation.replace(/^\*{1,2}\s*/, '').replace(/\*{1,2}$/, '').replace(/\n\s*---\s*$/, '').trim();
      }

      let optionsPart = rest;
      if (ansMatch) {
        optionsPart = optionsPart.substring(0, ansMatch.index);
      } else if (expMatch) {
        optionsPart = optionsPart.substring(0, expMatch.index);
      }

      const optRegex = /(?:^|\n)\s*(?:[-*•]\s*)?(?:\*{0,2}([A-D])\.?\*{0,2}|\(([A-D])\)|([A-D])[\.\)])\s+/gi;
      const matches = [];
      let m;
      while ((m = optRegex.exec(optionsPart)) !== null) {
        const letter = (m[1] || m[2] || m[3]).toUpperCase();
        matches.push({ letter, index: m.index, matchLength: m[0].length });
      }

      const options = { A: '', B: '', C: '', D: '' };
      for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const start = cur.index + cur.matchLength;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : optionsPart.length;
        let optText = optionsPart.substring(start, end).trim();
        optText = optText.replace(/\*{2,}$/, '').replace(/^[-*•]\s*/, '').trim();
        options[cur.letter] = optText;
      }

      if (stem && (options.A || options.B)) {
        parsedQuestions.push({
          question_text: stem,
          option_a: options.A || '',
          option_b: options.B || '',
          option_c: options.C || '',
          option_d: options.D || '',
          correct_answer: correctAnswer || 'A',
          explanation: explanation || '',
          difficulty
        });
      }
    }

    return parsedQuestions;
  }

  async parseAndAttachArenaQuestions(sessionId, rawText) {
    const parsedQuestions = this.parseQuestionsText(rawText);
    if (!parsedQuestions || parsedQuestions.length === 0) {
      throw new Error('No valid questions could be parsed from the provided text. Please ensure questions follow the standard Q / Option format.');
    }

    let targetSession = null;
    if (sessionId) {
      targetSession = await this.db.prepare('SELECT * FROM arena_sessions WHERE id = ?').get(sessionId);
    }
    if (!targetSession && this.activeSession) {
      targetSession = this.activeSession;
    }
    if (!targetSession) {
      targetSession = await this.db.prepare(`
        SELECT * FROM arena_sessions 
        WHERE status IN ('SCHEDULED', 'LOBBY') 
        ORDER BY created_at DESC LIMIT 1
      `).get();
    }
    if (!targetSession) {
      await this.ensureUpcomingSundaySession();
      targetSession = this.activeSession;
    }
    if (!targetSession) {
      throw new Error('No active or scheduled Arena session found to attach questions to.');
    }

    // Ensure foreign key parent rows exist in courses, chapters, quizzes
    try {
      await this.db.prepare(`
        INSERT OR IGNORE INTO courses (id, name, description, image_url, status) 
        VALUES ('c_arena', 'Sunday Live Grand Arena', 'Weekly synchronized freshman championship arena', '', 'ACTIVE')
      `).run();
      await this.db.prepare(`
        INSERT OR IGNORE INTO chapters (id, course_id, name, description, chapter_order, status) 
        VALUES ('ch_arena', 'c_arena', 'Arena Competitions', 'Arena Question Sets', 1, 'ACTIVE')
      `).run();

      const quizId = `quiz_arena_${targetSession.id}`;
      await this.db.prepare(`
        INSERT OR IGNORE INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status)
        VALUES (?, 'ch_arena', ?, 'Sunday Grand Arena Question Batch', ?, ?, 'Medium', 'ACTIVE')
      `).run(quizId, targetSession.title || 'Sunday Arena', parsedQuestions.length, targetSession.seconds_per_question || 40);
    } catch (e) {
      console.warn('Foreign key setup note:', e.message);
    }

    const quizId = `quiz_arena_${targetSession.id}`;
    const newQuestionIds = [];
    const timestamp = Date.now();

    for (let i = 0; i < parsedQuestions.length; i++) {
      const q = parsedQuestions[i];
      const qId = `q_arena_${timestamp}_${i + 1}`;
      newQuestionIds.push(qId);

      await this.db.prepare(`
        INSERT INTO questions (
          id, quiz_id, question_text, image_url,
          option_a, option_b, option_c, option_d,
          correct_answer, explanation, difficulty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        qId,
        quizId,
        q.question_text,
        null,
        q.option_a,
        q.option_b,
        q.option_c || '',
        q.option_d || '',
        q.correct_answer || 'A',
        q.explanation || '',
        q.difficulty || 'Medium'
      );
    }

    await this.db.prepare(`
      UPDATE arena_sessions 
      SET question_ids = ?, current_question_index = 0, current_question_started_at = 0
      WHERE id = ?
    `).run(JSON.stringify(newQuestionIds), targetSession.id);

    await this.loadActiveSession();

    return {
      sessionId: targetSession.id,
      title: targetSession.title,
      questionCount: newQuestionIds.length,
      questions: parsedQuestions
    };
  }

  async getArenaQuestions(sessionId) {
    let targetSession = null;
    if (sessionId) {
      targetSession = await this.db.prepare('SELECT * FROM arena_sessions WHERE id = ?').get(sessionId);
    } else if (this.activeSession) {
      targetSession = this.activeSession;
    } else {
      targetSession = await this.db.prepare(`
        SELECT * FROM arena_sessions ORDER BY created_at DESC LIMIT 1
      `).get();
    }

    if (!targetSession) return [];

    let qIds = [];
    try {
      qIds = JSON.parse(targetSession.question_ids || '[]');
    } catch (e) {
      qIds = [];
    }

    if (qIds.length === 0) return [];

    const placeholders = qIds.map(() => '?').join(',');
    const rows = await this.db.prepare(`
      SELECT id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty 
      FROM questions WHERE id IN (${placeholders})
    `).all(qIds);

    const rowMap = new Map(rows.map(r => [r.id, r]));
    return qIds.map(id => rowMap.get(id)).filter(Boolean);
  }
}

const arenaEngine = new ArenaEngine();
module.exports = arenaEngine;
