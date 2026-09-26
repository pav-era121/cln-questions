const http = require('http');
const { app, initDb } = require('./server.js');

const TEST_PORT = 3006;

function request(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
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
  console.log('Initializing database for enhanced feature test runner...');
  await initDb();

  const server = app.listen(TEST_PORT, () => {
    console.log(`Test server listening on port ${TEST_PORT}`);
  });

  console.log('===================================================');
  console.log('🧪 RUNNING ENHANCED CLN QUESTIONS FEATURE TESTS');
  console.log('===================================================');

  try {
    // 1. Test Ethiopian Phone Number Validation - Invalid Phone
    console.log('\n1. Testing registration with invalid phone (77777777777777777777777)...');
    const invalidPhoneRes = await request('/api/auth/register', 'POST', {
      username: 'invalid_phone_user',
      email: 'invalidphone@example.com',
      phone: '77777777777777777777777',
      password: 'password123',
      marketing_consent: true
    });
    console.log(`STATUS ${invalidPhoneRes.status}:`, invalidPhoneRes.body.error);
    if (invalidPhoneRes.status !== 400) {
      throw new Error('Expected status 400 for invalid phone number!');
    }
    console.log('✓ Invalid phone number correctly rejected!');

    // 2. Test Ethiopian Phone Number Validation - Valid Phone (+251912345678)
    const testUsername = `ethiopian_${Date.now()}`;
    console.log(`\n2. Testing registration with valid Ethiopian phone (+251912345678) as ${testUsername}...`);
    const validPhoneRes = await request('/api/auth/register', 'POST', {
      username: testUsername,
      email: `ethiopian_${Date.now()}@example.com`,
      phone: '+251912345678',
      password: 'studentpassword123',
      marketing_consent: true
    });
    console.log(`STATUS ${validPhoneRes.status}:`, validPhoneRes.body.message || validPhoneRes.body.error);
    if (validPhoneRes.status !== 201) {
      throw new Error('Expected status 201 for valid Ethiopian phone number!');
    }
    console.log('✓ Valid Ethiopian phone accepted & registered!');
    const studentToken = validPhoneRes.body.token;
    const studentId = validPhoneRes.body.user.id;

    // 3. Test Admin Login & Suspend User
    console.log('\n3. Admin logging in & suspending student...');
    const adminLoginRes = await request('/api/auth/login', 'POST', {
      identifier: 'admin',
      password: 'adminpassword123'
    });
    let adminToken = adminLoginRes.body.token;

    await request(`/api/admin/users/${studentId}/status`, 'POST', { status: 'Suspended' }, adminToken);
    console.log('Student account suspended.');

    // 4. Test Login as Suspended Student (Verify exact telegram notice)
    console.log('\n4. Verifying suspended student login attempt error text...');
    const suspendedLoginRes = await request('/api/auth/login', 'POST', {
      identifier: testUsername,
      password: 'studentpassword123'
    });
    console.log(`STATUS ${suspendedLoginRes.status}:`, suspendedLoginRes.body.error);
    const expectedError = 'Your account has been suspended. Please contace @CLN_AAU_Admin on telegram.';
    if (suspendedLoginRes.body.error !== expectedError) {
      throw new Error(`Expected error message "${expectedError}", but got "${suspendedLoginRes.body.error}"`);
    }
    console.log('✓ Exact Telegram suspended message verified!');

    // Reactivate student for remaining tests
    await request(`/api/admin/users/${studentId}/status`, 'POST', { status: 'Active' }, adminToken);

    // 5. Test Course Chapters Hierarchy & Cover Images
    console.log('\n5. Admin creating a Chapter under Physics course...');
    const subjRes = await request('/api/subjects');
    const physicsSubj = subjRes.body.subjects.find(s => s.name === 'Physics') || subjRes.body.subjects[0];

    const createChapRes = await request('/api/admin/chapters', 'POST', {
      subject_id: physicsSubj.id,
      title: 'Chapter 3: Electromagnetism & Optics',
      description: 'Electric fields, magnetic forces, and optical lenses.',
      image_url: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=600&q=80',
      order_index: 3
    }, adminToken);
    console.log('New Chapter Created:', createChapRes.body.chapter);

    // Fetch Chapters for Course
    const fetchChapsRes = await request(`/api/subjects/${physicsSubj.id}/chapters`);
    const chaptersList = fetchChapsRes.body.chapters || [];
    console.log(`Chapters found for ${physicsSubj.name} (${chaptersList.length}):`, chaptersList.map(c => c.title));

    // 6. Test Admin Password Change
    console.log('\n6. Testing Admin Password Change...');
    const changePassRes = await request('/api/admin/change-password', 'POST', {
      currentPassword: 'adminpassword123',
      newPassword: 'newadminpassword456'
    }, adminToken);
    console.log(`STATUS ${changePassRes.status}:`, changePassRes.body.message);

    // Verify Admin Login with New Password
    console.log('\n7. Verifying Admin Login with NEW Password...');
    const newAdminLoginRes = await request('/api/auth/login', 'POST', {
      identifier: 'admin',
      password: 'newadminpassword456'
    });
    console.log(`STATUS ${newAdminLoginRes.status}:`, newAdminLoginRes.body.message || newAdminLoginRes.body.error);
    if (newAdminLoginRes.status !== 200) {
      throw new Error('Failed to log in with newly updated admin password!');
    }
    console.log('✓ Admin password change verified successfully!');

    // Reset admin password back to default for convenience
    adminToken = newAdminLoginRes.body.token;
    await request('/api/admin/change-password', 'POST', {
      currentPassword: 'newadminpassword456',
      newPassword: 'adminpassword123'
    }, adminToken);
    console.log('Admin password restored to default (adminpassword123).');

    console.log('\n===================================================');
    console.log('✅ ALL ENHANCED FEATURE TESTS PASSED SUCCESSFULLY!');
    console.log('===================================================');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
