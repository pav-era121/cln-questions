const db = require('../db/client');

async function debug() {
  console.log('=== FRESHMAN COURSES QUESTION COUNTS ===');
  const rows = await db.prepare(`
    SELECT c.id, c.name, COUNT(q.id) as q_count
    FROM courses c
    JOIN chapters ch ON c.id = ch.course_id
    JOIN quizzes qz ON ch.id = qz.chapter_id
    JOIN questions q ON qz.id = q.quiz_id
    WHERE (c.is_private = 0 OR c.is_private IS NULL) AND c.id != 'c_arena'
    GROUP BY c.id
  `).all();
  console.log(rows);

  console.log('\n=== CURRENT ARENA SESSIONS ===');
  const sessions = await db.prepare(`
    SELECT id, title, scheduled_at, status, current_question_index, current_question_started_at, created_at
    FROM arena_sessions
    ORDER BY created_at DESC LIMIT 6
  `).all();
  console.log(sessions);
}

debug().catch(console.error);
