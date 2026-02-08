// app.js - Main entry point: routing, UI events, and page management

import { initAuth, login, register, loginWithGoogle, logout, onAuthChange, getCurrentUser, updateProfile } from './auth.js';
import { Game } from './game.js';
import { GameTimer } from './timer.js';
import { BackgroundCubes } from './cube.js';

// ===== State =====
let game = null;
let bgCubes = null;
let bgCubesRegister = null;
let selectedCubeSize = null;
let currentPage = 'login';
let gamePageInitialized = false;

// ===== DOM References =====
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// Pages
const loginPage = $('login-page');
const registerPage = $('register-page');
const gamePage = $('game-page');

// ===== Initialize =====
async function init() {
  // Init auth (and storage)
  await initAuth();

  // Listen for auth state changes
  onAuthChange(handleAuthChange);

  // Setup all event listeners
  setupAuthEvents();
  setupGameEvents();
  setupModalEvents();
  setupSettingsEvents();
  setupProfileEvents();

  // Generate size selector options
  generateSizeOptions();

  // Load settings into UI
  loadSettingsUI();
}

// ===== Auth State Handler =====
function handleAuthChange(user) {
  if (user) {
    showPage('game');
    updateProfileDisplay(user);
    if (!gamePageInitialized) {
      gamePageInitialized = true;
      initGamePage().catch(err => console.error('[App] initGamePage error:', err));
    }
  } else {
    gamePageInitialized = false;
    if (game) { game.destroy(); game = null; }
    showPage('login');
    initLoginBackground();
  }
}

// ===== Page Navigation =====
function showPage(page) {
  currentPage = page;

  loginPage.classList.remove('active');
  registerPage.classList.remove('active');
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

function destroyBackgrounds() {
  if (bgCubes) { bgCubes.destroy(); bgCubes = null; }
  if (bgCubesRegister) { bgCubesRegister.destroy(); bgCubesRegister = null; }
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
  });

  // Google auth
  $('google-auth-btn').addEventListener('click', async () => {
    const result = await loginWithGoogle();
    if (!result.success) {
      showToast(result.error || 'Google sign-in failed', 'error');
    }
  });

  // Go to register
  $('goto-register-btn').addEventListener('click', () => {
    showPage('register');
  });

  // Register form
  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('reg-email').value.trim();
    const password = $('reg-password').value;
    const confirm = $('reg-password-confirm').value;
    const name = $('reg-name').value.trim();

    if (!email || !password || !confirm || !name) {
      showToast('Please fill in all fields', 'error');
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

    const btn = $('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    const result = await register(email, password, name);

    btn.disabled = false;
    btn.textContent = 'Complete';

    if (!result.success) {
      showToast(result.error || 'Registration failed', 'error');
    } else {
      showToast('Account created successfully!', 'success');
    }
  });

  // Cancel register
  $('cancel-register-btn').addEventListener('click', () => {
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

  $('play-again-btn').addEventListener('click', () => {
    $('game-complete').classList.add('hidden');
    $('size-selector').classList.remove('hidden');
    selectedCubeSize = null;
    updateSizeSelection();
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

  await game.startGame(selectedCubeSize);

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

  const restored = await tempGame.tryRestore();

  if (restored) {
    game = tempGame;
    selectedCubeSize = game.cubeSize;
    $('size-selector').classList.add('hidden');
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

  const scores = await Game.getLeaderboard(cubeSize, 10);

  list.innerHTML = '';

  if (scores.length === 0) {
    list.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:13px;">No scores yet. Be the first!</div>';
    return;
  }

  scores.forEach((score, idx) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';

    const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';

    item.innerHTML = `
      <span class="leaderboard-rank ${rankClass}">${idx + 1}</span>
      <span class="leaderboard-name">${score.userCountry || '🌐'} ${score.userName || 'Anonymous'}</span>
      <span class="leaderboard-time">${GameTimer.formatTime(score.time)}</span>
    `;
    list.appendChild(item);
  });
}

// ===== Profile =====
function updateProfileDisplay(user) {
  if (!user) return;
  const display = $('user-profile-display');
  if (display) {
    display.textContent = `${user.country || '🌐'} ${user.name || 'Player'} #${user.code || '00000000'}`;
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

  $('avatar-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const preview = $('avatar-preview');
      preview.innerHTML = `<img src="${ev.target.result}" alt="Avatar">`;
      preview.dataset.imageData = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Save profile
  $('save-profile-btn').addEventListener('click', async () => {
    const name = $('edit-name').value.trim();
    const country = $('edit-country').value;
    const avatar = $('avatar-preview').dataset?.imageData || null;

    if (!name) {
      showToast('Name cannot be empty', 'error');
      return;
    }

    const updates = { name, country };
    if (avatar) updates.avatar = avatar;

    const result = await updateProfile(updates);
    if (result.success) {
      showToast('Profile updated!', 'success');
      updateProfileDisplay(result.user);
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
  $('edit-country').value = user.country || '🇺🇸';

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
  $('profile-menu').classList.add('hidden');
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
