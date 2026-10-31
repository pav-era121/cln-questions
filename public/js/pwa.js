// public/js/pwa.js — Progressive Web App (PWA) Controller for CLN Questions
const pwa = {
  deferredPrompt: null,
  isInstalled: false,

  init() {
    this.checkStandalone();
    this.registerServiceWorker();
    this.setupInstallListeners();
  },

  checkStandalone() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

    if (isStandalone) {
      this.isInstalled = true;
      document.body.classList.add('pwa-standalone');
      console.log('📱 Running in standalone installed PWA mode.');
      this.hideAllInstallUI();
    }
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((reg) => {
            console.log('✅ PWA Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('⚠️ Service Worker registration failed:', err.message);
          });
      });
    }
  },

  setupInstallListeners() {
    // 1. Capture browser's native install prompt (Chrome / Android / Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('💡 Native PWA install prompt captured.');

      if (!this.isInstalled) {
        this.showInstallButtons();
        this.scheduleInstallBanner();
      }
    });

    // 2. Track when app has been installed
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.hideAllInstallUI();
      console.log('🎉 CLN Questions was successfully installed on device!');

      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('🎉 CLN Questions is now installed on your home screen!', 'success');
      }
    });

    // Show install buttons on iOS / other browsers as manual guide
    if (!this.isInstalled) {
      this.showInstallButtons();
      this.scheduleInstallBanner();
    }
  },

  showInstallButtons() {
    if (this.isInstalled) return;
    const navBtn = document.getElementById('nav-btn-install');
    if (navBtn) {
      navBtn.style.display = 'inline-flex';
    }
  },

  hideAllInstallUI() {
    const navBtn = document.getElementById('nav-btn-install');
    if (navBtn) navBtn.style.display = 'none';

    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
  },

  scheduleInstallBanner() {
    if (this.isInstalled) return;

    // Do not show banner if user dismissed it in the last 24 hours
    const dismissedAt = localStorage.getItem('cln_pwa_banner_dismissed');
    if (dismissedAt && (Date.now() - parseInt(dismissedAt, 10)) < 24 * 60 * 60 * 1000) {
      return;
    }

    setTimeout(() => {
      if (!this.isInstalled) {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) {
          banner.style.display = 'flex';
          banner.classList.add('visible');
        }
      }
    }, 2500);
  },

  dismissBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.style.display = 'none';
    }
    localStorage.setItem('cln_pwa_banner_dismissed', Date.now().toString());
  },

  async promptInstall() {
    // 1. If native beforeinstallprompt is ready (Android / Chrome / Edge)
    if (this.deferredPrompt) {
      this.dismissBanner();
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      console.log('User choice on PWA install:', choiceResult.outcome);

      if (choiceResult.outcome === 'accepted') {
        this.isInstalled = true;
        this.hideAllInstallUI();
      }
      this.deferredPrompt = null;
      return;
    }

    // 2. Otherwise detect platform and show step-by-step installation instructions
    this.showInstallationGuide();
  },

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  showInstallationGuide() {
    const modal = document.getElementById('pwa-guide-modal');
    const content = document.getElementById('pwa-guide-modal-content');
    if (!modal || !content) return;

    const isApple = this.isIOS();

    if (isApple) {
      content.innerHTML = `
        <div style="text-align:center; margin-bottom:16px;">
          <div style="font-size:2.8rem; margin-bottom:8px;">🍏 📲</div>
          <h3 style="font-size:1.3rem; font-weight:800; color:var(--navy); margin:0 0 6px;">Install on iPhone / iPad</h3>
          <p style="font-size:0.9rem; color:var(--text-muted); margin:0;">Follow these 3 quick steps in Safari to add the app to your Home Screen:</p>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
          <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
            <span style="background:#2563eb; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">1</span>
            <div style="font-size:0.92rem; color:var(--navy); line-height:1.4;">
              Tap the <strong>Share</strong> icon <span style="font-size:1.15rem; color:#2563eb;">⎋</span> (the square with an arrow pointing up at the bottom of Safari).
            </div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
            <span style="background:#2563eb; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">2</span>
            <div style="font-size:0.92rem; color:var(--navy); line-height:1.4;">
              Scroll down and tap <strong>"Add to Home Screen"</strong> <span style="font-size:1.15rem;">➕</span>.
            </div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:12px;">
            <span style="background:#2563eb; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">3</span>
            <div style="font-size:0.92rem; color:var(--navy); line-height:1.4;">
              Tap <strong>"Add"</strong> in the top-right corner. The CLN Questions app will appear on your Home Screen!
            </div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="pwa.closeGuideModal()" style="width:100%; padding:12px; font-weight:700;">
          Got it!
        </button>
      `;
    } else {
      content.innerHTML = `
        <div style="text-align:center; margin-bottom:16px;">
          <div style="font-size:2.8rem; margin-bottom:8px;">🤖 📲</div>
          <h3 style="font-size:1.3rem; font-weight:800; color:var(--navy); margin:0 0 6px;">Install on Android / Chrome</h3>
          <p style="font-size:0.9rem; color:var(--text-muted); margin:0;">Add CLN Questions to your phone's home screen in 2 quick steps:</p>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
          <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
            <span style="background:#2563eb; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">1</span>
            <div style="font-size:0.92rem; color:var(--navy); line-height:1.4;">
              Tap the <strong>three dots menu (⋮)</strong> in the top-right corner of Chrome or your browser.
            </div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
            <span style="background:#2563eb; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">2</span>
            <div style="font-size:0.92rem; color:var(--navy); line-height:1.4;">
              Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
            </div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:12px;">
            <span style="background:#2563eb; color:#fff; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem; flex-shrink:0;">3</span>
            <div style="font-size:0.92rem; color:var(--navy); line-height:1.4;">
              Tap <strong>Install</strong> to confirm. The app will open in fullscreen mode without any browser search bars!
            </div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="pwa.closeGuideModal()" style="width:100%; padding:12px; font-weight:700;">
          Got it!
        </button>
      `;
    }

    modal.style.display = 'flex';
  },

  closeGuideModal(e) {
    if (e && e.target && e.target.id !== 'pwa-guide-modal' && !e.target.classList.contains('pwa-modal-overlay')) {
      return;
    }
    const modal = document.getElementById('pwa-guide-modal');
    if (modal) modal.style.display = 'none';
  }
};

// Auto-initialize PWA controller on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => pwa.init());
} else {
  pwa.init();
}
