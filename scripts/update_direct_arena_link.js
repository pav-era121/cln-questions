const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// ==========================================
// 1. UPDATE public/index.html
// ==========================================
const indexPath = path.join(rootDir, 'public', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// A. Insert Open Graph & Twitter Social Tags
const ogTags = `  <!-- OPEN GRAPH & SOCIAL PREVIEW (TELEGRAM, WHATSAPP, FACEBOOK) -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="🏆 Sunday Grand Arena: Freshman Championship">
  <meta property="og:description" content="Synchronized Live Rapid-Fire Competition for Ethiopian University Freshmen. Compete live, test your speed and accuracy, and claim your spot on the Grand Podium!">
  <meta property="og:image" content="https://cln-questions.vercel.app/icons/icon-512.png">
  <meta property="og:url" content="https://cln-questions.vercel.app/arena">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="🏆 Sunday Grand Arena: Freshman Championship">
  <meta name="twitter:description" content="Synchronized Live Competition for Ethiopian University Freshmen. Compete live tonight at 8:00 PM (EAT)!">
  <meta name="twitter:image" content="https://cln-questions.vercel.app/icons/icon-512.png">\n`;

if (!indexHtml.includes('og:title')) {
  indexHtml = indexHtml.replace(
    /<link rel="apple-touch-icon" sizes="512x512" href="\/icons\/icon-512\.png">\r?\n/i,
    `$&${ogTags}`
  );
  console.log('✅ Open Graph meta tags added to index.html');
}

// B. Add placeholder banner containers for Login & Register
if (!indexHtml.includes('id="arena-auth-banner-login"')) {
  indexHtml = indexHtml.replace(
    /(<section id="view-login"[^>]*>\s*<div class="container"[^>]*>)/i,
    `$1\n        <div id="arena-auth-banner-login" style="display:none;"></div>`
  );
  console.log('✅ Added arena-auth-banner-login container');
}

if (!indexHtml.includes('id="arena-auth-banner-reg"')) {
  indexHtml = indexHtml.replace(
    /(<section id="view-register"[^>]*>\s*<div class="container"[^>]*>)/i,
    `$1\n        <div id="arena-auth-banner-reg" style="display:none;"></div>`
  );
  console.log('✅ Added arena-auth-banner-reg container');
}

// C. Add autocomplete attributes to login & register form inputs
indexHtml = indexHtml.replace(
  'id="login-identifier" class="form-input"',
  'id="login-identifier" name="username" autocomplete="username" class="form-input"'
);
indexHtml = indexHtml.replace(
  'id="login-password" class="form-input"',
  'id="login-password" name="password" autocomplete="current-password" class="form-input"'
);
indexHtml = indexHtml.replace(
  'id="reg-fullname" class="form-input"',
  'id="reg-fullname" name="name" autocomplete="name" class="form-input"'
);
indexHtml = indexHtml.replace(
  'id="reg-email" class="form-input"',
  'id="reg-email" name="email" autocomplete="email" class="form-input"'
);
indexHtml = indexHtml.replace(
  'id="reg-phone" class="form-input"',
  'id="reg-phone" name="tel" autocomplete="tel" class="form-input"'
);
indexHtml = indexHtml.replace(
  'id="reg-password" class="form-input"',
  'id="reg-password" name="password" autocomplete="new-password" class="form-input"'
);

fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('✅ public/index.html updated successfully');


// ==========================================
// 2. UPDATE public/js/app.js
// ==========================================
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Replace init() with awaited auth and arena route handling
const oldInit = `  async init() {
    this.setupEventListeners();
    this.checkAuth();
    await this.loadCourses();
    if (typeof arena !== 'undefined' && arena.init) {
      arena.init();
    }
    this.showView('home');
  },`;

const newInit = `  async init() {
    this.setupEventListeners();
    await this.checkAuth();
    await this.loadCourses();
    if (typeof arena !== 'undefined' && arena.init) {
      arena.init();
    }

    // Detect if user arrived via direct arena link (/arena, /sunday-arena, #arena, ?arena=1)
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const isArenaRoute = path.includes('/arena') || path.includes('/sunday-arena') || hash === '#arena' || params.has('arena');

    if (isArenaRoute) {
      this.handleDirectArenaRoute();
    } else {
      this.showView('home');
    }
  },`;

appJs = appJs.replace(oldInit, newInit);

// Add popstate listener in setupEventListeners
if (!appJs.includes('cln:popstate-arena')) {
  appJs = appJs.replace(
    `    window.addEventListener('cln:auth-expired', (e) => {`,
    `    // Browser back/forward navigation support
    window.addEventListener('popstate', (e) => {
      const p = window.location.pathname.toLowerCase();
      if (p.includes('/arena') || p.includes('/sunday-arena')) {
        this.showView('arena');
      } else {
        this.showView('home');
      }
    }); // cln:popstate-arena

    window.addEventListener('cln:auth-expired', (e) => {`
  );
  console.log('✅ popstate listener added to setupEventListeners');
}

// Add handleDirectArenaRoute, showArenaAuthGate, copyArenaDirectLink
if (!appJs.includes('handleDirectArenaRoute()')) {
  const helperMethods = `
  handleDirectArenaRoute() {
    if (this.state.user) {
      this.showView('arena');
      this.showToast(\`Welcome back, \${this.state.user.fullName}! Entering Sunday Grand Arena...\`, 'info');
    } else {
      this.showArenaAuthGate('register');
    }
  },

  showArenaAuthGate(mode = 'register') {
    this.state.redirectAfterAuth = 'arena';
    try {
      sessionStorage.setItem('cln_post_auth_redirect', 'arena');
    } catch (e) {}

    const bannerHtml = \`
      <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); color:#fff; border-radius:14px; padding:18px 20px; margin-bottom:20px; text-align:center; box-shadow:0 8px 24px rgba(37,99,235,0.25);">
        <div style="font-size:2rem; margin-bottom:4px;">🏆</div>
        <h2 style="font-size:1.25rem; font-weight:900; color:#fff; margin:0 0 6px;">Sunday Grand Arena: Freshman Championship</h2>
        <p style="font-size:0.88rem; opacity:0.92; margin:0 auto; max-width:380px; line-height:1.45;">
          Join freshmen nationwide in tonight's synchronized competition! Please log in or create your student account to enter the arena.
        </p>
      </div>
    \`;

    const loginBanner = document.getElementById('arena-auth-banner-login');
    const regBanner = document.getElementById('arena-auth-banner-reg');
    if (loginBanner) {
      loginBanner.innerHTML = bannerHtml;
      loginBanner.style.display = 'block';
    }
    if (regBanner) {
      regBanner.innerHTML = bannerHtml;
      regBanner.style.display = 'block';
    }

    if (mode === 'login') {
      this.showView('login');
      const submitBtn = document.querySelector('#form-login button[type="submit"]');
      if (submitBtn) submitBtn.innerText = 'Log In & Enter Arena 🏆';
    } else {
      this.showView('register');
      const submitBtn = document.querySelector('#form-register button[type="submit"]');
      if (submitBtn) submitBtn.innerText = 'Create Account & Enter Arena 🏆';
    }
  },

  copyArenaDirectLink() {
    const url = \`\${window.location.origin}/arena\`;
    const textToCopy = \`🏆 Sunday Grand Arena: Freshman Championship\\nJoin tonight's live synchronized competition at 8:00 PM (EAT):\\n\${url}\`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        this.showToast('📋 Arena direct link copied! Ready to share on Telegram or WhatsApp.', 'success');
      }).catch(() => {
        prompt('Copy Arena Link:', url);
      });
    } else {
      prompt('Copy Arena Link:', url);
    }
  },
`;

  appJs = appJs.replace(
    `  renderNavUserArea() {`,
    `${helperMethods}\n  renderNavUserArea() {`
  );
  console.log('✅ Added arena route helpers to app.js');
}

// Update showView to manage URL and arena auth banners
const oldShowViewStart = `  showView(viewName) {
    this.state.currentView = viewName;

    // Hide all sections
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');`;

const newShowViewStart = `  showView(viewName) {
    this.state.currentView = viewName;

    // Clean up arena auth banners if navigating away from auth
    if (viewName !== 'login' && viewName !== 'register') {
      const loginBanner = document.getElementById('arena-auth-banner-login');
      const regBanner = document.getElementById('arena-auth-banner-reg');
      if (loginBanner) loginBanner.style.display = 'none';
      if (regBanner) regBanner.style.display = 'none';
      const loginBtn = document.querySelector('#form-login button[type="submit"]');
      if (loginBtn) loginBtn.innerText = 'Log In';
      const regBtn = document.querySelector('#form-register button[type="submit"]');
      if (regBtn) regBtn.innerText = 'Create Student Account';
    }

    // Keep address bar in sync for direct link sharing
    try {
      if (viewName === 'arena') {
        if (!window.location.pathname.includes('/arena')) {
          window.history.pushState({ view: 'arena' }, '', '/arena');
        }
      } else if (viewName === 'home') {
        if (window.location.pathname.includes('/arena')) {
          window.history.pushState({ view: 'home' }, '', '/');
        }
      }
    } catch (e) {}

    // Hide all sections
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');`;

appJs = appJs.replace(oldShowViewStart, newShowViewStart);

// Update handleLogin for post-auth arena redirect
const oldLoginRedirect = `      if (res.user.email === 'admin@cln.edu.et') {
        this.showView('admin');
      } else {
        this.showView('dashboard');
      }`;

const newLoginRedirect = `      const redirect = this.state.redirectAfterAuth || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cln_post_auth_redirect'));
      if (redirect === 'arena') {
        this.state.redirectAfterAuth = null;
        try { sessionStorage.removeItem('cln_post_auth_redirect'); } catch(e){}
        this.showView('arena');
        this.showToast(\`Welcome back, \${res.user.fullName}! Entering Sunday Grand Arena...\`, 'success');
        return;
      }

      if (res.user.email === 'admin@cln.edu.et') {
        this.showView('admin');
      } else {
        this.showView('dashboard');
      }`;

appJs = appJs.replace(oldLoginRedirect, newLoginRedirect);

// Update handleRegister for post-auth arena redirect
const oldRegSuccess = `      this.state.user = res.user;
      this.state.justRegistered = true;
      this.renderNavUserArea();
      this.showView('suspended');
      this.showToast(\`Welcome, \${res.user.fullName}! Choose a semester package or start your 3-day free trial.\`, 'success');`;

const newRegSuccess = `      this.state.user = res.user;
      this.renderNavUserArea();

      const redirect = this.state.redirectAfterAuth || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cln_post_auth_redirect'));
      if (redirect === 'arena') {
        this.state.redirectAfterAuth = null;
        try { sessionStorage.removeItem('cln_post_auth_redirect'); } catch(e){}
        this.state.justRegistered = true;
        this.showView('arena');
        this.showToast(\`Welcome, \${res.user.fullName}! Your free 3-day trial is active and you are ready for tonight's Sunday Grand Arena! 🏆\`, 'success');
        return;
      }

      this.state.justRegistered = true;
      this.showView('suspended');
      this.showToast(\`Welcome, \${res.user.fullName}! Choose a semester package or start your 3-day free trial.\`, 'success');`;

appJs = appJs.replace(oldRegSuccess, newRegSuccess);

// In Admin Arena Tab, add Direct Share Link Box
const adminShareCard = `
        <div style="background:var(--card-bg, #fff); border:1px solid var(--border); border-radius:10px; padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:#2563eb; letter-spacing:0.5px;">📢 Direct Share Link (Telegram / WhatsApp)</div>
            <div style="font-size:0.95rem; font-weight:700; color:var(--navy); word-break:break-all;">https://cln-questions.vercel.app/arena</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="app.copyArenaDirectLink()">📋 Copy Share Link</button>
        </div>
`;

if (!appJs.includes('app.copyArenaDirectLink()')) {
  appJs = appJs.replace(
    `container.innerHTML = \`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">`,
    `container.innerHTML = \`${adminShareCard}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">`
  );
  console.log('✅ Added Direct Share Link box to Admin Arena tab');
}

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('✅ public/js/app.js updated successfully');


// ==========================================
// 3. UPDATE public/js/arena.js
// ==========================================
const arenaJsPath = path.join(rootDir, 'public', 'js', 'arena.js');
let arenaJs = fs.readFileSync(arenaJsPath, 'utf8');

// Update checkInLobby to use showArenaAuthGate
const oldCheckInAuth = `  async checkInLobby(sessionId) {
    if (!app.state.user) {
      alert('Please register a student account or log in to enter the Sunday Arena.');
      app.showView('register');
      return;
    }`;

const newCheckInAuth = `  async checkInLobby(sessionId) {
    if (!app.state.user) {
      app.showArenaAuthGate('register');
      return;
    }`;

arenaJs = arenaJs.replace(oldCheckInAuth, newCheckInAuth);

// Add Share Invite Link button in renderScheduledState
const oldScheduledButtons = `        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-lg btn-primary" style="background:#ffd166; color:var(--navy); font-weight:800; border:none;" onclick="arena.checkInLobby('\${data.sessionId}')">
            🔔 Check In / Ready Up
          </button>
        </div>`;

const newScheduledButtons = `        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:8px;">
          <button class="btn btn-lg btn-primary" style="background:#ffd166; color:var(--navy); font-weight:800; border:none; box-shadow:0 4px 14px rgba(0,0,0,0.2);" onclick="arena.checkInLobby('\${data.sessionId}')">
            🔔 Check In / Ready Up
          </button>
          <button class="btn btn-lg" style="background:rgba(255,255,255,0.15); color:#fff; font-weight:700; border:1px solid rgba(255,255,255,0.35); backdrop-filter:blur(6px); cursor:pointer;" onclick="arena.shareArenaLink()">
            📢 Share Invite Link
          </button>
        </div>`;

arenaJs = arenaJs.replace(oldScheduledButtons, newScheduledButtons);

// Add Share Invite Link button in renderLobbyState
const oldLobbyButtons = `          <div style="margin-top:20px;">
            <button class="btn btn-lg" style="background:#ffd166; color:var(--navy); font-weight:800; padding:14px 32px; border:none;" onclick="arena.checkInLobby('\${data.sessionId}')">
              🔔 Join Lobby Now
            </button>
          </div>`;

const newLobbyButtons = `          <div style="margin-top:20px; display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-lg" style="background:#ffd166; color:var(--navy); font-weight:800; padding:14px 32px; border:none; box-shadow:0 4px 14px rgba(0,0,0,0.2);" onclick="arena.checkInLobby('\${data.sessionId}')">
              🔔 Join Lobby Now
            </button>
            <button class="btn btn-lg" style="background:rgba(255,255,255,0.15); color:#fff; font-weight:700; border:1px solid rgba(255,255,255,0.35); padding:14px 24px; cursor:pointer;" onclick="arena.shareArenaLink()">
              📢 Share Invite Link
            </button>
          </div>`;

arenaJs = arenaJs.replace(oldLobbyButtons, newLobbyButtons);

// Add shareArenaLink and copyArenaToClipboard to arena object
if (!arenaJs.includes('shareArenaLink()')) {
  const shareMethods = `
  shareArenaLink() {
    const arenaUrl = \`\${window.location.origin}/arena\`;
    const shareData = {
      title: 'Sunday Grand Arena: Freshman Championship',
      text: '🏆 Join me in the Sunday Grand Arena: Freshman Championship! Compete live against classmates nationwide tonight at 8:00 PM:',
      url: arenaUrl
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        this.copyArenaToClipboard(arenaUrl);
      });
    } else {
      this.copyArenaToClipboard(arenaUrl);
    }
  },

  copyArenaToClipboard(url) {
    const textToCopy = \`🏆 Sunday Grand Arena: Freshman Championship\\nJoin tonight's live synchronized competition at 8:00 PM (East Africa Time):\\n\${url}\`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('📋 Arena invite link copied to clipboard! Share it on Telegram or WhatsApp.', 'success');
        } else {
          alert('Arena invite link copied to clipboard!');
        }
      }).catch(() => {
        prompt('Copy this Sunday Arena link to share:', url);
      });
    } else {
      prompt('Copy this Sunday Arena link to share:', url);
    }
  },
`;

  arenaJs = arenaJs.replace(
    `  // ADMIN ACTION HANDLERS`,
    `${shareMethods}\n  // ADMIN ACTION HANDLERS`
  );
  console.log('✅ Added shareArenaLink & copyArenaToClipboard to arena.js');
}

fs.writeFileSync(arenaJsPath, arenaJs, 'utf8');
console.log('✅ public/js/arena.js updated successfully');

console.log('\n🎉 ALL DIRECT ARENA LINK UPDATES COMPLETE!');
