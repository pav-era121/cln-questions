const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');

const JWT_SECRET = 'CLN_QUESTIONS_ETHIOPIA_JWT_SECRET_2026';
const PORT = process.env.PORT || 3000;

// Initialize Database Connection
const dbPath = path.join(__dirname, 'db', 'cln.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload Directory Setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// Multer Storage Engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

// Helper: Phone Validation for Ethiopian Format
function formatEthiopianPhone(phone) {
  if (!phone) return null;
  let clean = phone.trim().replace(/\s+/g, '');
  if (clean.startsWith('+251')) {
    if (clean.length === 13 && (clean.startsWith('+2519') || clean.startsWith('+2517'))) {
      return clean;
    }
  } else if (clean.startsWith('0')) {
    if (clean.length === 10 && (clean.startsWith('09') || clean.startsWith('07'))) {
      return '+251' + clean.substring(1);
    }
  } else if (clean.length === 9 && (clean.startsWith('9') || clean.startsWith('7'))) {
    return '+251' + clean;
  }
  return null;
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
}

// User Status Authorization Middleware (Enforces Suspended Status Server-Side)
function verifyActiveUser(req, res, next) {
  try {
    const stmt = db.prepare('SELECT id, full_name, email, phone, status, total_xp FROM users WHERE id = ?');
    const user = stmt.get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User record not found.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        suspended: true,
        error: 'Your account has been suspended.',
        message: 'You currently cannot access CLN Questions. If you have any issue, question, or need support, contact Admin on Telegram: @CLN_AAU_Admin',
        supportContact: '@CLN_AAU_Admin',
        telegramUrl: 'https://t.me/CLN_AAU_Admin'
      });
    }

    req.dbUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database verification failed: ' + err.message });
  }
}

// Admin Authorization Middleware
function requireAdmin(req, res, next) {
  if (req.user.email !== 'admin@cln.edu.et') {
    return res.status(403).json({ error: 'Admin authorization required.' });
  }
  next();
}

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

app.post('/api/auth/register', (req, res) => {
  const { fullName, email, phone, password, marketingConsent } = req.body;

  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ error: 'Full name, email, phone, and password are required.' });
  }

  const validPhone = formatEthiopianPhone(phone);
  if (!validPhone) {
    return res.status(400).json({ error: 'Please enter a valid Ethiopian phone number (+2519XXXXXXXX or +2517XXXXXXXX).' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    // Check duplicate
    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?');
    const existing = checkStmt.get(email.toLowerCase().trim(), validPhone);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email or phone number already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const userId = 'u_' + Date.now() + '_' + Math.round(Math.random() * 1000);

    const insertStmt = db.prepare(`
      INSERT INTO users (id, full_name, email, phone, password_hash, marketing_consent, status, total_xp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?)
    `);

    insertStmt.run(
      userId,
      fullName.trim(),
      email.toLowerCase().trim(),
      validPhone,
      passwordHash,
      marketingConsent ? 1 : 0,
      new Date().toISOString()
    );

    const token = jwt.sign({ id: userId, email: email.toLowerCase().trim(), name: fullName }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user: {
        id: userId,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: validPhone,
        totalXp: 0,
        status: 'ACTIVE'
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { loginIdentifier, password } = req.body;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: 'Email/Phone and password are required.' });
  }

  try {
    const identifier = loginIdentifier.trim();
    const formattedPhone = formatEthiopianPhone(identifier);

    const stmt = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?');
    const user = stmt.get(identifier.toLowerCase(), formattedPhone || identifier);

    if (!user) {
      return res.status(400).json({ error: 'Invalid email/phone or password.' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid email/phone or password.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        suspended: true,
        error: 'Your account has been suspended.',
        message: 'You currently cannot access CLN Questions. If you have any issue, question, or need support, contact Admin on Telegram: @CLN_AAU_Admin',
        supportContact: '@CLN_AAU_Admin',
        telegramUrl: 'https://t.me/CLN_AAU_Admin'
      });
    }

    // Update last_active
    db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(new Date().toISOString(), user.id);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.full_name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        totalXp: user.total_xp,
        status: user.status
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, full_name, email, phone, status, total_xp, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        suspended: true,
        error: 'Your account has been suspended.',
        message: 'You currently cannot access CLN Questions. If you have any issue, question, or need support, contact Admin on Telegram: @CLN_AAU_Admin',
        supportContact: '@CLN_AAU_Admin',
        telegramUrl: 'https://t.me/CLN_AAU_Admin'
      });
    }

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// ==========================================
// 2. PUBLIC & STUDENT COURSE/QUIZ ENDPOINTS
// ==========================================

app.get('/api/courses', (req, res) => {
  try {
    const courses = db.prepare(`
      SELECT c.*, COUNT(ch.id) AS chapter_count
      FROM courses c
      LEFT JOIN chapters ch ON c.id = ch.course_id AND ch.status = 'ACTIVE'
      WHERE c.status = 'ACTIVE'
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `).all();

    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load courses.' });
  }
});

app.get('/api/courses/:id', (req, res) => {
  try {
    const course = db.prepare("SELECT * FROM courses WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const chapters = db.prepare(`
      SELECT ch.*, COUNT(q.id) AS quiz_count
      FROM chapters ch
      LEFT JOIN quizzes q ON ch.id = q.chapter_id AND q.status = 'ACTIVE'
      WHERE ch.course_id = ? AND ch.status = 'ACTIVE'
      GROUP BY ch.id
      ORDER BY ch.chapter_order ASC
    `).all(req.params.id);

    res.json({ course, chapters });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load course details.' });
  }
});

app.get('/api/chapters/:id', (req, res) => {
  try {
    const chapter = db.prepare("SELECT * FROM chapters WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found.' });

    const quizzes = db.prepare("SELECT * FROM quizzes WHERE chapter_id = ? AND status = 'ACTIVE' ORDER BY created_at ASC").all(req.params.id);

    res.json({ chapter, quizzes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chapter details.' });
  }
});

// Start Quiz (Protected & Authoritative - Hides Correct Answers!)
app.get('/api/quizzes/:id/start', authenticateToken, verifyActiveUser, (req, res) => {
  try {
    const quiz = db.prepare("SELECT * FROM quizzes WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found or inactive.' });

    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(quiz.chapter_id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(chapter.course_id);

    // Fetch questions WITHOUT correct_answer or explanation
    const rawQuestions = db.prepare(`
      SELECT id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d
      FROM questions WHERE quiz_id = ?
    `).all(quiz.id);

    if (rawQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions available for this quiz.' });
    }

    // Admin configured question_count limit
    const targetLimit = quiz.question_count && quiz.question_count > 0 ? quiz.question_count : rawQuestions.length;
    const finalQuestions = rawQuestions.slice(0, targetLimit);

    // Create attempt
    const attemptId = 'att_' + Date.now() + '_' + Math.round(Math.random() * 1000);
    db.prepare(`
      INSERT INTO quiz_attempts (id, user_id, quiz_id, started_at, score, percentage, xp_earned)
      VALUES (?, ?, ?, ?, 0, 0.0, 0)
    `).run(attemptId, req.user.id, quiz.id, new Date().toISOString());

    res.json({
      attemptId,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.time_limit,
        questionCount: finalQuestions.length,
        difficulty: quiz.difficulty,
        courseName: course ? course.name : '',
        chapterName: chapter ? chapter.name : ''
      },
      questions: finalQuestions
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start quiz: ' + err.message });
  }
});

// Submit Quiz (Server-side Authoritative Scoring & XP Award)
app.post('/api/quizzes/:id/submit', authenticateToken, verifyActiveUser, (req, res) => {
  const { attemptId, userAnswers } = req.body; // userAnswers: { questionId: selectedOption }

  if (!attemptId || !userAnswers) {
    return res.status(400).json({ error: 'Attempt ID and user answers are required.' });
  }

  try {
    const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ?').get(attemptId, req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Quiz attempt record not found.' });

    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
    const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ?').all(req.params.id);

    let correctCount = 0;
    const reviewDetails = [];

    const insertAnswerStmt = db.prepare(`
      INSERT INTO quiz_answers (id, attempt_id, user_id, question_id, selected_answer, is_correct, answered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    questions.forEach(q => {
      const selected = userAnswers[q.id] || 'UNANSWERED';
      const isCorrect = selected.toUpperCase() === q.correct_answer.toUpperCase() ? 1 : 0;
      if (isCorrect) correctCount++;

      const answerId = 'ans_' + Date.now() + '_' + Math.round(Math.random() * 10000);
      insertAnswerStmt.run(answerId, attemptId, req.user.id, q.id, selected, isCorrect, new Date().toISOString());

      reviewDetails.push({
        questionId: q.id,
        questionText: q.question_text,
        imageUrl: q.image_url,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        selectedAnswer: selected,
        correctAnswer: q.correct_answer,
        isCorrect: isCorrect === 1,
        explanation: q.explanation
      });
    });

    const totalQuestions = questions.length;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const xpEarned = correctCount * 10; // Rule: 1 correct = 10 XP

    // Update attempt
    db.prepare(`
      UPDATE quiz_attempts
      SET completed_at = ?, score = ?, percentage = ?, xp_earned = ?
      WHERE id = ?
    `).run(new Date().toISOString(), correctCount, percentage, xpEarned, attemptId);

    // Update user total XP
    db.prepare('UPDATE users SET total_xp = total_xp + ? WHERE id = ?').run(xpEarned, req.user.id);

    const updatedUser = db.prepare('SELECT total_xp FROM users WHERE id = ?').get(req.user.id);

    res.json({
      attemptId,
      score: correctCount,
      totalQuestions,
      percentage,
      xpEarned,
      newTotalXp: updatedUser.total_xp,
      review: reviewDetails
    });
  } catch (err) {
    res.status(500).json({ error: 'Quiz submission failed: ' + err.message });
  }
});

// Student Dashboard & Analytics
app.get('/api/student/dashboard', authenticateToken, verifyActiveUser, (req, res) => {
  try {
    const user = req.dbUser;

    const attemptsCount = db.prepare('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(user.id);
    const avgScore = db.prepare('SELECT AVG(percentage) AS avg_perc FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(user.id);
    const bestScore = db.prepare('SELECT MAX(percentage) AS max_perc FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(user.id);

    const recentAttempts = db.prepare(`
      SELECT qa.*, q.title AS quiz_title, c.name AS course_name, ch.name AS chapter_name
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      JOIN chapters ch ON q.chapter_id = ch.id
      JOIN courses c ON ch.course_id = c.id
      WHERE qa.user_id = ? AND qa.completed_at IS NOT NULL
      ORDER BY qa.completed_at DESC
      LIMIT 5
    `).all(user.id);

    res.json({
      user,
      stats: {
        totalXp: user.total_xp,
        quizzesCompleted: attemptsCount.count || 0,
        averageScore: Math.round(avgScore.avg_perc || 0),
        bestScore: Math.round(bestScore.max_perc || 0)
      },
      recentAttempts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student dashboard: ' + err.message });
  }
});

// Student History
app.get('/api/student/history', authenticateToken, verifyActiveUser, (req, res) => {
  try {
    const history = db.prepare(`
      SELECT qa.*, q.title AS quiz_title, c.name AS course_name, ch.name AS chapter_name
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      JOIN chapters ch ON q.chapter_id = ch.id
      JOIN courses c ON ch.course_id = c.id
      WHERE qa.user_id = ? AND qa.completed_at IS NOT NULL
      ORDER BY qa.completed_at DESC
    `).all(req.user.id);

    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load attempt history.' });
  }
});

// ==========================================
// 3. ADMIN MANAGEMENT ENDPOINTS
// ==========================================

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const totalStudents = db.prepare("SELECT COUNT(*) AS count FROM users WHERE email != 'admin@cln.edu.et'").get().count;
    const activeStudents = db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'ACTIVE' AND email != 'admin@cln.edu.et'").get().count;
    const suspendedStudents = db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'SUSPENDED'").get().count;
    const totalAttempts = db.prepare("SELECT COUNT(*) AS count FROM quiz_attempts WHERE completed_at IS NOT NULL").get().count;
    const totalQuestions = db.prepare("SELECT COUNT(*) AS count FROM questions").get().count;
    const avgScore = db.prepare("SELECT AVG(percentage) AS avg_perc FROM quiz_attempts WHERE completed_at IS NOT NULL").get().avg_perc || 0;

    res.json({
      stats: {
        totalStudents,
        activeStudents,
        suspendedStudents,
        totalAttempts,
        totalQuestions,
        averageScore: Math.round(avgScore)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load admin stats.' });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.total_xp, u.created_at, u.last_active,
             COUNT(qa.id) AS quiz_attempts
      FROM users u
      LEFT JOIN quiz_attempts qa ON u.id = qa.user_id AND qa.completed_at IS NOT NULL
      WHERE u.email != 'admin@cln.edu.et'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student list.' });
  }
});

app.patch('/api/admin/users/:id/status', authenticateToken, requireAdmin, (req, res) => {
  const { status } = req.body; // 'ACTIVE' or 'SUSPENDED'
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
  }

  try {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: `User status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// Admin Course CRUD
app.post('/api/admin/courses', authenticateToken, requireAdmin, (req, res) => {
  const { name, description, imageUrl, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Course name is required.' });

  try {
    const id = 'c_' + Date.now();
    db.prepare('INSERT INTO courses (id, name, description, image_url, status) VALUES (?, ?, ?, ?, ?)').run(id, name, description || '', imageUrl || '', status || 'ACTIVE');
    res.json({ message: 'Course created successfully.', courseId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create course.' });
  }
});

app.put('/api/admin/courses/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, description, imageUrl, status } = req.body;
  try {
    db.prepare('UPDATE courses SET name = ?, description = ?, image_url = ?, status = ? WHERE id = ?').run(name, description, imageUrl, status, req.params.id);
    res.json({ message: 'Course updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update course.' });
  }
});

app.delete('/api/admin/courses/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Course deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete course.' });
  }
});

// Admin Chapter CRUD
app.post('/api/admin/chapters', authenticateToken, requireAdmin, (req, res) => {
  const { courseId, name, description, imageUrl, chapterOrder, status } = req.body;
  if (!courseId || !name) return res.status(400).json({ error: 'Course ID and Chapter name are required.' });

  try {
    const id = 'ch_' + Date.now();
    db.prepare('INSERT INTO chapters (id, course_id, name, description, image_url, chapter_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, courseId, name, description || '', imageUrl || '', chapterOrder || 1, status || 'ACTIVE');
    res.json({ message: 'Chapter created successfully.', chapterId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chapter.' });
  }
});

app.put('/api/admin/chapters/:id', authenticateToken, requireAdmin, (req, res) => {
  const { name, description, imageUrl, chapterOrder, status } = req.body;
  try {
    db.prepare('UPDATE chapters SET name = ?, description = ?, image_url = ?, chapter_order = ?, status = ? WHERE id = ?').run(name, description, imageUrl, chapterOrder, status, req.params.id);
    res.json({ message: 'Chapter updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update chapter.' });
  }
});

app.delete('/api/admin/chapters/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
    res.json({ message: 'Chapter deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chapter.' });
  }
});

// Admin Content Hierarchy Tree
app.get('/api/admin/content-tree', authenticateToken, requireAdmin, (req, res) => {
  try {
    const courses = db.prepare("SELECT * FROM courses ORDER BY created_at ASC").all();
    const chapters = db.prepare("SELECT * FROM chapters ORDER BY chapter_order ASC, created_at ASC").all();
    const quizzes = db.prepare("SELECT * FROM quizzes ORDER BY created_at ASC").all();
    const questions = db.prepare("SELECT id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation FROM questions").all();

    res.json({ courses, chapters, quizzes, questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load content tree: ' + err.message });
  }
});

// Admin Quiz CRUD
app.post('/api/admin/quizzes', authenticateToken, requireAdmin, (req, res) => {
  const { chapterId, title, description, questionCount, timeLimit, difficulty, status } = req.body;
  if (!chapterId || !title) return res.status(400).json({ error: 'Chapter ID and Quiz title are required.' });

  try {
    const id = 'quiz_' + Date.now();
    db.prepare('INSERT INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, chapterId, title, description || '', questionCount || 10, timeLimit || 15, difficulty || 'Medium', status || 'ACTIVE');
    res.json({ message: 'Quiz created successfully.', quizId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create quiz: ' + err.message });
  }
});

app.put('/api/admin/quizzes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { title, description, questionCount, timeLimit, difficulty, status } = req.body;
  try {
    db.prepare('UPDATE quizzes SET title = ?, description = ?, question_count = ?, time_limit = ?, difficulty = ?, status = ? WHERE id = ?').run(title, description, questionCount || 10, timeLimit, difficulty, status, req.params.id);
    res.json({ message: 'Quiz updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quiz.' });
  }
});

app.delete('/api/admin/quizzes/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
    res.json({ message: 'Quiz deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quiz.' });
  }
});

// Admin Question CRUD
app.post('/api/admin/questions', authenticateToken, requireAdmin, (req, res) => {
  const { quizId, questionText, imageUrl, optionA, optionB, optionC, optionD, correctAnswer, explanation } = req.body;
  if (!quizId || !questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
    return res.status(400).json({ error: 'Target Quiz, Question text, Options A-D, and Correct Answer are required.' });
  }

  try {
    const quizExists = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
    if (!quizExists) {
      return res.status(404).json({ error: 'Selected quiz target does not exist. Please create or select a valid quiz.' });
    }

    const id = 'q_' + Date.now() + '_' + Math.round(Math.random() * 1000);
    db.prepare(`
      INSERT INTO questions (id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, quizId, questionText.trim(), imageUrl || '', optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim(), correctAnswer.trim().toUpperCase(), (explanation || '').trim());

    res.json({ message: 'Question added to bank successfully.', questionId: id });
  } catch (err) {
    console.error('Error adding question:', err);
    res.status(500).json({ error: 'Failed to add question: ' + err.message });
  }
});

app.put('/api/admin/questions/:id', authenticateToken, requireAdmin, (req, res) => {
  const { questionText, imageUrl, optionA, optionB, optionC, optionD, correctAnswer, explanation } = req.body;
  try {
    db.prepare(`
      UPDATE questions
      SET question_text = ?, image_url = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, explanation = ?
      WHERE id = ?
    `).run(questionText, imageUrl, optionA, optionB, optionC, optionD, correctAnswer.toUpperCase(), explanation, req.params.id);
    res.json({ message: 'Question updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update question.' });
  }
});

app.delete('/api/admin/questions/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const question = db.prepare('SELECT quiz_id FROM questions WHERE id = ?').get(req.params.id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);

    if (question) {
      const count = db.prepare('SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?').get(question.quiz_id).c;
      db.prepare('UPDATE quizzes SET question_count = ? WHERE id = ?').run(count, question.quiz_id);
    }

    res.json({ message: 'Question deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question.' });
  }
});

// Image Upload Endpoint
app.post('/api/admin/upload', authenticateToken, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl, message: 'Image uploaded successfully.' });
});

// Serve Single Page Application for any unhandled route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server (Only if not running as a Vercel Serverless Function)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`CLN Questions Platform API Server running on port ${PORT}`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`===================================================`);
  });
}

module.exports = app;

