const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
let content = fs.readFileSync(appJsPath, 'utf8');

// 1. Patch init()
content = content.replace(
  /async init\(\) \{[\s\S]*?this\.showView\('home'\);\s*\},/,
  `async init() {
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
  },`
);

// 2. Patch showView(viewName) start
content = content.replace(
  /showView\(viewName\) \{\s*this\.state\.currentView = viewName;\s*\/\/ Hide all sections/,
  `showView(viewName) {
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

    // Hide all sections`
);

// 3. Patch handleRegister(e) for post-auth arena redirect
content = content.replace(
  /this\.state\.user = res\.user;\s*this\.state\.justRegistered = true;\s*this\.renderNavUserArea\(\);\s*this\.showView\('suspended'\);\s*this\.showToast\(`Welcome, \$\{res\.user\.fullName\}! Choose a semester package or start your 3-day free trial\.`, 'success'\);/,
  `this.state.user = res.user;
      this.renderNavUserArea();

      const redirect = this.state.redirectAfterAuth || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cln_post_auth_redirect'));
      if (redirect === 'arena') {
        this.state.redirectAfterAuth = null;
        try { sessionStorage.removeItem('cln_post_auth_redirect'); } catch(e){}
        this.state.justRegistered = true;
        this.showView('arena');
        this.showToast(\`Welcome, \${res.user.fullName}! Your free 3-day trial is active and you are checked into tonight's Sunday Grand Arena! 🏆\`, 'success');
        return;
      }

      this.state.justRegistered = true;
      this.showView('suspended');
      this.showToast(\`Welcome, \${res.user.fullName}! Choose a semester package or start your 3-day free trial.\`, 'success');`
);

// 4. Patch handleLogin(e) for post-auth arena redirect
content = content.replace(
  /if \(res\.user\.email === 'admin@cln\.edu\.et'\) \{\s*this\.showView\('admin'\);\s*\} else \{\s*this\.showView\('dashboard'\);\s*\}/,
  `const redirect = this.state.redirectAfterAuth || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cln_post_auth_redirect'));
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
      }`
);

fs.writeFileSync(appJsPath, content, 'utf8');
console.log('✅ app.js successfully patched!');
