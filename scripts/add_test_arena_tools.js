const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// ==========================================
// 1. UPDATE arenaEngine.js
// ==========================================
const arenaEnginePath = path.join(rootDir, 'arenaEngine.js');
let arenaEngine = fs.readFileSync(arenaEnginePath, 'utf8');

// A. Support chapterId in adminCreateSession
const oldAdminCreateCheck = `    if (courseId) {
      randomQuestions = await this.db.prepare(\`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        JOIN chapters ch ON qz.chapter_id = ch.id
        JOIN courses c ON ch.course_id = c.id
        WHERE c.id = ? AND (c.is_private = 0 OR c.is_private IS NULL)
          AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      \`).all(courseId, questionCount);
    } else {`;

const newAdminCreateCheck = `    if (chapterId) {
      randomQuestions = await this.db.prepare(\`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        WHERE qz.chapter_id = ?
          AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      \`).all(chapterId, questionCount);
    } else if (courseId) {
      randomQuestions = await this.db.prepare(\`
        SELECT q.id FROM questions q
        JOIN quizzes qz ON q.quiz_id = qz.id
        JOIN chapters ch ON qz.chapter_id = ch.id
        JOIN courses c ON ch.course_id = c.id
        WHERE c.id = ? AND (c.is_private = 0 OR c.is_private IS NULL)
          AND q.question_text IS NOT NULL AND q.option_a IS NOT NULL AND q.option_b IS NOT NULL
        ORDER BY RANDOM() LIMIT ?
      \`).all(courseId, questionCount);
    } else {`;

arenaEngine = arenaEngine.replace(
  'async adminCreateSession({ title, courseId, scheduledAt, secondsPerQuestion = 40, questionCount = 20 }) {',
  'async adminCreateSession({ title, courseId, chapterId, scheduledAt, secondsPerQuestion = 40, questionCount = 20 }) {'
);
arenaEngine = arenaEngine.replace(oldAdminCreateCheck, newAdminCreateCheck);

// B. Add resetToUpcomingSundaySession method to arenaEngine
const resetSundayMethod = `
  // Reset and restore tonight's official Sunday Arena (Geography Chapter 2)
  async resetToUpcomingSundaySession() {
    // 1. Mark any active test sessions as ENDED
    await this.db.prepare(\`
      UPDATE arena_sessions 
      SET status = 'ENDED' 
      WHERE id != 'arena_sun_1793533064874' AND status IN ('ACTIVE', 'LOBBY')
    \`).run();

    // 2. Fetch the 25 curated Geography Chapter 2 question IDs
    const rows = await this.db.prepare(\`
      SELECT q.id FROM questions q
      JOIN quizzes qz ON q.quiz_id = qz.id
      WHERE qz.chapter_id = 'ch_1790783341715'
      ORDER BY q.id ASC
    \`).all();

    let questionIds = [];
    if (rows && rows.length >= 25) {
      const indices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 49];
      questionIds = indices.map(i => rows[i].id);
    } else {
      questionIds = rows.map(r => r.id);
    }

    const scheduledAt = '2026-11-01T17:00:00.000Z';
    const officialId = 'arena_sun_1793533064874';

    await this.db.prepare(\`
      UPDATE arena_sessions 
      SET title = 'Sunday Grand Arena: Geography Chapter 2 (The Geology of Ethiopia & Horn)',
          course_id = 'c_1790611158939',
          scheduled_at = ?,
          seconds_per_question = 40,
          question_ids = ?,
          status = 'SCHEDULED',
          current_question_index = 0,
          current_question_started_at = 0
      WHERE id = ?
    \`).run(scheduledAt, JSON.stringify(questionIds), officialId);

    // Reset participant state
    await this.db.prepare(\`
      UPDATE arena_participants
      SET total_score = 0, total_time_ms = 0, answers = '{}'
      WHERE session_id = ?
    \`).run(officialId);

    await this.loadActiveSession();
    console.log('✅ Official Sunday Arena (Geography Ch. 2, 8:00 PM) restored!');
  }
`;

if (!arenaEngine.includes('resetToUpcomingSundaySession()')) {
  arenaEngine = arenaEngine.replace(
    `  // Admin action handler: status update`,
    `${resetSundayMethod}\n  // Admin action handler: status update`
  );
  console.log('✅ Added resetToUpcomingSundaySession to arenaEngine.js');
}

fs.writeFileSync(arenaEnginePath, arenaEngine, 'utf8');
console.log('✅ arenaEngine.js updated successfully');


// ==========================================
// 2. UPDATE server.js
// ==========================================
const serverJsPath = path.join(rootDir, 'server.js');
let serverJs = fs.readFileSync(serverJsPath, 'utf8');

// Update admin status route to handle RESET_SCHEDULED
const oldServerStatus = `    const { action, status } = req.body;
    if (action === 'NEXT') {
      await arenaEngine.advanceNextQuestion();
    } else if (status) {
      await arenaEngine.adminSetStatus(status);
    }`;

const newServerStatus = `    const { action, status } = req.body;
    if (action === 'NEXT') {
      await arenaEngine.advanceNextQuestion();
    } else if (action === 'RESET_SCHEDULED') {
      await arenaEngine.resetToUpcomingSundaySession();
    } else if (status) {
      await arenaEngine.adminSetStatus(status);
    }`;

serverJs = serverJs.replace(oldServerStatus, newServerStatus);

// Pass chapterId in admin arena create route
serverJs = serverJs.replace(
  `const { title, courseId, scheduledAt, secondsPerQuestion, questionCount } = req.body;`,
  `const { title, courseId, chapterId, scheduledAt, secondsPerQuestion, questionCount } = req.body;`
);
serverJs = serverJs.replace(
  `courseId,\n      scheduledAt,`,
  `courseId,\n      chapterId,\n      scheduledAt,`
);

fs.writeFileSync(serverJsPath, serverJs, 'utf8');
console.log('✅ server.js updated successfully');


// ==========================================
// 3. UPDATE public/js/arena.js
// ==========================================
const arenaJsPath = path.join(rootDir, 'public', 'js', 'arena.js');
let arenaJs = fs.readFileSync(arenaJsPath, 'utf8');

// A. Add buttons in Supervisor Dock
const oldDockButtons = `<button class="btn btn-sm btn-outline" onclick="arena.adminLaunchTestArena()" title="Re-randomizes a 5-question test contest">🚀 Quick 5-Q Test</button>`;
const newDockButtons = `<button class="btn btn-sm" style="background:#8b5cf6; color:#fff; font-weight:700;" onclick="arena.adminLaunchGeoTestArena()" title="Launch a live 5-question test for Geography Chapter 2">🧪 Test Geo Ch. 2 (5 Qs)</button>
            <button class="btn btn-sm btn-outline" style="color:#2563eb; border-color:#93c5fd; background:#eff6ff;" onclick="arena.adminResetToOfficialSunday()" title="Reset session back to Tonight's 8:00 PM Official Arena">🔙 Restore 8:00 PM Arena</button>
            <button class="btn btn-sm btn-outline" onclick="arena.adminLaunchTestArena()" title="Re-randomizes a 5-question test contest">🚀 Quick 5-Q Test</button>`;

arenaJs = arenaJs.replace(oldDockButtons, newDockButtons);

// B. Add adminLaunchGeoTestArena and adminResetToOfficialSunday
const newArenaMethods = `
  async adminLaunchGeoTestArena() {
    if (!confirm('Launch a 5-question live test for Geography Chapter 2 right now?')) return;

    try {
      await API.adminArenaCreate({
        title: 'Test Battle: Geography Ch. 2 (5 Questions)',
        chapterId: 'ch_1790783341715',
        courseId: 'c_1790611158939',
        scheduledAt: new Date(Date.now() + 5000).toISOString(),
        secondsPerQuestion: 25,
        questionCount: 5
      });
      await API.adminArenaStatus({ status: 'LOBBY' });
      this.state.lastQuestionIndex = -1;
      this.state.lockedAnswer = null;
      await this.fetchAndRender();
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('Test Arena for Geography Ch. 2 launched! Enter lobby to test.', 'success');
      }
    } catch (err) {
      alert('Could not launch test battle: ' + err.message);
    }
  },

  async adminResetToOfficialSunday() {
    if (!confirm("Restore tonight's official Sunday Arena (Geography Ch. 2, 8:00 PM)?")) return;

    try {
      await API.adminArenaStatus({ action: 'RESET_SCHEDULED' });
      this.state.lastQuestionIndex = -1;
      this.state.lockedAnswer = null;
      await this.fetchAndRender();
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast("Official Sunday Arena (8:00 PM) restored!", 'success');
      }
    } catch (err) {
      alert('Failed to restore official arena: ' + err.message);
    }
  },
`;

if (!arenaJs.includes('adminLaunchGeoTestArena()')) {
  arenaJs = arenaJs.replace(
    `  async adminLaunchTestArena() {`,
    `${newArenaMethods}\n  async adminLaunchTestArena() {`
  );
  console.log('✅ Added adminLaunchGeoTestArena and adminResetToOfficialSunday to arena.js');
}

fs.writeFileSync(arenaJsPath, arenaJs, 'utf8');
console.log('✅ public/js/arena.js updated successfully');


// ==========================================
// 4. UPDATE public/js/app.js
// ==========================================
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// In Admin Arena Tab actions, add the Geo Ch 2 test and restore buttons
const oldAdminTabButtons = `<button class="btn btn-sm btn-outline" onclick="app.loadAdminArenaTab()">🔄 Refresh Monitor</button>`;
const newAdminTabButtons = `<button class="btn btn-sm" style="background:#8b5cf6; color:#fff; font-weight:700;" onclick="arena.adminLaunchGeoTestArena(); app.loadAdminArenaTab();" title="Launch a live 5-question test for Geography Chapter 2">🧪 Test Geo Ch. 2 Live</button>
            <button class="btn btn-sm btn-outline" style="color:#2563eb; border-color:#93c5fd; background:#eff6ff;" onclick="arena.adminResetToOfficialSunday(); app.loadAdminArenaTab();" title="Restore Tonight's 8:00 PM Official Arena">🔙 Restore 8:00 PM Arena</button>
            <button class="btn btn-sm btn-outline" onclick="app.loadAdminArenaTab()">🔄 Refresh Monitor</button>`;

appJs = appJs.replace(oldAdminTabButtons, newAdminTabButtons);

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('✅ public/js/app.js updated successfully');

console.log('\n🎉 ALL UPDATES COMPLETED SUCCESSFULLY!');
