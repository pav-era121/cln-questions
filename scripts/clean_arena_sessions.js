const db = require('../db/client');

async function cleanSessions() {
  console.log('Cleaning up duplicate and stale arena sessions...');

  // 1. Mark all older scheduled sessions as ENDED
  await db.exec(`
    UPDATE arena_sessions 
    SET status = 'ENDED' 
    WHERE scheduled_at < '2026-11-01T17:00:00.000Z' AND status != 'ENDED';
  `);

  // 2. For today's scheduled sessions (2026-11-01T17:00:00.000Z)
  const todaySessions = await db.prepare(`
    SELECT id, created_at FROM arena_sessions 
    WHERE scheduled_at = '2026-11-01T17:00:00.000Z'
    ORDER BY created_at DESC
  `).all();

  console.log('Today sessions found:', todaySessions.length);
  if (todaySessions.length > 1) {
    const keepId = todaySessions[0].id;
    console.log('Keeping official session:', keepId);
    for (let i = 1; i < todaySessions.length; i++) {
      console.log('Retiring duplicate session:', todaySessions[i].id);
      await db.prepare("UPDATE arena_sessions SET status = 'ENDED' WHERE id = ?").run(todaySessions[i].id);
    }
  }

  // 3. Ensure the official session has 25 authentic Freshman questions
  const official = await db.prepare(`
    SELECT * FROM arena_sessions 
    WHERE scheduled_at = '2026-11-01T17:00:00.000Z' AND status = 'SCHEDULED'
    LIMIT 1
  `).get();

  if (official) {
    console.log('Populating authentic Freshman questions for:', official.id);
    const freshmanQuestions = await db.prepare(`
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

    const qIds = freshmanQuestions.map(q => q.id);
    await db.prepare('UPDATE arena_sessions SET question_ids = ?, current_question_index = 0, current_question_started_at = 0 WHERE id = ?').run(
      JSON.stringify(qIds),
      official.id
    );
    console.log('Successfully set 25 authentic Freshman questions for session:', official.id);
  }

  const remaining = await db.prepare("SELECT id, scheduled_at, status FROM arena_sessions WHERE status = 'SCHEDULED'").all();
  console.log('Remaining scheduled sessions:', remaining);
}

cleanSessions().catch(console.error);
