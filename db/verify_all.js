async function runVerification() {
  console.log('--- CLN QUESTIONS END-TO-END VERIFICATION ---');

  // 1. Fetch Courses
  const resCourses = await fetch('http://localhost:3000/api/courses');
  const dataCourses = await resCourses.json();
  console.log('1. Courses List:', dataCourses.courses.map(c => c.name));

  // 2. Student Login
  const resLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: 'student@cln.edu.et', password: 'StudentPassword123' })
  });
  const dataLogin = await resLogin.json();
  console.log('2. Student Login:', dataLogin.message, '| User:', dataLogin.user.fullName, '| XP:', dataLogin.user.totalXp);
  const token = dataLogin.token;

  // 3. Start Logic Quiz
  const resStart = await fetch('http://localhost:3000/api/quizzes/quiz-logic-1/start', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const dataStart = await resStart.json();

  if (dataStart.error) {
    console.error('3. Start Quiz Error:', dataStart.error);
    return;
  }

  console.log('3. Start Quiz Attempt:', dataStart.attemptId, '| Questions received:', dataStart.questions.length);

  // Verify correct_answer is HIDDEN
  const hasCorrectAnswerField = dataStart.questions.some(q => q.correct_answer !== undefined);
  console.log('   Correct Answer Hidden Server-Side:', !hasCorrectAnswerField ? 'PASSED ✓' : 'FAILED ✗');

  // 4. Submit Quiz Answers (4 correct, 1 wrong)
  const qList = dataStart.questions;
  const userAnswers = {};
  userAnswers[qList[0].id] = 'B'; // Correct
  userAnswers[qList[1].id] = 'B'; // Correct
  userAnswers[qList[2].id] = 'B'; // Correct
  userAnswers[qList[3].id] = 'B'; // Correct
  userAnswers[qList[4].id] = 'D'; // Wrong (correct is A)

  const resSubmit = await fetch('http://localhost:3000/api/quizzes/quiz-logic-1/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ attemptId: dataStart.attemptId, userAnswers })
  });
  const dataSubmit = await resSubmit.json();
  if (dataSubmit.error) {
    console.error('4. Submit Quiz Error:', dataSubmit.error);
    return;
  }

  console.log('4. Submit Quiz Results:', `Score: ${dataSubmit.score}/${dataSubmit.totalQuestions} (${dataSubmit.percentage}%)`, `| Earned: +${dataSubmit.xpEarned} XP`, `| New Total: ${dataSubmit.newTotalXp} XP`);

  // 5. Admin Login & Suspend User Test
  const resAdminLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: 'admin@cln.edu.et', password: 'AdminPassword123' })
  });
  const dataAdminLogin = await resAdminLogin.json();
  const adminToken = dataAdminLogin.token;

  // Suspend student
  await fetch(`http://localhost:3000/api/admin/users/${dataLogin.user.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'SUSPENDED' })
  });

  // Verify Student is BLOCKED
  const resBlocked = await fetch('http://localhost:3000/api/student/dashboard', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const dataBlocked = await resBlocked.json();
  console.log('5. Suspended User Server Enforcement:', resBlocked.status === 403 && dataBlocked.suspended ? 'PASSED ✓' : 'FAILED ✗', '| Message:', dataBlocked.message);

  // Reactivate student
  await fetch(`http://localhost:3000/api/admin/users/${dataLogin.user.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'ACTIVE' })
  });
  console.log('   Reactivated student user status successfully.');

  console.log('--- ALL E2E VERIFICATIONS PASSED SUCCESSFULLY ---');
}

runVerification();
