const db = require('../db/client');

async function main() {
  console.log('🌍 Setting Sunday Grand Arena to Geography Chapter 2...');

  // 1. Fetch questions specifically from Chapter 2 of Geography (ch_1790783341715)
  const rows = await db.prepare(`
    SELECT q.id, q.question_text, q.correct_answer 
    FROM questions q
    JOIN quizzes qz ON q.quiz_id = qz.id
    WHERE qz.chapter_id = 'ch_1790783341715'
    ORDER BY q.id ASC
  `).all();

  console.log(`Found ${rows.length} questions in Geography Chapter 2.`);
  if (rows.length < 25) {
    throw new Error(`Expected at least 25 questions in Chapter 2, found ${rows.length}`);
  }

  // 2. Select 25 evenly spaced, representative questions covering the full chapter
  const indices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 49];
  const selectedQuestions = indices.map(i => rows[i]);
  const questionIds = selectedQuestions.map(q => q.id);

  console.log('\nSelected 25 Questions:');
  selectedQuestions.forEach((q, idx) => {
    console.log(`  ${idx + 1}. [${q.id}] ${q.question_text.slice(0, 70)}... (Answer: ${q.correct_answer})`);
  });

  // 3. Update official Sunday session
  const sessionId = 'arena_sun_1793533064874';
  const newTitle = 'Sunday Grand Arena: Geography Chapter 2 (The Geology of Ethiopia & Horn)';
  const courseId = 'c_1790611158939';
  const scheduledAt = '2026-11-01T17:00:00.000Z'; // 8:00 PM EAT

  await db.prepare(`
    UPDATE arena_sessions 
    SET title = ?, 
        course_id = ?, 
        scheduled_at = ?, 
        seconds_per_question = 40, 
        question_ids = ?, 
        status = 'SCHEDULED', 
        current_question_index = 0, 
        current_question_started_at = 0
    WHERE id = ?
  `).run(
    newTitle,
    courseId,
    scheduledAt,
    JSON.stringify(questionIds),
    sessionId
  );

  console.log(`\n✅ Session ${sessionId} updated successfully!`);
  const updated = await db.prepare('SELECT id, title, course_id, status, scheduled_at, seconds_per_question FROM arena_sessions WHERE id = ?').get(sessionId);
  console.log('Updated Session Details:', updated);
  console.log('Total Questions in Arena:', questionIds.length);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
