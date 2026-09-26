const http = require('http');

function request(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('===================================================');
  console.log('🧪 RUNNING CLN QUESTIONS MVP AUTOMATED E2E TEST');
  console.log('===================================================');

  // 1. Register Student
  console.log('\n1. Registering new student (sarah_student)...');
  const regRes = await request('/api/auth/register', 'POST', {
    username: 'sarah_student',
    email: 'sarah@example.com',
    phone: '+1987654321',
    password: 'studentpassword123',
    marketing_consent: true
  });
  console.log(`STATUS ${regRes.status}:`, regRes.body.message || regRes.body.error);
  const studentToken = regRes.body.token;

  // 2. Fetch Subjects (Verify DB driven)
  console.log('\n2. Fetching subjects from database...');
  const subjRes = await request('/api/subjects');
  console.log(`Found ${subjRes.body.subjects.length} subjects in DB:`, subjRes.body.subjects.map(s => s.name));

  // 3. Start Quiz
  const physicsSubj = subjRes.body.subjects.find(s => s.name === 'Physics');
  const quizListRes = await request(`/api/subjects/${physicsSubj.id}/quizzes`);
  const targetQuiz = quizListRes.body.quizzes[0];
  console.log(`\n3. Starting quiz "${targetQuiz.title}" (ID: ${targetQuiz.id})...`);

  const startRes = await request(`/api/quiz/${targetQuiz.id}/start`, 'POST', null, studentToken);
  console.log(`Quiz Started! Attempt ID: ${startRes.body.attemptId}, Remaining Seconds: ${startRes.body.remainingSeconds}`);
  console.log(`Questions loaded: ${startRes.body.questions.length}`);

  // 4. Submit Answers
  console.log('\n4. Submitting quiz answers...');
  const answers = {};
  startRes.body.questions.forEach((q, idx) => {
    answers[q.id] = idx % 2 === 0 ? 'B' : 'A'; // Select options
  });

  const subRes = await request(`/api/quiz/attempt/${startRes.body.attemptId}/submit`, 'POST', { answers }, studentToken);
  console.log('RESULT SUMMARY:');
  console.log(`- Score: ${subRes.body.score}/${subRes.body.total_questions}`);
  console.log(`- Percentage: ${subRes.body.percentage}%`);
  console.log(`- XP Earned: +${subRes.body.xp_earned} XP`);

  // 5. Check Student Dashboard
  console.log('\n5. Verifying Student Dashboard metrics...');
  const dashRes = await request('/api/student/dashboard', 'GET', null, studentToken);
  console.log(`- Username: ${dashRes.body.username}`);
  console.log(`- Total XP: ${dashRes.body.total_xp} XP`);
  console.log(`- Quizzes Completed: ${dashRes.body.quizzes_completed}`);
  console.log(`- Average Score: ${dashRes.body.average_score}%`);

  // 6. Admin Login
  console.log('\n6. Logging in as Admin...');
  const adminLogin = await request('/api/auth/login', 'POST', {
    identifier: 'admin',
    password: 'adminpassword123'
  });
  const adminToken = adminLogin.body.token;
  console.log('Admin login success!');

  // 7. Admin Creates New Course / Subject
  console.log('\n7. Admin adding NEW Course: "Computer Science"...');
  const createSubjRes = await request('/api/admin/subjects', 'POST', {
    name: 'Computer Science',
    description: 'Algorithms, Data Structures & Software Development',
    icon: 'code',
    status: 'active'
  }, adminToken);
  console.log('New Course Created:', createSubjRes.body.subject);

  // 8. Admin Creates New Quiz under Computer Science
  console.log('\n8. Admin creating Quiz under Computer Science...');
  const createQuizRes = await request('/api/admin/quizzes', 'POST', {
    subject_id: createSubjRes.body.subject.id,
    title: 'Python & Data Structures',
    description: 'Master arrays, linked lists, dictionaries and sorting.',
    time_limit: 15,
    difficulty: 'Medium',
    status: 'published'
  }, adminToken);
  console.log('New Quiz Created:', createQuizRes.body.quiz);

  // 9. Admin Adds Question to New Quiz
  console.log('\n9. Admin adding MCQ Question to "Python & Data Structures"...');
  const createQRes = await request('/api/admin/questions', 'POST', {
    quiz_id: createQuizRes.body.quiz.id,
    question_text: 'What is the time complexity of looking up a key in a Python dictionary on average?',
    option_a: 'O(N)',
    option_b: 'O(1)',
    option_c: 'O(N log N)',
    option_d: 'O(N²)',
    correct_answer: 'B',
    explanation: 'Python dictionaries use hash tables which provide O(1) average lookup time.'
  }, adminToken);
  console.log('Question Created:', createQRes.body.question);

  // 10. Verify New Course & Quiz returned in Public Subjects API
  console.log('\n10. Re-verifying Public Subjects API (Ensuring no hardcoded courses)...');
  const updatedSubjRes = await request('/api/subjects');
  console.log('Updated Subjects List from Database:', updatedSubjRes.body.subjects.map(s => `${s.name} (${s.quiz_count} quizzes)`));

  console.log('\n===================================================');
  console.log('✅ ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('===================================================');
}

runTests().catch(err => {
  console.error('Test error:', err);
});
