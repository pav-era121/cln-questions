const db = require('../db/client');

async function main() {
  console.log('🌍 Setting Sunday Grand Arena to 40 questions for Geography Chapter 2...');

  // 1. Fetch questions specifically from Chapter 2 of Geography (ch_1790783341715)
  const rows = await db.prepare(`
    SELECT q.id, q.question_text, q.correct_answer 
    FROM questions q
    JOIN quizzes qz ON q.quiz_id = qz.id
    WHERE qz.chapter_id = 'ch_1790783341715'
    ORDER BY q.id ASC
  `).all();

  console.log(`Found ${rows.length} questions in Geography Chapter 2.`);

  // 2. Select 40 curated questions (dropping 10 redundant/overlapping ones)
  const dropIndices = new Set([1, 7, 10, 12, 17, 23, 25, 27, 32, 39]);
  const selected40 = rows.filter((r, i) => !dropIndices.has(i));
  const questionIds = selected40.map(q => q.id);

  console.log(`Selected ${questionIds.length} high-yield questions covering all topics of Chapter 2.`);

  // 3. Update the official Sunday session
  const sessionId = 'arena_sun_1793533064874';
  const newTitle = 'Sunday Grand Arena: Geography Chapter 2 (40 Questions)';
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
