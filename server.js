const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db/client');
const arenaEngine = require('./arenaEngine');

const JWT_SECRET = process.env.JWT_SECRET || 'CLN_QUESTIONS_ETHIOPIA_JWT_SECRET_2026';
const PORT = process.env.PORT || 3000;

// Initialize Arena Engine
arenaEngine.init(db);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Prevent aggressive caching on API routes across browsers and CDNs
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Upload Directory Setup (safe for local & serverless)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.warn('Could not create uploadDir:', e.message);
  }
}
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// Self-healing DB migrations
(async () => {
  try {
    await db.exec('ALTER TABLE quiz_attempts ADD COLUMN served_question_ids TEXT;');
  } catch (e) {
    // Column already exists, safe to ignore
  }
  try {
    await db.exec("ALTER TABLE questions ADD COLUMN difficulty TEXT DEFAULT 'Medium';");
  } catch (e) {
    // Column already exists, safe to ignore
  }
})();

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

const PAYMENT_INFO = {
  bundles: [
    {
      id: 'solo',
      name: 'Solo Semester Pass',
      badge: '1 Student',
      price: 380,
      originalPrice: 600,
      discount: 'Save 37%',
      perStudent: 380,
      duration: '1 Semester',
      description: 'Full 1-semester access for 1 student to all courses, chapters, quizzes & Sunday Arena.'
    },
    {
      id: 'dorm',
      name: 'Dorm Squad Deal',
      badge: '4 Students • Most Popular 🔥',
      price: 1200,
      originalPrice: 1520,
      discount: 'Save 320 ETB Total',
      perStudent: 300,
      savingPerStudent: 80,
      duration: '1 Semester',
      description: 'Activate 4 student accounts (300 ETB each — Save 80 ETB per student).'
    },
    {
      id: 'floor',
      name: 'Floor / Section Deal',
      badge: '8 Students • Best Value ⚡',
      price: 2000,
      originalPrice: 3040,
      discount: 'Save 1,040 ETB Total',
      perStudent: 250,
      savingPerStudent: 130,
      duration: '1 Semester',
      description: 'Activate 8 student accounts (250 ETB each — Save 130 ETB per student).'
    }
  ],
  amount: 380,
  originalPrice: 600,
  discount: '37% OFF',
  accessDuration: 'One Semester Access',
  cbe: {
    bankName: 'Commercial Bank of Ethiopia (CBE)',
    accountNumber: '1000253063452',
    accountName: 'EYOB'
  },
  telebirr: {
    serviceName: 'Telebirr',
    phoneNumber: '0950113361'
  },
  bankName: 'Commercial Bank of Ethiopia (CBE)',
  accountNumber: '1000253063452',
  accountName: 'EYOB',
  telebirrPhone: '0950113361',
  telegramAdmin: '@CLN_AAU_Admin',
  telegramUrl: 'https://t.me/CLN_AAU_Admin'
};

// User Status & 3-Day Free Trial Authorization Middleware
async function verifyActiveUser(req, res, next) {
  try {
    const user = await db.prepare('SELECT id, full_name, email, phone, status, is_paid, tag, created_at, trial_ends_at, total_xp FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User record not found.' });
    }

    const isAdmin = user.email === 'admin@cln.edu.et' || user.email === 'eyoba7619@gmail.com';
    if (isAdmin) {
      req.dbUser = user;
      return next();
    }

    // 1. Explicitly suspended
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        suspended: true,
        trialExpired: false,
        error: 'Your account has been suspended.',
        message: 'Your account is suspended. To activate your 1-semester access, complete your payment (Solo: 380 ETB | Dorm Squad of 4: 1,200 ETB | Section Deal of 8: 2,000 ETB) via CBE account 1000253063452 (EYOB) or Telebirr (0950113361) and send your receipt to @CLN_AAU_Admin on Telegram.',
        supportContact: '@CLN_AAU_Admin',
        telegramUrl: 'https://t.me/CLN_AAU_Admin',
        paymentInfo: PAYMENT_INFO
      });
    }

    // 2. 3-Day (72h) Free Trial Check for Unpaid Students
    if (!user.is_paid) {
      const now = Date.now();
      const trialEndMs = user.trial_ends_at 
        ? new Date(user.trial_ends_at).getTime() 
        : (new Date(user.created_at).getTime() + 72 * 3600 * 1000);

      if (now > trialEndMs) {
        // 72 hours passed! Auto-update user status in DB
        try {
          await db.prepare("UPDATE users SET status = 'SUSPENDED' WHERE id = ?").run(user.id);
        } catch (e) {
          console.error('Failed to auto-suspend expired user:', e);
        }

        return res.status(403).json({
          suspended: true,
          trialExpired: true,
          error: 'Your 3-day free trial has expired.',
          message: 'Your 72-hour free trial has ended. Please choose a semester bundle (Solo: 380 ETB | Dorm Squad of 4: 1,200 ETB | Section Deal of 8: 2,000 ETB) and pay via CBE account 1000253063452 (EYOB) or Telebirr (0950113361), then send your receipt to @CLN_AAU_Admin on Telegram to activate full semester access.',
          supportContact: '@CLN_AAU_Admin',
          telegramUrl: 'https://t.me/CLN_AAU_Admin',
          paymentInfo: PAYMENT_INFO
        });
      }
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

// Optional Authentication Middleware
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) req.user = null;
    else req.user = user;
    next();
  });
}

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

app.post('/api/auth/register', async (req, res) => {
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
    const existing = await db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email.toLowerCase().trim(), validPhone);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email or phone number already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const userId = 'u_' + Date.now() + '_' + Math.round(Math.random() * 1000);

    const createdAt = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    await db.prepare(`
      INSERT INTO users (id, full_name, email, phone, password_hash, marketing_consent, status, total_xp, created_at, trial_ends_at, is_paid, tag)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, 0, '')
    `).run(
      userId,
      fullName.trim(),
      email.toLowerCase().trim(),
      validPhone,
      passwordHash,
      marketingConsent ? 1 : 0,
      createdAt,
      trialEndsAt
    );

    const token = jwt.sign({ id: userId, email: email.toLowerCase().trim(), name: fullName }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Registration successful! Welcome to your 3-day free trial.',
      token,
      user: {
        id: userId,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phone: validPhone,
        totalXp: 0,
        status: 'ACTIVE',
        isPaid: false,
        isTrial: true,
        hoursLeft: 72,
        createdAt,
        trialEndsAt,
        tag: '',
        paymentInfo: PAYMENT_INFO
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { loginIdentifier, password } = req.body;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: 'Email/Phone and password are required.' });
  }

  try {
    const identifier = loginIdentifier.trim();
    const formattedPhone = formatEthiopianPhone(identifier);

    const user = await db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(identifier.toLowerCase(), formattedPhone || identifier);

    if (!user) {
      return res.status(400).json({ error: 'Invalid email/phone or password.' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid email/phone or password.' });
    }

    const isAdmin = user.email === 'admin@cln.edu.et' || user.email === 'eyoba7619@gmail.com';
    const now = Date.now();
    const trialEndMs = user.trial_ends_at 
      ? new Date(user.trial_ends_at).getTime() 
      : (new Date(user.created_at).getTime() + 72 * 3600 * 1000);
    const isTrialExpired = !isAdmin && !user.is_paid && now > trialEndMs;

    if (user.status === 'SUSPENDED' || isTrialExpired) {
      if (isTrialExpired && user.status !== 'SUSPENDED') {
        try {
          await db.prepare("UPDATE users SET status = 'SUSPENDED' WHERE id = ?").run(user.id);
          user.status = 'SUSPENDED';
        } catch (e) {}
      }
      return res.status(403).json({
        suspended: true,
        trialExpired: isTrialExpired,
        error: isTrialExpired ? 'Your 3-day free trial has expired.' : 'Your account has been suspended.',
        message: 'Please choose a semester bundle (Solo: 380 ETB | Dorm Squad of 4: 1,200 ETB | Section Deal of 8: 2,000 ETB) and pay via CBE account 1000253063452 (EYOB) or Telebirr (0950113361), then send your receipt to @CLN_AAU_Admin on Telegram to activate full semester access.',
        supportContact: '@CLN_AAU_Admin',
        telegramUrl: 'https://t.me/CLN_AAU_Admin',
        paymentInfo: PAYMENT_INFO
      });
    }

    // Update last_active
    await db.prepare('UPDATE users SET last_active = ? WHERE id = ?').run(new Date().toISOString(), user.id);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.full_name }, JWT_SECRET, { expiresIn: '30d' });
    const hoursLeft = (!user.is_paid && !isAdmin) ? Math.max(0, Math.ceil((trialEndMs - now) / (3600 * 1000))) : 0;

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        totalXp: user.total_xp,
        status: user.status,
        isPaid: Boolean(user.is_paid || isAdmin),
        isTrial: Boolean(!user.is_paid && !isAdmin && hoursLeft > 0),
        hoursLeft,
        createdAt: user.created_at,
        trialEndsAt: user.trial_ends_at,
        tag: user.tag || '',
        paymentInfo: PAYMENT_INFO
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, full_name, email, phone, status, is_paid, tag, created_at, trial_ends_at, total_xp FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isAdmin = user.email === 'admin@cln.edu.et' || user.email === 'eyoba7619@gmail.com';
    const now = Date.now();
    const trialEndMs = user.trial_ends_at 
      ? new Date(user.trial_ends_at).getTime() 
      : (new Date(user.created_at).getTime() + 72 * 3600 * 1000);
    const isTrialExpired = !isAdmin && !user.is_paid && now > trialEndMs;

    if (user.status === 'SUSPENDED' || isTrialExpired) {
      if (isTrialExpired && user.status !== 'SUSPENDED') {
        try {
          await db.prepare("UPDATE users SET status = 'SUSPENDED' WHERE id = ?").run(user.id);
          user.status = 'SUSPENDED';
        } catch (e) {}
      }
      return res.status(403).json({
        suspended: true,
        trialExpired: isTrialExpired,
        error: isTrialExpired ? 'Your 3-day free trial has expired.' : 'Your account has been suspended.',
        message: 'Please choose a semester bundle (Solo: 380 ETB | Dorm Squad of 4: 1,200 ETB | Section Deal of 8: 2,000 ETB) and pay via CBE account 1000253063452 (EYOB) or Telebirr (0950113361), then send your receipt to @CLN_AAU_Admin on Telegram to activate full semester access.',
        supportContact: '@CLN_AAU_Admin',
        telegramUrl: 'https://t.me/CLN_AAU_Admin',
        paymentInfo: PAYMENT_INFO
      });
    }

    const hoursLeft = (!user.is_paid && !isAdmin) ? Math.max(0, Math.ceil((trialEndMs - now) / (3600 * 1000))) : 0;

    res.json({
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        isPaid: Boolean(user.is_paid || isAdmin),
        isTrial: Boolean(!user.is_paid && !isAdmin && hoursLeft > 0),
        hoursLeft,
        createdAt: user.created_at,
        trialEndsAt: user.trial_ends_at,
        tag: user.tag || '',
        totalXp: user.total_xp,
        paymentInfo: PAYMENT_INFO
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// ==========================================
// 2. PUBLIC & STUDENT COURSE/QUIZ ENDPOINTS
// ==========================================

app.get('/api/courses', async (req, res) => {
  try {
    const courses = await db.prepare(`
      SELECT c.*, COUNT(ch.id) AS chapter_count
      FROM courses c
      LEFT JOIN chapters ch ON c.id = ch.course_id AND ch.status = 'ACTIVE' AND ch.id != 'ch_arena'
      WHERE c.status = 'ACTIVE' AND c.id != 'c_arena' AND c.id NOT LIKE 'c_arena%'
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `).all();

    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load courses: ' + err.message });
  }
});

app.get('/api/courses/:id', optionalAuthenticateToken, async (req, res) => {
  try {
    if (req.params.id === 'c_arena' || req.params.id.startsWith('c_arena')) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const course = await db.prepare("SELECT * FROM courses WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const rawChapters = await db.prepare(`
      SELECT ch.*, COUNT(q.id) AS quiz_count
      FROM chapters ch
      LEFT JOIN quizzes q ON ch.id = q.chapter_id AND q.status = 'ACTIVE' AND q.id NOT LIKE 'quiz_arena_%'
      WHERE ch.course_id = ? AND ch.status = 'ACTIVE' AND ch.id != 'ch_arena'
      GROUP BY ch.id
      ORDER BY ch.chapter_order ASC
    `).all(req.params.id);

    const isAdmin = req.user && (req.user.email === 'admin@cln.edu.et' || req.user.email === 'eyoba7619@gmail.com');

    // Collect completion records for student in this course
    let completedChapterMap = new Map();
    if (req.user && req.user.id) {
      const completedAttempts = await db.prepare(`
        SELECT q.chapter_id, qa.score, qa.percentage
        FROM quiz_attempts qa
        JOIN quizzes q ON qa.quiz_id = q.id
        JOIN chapters ch ON q.chapter_id = ch.id
        WHERE qa.user_id = ? AND ch.course_id = ? AND qa.completed_at IS NOT NULL
        ORDER BY qa.completed_at ASC
      `).all(req.user.id, course.id);

      for (const a of completedAttempts) {
        if (!completedChapterMap.has(a.chapter_id)) {
          completedChapterMap.set(a.chapter_id, {
            attemptsCount: 0,
            bestScore: 0,
            latestScore: 0
          });
        }
        const entry = completedChapterMap.get(a.chapter_id);
        entry.attemptsCount++;
        if (a.percentage > entry.bestScore) entry.bestScore = a.percentage;
        entry.latestScore = a.percentage;
      }
    }

    // Determine sequential progressive unlock
    let previousChapterCompleted = true; // Chapter 1 is always unlocked
    const chapters = rawChapters.map((ch, index) => {
      const stats = completedChapterMap.get(ch.id);
      const isCompleted = Boolean(stats);
      const bestScore = stats ? stats.bestScore : null;
      const latestScore = stats ? stats.latestScore : null;
      const attemptsCount = stats ? stats.attemptsCount : 0;

      let isUnlocked = false;
      let lockedReason = null;

      if (isAdmin) {
        isUnlocked = true;
      } else if (index === 0) {
        // First chapter is always unlocked
        isUnlocked = true;
      } else if (previousChapterCompleted) {
        // Unlocked because previous chapter has been completed
        isUnlocked = true;
      } else {
        const prevChapter = rawChapters[index - 1];
        const prevName = prevChapter ? prevChapter.name : `Chapter ${index}`;
        isUnlocked = false;
        lockedReason = `Complete ${prevName} Quiz to unlock ${ch.name} Quiz.`;
      }

      // Next chapter unlock depends strictly on whether this chapter is completed (score is irrelevant!)
      previousChapterCompleted = isCompleted;

      return {
        ...ch,
        is_completed: isCompleted,
        best_score: bestScore,
        latest_score: latestScore,
        attempts_count: attemptsCount,
        is_unlocked: isUnlocked,
        locked_reason: lockedReason
      };
    });

    res.json({ course, chapters });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load course details: ' + err.message });
  }
});

app.get('/api/chapters/:id', optionalAuthenticateToken, async (req, res) => {
  try {
    if (req.params.id === 'ch_arena' || req.params.id.startsWith('ch_arena')) {
      return res.status(404).json({ error: 'Chapter not found.' });
    }

    const chapter = await db.prepare("SELECT * FROM chapters WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found.' });

    const course = await db.prepare("SELECT * FROM courses WHERE id = ?").get(chapter.course_id);

    const isAdmin = req.user && (req.user.email === 'admin@cln.edu.et' || req.user.email === 'eyoba7619@gmail.com');

    // Check if this chapter itself is unlocked
    let isChapterUnlocked = false;
    let chapterLockedReason = null;

    if (isAdmin || chapter.chapter_order <= 1) {
      isChapterUnlocked = true;
    } else {
      // Find previous chapter in same course
      const prevChapter = await db.prepare(`
        SELECT * FROM chapters
        WHERE course_id = ? AND chapter_order < ? AND status = 'ACTIVE' AND id != 'ch_arena'
        ORDER BY chapter_order DESC
        LIMIT 1
      `).get(chapter.course_id, chapter.chapter_order);

      if (!prevChapter) {
        isChapterUnlocked = true;
      } else if (!req.user) {
        isChapterUnlocked = false;
        chapterLockedReason = `Complete ${prevChapter.name} Quiz to unlock ${chapter.name} Quiz.`;
      } else {
        const prevAttempt = await db.prepare(`
          SELECT qa.id FROM quiz_attempts qa
          JOIN quizzes q ON qa.quiz_id = q.id
          WHERE q.chapter_id = ? AND qa.user_id = ? AND qa.completed_at IS NOT NULL
          LIMIT 1
        `).get(prevChapter.id, req.user.id);

        if (prevAttempt) {
          isChapterUnlocked = true;
        } else {
          isChapterUnlocked = false;
          chapterLockedReason = `Complete ${prevChapter.name} Quiz to unlock ${chapter.name} Quiz.`;
        }
      }
    }

    const rawQuizzes = await db.prepare("SELECT * FROM quizzes WHERE chapter_id = ? AND status = 'ACTIVE' AND id NOT LIKE 'quiz_arena_%' ORDER BY created_at ASC").all(req.params.id);

    const quizzes = [];
    let previousQuizCompleted = true; // Within a chapter, first quiz is unlocked if chapter is unlocked

    for (let i = 0; i < rawQuizzes.length; i++) {
      const q = rawQuizzes[i];
      let quizAttempts = [];
      if (req.user && req.user.id) {
        quizAttempts = await db.prepare(`
          SELECT score, percentage, completed_at
          FROM quiz_attempts
          WHERE user_id = ? AND quiz_id = ? AND completed_at IS NOT NULL
          ORDER BY completed_at DESC
        `).all(req.user.id, q.id);
      }

      const isCompleted = quizAttempts.length > 0;
      const bestScore = isCompleted ? Math.max(...quizAttempts.map(a => a.percentage)) : null;
      const latestScore = isCompleted ? quizAttempts[0].percentage : null;
      const attemptsCount = quizAttempts.length;

      let isUnlocked = false;
      let lockedReason = null;

      if (isAdmin) {
        isUnlocked = true;
      } else if (!isChapterUnlocked) {
        isUnlocked = false;
        lockedReason = chapterLockedReason;
      } else if (i === 0 || previousQuizCompleted) {
        isUnlocked = true;
      } else {
        const prevQuiz = rawQuizzes[i - 1];
        isUnlocked = false;
        lockedReason = `Complete ${prevQuiz.title} to unlock ${q.title}.`;
      }

      previousQuizCompleted = isCompleted;

      quizzes.push({
        ...q,
        is_completed: isCompleted,
        best_score: bestScore,
        latest_score: latestScore,
        attempts_count: attemptsCount,
        is_unlocked: isUnlocked,
        locked_reason: lockedReason
      });
    }

    res.json({
      chapter: {
        ...chapter,
        is_unlocked: isChapterUnlocked,
        locked_reason: chapterLockedReason
      },
      quizzes,
      course
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chapter details: ' + err.message });
  }
});

// Start Quiz (Protected & Authoritative - Hides Correct Answers!)
app.get('/api/quizzes/:id/start', authenticateToken, verifyActiveUser, async (req, res) => {
  try {
    if (req.params.id.startsWith('quiz_arena_')) {
      return res.status(403).json({ error: 'Sunday Arena questions can only be accessed during live Sunday competitions.' });
    }
    const quiz = await db.prepare("SELECT * FROM quizzes WHERE id = ? AND status = 'ACTIVE'").get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found or inactive.' });

    const chapter = await db.prepare('SELECT * FROM chapters WHERE id = ?').get(quiz.chapter_id);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found.' });

    const course = await db.prepare('SELECT * FROM courses WHERE id = ?').get(chapter.course_id);

    const isAdmin = req.user.email === 'admin@cln.edu.et' || req.user.email === 'eyoba7619@gmail.com';

    // Authoritative Progressive Unlock Check:
    // If chapter > 1, the student MUST have completed at least one quiz in the previous chapter
    if (!isAdmin && chapter.chapter_order > 1) {
      const prevChapter = await db.prepare(`
        SELECT * FROM chapters
        WHERE course_id = ? AND chapter_order < ? AND status = 'ACTIVE' AND id != 'ch_arena'
        ORDER BY chapter_order DESC
        LIMIT 1
      `).get(chapter.course_id, chapter.chapter_order);

      if (prevChapter) {
        const prevAttempt = await db.prepare(`
          SELECT qa.id FROM quiz_attempts qa
          JOIN quizzes q ON qa.quiz_id = q.id
          WHERE q.chapter_id = ? AND qa.user_id = ? AND qa.completed_at IS NOT NULL
          LIMIT 1
        `).get(prevChapter.id, req.user.id);

        if (!prevAttempt) {
          return res.status(403).json({
            locked: true,
            error: 'Quiz Locked',
            message: `Complete ${prevChapter.name} Quiz to unlock ${chapter.name} Quiz.`
          });
        }
      }
    }

    const rawQuestions = await db.prepare(`
      SELECT id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d, difficulty
      FROM questions WHERE quiz_id = ?
    `).all(quiz.id);

    if (rawQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions available for this quiz.' });
    }

    const targetLimit = quiz.question_count && quiz.question_count > 0 ? quiz.question_count : rawQuestions.length;
    const finalQuestions = rawQuestions.slice(0, targetLimit);

    const attemptId = 'att_' + Date.now() + '_' + Math.round(Math.random() * 1000);
    const servedQuestionIds = JSON.stringify(finalQuestions.map(q => q.id));

    await db.prepare(`
      INSERT INTO quiz_attempts (id, user_id, quiz_id, started_at, score, percentage, xp_earned, served_question_ids)
      VALUES (?, ?, ?, ?, 0, 0.0, 0, ?)
    `).run(attemptId, req.user.id, quiz.id, new Date().toISOString(), servedQuestionIds);

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
app.post('/api/quizzes/:id/submit', authenticateToken, verifyActiveUser, async (req, res) => {
  const { attemptId, userAnswers } = req.body;

  if (!attemptId || !userAnswers) {
    return res.status(400).json({ error: 'Attempt ID and user answers are required.' });
  }

  try {
    const attempt = await db.prepare('SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ?').get(attemptId, req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Quiz attempt record not found.' });

    const quiz = await db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);

    // Determine the exact list of questions that were served to the student
    let questions = [];
    if (attempt.served_question_ids) {
      try {
        const ids = JSON.parse(attempt.served_question_ids);
        if (Array.isArray(ids) && ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const fetched = await db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(ids);
          const qMap = new Map(fetched.map(q => [q.id, q]));
          questions = ids.map(id => qMap.get(id)).filter(Boolean);
        }
      } catch (e) {
        console.error('Failed to parse served_question_ids:', e);
      }
    }

    if (!questions || questions.length === 0) {
      const allQuestions = await db.prepare('SELECT * FROM questions WHERE quiz_id = ?').all(req.params.id);
      const answeredKeys = Object.keys(userAnswers || {});
      if (answeredKeys.length > 0 && answeredKeys.length < allQuestions.length) {
        questions = allQuestions.filter(q => answeredKeys.includes(q.id));
      } else {
        questions = allQuestions;
      }
    }

    let correctCount = 0;
    const reviewDetails = [];

    const insertAnswerStmt = db.prepare(`
      INSERT INTO quiz_answers (id, attempt_id, user_id, question_id, selected_answer, is_correct, answered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of questions) {
      const selected = userAnswers[q.id] || 'UNANSWERED';
      const isCorrect = selected.toUpperCase() === q.correct_answer.toUpperCase() ? 1 : 0;
      if (isCorrect) correctCount++;

      const answerId = 'ans_' + Date.now() + '_' + Math.round(Math.random() * 10000);
      await insertAnswerStmt.run(answerId, attemptId, req.user.id, q.id, selected, isCorrect, new Date().toISOString());

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
        explanation: q.explanation,
        difficulty: q.difficulty || 'Medium'
      });
    }

    const totalQuestions = questions.length;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const xpEarned = correctCount * 10;

    await db.prepare(`
      UPDATE quiz_attempts
      SET completed_at = ?, score = ?, percentage = ?, xp_earned = ?
      WHERE id = ?
    `).run(new Date().toISOString(), correctCount, percentage, xpEarned, attemptId);

    await db.prepare('UPDATE users SET total_xp = total_xp + ? WHERE id = ?').run(xpEarned, req.user.id);

    const updatedUser = await db.prepare('SELECT total_xp FROM users WHERE id = ?').get(req.user.id);

    // Progressive Unlock: Determine next chapter unlocked in this course
    let unlockedNextChapter = null;
    try {
      const currentChapter = await db.prepare('SELECT * FROM chapters WHERE id = ?').get(quiz.chapter_id);
      if (currentChapter) {
        const nextChapter = await db.prepare(`
          SELECT * FROM chapters
          WHERE course_id = ? AND chapter_order > ? AND status = 'ACTIVE' AND id != 'ch_arena'
          ORDER BY chapter_order ASC
          LIMIT 1
        `).get(currentChapter.course_id, currentChapter.chapter_order);

        if (nextChapter) {
          const nextQuiz = await db.prepare(`
            SELECT id, title FROM quizzes
            WHERE chapter_id = ? AND status = 'ACTIVE' AND id NOT LIKE 'quiz_arena_%'
            ORDER BY created_at ASC
            LIMIT 1
          `).get(nextChapter.id);

          unlockedNextChapter = {
            chapterId: nextChapter.id,
            chapterName: nextChapter.name,
            chapterOrder: nextChapter.chapter_order,
            quizId: nextQuiz ? nextQuiz.id : null,
            quizTitle: nextQuiz ? nextQuiz.title : null
          };
        }
      }
    } catch (e) {
      console.error('Failed to compute unlockedNextChapter:', e);
    }

    res.json({
      attemptId,
      score: correctCount,
      totalQuestions,
      percentage,
      xpEarned,
      newTotalXp: updatedUser.total_xp,
      review: reviewDetails,
      unlockedNextChapter
    });
  } catch (err) {
    res.status(500).json({ error: 'Quiz submission failed: ' + err.message });
  }
});

// Student Dashboard & Analytics
app.get('/api/student/dashboard', authenticateToken, verifyActiveUser, async (req, res) => {
  try {
    const user = req.dbUser;

    const attemptsCount = await db.prepare('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(user.id);
    const avgScore = await db.prepare('SELECT AVG(percentage) AS avg_perc FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(user.id);
    const bestScore = await db.prepare('SELECT MAX(percentage) AS max_perc FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL').get(user.id);

    const recentAttempts = await db.prepare(`
      SELECT qa.*, q.title AS quiz_title, c.name AS course_name, ch.name AS chapter_name
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      JOIN chapters ch ON q.chapter_id = ch.id
      JOIN courses c ON ch.course_id = c.id
      WHERE qa.user_id = ? AND qa.completed_at IS NOT NULL
      ORDER BY qa.completed_at DESC
      LIMIT 5
    `).all(user.id);

    // Difficulty performance breakdown for student
    const diffStatsRaw = await db.prepare(`
      SELECT 
        COALESCE(q.difficulty, 'Medium') AS difficulty,
        COUNT(qa.id) AS total_attempted,
        SUM(qa.is_correct) AS total_correct
      FROM quiz_answers qa
      JOIN questions q ON qa.question_id = q.id
      WHERE qa.user_id = ?
      GROUP BY q.difficulty
    `).all(user.id);

    const difficultyStats = {
      Easy: { attempted: 0, correct: 0, accuracy: 0 },
      Medium: { attempted: 0, correct: 0, accuracy: 0 },
      Hard: { attempted: 0, correct: 0, accuracy: 0 }
    };

    for (const row of diffStatsRaw) {
      const key = ['Easy', 'Medium', 'Hard'].includes(row.difficulty) ? row.difficulty : 'Medium';
      difficultyStats[key].attempted += Number(row.total_attempted || 0);
      difficultyStats[key].correct += Number(row.total_correct || 0);
      difficultyStats[key].accuracy = difficultyStats[key].attempted > 0 
        ? Math.round((difficultyStats[key].correct / difficultyStats[key].attempted) * 100)
        : 0;
    }

    res.json({
      user,
      stats: {
        totalXp: user.total_xp,
        quizzesCompleted: attemptsCount ? attemptsCount.count : 0,
        averageScore: Math.round((avgScore && avgScore.avg_perc) || 0),
        bestScore: Math.round((bestScore && bestScore.max_perc) || 0),
        difficultyStats
      },
      recentAttempts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student dashboard: ' + err.message });
  }
});

// Student History
app.get('/api/student/history', authenticateToken, verifyActiveUser, async (req, res) => {
  try {
    const history = await db.prepare(`
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

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalStudents = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE email != 'admin@cln.edu.et'").get()).count;
    const activeStudents = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'ACTIVE' AND email != 'admin@cln.edu.et'").get()).count;
    const suspendedStudents = (await db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'SUSPENDED'").get()).count;
    const totalAttempts = (await db.prepare("SELECT COUNT(*) AS count FROM quiz_attempts WHERE completed_at IS NOT NULL").get()).count;
    const totalQuestions = (await db.prepare("SELECT COUNT(*) AS count FROM questions").get()).count;
    const avgScoreResult = await db.prepare("SELECT AVG(percentage) AS avg_perc FROM quiz_attempts WHERE completed_at IS NOT NULL").get();
    const avgScore = avgScoreResult && avgScoreResult.avg_perc ? avgScoreResult.avg_perc : 0;

    // Platform-wide difficulty stats
    const adminDiffRaw = await db.prepare(`
      SELECT 
        COALESCE(q.difficulty, 'Medium') AS difficulty,
        COUNT(qa.id) AS total_attempted,
        SUM(qa.is_correct) AS total_correct
      FROM quiz_answers qa
      JOIN questions q ON qa.question_id = q.id
      GROUP BY q.difficulty
    `).all();

    const difficultyStats = {
      Easy: { attempted: 0, correct: 0, accuracy: 0 },
      Medium: { attempted: 0, correct: 0, accuracy: 0 },
      Hard: { attempted: 0, correct: 0, accuracy: 0 }
    };
    for (const r of adminDiffRaw) {
      const key = ['Easy', 'Medium', 'Hard'].includes(r.difficulty) ? r.difficulty : 'Medium';
      difficultyStats[key].attempted += Number(r.total_attempted || 0);
      difficultyStats[key].correct += Number(r.total_correct || 0);
      difficultyStats[key].accuracy = difficultyStats[key].attempted > 0 
        ? Math.round((difficultyStats[key].correct / difficultyStats[key].attempted) * 100)
        : 0;
    }

    // Difficulty breakdown by course
    const courseDiffRaw = await db.prepare(`
      SELECT 
        c.name AS course_name,
        COALESCE(q.difficulty, 'Medium') AS difficulty,
        COUNT(qa.id) AS total_attempted,
        SUM(qa.is_correct) AS total_correct
      FROM quiz_answers qa
      JOIN questions q ON qa.question_id = q.id
      JOIN quizzes qz ON q.quiz_id = qz.id
      JOIN chapters ch ON qz.chapter_id = ch.id
      JOIN courses c ON ch.course_id = c.id
      GROUP BY c.id, q.difficulty
    `).all();

    const courseDifficultyBreakdown = {};
    for (const cRow of courseDiffRaw) {
      if (!courseDifficultyBreakdown[cRow.course_name]) {
        courseDifficultyBreakdown[cRow.course_name] = {
          Easy: { attempted: 0, correct: 0, accuracy: 0 },
          Medium: { attempted: 0, correct: 0, accuracy: 0 },
          Hard: { attempted: 0, correct: 0, accuracy: 0 }
        };
      }
      const diffKey = ['Easy', 'Medium', 'Hard'].includes(cRow.difficulty) ? cRow.difficulty : 'Medium';
      const att = Number(cRow.total_attempted || 0);
      const corr = Number(cRow.total_correct || 0);
      courseDifficultyBreakdown[cRow.course_name][diffKey] = {
        attempted: att,
        correct: corr,
        accuracy: att > 0 ? Math.round((corr / att) * 100) : 0
      };
    }

    res.json({
      stats: {
        totalStudents,
        activeStudents,
        suspendedStudents,
        totalAttempts,
        totalQuestions,
        averageScore: Math.round(avgScore),
        difficultyStats,
        courseDifficultyBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load admin stats: ' + err.message });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.prepare(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.is_paid, u.tag, u.created_at, u.trial_ends_at, u.last_active, u.total_xp,
             COUNT(qa.id) AS quiz_attempts
      FROM users u
      LEFT JOIN quiz_attempts qa ON u.id = qa.user_id AND qa.completed_at IS NOT NULL
      WHERE u.email != 'admin@cln.edu.et'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    const now = Date.now();
    const enhancedUsers = users.map(u => {
      const trialEndMs = u.trial_ends_at 
        ? new Date(u.trial_ends_at).getTime() 
        : (new Date(u.created_at).getTime() + 72 * 3600 * 1000);
      const isPaid = Boolean(u.is_paid);
      const isSuspended = u.status === 'SUSPENDED';
      const isTrialActive = !isPaid && !isSuspended && now < trialEndMs;
      const isTrialExpired = !isPaid && now >= trialEndMs;
      const hoursLeft = Math.max(0, Math.ceil((trialEndMs - now) / (3600 * 1000)));

      return {
        ...u,
        is_paid: isPaid,
        is_trial_active: isTrialActive,
        is_trial_expired: isTrialExpired,
        hours_left: hoursLeft
      };
    });

    res.json({ users: enhancedUsers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student list: ' + err.message });
  }
});

app.patch('/api/admin/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const { status, isPaid } = req.body;
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be ACTIVE or SUSPENDED.' });
  }

  try {
    if (status === 'ACTIVE') {
      const paidVal = (isPaid !== undefined) ? (isPaid ? 1 : 0) : 1;
      await db.prepare('UPDATE users SET status = ?, is_paid = ? WHERE id = ?').run(status, paidVal, req.params.id);
      res.json({ message: `User activated successfully with full access.` });
    } else {
      await db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
      res.json({ message: `User status updated to ${status}.` });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

app.patch('/api/admin/users/:id/tag', authenticateToken, requireAdmin, async (req, res) => {
  const { tag } = req.body;
  const cleanTag = (tag || '').trim();
  if (cleanTag.length > 10) {
    return res.status(400).json({ error: 'Tag cannot exceed 10 characters.' });
  }

  try {
    await db.prepare('UPDATE users SET tag = ? WHERE id = ?').run(cleanTag, req.params.id);
    res.json({ message: 'Tag updated successfully.', tag: cleanTag });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user tag: ' + err.message });
  }
});

// Admin Course CRUD
app.post('/api/admin/courses', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, imageUrl, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Course name is required.' });

  try {
    const id = 'c_' + Date.now();
    await db.prepare('INSERT INTO courses (id, name, description, image_url, status) VALUES (?, ?, ?, ?, ?)').run(id, name, description || '', imageUrl || '', status || 'ACTIVE');
    res.json({ message: 'Course created successfully.', courseId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create course: ' + err.message });
  }
});

app.put('/api/admin/courses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, imageUrl, status } = req.body;
  try {
    const existing = await db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Course not found.' });
    await db.prepare('UPDATE courses SET name = ?, description = ?, image_url = ?, status = ? WHERE id = ?').run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      status || existing.status || 'ACTIVE',
      req.params.id
    );
    res.json({ message: 'Course updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update course: ' + err.message });
  }
});

app.delete('/api/admin/courses/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Course deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete course: ' + err.message });
  }
});

// Admin Chapter CRUD
app.post('/api/admin/chapters', authenticateToken, requireAdmin, async (req, res) => {
  const { courseId, name, description, imageUrl, chapterOrder, status } = req.body;
  if (!courseId || !name) return res.status(400).json({ error: 'Course ID and Chapter name are required.' });

  try {
    const id = 'ch_' + Date.now();
    await db.prepare('INSERT INTO chapters (id, course_id, name, description, image_url, chapter_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, courseId, name, description || '', imageUrl || '', chapterOrder || 1, status || 'ACTIVE');
    res.json({ message: 'Chapter created successfully.', chapterId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chapter: ' + err.message });
  }
});

app.put('/api/admin/chapters/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, imageUrl, chapterOrder, status } = req.body;
  try {
    const existing = await db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Chapter not found.' });
    await db.prepare('UPDATE chapters SET name = ?, description = ?, image_url = ?, chapter_order = ?, status = ? WHERE id = ?').run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      chapterOrder !== undefined && chapterOrder !== '' ? parseInt(chapterOrder) : existing.chapter_order,
      status || existing.status || 'ACTIVE',
      req.params.id
    );
    res.json({ message: 'Chapter updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update chapter: ' + err.message });
  }
});

app.delete('/api/admin/chapters/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
    res.json({ message: 'Chapter deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chapter: ' + err.message });
  }
});

// Admin Content Hierarchy Tree (Excludes internal arena items)
app.get('/api/admin/content-tree', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const courses = await db.prepare("SELECT * FROM courses WHERE id != 'c_arena' AND id NOT LIKE 'c_arena%' ORDER BY created_at ASC").all();
    const chapters = await db.prepare("SELECT * FROM chapters WHERE id != 'ch_arena' AND course_id != 'c_arena' ORDER BY chapter_order ASC, created_at ASC").all();
    const quizzes = await db.prepare("SELECT * FROM quizzes WHERE id NOT LIKE 'quiz_arena_%' AND chapter_id != 'ch_arena' ORDER BY created_at ASC").all();
    const questions = await db.prepare("SELECT id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty FROM questions WHERE quiz_id NOT LIKE 'quiz_arena_%'").all();

    res.json({ courses, chapters, quizzes, questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load content tree: ' + err.message });
  }
});

// Admin Quiz CRUD
app.post('/api/admin/quizzes', authenticateToken, requireAdmin, async (req, res) => {
  const { chapterId, title, description, questionCount, timeLimit, difficulty, status } = req.body;
  if (!chapterId || !title) return res.status(400).json({ error: 'Chapter ID and Quiz title are required.' });

  try {
    const id = 'quiz_' + Date.now();
    await db.prepare('INSERT INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, chapterId, title, description || '', questionCount || 10, timeLimit || 15, difficulty || 'Medium', status || 'ACTIVE');
    res.json({ message: 'Quiz created successfully.', quizId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create quiz: ' + err.message });
  }
});

app.put('/api/admin/quizzes/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { title, description, questionCount, timeLimit, difficulty, status } = req.body;
  try {
    const existing = await db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Quiz not found.' });
    await db.prepare('UPDATE quizzes SET title = ?, description = ?, question_count = ?, time_limit = ?, difficulty = ?, status = ? WHERE id = ?').run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      questionCount ? parseInt(questionCount) : existing.question_count,
      timeLimit ? parseInt(timeLimit) : existing.time_limit,
      difficulty || existing.difficulty,
      status || existing.status || 'ACTIVE',
      req.params.id
    );
    res.json({ message: 'Quiz updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update quiz: ' + err.message });
  }
});

app.delete('/api/admin/quizzes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
    res.json({ message: 'Quiz deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quiz: ' + err.message });
  }
});

// Admin Question CRUD
app.post('/api/admin/questions', authenticateToken, requireAdmin, async (req, res) => {
  const { quizId, questionText, imageUrl, optionA, optionB, optionC, optionD, correctAnswer, explanation, difficulty } = req.body;
  if (!quizId || !questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
    return res.status(400).json({ error: 'Target Quiz, Question text, Options A-D, and Correct Answer are required.' });
  }

  try {
    const quizExists = await db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
    if (!quizExists) {
      return res.status(404).json({ error: 'Selected quiz target does not exist. Please create or select a valid quiz.' });
    }

    const validDifficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium';
    const id = 'q_' + Date.now() + '_' + Math.round(Math.random() * 1000);
    await db.prepare(`
      INSERT INTO questions (id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, quizId, questionText.trim(), imageUrl || '', optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim(), correctAnswer.trim().toUpperCase(), (explanation || '').trim(), validDifficulty);

    // Automatically keep quiz question_count in sync with bank count so new questions are served by default
    const countResult = await db.prepare('SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?').get(quizId);
    const count = countResult ? countResult.c : 0;
    await db.prepare('UPDATE quizzes SET question_count = ? WHERE id = ?').run(count, quizId);

    res.json({ message: 'Question added to bank successfully.', questionId: id, totalQuestions: count });
  } catch (err) {
    console.error('Error adding question:', err);
    res.status(500).json({ error: 'Failed to add question: ' + err.message });
  }
});

app.put('/api/admin/questions/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { questionText, imageUrl, optionA, optionB, optionC, optionD, correctAnswer, explanation, difficulty } = req.body;
  try {
    const existing = await db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    await db.prepare(`
      UPDATE questions
      SET question_text = ?, image_url = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, explanation = ?, difficulty = ?
      WHERE id = ?
    `).run(
      questionText || existing.question_text,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      optionA || existing.option_a,
      optionB || existing.option_b,
      optionC || existing.option_c,
      optionD || existing.option_d,
      (correctAnswer || existing.correct_answer).toUpperCase(),
      explanation !== undefined ? explanation : existing.explanation,
      difficulty || existing.difficulty || 'Medium',
      req.params.id
    );
    res.json({ message: 'Question updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update question: ' + err.message });
  }
});

app.delete('/api/admin/questions/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const question = await db.prepare('SELECT quiz_id FROM questions WHERE id = ?').get(req.params.id);
    await db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);

    if (question) {
      const countResult = await db.prepare('SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?').get(question.quiz_id);
      const count = countResult ? countResult.c : 0;
      await db.prepare('UPDATE quizzes SET question_count = ? WHERE id = ?').run(count, question.quiz_id);
    }

    res.json({ message: 'Question deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question: ' + err.message });
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

// ==========================================
// 8. SUNDAY LIVE ARENA ENDPOINTS
// ==========================================

// Get current live or scheduled arena state
app.get('/api/arena/current', optionalAuthenticateToken, (req, res) => {
  try {
    const isAdmin = req.user && req.user.email === 'admin@cln.edu.et';
    const state = arenaEngine.getPublicState(req.user, isAdmin);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve arena status: ' + err.message });
  }
});

// Join the arena lobby
app.post('/api/arena/join', authenticateToken, verifyActiveUser, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = await arenaEngine.joinSession(sessionId, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Submit answer for active question
app.post('/api/arena/submit', authenticateToken, verifyActiveUser, async (req, res) => {
  try {
    const { sessionId, questionIndex, answerKey } = req.body;
    if (!sessionId || questionIndex === undefined || !answerKey) {
      return res.status(400).json({ error: 'sessionId, questionIndex, and answerKey are required.' });
    }
    const result = await arenaEngine.submitAnswer(sessionId, req.user.id, questionIndex, answerKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get leaderboard for a session
app.get('/api/arena/leaderboard/:sessionId', (req, res) => {
  try {
    const leaderboard = arenaEngine.getLeaderboard();
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Arena Status Controller (LOBBY, ACTIVE, NEXT, ENDED)
app.post('/api/admin/arena/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, status } = req.body;
    if (action === 'NEXT') {
      await arenaEngine.advanceNextQuestion();
    } else if (status) {
      await arenaEngine.adminSetStatus(status);
    }
    const state = arenaEngine.getPublicState(req.user, true);
    res.json({ message: 'Arena status updated.', state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Create/Schedule New Arena Session
app.post('/api/admin/arena/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, courseId, scheduledAt, secondsPerQuestion, questionCount } = req.body;
    const result = await arenaEngine.adminCreateSession({
      title,
      courseId,
      scheduledAt,
      secondsPerQuestion: parseInt(secondsPerQuestion) || 40,
      questionCount: parseInt(questionCount) || 20
    });
    res.json({ message: 'Arena session created successfully.', result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Live Monitor Data
app.get('/api/admin/arena/monitor', authenticateToken, requireAdmin, (req, res) => {
  try {
    const state = arenaEngine.getPublicState(req.user, true);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Toggle Auto-Pilot
app.post('/api/admin/arena/autopilot', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled === 'boolean') {
      arenaEngine.autoPilot = enabled;
    }
    res.json({ message: 'Auto-pilot setting updated.', autoPilot: arenaEngine.autoPilot });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Upload & Attach Questions to Sunday Arena
app.post('/api/admin/arena/upload-questions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sessionId, rawText } = req.body;
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: 'Please paste question text to upload.' });
    }
    const result = await arenaEngine.parseAndAttachArenaQuestions(sessionId, rawText);
    res.json({
      message: `Successfully parsed and attached ${result.questionCount} questions to the Sunday Arena!`,
      result
    });
  } catch (err) {
    console.error('Error attaching arena questions:', err);
    res.status(400).json({ error: err.message });
  }
});

// Admin Get Loaded Questions for Sunday Arena Preview
app.get('/api/admin/arena/questions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const questions = await arenaEngine.getArenaQuestions(sessionId);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global Error Handling Middleware (Ensures JSON errors, prevents HTML error responses)
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || 'Internal Server Error'
  });
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
    console.log(`Database connected via Turso Cloud / LibSQL`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`===================================================`);
  });
}

module.exports = app;
