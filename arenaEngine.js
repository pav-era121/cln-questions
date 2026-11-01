// arenaEngine.js — Synchronized Live Competition Engine for CLN Questions
// Designed for Sunday Weekly Grand Arena & Competitive Contests

class ArenaEngine {
  constructor() {
    this.db = null;
    this.activeSession = null;
    this.questions = []; // Cached question details for current active session
    this.autoPilot = true; // Autonomous self-starting & managing engine
    this.masterSchedulerInterval = null;
    this.tickInterval = null;
    this.initPromise = null;
    this.lastQuestionsSessionId = null;
  }

  init(database) {
    this.db = database;

    if (!this.initPromise) {
      this.initPromise = (async () => {
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

            CREATE TABLE IF NOT EXISTS arena_questions (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              question_order INTEGER DEFAULT 1,
              question_text TEXT NOT NULL,
              image_url TEXT,
              option_a TEXT NOT NULL,
              option_b TEXT NOT NULL,
              option_c TEXT DEFAULT '',
              option_d TEXT DEFAULT '',
              correct_answer TEXT NOT NULL,
              explanation TEXT DEFAULT '',
              difficulty TEXT DEFAULT 'Medium',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `);

          // 2. Load latest active session from DB
          await this.loadActiveSession();

          // 3. If no session exists, initialize an upcoming Sunday Arena
          if (!this.activeSession) {
            await this.ensureUpcomingSundaySession();
          }

          // 4. Launch Autonomous Master Scheduler
          this.startMasterScheduler();

          console.log('✅ Arena Engine initialized successfully with Autonomous Auto-Pilot active.');
        } catch (err) {
          console.error('❌ Arena Engine initialization error:', err.message);
        }
      })();
    }

    return this.initPromise;
  }

  // Ensure engine is ready and synchronized before handling any API request
  async ensureReady() {
    if (this.initPromise) {
      await this.initPromise;
    }

    await this.syncFromDb();

    if (!this.activeSession) {
      await this.ensureUpcomingSundaySession();
    } else {
      // Check auto-pilot triggers and question time expiration on EVERY incoming request!
      if (this.autoPilot) {
        await this.checkAutoPilot();
      }
      if (this.activeSession && this.activeSession.status === 'ACTIVE') {
        await this.checkAndAdvanceQuestion();
      }
    }
  }

  // Calculate next Sunday at 8:00 PM (East Africa Time: UTC+3 -> 17:00 UTC)
  getNextSunday8PM() {
    const now = new Date();
    const eatOffsetMs = 3 * 60 * 60 * 1000;
    const eatNow = new Date(now.getTime() + eatOffsetMs);
    const eatDay = eatNow.getUTCDay(); // 0 is Sunday
    let daysUntilSunday = (7 - eatDay) % 7;

    // If today is Sunday in EAT and it's already past 20:00 (8 PM EAT), set to next Sunday
    if (daysUntilSunday === 0 && (eatNow.getUTCHours() > 20 || (eatNow.getUTCHours() === 20 && eatNow.getUTCMinutes() > 0))) {
      daysUntilSunday = 7;
    }

    const eatTargetDate = new Date(eatNow);
    eatTargetDate.setUTCDate(eatNow.getUTCDate() + daysUntilSunday);
    eatTargetDate.setUTCHours(20, 0, 0, 0); // 20:00:00 EAT

    // Convert back to UTC ISO string
    const targetUtc = new Date(eatTargetDate.getTime() - eatOffsetMs);
    return targetUtc.toISOString();
  }

  // Authoritatively load the current session from DB
  async loadActiveSession() {
    try {
      // 1. Try to find a currently running session ('ACTIVE' or 'LOBBY')
      let session = await this.db.prepare(`
        SELECT * FROM arena_sessions 
        WHERE status IN ('ACTIVE', 'LOBBY')
        ORDER BY created_at DESC LIMIT 1
      `).get();

      // If a session has been sitting in LOBBY or ACTIVE for more than 4 hours past its scheduled time, retire it as ENDED
      if (session) {
        const schedTime = new Date(session.scheduled_at).getTime();
        if (!isNaN(schedTime) && (Date.now() - schedTime > 4 * 60 * 60 * 1000)) {
          console.log(`🧹 Auto-retiring stale arena session ${session.id} (was scheduled ${session.scheduled_at})`);
          await this.db.prepare("UPDATE arena_sessions SET status = 'ENDED' WHERE id = ?").run(session.id);
          session = null;
        }
      }

      // 2. If no running session, check for upcoming SCHEDULED sessions
      if (!session) {
        session = await this.db.prepare(`
          SELECT * FROM arena_sessions 
          WHERE status = 'SCHEDULED'
          ORDER BY scheduled_at ASC, created_at DESC LIMIT 1
        `).get();
      }

      // 3. If no upcoming scheduled session, check if there's a recently ENDED session within the last 2 hours
      if (!session) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        session = await this.db.prepare(`
          SELECT * FROM arena_sessions 
          WHERE status = 'ENDED' AND created_at >= ?
          ORDER BY created_at DESC LIMIT 1
        `).get(twoHoursAgo);
      }

      // 4. Otherwise, fallback to the most recent session
      if (!session) {
        session = await this.db.prepare(`
          SELECT * FROM arena_sessions 
          ORDER BY created_at DESC LIMIT 1
        `).get();
      }

      if (!session) {
        this.activeSession = null;
        this.questions = [];
        return;
      }

      this.activeSession = session;
      await this.loadQuestionsForSession(session);
    } catch (err) {
      console.error('Error loading active arena session:', err.message);
    }
  }

  // Load questions for the active session (cached in memory by session ID)
  async loadQuestionsForSession(session) {
    if (!session) {
      this.questions = [];
      return;
    }

    // If already loaded for this exact session and question count matches, avoid re-querying
    if (this.lastQuestionsSessionId === session.id && this.questions && this.questions.length > 0) {
      return;
    }

    try {
      // 1. Check if dedicated arena_questions exist for this session
      const arenaQRows = await this.db.prepare(`
        SELECT id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty
        FROM arena_questions
        WHERE session_id = ?
        ORDER BY question_order ASC
      `).all(session.id);

      if (arenaQRows && arenaQRows.length > 0) {
        this.questions = arenaQRows;
        this.lastQuestionsSessionId = session.id;
        return;
      }

      // 2. Fallback to question_ids JSON array from questions table
      let qIds = [];
      try {
        qIds = JSON.parse(session.question_ids || '[]');
      } catch (e) {
        qIds = [];
      }

      if (qIds.length > 0) {
        const placeholders = qIds.map(() => '?').join(',');
        const rows = await this.db.prepare(`
          SELECT id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty 
          FROM questions WHERE id IN (${placeholders})
        `).all(qIds);

        const rowMap = new Map(rows.map(r => [r.id, r]));
        this.questions = qIds.map(id => rowMap.get(id)).filter(Boolean);
        this.lastQuestionsSessionId = session.id;
      } else {
        this.questions = [];
      }
    } catch (e) {
      console.error('Error loading questions for session:', e.message);
      this.questions = [];
    }
  }

  // Synchronize latest session row from DB
  async syncFromDb() {
    if (!this.activeSession) {
      await this.loadActiveSession();
      return;
    }

    try {
      // Check if an ACTIVE or LOBBY session has taken priority over a SCHEDULED one
      if (this.activeSession.status === 'SCHEDULED') {
        const activeOrLobby = await this.db.prepare(`
          SELECT * FROM arena_sessions WHERE status IN ('ACTIVE', 'LOBBY') ORDER BY created_at DESC LIMIT 1
        `).get();
        if (activeOrLobby) {
          this.activeSession = activeOrLobby;
          await this.loadQuestionsForSession(this.activeSession);
          return;
        }
      }

      const fresh = await this.db.prepare(`
        SELECT * FROM arena_sessions WHERE id = ?
      `).get(this.activeSession.id);

      if (fresh) {
        this.activeSession = fresh;
        if (this.lastQuestionsSessionId !== fresh.id) {
          await this.loadQuestionsForSession(fresh);
        }
      } else {
        await this.loadActiveSession();
      }
    } catch (e) {
      // Safe fallback
    }
  }

  // Ensure single official upcoming Sunday session with 100% Freshman questions
  async ensureUpcomingSundaySession() {
    try {
      const scheduledAt = this.getNextSunday8PM();

      // Check if an existing upcoming session for this Sunday already exists
      const existing = await this.db.prepare(`
        SELECT * FROM arena_sessions 
        WHERE scheduled_at = ? AND status IN ('SCHEDULED', 'LOBBY', 'ACTIVE')
        ORDER BY created_at DESC LIMIT 1
      `).get(scheduledAt);

      if (existing) {
        this.activeSession = existing;
        await this.loadQuestionsForSession(existing);
        return;
      }

      const sessionId = `arena_sun_${Date.now()}`;

      // Select 25 high-quality random questions EXCLUSIVELY from non-private Freshman courses!
      const randomQuestions = await this.db.prepare(`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        JOIN chapters ch ON qz.chapter_id = ch.id
        JOIN courses c ON ch.course_id = c.id
        WHERE (c.is_private = 0 OR c.is_private IS NULL)
          AND c.id != 'c_arena'
          AND q.question_text IS NOT NULL 
          AND q.option_a IS NOT NULL 
          AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT 25
      `).all();

      if (!randomQuestions || randomQuestions.length === 0) {
        console.warn('⚠️ No questions found in freshman question bank to create arena session.');
        return;
      }

      const qIds = randomQuestions.map(q => q.id);

      await this.db.prepare(`
        INSERT INTO arena_sessions (id, title, course_id, scheduled_at, seconds_per_question, question_ids, status, current_question_index, current_question_started_at)
        VALUES (?, ?, NULL, ?, ?, ?, 'SCHEDULED', 0, 0)
      `).run(
        sessionId,
        'Sunday Grand Arena: Freshman Championship',
        scheduledAt,
        40,
        JSON.stringify(qIds)
      );

      await this.loadActiveSession();
      console.log(`🏆 Created official upcoming Sunday Arena session: ${sessionId} (Scheduled for ${scheduledAt})`);
    } catch (err) {
      console.error('Error ensuring Sunday session:', err.message);
    }
  }

  // Master Scheduler: Checks clocks every 2 seconds on persistent instances
  startMasterScheduler() {
    if (this.masterSchedulerInterval) clearInterval(this.masterSchedulerInterval);
    if (this.tickInterval) clearInterval(this.tickInterval);

    this.masterSchedulerInterval = setInterval(() => {
      this.checkMasterScheduler().catch(err => {
        console.error('Master scheduler error:', err.message);
      });
    }, 2000);

    // Initial check after 1 second
    setTimeout(() => {
      this.checkMasterScheduler().catch(err => {
        console.error('Initial master scheduler error:', err.message);
      });
    }, 1000);
  }

  async checkMasterScheduler() {
    if (!this.autoPilot) return;
    await this.syncFromDb();
    if (!this.activeSession) {
      await this.ensureUpcomingSundaySession();
      return;
    }
    await this.checkAutoPilot();
    if (this.activeSession && this.activeSession.status === 'ACTIVE') {
      await this.checkAndAdvanceQuestion();
    }
  }

  // Check and execute auto-pilot transitions (LOBBY open 15m prior, ACTIVE on schedule, ENDED transition)
  async checkAutoPilot() {
    if (!this.activeSession || !this.autoPilot) return;

    const now = Date.now();
    const sess = this.activeSession;

    // Transition from ended session after 60 min
    if (sess.status === 'ENDED') {
      const schedTime = new Date(sess.scheduled_at).getTime();
      const cooldownMs = 60 * 60 * 1000;
      if (now > schedTime + cooldownMs) {
        const nextScheduled = await this.db.prepare(`
          SELECT id FROM arena_sessions 
          WHERE status = 'SCHEDULED' AND scheduled_at > ?
          ORDER BY scheduled_at ASC LIMIT 1
        `).get(new Date(now).toISOString());

        if (nextScheduled) {
          await this.loadActiveSession();
        } else {
          console.log('🔄 [Auto-Pilot] Transitioning from ended session to next week Sunday session...');
          await this.ensureUpcomingSundaySession();
        }
      }
      return;
    }

    const scheduledMs = new Date(sess.scheduled_at).getTime();
    if (isNaN(scheduledMs)) return;

    // 1. Auto-open LOBBY 15 minutes before scheduled start time
    const lobbyOpenTimeMs = scheduledMs - (15 * 60 * 1000);
    if (sess.status === 'SCHEDULED' && now >= lobbyOpenTimeMs && now < scheduledMs) {
      console.log(`🟢 [Auto-Pilot] 15 minutes to start! Automatically opening pre-flight lobby for "${sess.title}"`);
      await this.db.prepare("UPDATE arena_sessions SET status = 'LOBBY' WHERE id = ? AND status = 'SCHEDULED'").run(sess.id);
      sess.status = 'LOBBY';
      return;
    }

    // 2. Auto-start ACTIVE competition when scheduled time is reached
    // CRITICAL ATOMIC UPDATE: Only transitions IF status is currently SCHEDULED or LOBBY!
    // NEVER resets an already ACTIVE competition!
    if ((sess.status === 'SCHEDULED' || sess.status === 'LOBBY') && now >= scheduledMs) {
      if (!this.questions || this.questions.length === 0) {
        await this.loadQuestionsForSession(sess);
      }

      if (this.questions && this.questions.length > 0) {
        console.log(`🚀 [Auto-Pilot] Scheduled time reached! Automatically firing Question 1 for "${sess.title}"`);
        const res = await this.db.prepare(`
          UPDATE arena_sessions 
          SET status = 'ACTIVE', current_question_index = 0, current_question_started_at = ?
          WHERE id = ? AND status IN ('SCHEDULED', 'LOBBY')
        `).run(now, sess.id);

        if (res.changes > 0) {
          sess.status = 'ACTIVE';
          sess.current_question_index = 0;
          sess.current_question_started_at = now;
        }
      }
      return;
    }
  }

  // ATOMIC, DETERMINISTIC QUESTION TIMER & AUTO-ADVANCEMENT
  // Runs on EVERY request and in tick interval — immune to serverless freezes!
  async checkAndAdvanceQuestion() {
    if (!this.activeSession || this.activeSession.status !== 'ACTIVE') return;

    const sess = this.activeSession;
    const now = Date.now();

    // If started_at was unset, set it now
    if (!sess.current_question_started_at || sess.current_question_started_at <= 0) {
      await this.db.prepare(`
        UPDATE arena_sessions SET current_question_started_at = ? WHERE id = ?
      `).run(now, sess.id);
      sess.current_question_started_at = now;
      return;
    }

    const elapsedMs = now - sess.current_question_started_at;
    const limitMs = (sess.seconds_per_question || 40) * 1000;
    const breatherMs = 3000; // 3-second grace period for smooth animations
    const totalRoundMs = limitMs + breatherMs;

    if (elapsedMs >= totalRoundMs) {
      const currentIdx = sess.current_question_index;
      const nextIdx = currentIdx + 1;
      const totalQuestions = this.questions.length;

      if (nextIdx >= totalQuestions && totalQuestions > 0) {
        // Reached end of questions -> Atomically END session
        console.log(`🏁 [Arena Engine] All ${totalQuestions} questions completed! Finalizing arena session.`);
        await this.endSession(sess.id);
      } else {
        // ATOMIC CONDITIONAL UPDATE:
        // Only one process/request will succeed in updating current_question_index!
        const res = await this.db.prepare(`
          UPDATE arena_sessions 
          SET current_question_index = ?, current_question_started_at = ?
          WHERE id = ? AND current_question_index = ? AND status = 'ACTIVE'
        `).run(nextIdx, now, sess.id, currentIdx);

        if (res.changes > 0) {
          sess.current_question_index = nextIdx;
          sess.current_question_started_at = now;
          console.log(`⏭️ [Arena Engine] Advanced to Question ${nextIdx + 1}/${totalQuestions} (Session: ${sess.id})`);
        } else {
          // Another concurrent request already updated it, fetch latest values
          const fresh = await this.db.prepare(`
            SELECT current_question_index, current_question_started_at, status FROM arena_sessions WHERE id = ?
          `).get(sess.id);
          if (fresh) {
            sess.current_question_index = fresh.current_question_index;
            sess.current_question_started_at = fresh.current_question_started_at;
            sess.status = fresh.status;
          }
        }
      }
    }
  }

  // Manually or Programmatically advance to the next question
  async advanceNextQuestion() {
    if (!this.activeSession || this.activeSession.status !== 'ACTIVE') return;

    await this.syncFromDb();
    const currentIdx = this.activeSession.current_question_index;
    const nextIdx = currentIdx + 1;
    const totalQuestions = this.questions.length;

    if (nextIdx >= totalQuestions && totalQuestions > 0) {
      await this.endSession(this.activeSession.id);
    } else {
      const now = Date.now();
      const res = await this.db.prepare(`
        UPDATE arena_sessions 
        SET current_question_index = ?, current_question_started_at = ?
        WHERE id = ? AND current_question_index = ? AND status = 'ACTIVE'
      `).run(nextIdx, now, this.activeSession.id, currentIdx);

      if (res.changes > 0) {
        this.activeSession.current_question_index = nextIdx;
        this.activeSession.current_question_started_at = now;
      } else {
        await this.syncFromDb();
      }
    }
  }

  // End session, calculate final ranks and award bonus XP
  async endSession(sessionId) {
    const targetId = sessionId || (this.activeSession ? this.activeSession.id : null);
    if (!targetId) return;

    await this.db.prepare("UPDATE arena_sessions SET status = 'ENDED' WHERE id = ?").run(targetId);
    if (this.activeSession && this.activeSession.id === targetId) {
      this.activeSession.status = 'ENDED';
    }

    // Award bonus XP based on final leaderboard in DB
    try {
      const leaderboard = await this.getLeaderboard(targetId);

      for (let i = 0; i < leaderboard.length; i++) {
        const p = leaderboard[i];
        if (p.userId === 'u_dagmawi_t') continue; // House competitor

        let bonusXp = 50 + (p.totalScore * 10);
        if (i === 0) bonusXp += 150; // 🥇 1st place
        else if (i === 1) bonusXp += 75; // 🥈 2nd place
        else if (i === 2) bonusXp += 40; // 🥉 3rd place

        try {
          await this.db.prepare("UPDATE users SET total_xp = total_xp + ? WHERE id = ?").run(bonusXp, p.userId);
        } catch (e) {}
      }

      console.log(`🏁 Sunday Arena ended. Final leaderboard computed for ${leaderboard.length} competitors.`);
    } catch (e) {
      console.error('Error finalizing rewards for arena:', e.message);
    }
  }

  // Submit Answer with High-Precision Server Timestamp & Database Persistence
  async submitAnswer(sessionId, userId, questionIndex, answerKey) {
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      await this.syncFromDb();
    }
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      throw new Error('No active arena session matching this ID.');
    }

    if (this.activeSession.status !== 'ACTIVE') {
      throw new Error('Arena is not currently accepting answers.');
    }

    const currentIdx = this.activeSession.current_question_index;
    const elapsedSinceStarted = Date.now() - (this.activeSession.current_question_started_at || 0);

    // Jitter tolerance: Accept current question OR previous question within 3.5s grace period
    const isCurrent = (questionIndex === currentIdx);
    const isRecentPrevious = (questionIndex === currentIdx - 1 && elapsedSinceStarted < 3500);

    if (!isCurrent && !isRecentPrevious) {
      throw new Error('Question time has expired or does not match current question.');
    }

    const targetIdx = questionIndex;
    const currentQ = this.questions[targetIdx];
    if (!currentQ) {
      throw new Error('Invalid question index.');
    }

    // Load or create participant from DB (stateless across lambdas)
    let pRow = await this.db.prepare(`
      SELECT session_id, user_id, user_name, total_score, total_time_ms, answers
      FROM arena_participants WHERE session_id = ? AND user_id = ?
    `).get(sessionId, userId);

    if (!pRow) {
      const user = await this.db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(userId);
      const userName = user ? (user.full_name || user.email.split('@')[0]) : 'Student';
      await this.db.prepare(`
        INSERT OR IGNORE INTO arena_participants (session_id, user_id, user_name, joined_at, total_score, total_time_ms, answers)
        VALUES (?, ?, ?, ?, 0, 0, '{}')
      `).run(sessionId, userId, userName, Date.now());

      pRow = {
        session_id: sessionId,
        user_id: userId,
        user_name: userName,
        total_score: 0,
        total_time_ms: 0,
        answers: '{}'
      };
    }

    let answers = {};
    try { answers = JSON.parse(pRow.answers || '{}'); } catch(e) {}

    // Anti-cheat: Check if already answered this question
    if (answers[targetIdx]) {
      return {
        success: true,
        alreadySubmitted: true,
        selectedAnswer: answers[targetIdx].answer
      };
    }

    const startedAt = (targetIdx === currentIdx)
      ? (this.activeSession.current_question_started_at || Date.now())
      : (this.activeSession.current_question_started_at - 40000);
    const rawTimeMs = Date.now() - startedAt;
    const maxLimitMs = (this.activeSession.seconds_per_question || 40) * 1000;
    const timeMs = Math.max(100, Math.min(maxLimitMs, rawTimeMs));

    const isCorrect = (answerKey.toUpperCase() === currentQ.correct_answer.toUpperCase());
    const newScore = pRow.total_score + (isCorrect ? 1 : 0);
    const newTimeMs = pRow.total_time_ms + timeMs;

    answers[targetIdx] = {
      answer: answerKey.toUpperCase(),
      timeMs,
      isCorrect
    };

    // Save directly to Turso DB
    await this.db.prepare(`
      UPDATE arena_participants 
      SET total_score = ?, total_time_ms = ?, answers = ?
      WHERE session_id = ? AND user_id = ?
    `).run(
      newScore,
      newTimeMs,
      JSON.stringify(answers),
      sessionId,
      userId
    );

    return {
      success: true,
      questionIndex: targetIdx,
      selectedAnswer: answerKey.toUpperCase(),
      timeMs,
      timeFormatted: (timeMs / 1000).toFixed(2) + 's'
    };
  }

  // Join session and persist to DB
  async joinSession(sessionId, user) {
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      await this.syncFromDb();
    }
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      throw new Error('Session not found.');
    }

    if (this.activeSession.status === 'ENDED') {
      throw new Error('This session has already ended.');
    }

    const userName = user.fullName || user.email.split('@')[0];

    await this.db.prepare(`
      INSERT OR IGNORE INTO arena_participants (session_id, user_id, user_name, joined_at, total_score, total_time_ms, answers)
      VALUES (?, ?, ?, ?, 0, 0, '{}')
    `).run(sessionId, user.id, userName, Date.now());

    // Ensure house competitor is always seeded
    await this.db.prepare(`
      INSERT OR IGNORE INTO arena_participants (session_id, user_id, user_name, joined_at, total_score, total_time_ms, answers)
      VALUES (?, 'u_dagmawi_t', 'Dagmawi T.', ?, 0, 0, '{}')
    `).run(sessionId, Date.now());

    const countRow = await this.db.prepare('SELECT COUNT(*) as cnt FROM arena_participants WHERE session_id = ?').get(sessionId);
    return { success: true, participantCount: countRow ? countRow.cnt : 1 };
  }

  // Build Leaderboard directly from Database
  async getLeaderboard(sessionId) {
    const targetSessionId = sessionId || (this.activeSession ? this.activeSession.id : null);
    if (!targetSessionId) return [];

    const parts = await this.db.prepare(`
      SELECT user_id, user_name, total_score, total_time_ms, answers
      FROM arena_participants WHERE session_id = ?
    `).all(targetSessionId);

    let list = parts.map(p => {
      let answers = {};
      try { answers = JSON.parse(p.answers || '{}'); } catch(e) {}
      return {
        userId: p.user_id,
        userName: p.user_name,
        totalScore: p.total_score || 0,
        totalTimeMs: p.total_time_ms || 0,
        totalTimeFormatted: this.formatTime(p.total_time_ms || 0),
        answersCount: Object.keys(answers).length
      };
    });

    // Ensure house competitor 'u_dagmawi_t' is present
    let houseIndex = list.findIndex(p => p.userId === 'u_dagmawi_t');
    if (houseIndex === -1) {
      list.push({
        userId: 'u_dagmawi_t',
        userName: 'Dagmawi T.',
        totalScore: 0,
        totalTimeMs: 0,
        totalTimeFormatted: '0s',
        answersCount: 0
      });
      houseIndex = list.length - 1;
    }

    // Dynamic benchmark scoring for Dagmawi T. (top ranking)
    const otherPlayers = list.filter(p => p.userId !== 'u_dagmawi_t');
    if (otherPlayers.length > 0) {
      const maxOtherScore = Math.max(...otherPlayers.map(p => p.totalScore || 0));
      let bestOtherTime = Math.min(...otherPlayers.map(p => p.totalTimeMs || 99999999));
      if (bestOtherTime === 99999999 || bestOtherTime <= 0) bestOtherTime = 120000;

      const totalQ = (this.questions && this.questions.length > 0) ? this.questions.length : 25;
      let targetScore = Math.min(totalQ, maxOtherScore + 1);
      if (targetScore > totalQ) targetScore = totalQ;
      if (targetScore === 0) targetScore = Math.min(totalQ, 24);

      const targetTimeMs = Math.max(35000, Math.floor(bestOtherTime * 0.78));

      list[houseIndex].totalScore = targetScore;
      list[houseIndex].totalTimeMs = targetTimeMs;
      list[houseIndex].totalTimeFormatted = this.formatTime(targetTimeMs);
      list[houseIndex].answersCount = totalQ;
    }

    // Sort: Primary Score DESC; Tie-breaker Total Time ASC
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
  async getPublicState(user = null, isAdmin = false) {
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

    // Load user state directly from DB
    if (user && user.id) {
      const pRow = await this.db.prepare(`
        SELECT total_score, total_time_ms, answers
        FROM arena_participants WHERE session_id = ? AND user_id = ?
      `).get(sess.id, user.id);

      if (pRow) {
        isJoined = true;
        myScore = pRow.total_score || 0;
        myTotalTime = pRow.total_time_ms || 0;
        let answers = {};
        try { answers = JSON.parse(pRow.answers || '{}'); } catch(e) {}
        if (answers[currentQIdx]) {
          myAnswer = answers[currentQIdx];
        }
      }
    }

    // Participant count from DB
    const countRow = await this.db.prepare('SELECT COUNT(*) as cnt FROM arena_participants WHERE session_id = ?').get(sess.id);
    const participantCount = countRow ? countRow.cnt : 1;

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

      if (isAdmin) {
        currentQuestionPayload.correct_answer = currentQ.correct_answer;
        currentQuestionPayload.explanation = currentQ.explanation;
      }
    }

    // Heatmap of current question choices (Admin only)
    let adminHeatmap = null;
    if (isAdmin && sess.status === 'ACTIVE') {
      const parts = await this.db.prepare('SELECT answers FROM arena_participants WHERE session_id = ?').all(sess.id);
      const counts = { A: 0, B: 0, C: 0, D: 0, answered: 0, total: parts.length };
      for (const p of parts) {
        let answers = {};
        try { answers = JSON.parse(p.answers || '{}'); } catch(e) {}
        const a = answers[currentQIdx];
        if (a && a.answer) {
          counts[a.answer] = (counts[a.answer] || 0) + 1;
          counts.answered++;
        }
      }
      adminHeatmap = counts;
    }

    // Leaderboard logic: revealed to students on ENDED, always visible to admin
    let leaderboard = null;
    if (sess.status === 'ENDED' || isAdmin) {
      leaderboard = await this.getLeaderboard(sess.id);
      if (user && user.id) {
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
      participantCount,
      autoPilot: this.autoPilot,
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


  // Reset and restore tonight's official Sunday Arena (Geography Chapter 2)
  async resetToUpcomingSundaySession() {
    // 1. Mark any active test sessions as ENDED
    await this.db.prepare(`
      UPDATE arena_sessions 
      SET status = 'ENDED' 
      WHERE id != 'arena_sun_1793533064874' AND status IN ('ACTIVE', 'LOBBY')
    `).run();

    // 2. Fetch the 25 curated Geography Chapter 2 question IDs
    const rows = await this.db.prepare(`
      SELECT q.id FROM questions q
      JOIN quizzes qz ON q.quiz_id = qz.id
      WHERE qz.chapter_id = 'ch_1790783341715'
      ORDER BY q.id ASC
    `).all();

    let questionIds = [];
    if (rows && rows.length >= 40) {
      const dropIndices = new Set([1, 7, 10, 12, 17, 23, 25, 27, 32, 39]);
      questionIds = rows.filter((r, i) => !dropIndices.has(i)).map(r => r.id);
    } else {
      questionIds = rows.map(r => r.id);
    }

    const scheduledAt = '2026-11-01T17:00:00.000Z';
    const officialId = 'arena_sun_1793533064874';

    await this.db.prepare(`
      UPDATE arena_sessions 
      SET title = 'Sunday Grand Arena: Geography Chapter 2 (40 Questions)',
          course_id = 'c_1790611158939',
          scheduled_at = ?,
          seconds_per_question = 40,
          question_ids = ?,
          status = 'SCHEDULED',
          current_question_index = 0,
          current_question_started_at = 0
      WHERE id = ?
    `).run(scheduledAt, JSON.stringify(questionIds), officialId);

    // Reset participant state
    await this.db.prepare(`
      UPDATE arena_participants
      SET total_score = 0, total_time_ms = 0, answers = '{}'
      WHERE session_id = ?
    `).run(officialId);

    await this.loadActiveSession();
    console.log('✅ Official Sunday Arena (Geography Ch. 2, 8:00 PM) restored!');
  }

  // Admin Controls
  async adminSetStatus(status) {
    if (!this.activeSession) throw new Error('No session active.');

    if (status === 'RESTART') {
      const now = Date.now();
      await this.db.prepare(`
        UPDATE arena_participants 
        SET total_score = 0, total_time_ms = 0, answers = '{}'
        WHERE session_id = ?
      `).run(this.activeSession.id);

      await this.db.prepare(`
        UPDATE arena_sessions 
        SET status = 'ACTIVE', current_question_index = 0, current_question_started_at = ?
        WHERE id = ?
      `).run(now, this.activeSession.id);

      this.activeSession.status = 'ACTIVE';
      this.activeSession.current_question_index = 0;
      this.activeSession.current_question_started_at = now;
      return;
    }

    if (status === 'ACTIVE') {
      const now = Date.now();
      await this.db.prepare(`
        UPDATE arena_sessions 
        SET status = 'ACTIVE', current_question_index = 0, current_question_started_at = ?
        WHERE id = ?
      `).run(now, this.activeSession.id);

      this.activeSession.status = 'ACTIVE';
      this.activeSession.current_question_index = 0;
      this.activeSession.current_question_started_at = now;
      return;
    }

    if (status === 'ENDED') {
      await this.endSession(this.activeSession.id);
      return;
    }

    await this.db.prepare(`
      UPDATE arena_sessions 
      SET status = ?
      WHERE id = ?
    `).run(status, this.activeSession.id);

    this.activeSession.status = status;
  }

  async adminCreateSession({ title, courseId, chapterId, scheduledAt, secondsPerQuestion = 40, questionCount = 20 }) {
    const sessionId = `arena_${Date.now()}`;
    let randomQuestions;

    if (chapterId) {
      randomQuestions = await this.db.prepare(`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        WHERE qz.chapter_id = ?
          AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      `).all(chapterId, questionCount);
    } else if (courseId) {
      randomQuestions = await this.db.prepare(`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        JOIN chapters ch ON qz.chapter_id = ch.id
        JOIN courses c ON ch.course_id = c.id
        WHERE c.id = ? AND (c.is_private = 0 OR c.is_private IS NULL)
          AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      `).all(courseId, questionCount);
    } else {
      randomQuestions = await this.db.prepare(`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        JOIN chapters ch ON qz.chapter_id = ch.id
        JOIN courses c ON ch.course_id = c.id
        WHERE (c.is_private = 0 OR c.is_private IS NULL)
          AND c.id != 'c_arena'
          AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      `).all(questionCount);
    }

    if (!randomQuestions || randomQuestions.length === 0) {
      throw new Error('No questions found in freshman question bank to create arena session.');
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
      } else if (ansMatch) {
        const afterAns = rest.substring(ansMatch.index + ansMatch[0].length);
        const inlineExpMatch = afterAns.match(/^\*{0,2}\s*[\-—–:]\s*([\s\S]*)$/);
        if (inlineExpMatch) {
          explanation = inlineExpMatch[1].trim();
          explanation = explanation.replace(/^\*{1,2}\s*/, '').replace(/\*{1,2}$/, '').replace(/\n\s*---\s*$/, '').trim();
        }
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

    await this.db.prepare('DELETE FROM arena_questions WHERE session_id = ?').run(targetSession.id);

    const newQuestionIds = [];
    const timestamp = Date.now();

    for (let i = 0; i < parsedQuestions.length; i++) {
      const q = parsedQuestions[i];
      const qId = `aq_${timestamp}_${i + 1}`;
      newQuestionIds.push(qId);

      await this.db.prepare(`
        INSERT INTO arena_questions (
          id, session_id, question_order, question_text, image_url,
          option_a, option_b, option_c, option_d,
          correct_answer, explanation, difficulty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        qId,
        targetSession.id,
        i + 1,
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

    this.lastQuestionsSessionId = null;
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

    const arenaQRows = await this.db.prepare(`
      SELECT id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty
      FROM arena_questions
      WHERE session_id = ?
      ORDER BY question_order ASC
    `).all(targetSession.id);

    if (arenaQRows && arenaQRows.length > 0) {
      return arenaQRows;
    }

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
