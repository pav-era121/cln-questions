const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// 1. Patch arenaEngine.js
const enginePath = path.join(rootDir, 'arenaEngine.js');
let engineContent = fs.readFileSync(enginePath, 'utf8');

const resetMethod = `
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

if (!engineContent.includes('resetToUpcomingSundaySession()')) {
  engineContent = engineContent.replace(
    '  // Admin Controls\r?\n  async adminSetStatus(status) {',
    `${resetMethod}\n  // Admin Controls\n  async adminSetStatus(status) {`
  );
  if (!engineContent.includes('resetToUpcomingSundaySession()')) {
    // Try matching without regex
    engineContent = engineContent.replace(
      '  // Admin Controls',
      `${resetMethod}\n  // Admin Controls`
    );
  }
  fs.writeFileSync(enginePath, engineContent, 'utf8');
  console.log('✅ Patched arenaEngine.js with resetToUpcomingSundaySession');
}

// 2. Patch public/js/arena.js
const arenaPath = path.join(rootDir, 'public', 'js', 'arena.js');
let arenaContent = fs.readFileSync(arenaPath, 'utf8');

const arenaMethods = `
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

if (!arenaContent.includes('adminLaunchGeoTestArena()')) {
  arenaContent = arenaContent.replace(
    '  async adminLaunchTestArena() {',
    `${arenaMethods}\n  async adminLaunchTestArena() {`
  );
  fs.writeFileSync(arenaPath, arenaContent, 'utf8');
  console.log('✅ Patched public/js/arena.js with adminLaunchGeoTestArena');
}
