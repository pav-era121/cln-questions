async function testAddQuestion() {
  console.log('--- TESTING ADMIN QUESTION CREATION ---');

  // 1. Login as Admin
  const resLogin = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginIdentifier: 'admin@cln.edu.et', password: 'AdminPassword123' })
  });
  const dataLogin = await resLogin.json();
  const token = dataLogin.token;

  // 2. Post new question to quiz-logic-1
  const newQuestion = {
    quizId: 'quiz-logic-1',
    questionText: 'Test Question: What is a sound argument?',
    optionA: 'Valid argument with true premises',
    optionB: 'Invalid argument with true premises',
    optionC: 'Valid argument with false premises',
    optionD: 'An emotional appeal',
    correctAnswer: 'A',
    explanation: 'A sound argument is both logically valid and contains factually true premises.'
  };

  const resAdd = await fetch('http://localhost:3000/api/admin/questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(newQuestion)
  });

  const dataAdd = await resAdd.json();
  console.log('API Response:', dataAdd);

  if (resAdd.ok && dataAdd.questionId) {
    console.log('✓ QUESTION SAVED SUCCESSFULLY! ID:', dataAdd.questionId);
  } else {
    console.error('✗ FAILED TO SAVE QUESTION:', dataAdd.error);
  }
}

testAddQuestion();
