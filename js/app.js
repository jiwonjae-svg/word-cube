// app.js - Main entry point: routing, UI events, and page management

import { initAuth, login, register, loginWithGoogle, handleGoogleRedirect, logout, onAuthChange, getCurrentUser, updateProfile, checkEmailExists, sendPasswordReset, sendVerificationEmail, isEmailVerified, reloadCurrentUser, applyEmailVerificationCode, isAdmin, logActivity, startPresence, stopPresence, getOnlineUsers, postAnnouncement, getLatestAnnouncement, getActivityLogs } from './auth.js';
import { Game } from './game.js';
import { GameTimer } from './timer.js';
import { BackgroundCubes } from './cube.js';

// ===== State =====
let game = null;
let bgCubes = null;
let bgCubesRegister = null;
let bgCubesForgot = null;
let bgCubesVerify = null;
let selectedCubeSize = null;
let currentPage = 'login';
let gamePageInitialized = false;
let leaderboardMode = 'daily'; // 'daily' or 'alltime'
let verifyPollInterval = null;

// ===== DOM References =====
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Country Flag Helper =====
function countryFlag(code) {
  if (!code || typeof code !== 'string' || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) return sanitize(code || '');
  const lower = code.toLowerCase();
  return `<img src="https://flagcdn.com/16x12/${lower}.png" alt="${sanitize(code)}" style="vertical-align:middle;margin-right:2px;" onerror="this.style.display='none'">`;
}

// ===== Security: HTML Sanitization =====
function sanitize(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Avatar Processing (resize to max 200px, enforce 10MB limit) =====
function processAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Always resize for storage efficiency
      const img = new Image();
      img.onload = () => {
        const maxDim = 200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
          } else {
            width = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const result = canvas.toDataURL('image/jpeg', 0.8);
        if (file.size > MAX_FILE_SIZE) {
          showToast('Image was resized (original > 10MB)', 'info');
        }
        resolve(result);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function resetEmailVerification() {
  // No-op: email verification is now handled by Firebase
}

// Pages
const loginPage = $('login-page');
const registerPage = $('register-page');
const forgotPage = $('forgot-page');
const verifyPage = $('verify-page');
const gamePage = $('game-page');

// ===== Initialize =====
async function init() {
  // Init auth (and storage)
  await initAuth();

  // Handle email verification from URL params
  await handleEmailVerificationFromURL();

  // Handle Google OAuth redirect result
  const redirectResult = await handleGoogleRedirect();
  if (redirectResult && redirectResult.success) {
    if (redirectResult.isNewUser) {
      setTimeout(() => {
        const user = getCurrentUser();
        if (user) {
          localStorage.setItem(`wordcube_welcome_shown_${user.id}`, '1');
        }
        const userName = user ? user.name : 'Player';
        $('welcome-user-name').textContent = `Welcome, ${userName}!`;
        showModal('welcome-modal');
      }, 500);
    }
  } else if (redirectResult && redirectResult.error) {
    showToast(redirectResult.error, 'error');
  }

  // Listen for auth state changes
  onAuthChange(handleAuthChange);

  // Setup all event listeners
  setupAuthEvents();
  setupGameEvents();
  setupModalEvents();
  setupSettingsEvents();
  setupProfileEvents();
  setupAdminEvents();
  setupPrivacyEvents();

  // Generate size selector options
  generateSizeOptions();

  // Load settings into UI
  loadSettingsUI();
}

// Handle email verification from URL parameters
async function handleEmailVerificationFromURL() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');

  // Handle Firebase action URL redirect
  if (mode === 'verifyEmail' && oobCode) {
    const result = await applyEmailVerificationCode(oobCode);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    if (result.success) {
      showToast('Email verified successfully! Please log in.', 'success');
    } else {
      showToast(result.error || 'Verification failed. Please try again.', 'error');
    }
    return;
  }
}

// ===== Email Verification Polling =====
function startVerificationPolling() {
  stopVerificationPolling();
  verifyPollInterval = setInterval(async () => {
    const verified = await reloadCurrentUser();
    if (verified) {
      stopVerificationPolling();
      showToast('Email verified! Logging in...', 'success');
      const user = getCurrentUser();
      if (user) handleAuthChange(user);
    }
  }, 3000); // Check every 3 seconds
}

function stopVerificationPolling() {
  if (verifyPollInterval) {
    clearInterval(verifyPollInterval);
    verifyPollInterval = null;
  }
}

// ===== Auth State Handler =====
function handleAuthChange(user) {
  if (user) {
    // If email not verified (and not a Google user), redirect to verify page
    if (!isEmailVerified() && user.providerData?.[0]?.providerId !== 'google.com') {
      $('verify-email-address').textContent = user.email || '';
      showPage('verify');
      startVerificationPolling();
      return;
    }
    stopVerificationPolling();
    showPage('game');
    updateProfileDisplay(user);

    // Toggle admin UI
    const adminBtn = $('admin-btn');
    if (adminBtn) {
      if (isAdmin(user)) {
        adminBtn.classList.remove('hidden');
      } else {
        adminBtn.classList.add('hidden');
      }
    }

    // Start presence tracking
    startPresence();

    // Log login
    logActivity('login', { email: user.email });

    // Check for announcements
    loadAnnouncement();

    if (!gamePageInitialized) {
      gamePageInitialized = true;
      initGamePage().catch(err => console.error('[App] initGamePage error:', err));

      // Show welcome modal for first-time users (email-registered)
      const welcomeShownKey = `wordcube_welcome_shown_${user.id}`;
      if (!localStorage.getItem(welcomeShownKey)) {
        localStorage.setItem(welcomeShownKey, '1');
        setTimeout(() => {
          const userName = user.name || 'Player';
          $('welcome-user-name').textContent = `Welcome, ${userName}!`;
          showModal('welcome-modal');
        }, 600);
      }
    }
  } else {
    gamePageInitialized = false;
    if (game) { game.destroy(); game = null; }
    stopPresence();
    showPage('login');
    initLoginBackground();
  }
}

// ===== Page Navigation =====
function showPage(page) {
  currentPage = page;

  loginPage.classList.remove('active');
  registerPage.classList.remove('active');
  forgotPage.classList.remove('active');
  verifyPage.classList.remove('active');
  gamePage.classList.remove('active');

  switch (page) {
    case 'login':
      loginPage.classList.add('active');
      initLoginBackground();
      break;
    case 'register':
      registerPage.classList.add('active');
      initRegisterBackground();
      break;
    case 'forgot':
      forgotPage.classList.add('active');
      initForgotBackground();
      break;
    case 'verify':
      verifyPage.classList.add('active');
      initVerifyBackground();
      break;
    case 'game':
      gamePage.classList.add('active');
      destroyBackgrounds();
      break;
  }
}

// ===== Background Cubes =====
function initLoginBackground() {
  if (bgCubes) return;
  const canvas = $('bg-canvas-login');
  if (canvas) {
    bgCubes = new BackgroundCubes(canvas);
  }
}

function initRegisterBackground() {
  if (bgCubesRegister) return;
  const canvas = $('bg-canvas-register');
  if (canvas) {
    bgCubesRegister = new BackgroundCubes(canvas);
  }
}

function initForgotBackground() {
  if (bgCubesForgot) return;
  const canvas = $('bg-canvas-forgot');
  if (canvas) {
    bgCubesForgot = new BackgroundCubes(canvas);
  }
}

function initVerifyBackground() {
  if (bgCubesVerify) return;
  const canvas = $('bg-canvas-verify');
  if (canvas) {
    bgCubesVerify = new BackgroundCubes(canvas);
  }
}

function destroyBackgrounds() {
  if (bgCubes) { bgCubes.destroy(); bgCubes = null; }
  if (bgCubesRegister) { bgCubesRegister.destroy(); bgCubesRegister = null; }
  if (bgCubesForgot) { bgCubesForgot.destroy(); bgCubesForgot = null; }
  if (bgCubesVerify) { bgCubesVerify.destroy(); bgCubesVerify = null; }
}

// ===== Auth Events =====
function setupAuthEvents() {
  // Login form
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;

    if (!email || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    const btn = $('login-btn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    const result = await login(email, password);

    btn.disabled = false;
    btn.textContent = 'Login';

    if (!result.success) {
      showToast(result.error || 'Login failed', 'error');
    }
    // Note: welcome modal for first-time email users is handled in handleAuthChange
  });

  // Google auth
  $('google-auth-btn').addEventListener('click', async () => {
    const btn = $('google-auth-btn');
    btn.disabled = true;
    btn.textContent = 'Connecting...';

    const result = await loginWithGoogle();

    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google`;

    if (result.redirect) {
      // Redirect in progress, page will reload
      return;
    }

    if (!result.success) {
      showToast(result.error || 'Google sign-in failed', 'error');
    } else if (result.isNewUser) {
      // Show welcome modal for first-time Google users
      // Mark as shown so handleAuthChange doesn't show it again
      setTimeout(() => {
        const user = getCurrentUser();
        if (user) {
          localStorage.setItem(`wordcube_welcome_shown_${user.id}`, '1');
        }
        const userName = user ? user.name : 'Player';
        $('welcome-user-name').textContent = `Welcome, ${userName}!`;
        showModal('welcome-modal');
      }, 500);
    }
  });

  // Go to register
  $('goto-register-btn').addEventListener('click', () => {
    showPage('register');
  });

  // Go to forgot password
  $('goto-forgot-btn').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('forgot');
  });

  // Forgot password form
  $('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('forgot-email').value.trim();
    if (!email) {
      showToast('Please enter your email', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Invalid email format', 'error');
      return;
    }

    const btn = $('forgot-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const result = await sendPasswordReset(email);

    btn.disabled = false;
    btn.textContent = 'Send Email';

    if (result.success) {
      showToast('Password reset email sent! Check your inbox.', 'success');
      $('forgot-email').value = '';
    } else {
      showToast(result.error || 'Failed to send reset email', 'error');
    }
  });

  // Cancel forgot password
  $('cancel-forgot-btn').addEventListener('click', () => {
    $('forgot-email').value = '';
    showPage('login');
  });

  // Register form
  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('reg-email').value.trim();
    const password = $('reg-password').value;
    const confirm = $('reg-password-confirm').value;
    const name = $('reg-name').value.trim();
    const privacyAgreed = $('reg-privacy-agree').checked;

    if (!email || !password || !confirm || !name) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    if (!privacyAgreed) {
      showToast('Please agree to the Privacy Policy.', 'error');
      return;
    }

    if (name.length > 30) {
      showToast('Name must be 30 characters or less', 'error');
      return;
    }

    if (password !== confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    if (password.length > 128) {
      showToast('Password must be 128 characters or less', 'error');
      return;
    }

    const btn = $('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    const result = await register(email, password, name);

    btn.disabled = false;
    btn.textContent = 'Complete';

    if (!result.success) {
      showToast(result.error || 'Registration failed', 'error');
    } else {
      // Send verification email - handleAuthChange will redirect to verify page
      // since the user's email is not yet verified
      const verifyResult = await sendVerificationEmail();
      if (!verifyResult.success) {
        showToast('Could not send verification email. You can resend it later.', 'info');
      }
    }
  });

  // Cancel register
  $('cancel-register-btn').addEventListener('click', () => {
    resetEmailVerification();
    showPage('login');
  });

  // Logout
  $('logout-btn').addEventListener('click', async () => {
    if (game) {
      game.destroy();
      game = null;
    }
    await logout();
    showPage('login');
  });
}

// ===== Game Events =====
function setupGameEvents() {
  $('start-game-btn').addEventListener('click', startNewGame);

  $('scramble-btn').addEventListener('click', async () => {
    $('scramble-overlay').classList.add('hidden');
    await game.beginScramble();
    $('new-game-btn').style.display = '';
    $('mobile-new-game-btn').style.display = '';
    updateLeaderboard(selectedCubeSize);
    $('leaderboard-size').innerHTML = `Cube: ${selectedCubeSize}&times;${selectedCubeSize}`;
    if ($('mobile-leaderboard-size')) {
      $('mobile-leaderboard-size').innerHTML = `Cube: ${selectedCubeSize}&times;${selectedCubeSize}`;
    }
  });

  $('play-again-btn').addEventListener('click', () => {
    $('game-complete').classList.add('hidden');
    $('size-selector').classList.remove('hidden');
    $('new-game-btn').style.display = 'none';
    $('mobile-new-game-btn').style.display = 'none';
    selectedCubeSize = null;
    updateSizeSelection();
  });

  // Undo / Redo buttons (desktop + mobile)
  const undoAction = () => { if (game) game.undo(); };
  const redoAction = () => { if (game) game.redo(); };
  $('undo-btn').addEventListener('click', undoAction);
  $('redo-btn').addEventListener('click', redoAction);
  $('mobile-undo-btn').addEventListener('click', undoAction);
  $('mobile-redo-btn').addEventListener('click', redoAction);

  // New Game button (desktop + mobile)
  const newGameAction = () => { showModal('newgame-modal'); };
  $('new-game-btn').addEventListener('click', newGameAction);
  $('mobile-new-game-btn').addEventListener('click', newGameAction);

  $('newgame-confirm-btn').addEventListener('click', () => {
    closeAllModals();
    if (game) { game.destroy(); game = null; }
    $('new-game-btn').style.display = 'none';
    $('mobile-new-game-btn').style.display = 'none';
    $('undo-btn').disabled = true;
    $('redo-btn').disabled = true;
    $('mobile-undo-btn').disabled = true;
    $('mobile-redo-btn').disabled = true;
    $('size-selector').classList.remove('hidden');
    $('game-complete').classList.add('hidden');
    selectedCubeSize = null;
    updateSizeSelection();
  });
  $('newgame-cancel-btn').addEventListener('click', () => {
    closeAllModals();
  });

  // Mobile panel modals (Words / Ranking)
  $('mobile-words-btn').addEventListener('click', () => {
    // Sync word list content to mobile modal
    const src = $('word-list');
    const dst = $('mobile-word-list');
    dst.innerHTML = src.innerHTML;
    $('mobile-words-modal').classList.remove('hidden');
  });
  $('mobile-ranking-btn').addEventListener('click', () => {
    syncMobileLeaderboard();
    $('mobile-ranking-modal').classList.remove('hidden');
  });

  // Close mobile modals on overlay click or close button
  $$('.mobile-panel-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      overlay.closest('.mobile-panel-modal').classList.add('hidden');
    });
  });
  $$('.mobile-panel-modal .modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.mobile-panel-modal').classList.add('hidden');
    });
  });

  // Ranking tab switching (desktop)
  const setupRankingTabs = (dailyId, alltimeId, isMobile) => {
    const dailyBtn = $(dailyId);
    const alltimeBtn = $(alltimeId);
    if (!dailyBtn || !alltimeBtn) return;

    dailyBtn.addEventListener('click', () => {
      leaderboardMode = 'daily';
      dailyBtn.classList.add('active');
      alltimeBtn.classList.remove('active');
      updateLeaderboard(selectedCubeSize || 3);
      if (isMobile) syncMobileLeaderboard();
    });
    alltimeBtn.addEventListener('click', () => {
      leaderboardMode = 'alltime';
      alltimeBtn.classList.add('active');
      dailyBtn.classList.remove('active');
      updateLeaderboard(selectedCubeSize || 3);
      if (isMobile) syncMobileLeaderboard();
    });
  };

  setupRankingTabs('ranking-tab-daily', 'ranking-tab-alltime', false);
  setupRankingTabs('mobile-ranking-tab-daily', 'mobile-ranking-tab-alltime', true);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!game) return;
    // Undo: Ctrl+Z (not Shift)
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      game.undo();
    }
    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
      e.preventDefault();
      game.redo();
    }
  });
}

function generateSizeOptions() {
  const grid = $('size-grid');
  grid.innerHTML = '';

  for (let n = 3; n <= 10; n++) {
    const btn = document.createElement('button');
    btn.className = 'size-option';
    btn.textContent = `${n}×${n}`;
    btn.dataset.size = n;

    btn.addEventListener('click', () => {
      selectedCubeSize = n;
      updateSizeSelection();
      $('start-game-btn').disabled = false;
    });

    grid.appendChild(btn);
  }
}

function updateSizeSelection() {
  $$('.size-option').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.size) === selectedCubeSize);
  });
}

async function startNewGame() {
  if (!selectedCubeSize) return;

  if (game) { game.destroy(); game = null; }
  $('size-selector').classList.add('hidden');

  // Initialize game
  game = new Game();
  game.init(
    $('cube-container'),
    $('word-list'),
    $('timer-display')
  );

  game.onGameComplete = (elapsed, valid) => {
    $('complete-time').textContent = GameTimer.formatTime(elapsed);
    $('game-complete').classList.remove('hidden');

    if (!valid) {
      showToast('Time validation failed - score not recorded', 'error');
    } else {
      showToast('Puzzle complete! Score saved.', 'success');
    }

    // Refresh leaderboard
    updateLeaderboard(selectedCubeSize);
  };

  game.onMoveHistoryChange = (undoCount, redoCount) => {
    $('undo-btn').disabled = undoCount === 0;
    $('redo-btn').disabled = redoCount === 0;
    $('mobile-undo-btn').disabled = undoCount === 0;
    $('mobile-redo-btn').disabled = redoCount === 0;
  };

  // Show solved cube first
  await game.startGame(selectedCubeSize);

  // Show scramble overlay so user can review solved state
  $('scramble-overlay').classList.remove('hidden');

  // Update leaderboard
  updateLeaderboard(selectedCubeSize);
  $('leaderboard-size').innerHTML = `Cube: ${selectedCubeSize}&times;${selectedCubeSize}`;
}

async function initGamePage() {
  // Try to restore a previous session
  const tempGame = new Game();
  tempGame.init(
    $('cube-container'),
    $('word-list'),
    $('timer-display')
  );

  tempGame.onGameComplete = (elapsed, valid) => {
    $('complete-time').textContent = GameTimer.formatTime(elapsed);
    $('game-complete').classList.remove('hidden');
    if (!valid) {
      showToast('Time validation failed - score not recorded', 'error');
    } else {
      showToast('Puzzle complete! Score saved.', 'success');
    }
    updateLeaderboard(tempGame.cubeSize);
  };

  tempGame.onMoveHistoryChange = (undoCount, redoCount) => {
    $('undo-btn').disabled = undoCount === 0;
    $('redo-btn').disabled = redoCount === 0;
    $('mobile-undo-btn').disabled = undoCount === 0;
    $('mobile-redo-btn').disabled = redoCount === 0;
  };

  const restored = await tempGame.tryRestore();

  if (restored) {
    game = tempGame;
    selectedCubeSize = game.cubeSize;
    $('size-selector').classList.add('hidden');
    $('new-game-btn').style.display = '';
    $('mobile-new-game-btn').style.display = '';
    $('leaderboard-size').innerHTML = `Cube: ${selectedCubeSize}&times;${selectedCubeSize}`;
    updateLeaderboard(selectedCubeSize);
    showToast('Previous game session restored', 'info');
  } else {
    tempGame.destroy();
    // Show size selector
    $('size-selector').classList.remove('hidden');
    $('game-complete').classList.add('hidden');
  }

  // Load default leaderboard
  updateLeaderboard(3);
}

// ===== Leaderboard =====
async function updateLeaderboard(cubeSize) {
  const list = $('leaderboard-list');
  list.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:13px;">Loading...</div>';

  const scores = await Game.getLeaderboard(cubeSize, 10, leaderboardMode);

  list.innerHTML = '';

  if (scores.length === 0) {
    const msg = leaderboardMode === 'daily' ? 'No scores today. Be the first!' : 'No scores yet. Be the first!';
    list.innerHTML = `<div style="padding:12px;color:#94a3b8;font-size:13px;">${msg}</div>`;
    return;
  }

  scores.forEach((score, idx) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';

    const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';

    item.innerHTML = `
      <span class="leaderboard-rank ${rankClass}">${idx + 1}</span>
      <span class="leaderboard-name">${countryFlag(score.userCountry)} ${sanitize(score.userName || 'Anonymous')}</span>
      <span class="leaderboard-time">${GameTimer.formatTime(score.time)}</span>
    `;
    list.appendChild(item);
  });
}

function syncMobileLeaderboard() {
  const src = $('leaderboard-list');
  const dst = $('mobile-leaderboard-list');
  dst.innerHTML = src.innerHTML;
  if ($('mobile-leaderboard-size')) {
    $('mobile-leaderboard-size').innerHTML = $('leaderboard-size').innerHTML;
  }
  // Sync tab active state
  const mobileDailyTab = $('mobile-ranking-tab-daily');
  const mobileAlltimeTab = $('mobile-ranking-tab-alltime');
  if (mobileDailyTab && mobileAlltimeTab) {
    mobileDailyTab.classList.toggle('active', leaderboardMode === 'daily');
    mobileAlltimeTab.classList.toggle('active', leaderboardMode === 'alltime');
  }
}

// ===== Profile =====
function updateProfileDisplay(user) {
  if (!user) return;
  const display = $('user-profile-display');
  if (display) {
    const flag = countryFlag(user.country);
    const avatarImg = user.avatar
      ? `<img src="${user.avatar}" alt="" class="profile-avatar-mini" onerror="this.src='assets/empty_profile_img.png'">`
      : `<img src="assets/empty_profile_img.png" alt="" class="profile-avatar-mini">`;
    display.innerHTML = `${flag} ${avatarImg}${sanitize(user.name || 'Player')} #${sanitize(user.code || '00000000')}`;
  }
}

function setupProfileEvents() {
  const profileBtn = $('profile-btn');
  const profileMenu = $('profile-menu');

  // Toggle profile dropdown
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = profileBtn.getBoundingClientRect();
    profileMenu.style.left = rect.left + 'px';
    profileMenu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    profileMenu.classList.toggle('hidden');
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    profileMenu.classList.add('hidden');
  });

  // Edit profile
  $('profile-edit-btn').addEventListener('click', () => {
    profileMenu.classList.add('hidden');
    openProfileEditModal();
  });

  // Play history
  $('profile-history-btn').addEventListener('click', () => {
    profileMenu.classList.add('hidden');
    openHistoryModal();
  });

  // Avatar upload
  $('avatar-upload-btn').addEventListener('click', () => {
    $('avatar-upload').click();
  });

  $('avatar-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const resizedDataUrl = await processAvatarFile(file);
      const preview = $('avatar-preview');
      preview.innerHTML = `<img src="${resizedDataUrl}" alt="Avatar">`;
      preview.dataset.imageData = resizedDataUrl;
    } catch (err) {
      showToast('Failed to process image', 'error');
    }
  });

  // Save profile
  $('save-profile-btn').addEventListener('click', async () => {
    const name = $('edit-name').value.trim();
    const avatar = $('avatar-preview').dataset?.imageData || null;

    if (!name) {
      showToast('Name cannot be empty', 'error');
      return;
    }

    const updates = { name };
    if (avatar) updates.avatar = avatar;

    const result = await updateProfile(updates);
    if (result.success) {
      showToast('Profile updated!', 'success');
      updateProfileDisplay(result.user);
      logActivity('profile_update', { name });
      closeAllModals();
    } else {
      showToast('Failed to update profile', 'error');
    }
  });
}

function openProfileEditModal() {
  const user = getCurrentUser();
  if (!user) return;

  $('edit-name').value = user.name || '';

  // Show country as read-only (auto-detected from IP)
  const countryDisplay = $('edit-country-display');
  if (countryDisplay) {
    const code = user.country || 'US';
    countryDisplay.innerHTML = `${countryFlag(code)} ${sanitize(code)}`;
  }

  const preview = $('avatar-preview');
  if (user.avatar) {
    preview.innerHTML = `<img src="${user.avatar}" alt="Avatar">`;
  } else {
    preview.innerHTML = user.name ? user.name[0].toUpperCase() : '?';
  }

  showModal('profile-edit-modal');
}

async function openHistoryModal() {
  const user = getCurrentUser();
  if (!user) return;

  showModal('history-modal');
  const list = $('history-list');
  list.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Loading...</td></tr>';

  const history = await Game.getPlayHistory(user.id, 50);

  list.innerHTML = '';

  if (history.length === 0) {
    list.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">No games played yet</td></tr>';
    return;
  }

  for (const entry of history) {
    const tr = document.createElement('tr');
    const date = new Date(entry.date).toLocaleDateString();
    tr.innerHTML = `
      <td>${date}</td>
      <td>${entry.cubeSize}×${entry.cubeSize}</td>
      <td>${GameTimer.formatTime(entry.time)}</td>
      <td style="font-family:monospace;font-size:12px;">${entry.seed || '-'}</td>
    `;
    list.appendChild(tr);
  }
}

// ===== Settings =====
function setupSettingsEvents() {
  $('settings-btn').addEventListener('click', () => {
    loadSettingsUI();
    showModal('settings-modal');
  });

  // Sensitivity slider
  $('setting-sensitivity').addEventListener('input', (e) => {
    $('sensitivity-value').textContent = e.target.value;
    saveCurrentSettings();
  });

  // Invert rotation
  $('setting-invert').addEventListener('change', () => saveCurrentSettings());

  // Click feedback
  $('setting-feedback').addEventListener('change', () => saveCurrentSettings());
}

function loadSettingsUI() {
  const s = Game.loadSettings();
  $('setting-sensitivity').value = s.sensitivity;
  $('sensitivity-value').textContent = s.sensitivity;
  $('setting-invert').checked = s.invertRotation;
  $('setting-feedback').checked = s.clickFeedback;
}

function saveCurrentSettings() {
  const settings = {
    sensitivity: parseInt($('setting-sensitivity').value),
    invertRotation: $('setting-invert').checked,
    clickFeedback: $('setting-feedback').checked
  };
  Game.saveSettings(settings);

  // Apply to active game
  if (game && game.cube) {
    game.cube.setSettings(settings.sensitivity, settings.invertRotation, settings.clickFeedback);
  }
}

// ===== Modal Management =====
function setupModalEvents() {
  // Close buttons
  $$('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) modal.classList.add('hidden');
    });
  });

  // Overlay clicks
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      const modal = overlay.closest('.modal');
      if (modal) modal.classList.add('hidden');
    });
  });

  // Help button
  $('help-btn').addEventListener('click', () => {
    showModal('help-modal');
  });

  // Welcome modal start button
  $('welcome-start-btn').addEventListener('click', () => {
    closeAllModals();
  });

  // Verify email page - "Resend Email" button
  $('verify-email-resend-btn').addEventListener('click', async () => {
    const btn = $('verify-email-resend-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const result = await sendVerificationEmail();

    btn.disabled = false;
    btn.textContent = 'Resend Email';

    if (result.success) {
      showToast('Verification email resent! Check your inbox.', 'success');
    } else {
      showToast(result.error || 'Failed to resend email', 'error');
    }
  });

  // Verify email page - "Back to Login" button
  $('verify-back-login-btn').addEventListener('click', async () => {
    stopVerificationPolling();
    await logout();
    showPage('login');
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });
}

function showModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove('hidden');
}

function closeAllModals() {
  $$('.modal').forEach(m => m.classList.add('hidden'));
  $$('.mobile-panel-modal').forEach(m => m.classList.add('hidden'));
  $('profile-menu').classList.add('hidden');
}

// ===== Admin Events =====
function setupAdminEvents() {
  // Admin panel button
  const adminBtn = $('admin-btn');
  if (adminBtn) {
    adminBtn.addEventListener('click', () => {
      showModal('admin-modal');
    });
  }

  // Force clear puzzle
  $('admin-force-clear-btn').addEventListener('click', () => {
    closeAllModals();
    if (game && game.state === 'playing') {
      game.forceComplete();
      logActivity('admin_force_clear', { cubeSize: game.cubeSize });
      showToast('Puzzle force-cleared (admin)', 'info');
    } else {
      showToast('No active game to clear', 'error');
    }
  });

  // View logs
  $('admin-logs-btn').addEventListener('click', async () => {
    closeAllModals();
    showModal('admin-logs-modal');
    const listEl = $('admin-logs-list');
    listEl.innerHTML = '<p style="color:var(--text-light);font-size:13px;">Loading...</p>';

    const logs = await getActivityLogs(100);
    listEl.innerHTML = '';

    if (logs.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-light);font-size:13px;">No logs found.</p>';
      return;
    }

    for (const log of logs) {
      const item = document.createElement('div');
      item.className = 'log-item';
      const date = new Date(log.timestamp || log.date).toLocaleString();
      let details = '';
      try { details = log.details ? JSON.parse(log.details) : {}; } catch { details = log.details; }
      const detailStr = typeof details === 'object' ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ') : String(details);
      item.innerHTML = `
        <span class="log-time">${sanitize(date)}</span>
        <span class="log-action">${sanitize(log.action)}</span>
        <span class="log-user">${sanitize(log.userName)}</span>
        <span class="log-details">${sanitize(detailStr)}</span>
      `;
      listEl.appendChild(item);
    }
  });

  // Online users
  $('admin-online-btn').addEventListener('click', async () => {
    closeAllModals();
    showModal('admin-online-modal');
    const listEl = $('admin-online-list');
    const countEl = $('admin-online-count');
    listEl.innerHTML = '<p style="color:var(--text-light);font-size:13px;">Loading...</p>';

    const users = await getOnlineUsers();
    countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''} online`;
    listEl.innerHTML = '';

    if (users.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-light);font-size:13px;">No users online.</p>';
      return;
    }

    for (const u of users) {
      const item = document.createElement('div');
      item.className = 'online-user-item';
      const ago = Math.round((Date.now() - u.lastActive) / 1000);
      const agoStr = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
      item.innerHTML = `
        <span class="online-dot"></span>
        <span>${sanitize(u.userName)}</span>
        <span style="color:var(--text-light);font-size:12px;margin-left:auto;">${agoStr}</span>
      `;
      listEl.appendChild(item);
    }
  });

  // Post announcement
  $('admin-announce-btn').addEventListener('click', () => {
    closeAllModals();
    $('announce-title').value = '';
    $('announce-content').value = '';
    showModal('admin-announce-modal');
  });

  $('announce-submit-btn').addEventListener('click', async () => {
    const title = $('announce-title').value.trim();
    const content = $('announce-content').value.trim();

    if (!title || !content) {
      showToast('Please fill in title and content', 'error');
      return;
    }

    const btn = $('announce-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Posting...';

    const result = await postAnnouncement(title, content);

    btn.disabled = false;
    btn.textContent = 'Post Announcement';

    if (result.success) {
      showToast('Announcement posted!', 'success');
      logActivity('admin_announcement', { title });
      closeAllModals();
      loadAnnouncement();
    } else {
      showToast(result.error || 'Failed to post', 'error');
    }
  });
}

// ===== Privacy Policy Events =====
function setupPrivacyEvents() {
  // Register page privacy link
  const privacyLink = $('privacy-policy-link');
  if (privacyLink) {
    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      showModal('privacy-modal');
    });
  }

  // Footer privacy link
  const footerPrivacy = $('footer-privacy-link');
  if (footerPrivacy) {
    footerPrivacy.addEventListener('click', (e) => {
      e.preventDefault();
      showModal('privacy-modal');
    });
  }
}

// ===== Announcement Banner =====
async function loadAnnouncement() {
  const ann = await getLatestAnnouncement();
  const banner = $('announcement-banner');
  if (!banner) return;

  if (ann) {
    // Check if user already dismissed this announcement
    const dismissedKey = `wordcube_dismissed_ann_${ann.id}`;
    if (localStorage.getItem(dismissedKey)) {
      banner.classList.add('hidden');
      return;
    }

    $('announcement-title').textContent = ann.title || '';
    $('announcement-content').textContent = ` — ${ann.content || ''}`;
    banner.classList.remove('hidden');

    // Close button
    $('announcement-close-btn').onclick = () => {
      banner.classList.add('hidden');
      localStorage.setItem(dismissedKey, '1');
    };
  } else {
    banner.classList.add('hidden');
  }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(60px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== Start App =====
init().catch(err => {
  console.error('[App] Initialization failed:', err);
});
