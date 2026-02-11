// game.js - Game orchestration: puzzle generation, word checking, scoring, session persistence

import { WordCube } from './cube.js';
import { GameTimer } from './timer.js';
import { generatePuzzle, findWordsOnFaces } from './words.js';
import { setDoc, getDoc, queryCollection, generateId, getServerTime } from './firebase-config.js';
import { getCurrentUser } from './auth.js';

const SESSION_KEY = 'wordcube_game_session';

export class Game {
  constructor() {
    this.cube = null;
    this.timer = new GameTimer();
    this.cubeSize = 3;
    this.puzzle = null;
    this.targetWords = [];
    this.foundWords = new Map();   // word -> boolean (currently found)
    this.state = 'idle';           // idle, playing, complete
    this.seed = 0;
    this.startServerTime = 0;

    // UI references
    this.containerEl = null;
    this.wordListEl = null;
    this.timerEl = null;

    // Callbacks
    this.onGameComplete = null;
    this.onWordsUpdated = null;
    this.onMoveHistoryChange = null;
  }

  // Initialize with DOM elements
  init(containerEl, wordListEl, timerEl) {
    this.containerEl = containerEl;
    this.wordListEl = wordListEl;
    this.timerEl = timerEl;

    // Timer update callback (throttled session save)
    this._lastSessionSave = 0;
    this.timer.onUpdate = (formatted, raw) => {
      if (this.timerEl) {
        this.timerEl.textContent = formatted;
      }
      // Save session state every ~1 second
      const now = Date.now();
      if (now - this._lastSessionSave > 1000) {
        this._lastSessionSave = now;
        this._saveSession();
      }
    };
  }

  // Start a new game with selected cube size
  async startGame(cubeSize) {
    // Clear any previous session
    this._clearSession();

    this.cubeSize = cubeSize;
    this.state = 'ready';
    this.seed = Date.now() % 2147483647;

    // Generate puzzle
    this.puzzle = generatePuzzle(cubeSize, this.seed);
    this.targetWords = [...this.puzzle.targetWords];

    // Initialize found words
    this.foundWords = new Map();
    for (const word of this.targetWords) {
      this.foundWords.set(word, false);
    }

    // Create 3D cube
    if (this.cube) this.cube.destroy();
    this.cube = new WordCube(this.containerEl, cubeSize);

    // Set initial (solved) letters - show to user
    this.cube.setFaceGrids(this.puzzle.solvedFaces);

    // Apply settings
    this._applySettings();

    // Render word list
    this._renderWordList();

    // Highlight words on the solved cube
    this._highlightSolvedWords();

    return this.puzzle;
  }

  // Highlight all target word positions on the solved (pre-scramble) cube
  _highlightSolvedWords() {
    if (!this.cube || !this.puzzle) return;
    const results = findWordsOnFaces(this.puzzle.solvedFaces, this.targetWords, this.cubeSize);
    const tilesToHighlight = [];
    for (const word of this.targetWords) {
      const locations = results.get(word) || [];
      for (const loc of locations) {
        for (const pos of loc.positions) {
          tilesToHighlight.push({ faceIdx: loc.face, row: pos.row, col: pos.col });
        }
      }
    }
    if (tilesToHighlight.length > 0) {
      this.cube.highlightTiles(tilesToHighlight);
    }
  }

  // After user reviews solved state, scramble and begin
  async beginScramble() {
    this.state = 'playing';

    // Clear highlights before scrambling
    this.cube.clearHighlights();

    // Animated scramble
    await this.cube.animatedScramble(this.puzzle.scrambleMoves);

    // Set up rotation callback
    this.cube.onRotationComplete = (grids) => {
      this._checkWords(grids);
      this._notifyMoveHistoryChange();
    };

    // Initial word check (some might be formed after scramble)
    this._checkWords(this.cube.getFaceGrids());

    // Start timer
    this.startServerTime = await getServerTime();
    this.timer.start(this.startServerTime);

    // Save session
    this._saveSession();
  }

  // Undo last move
  undo() {
    if (!this.cube || this.state !== 'playing') return false;
    const result = this.cube.undo();
    if (result) this._notifyMoveHistoryChange();
    return result;
  }

  // Redo last undone move
  redo() {
    if (!this.cube || this.state !== 'playing') return false;
    const result = this.cube.redo();
    if (result) this._notifyMoveHistoryChange();
    return result;
  }

  _notifyMoveHistoryChange() {
    if (this.onMoveHistoryChange && this.cube) {
      this.onMoveHistoryChange(
        this.cube.moveHistory.length,
        this.cube.redoStack.length
      );
    }
  }

  // Check for found words on current face grids
  _checkWords(grids) {
    const results = findWordsOnFaces(grids, this.targetWords, this.cubeSize);
    let changed = false;
    let allFound = this.targetWords.length > 0;
    const tilesToHighlight = [];

    for (const word of this.targetWords) {
      const locations = results.get(word) || [];
      const wasFound = this.foundWords.get(word);
      const isNowFound = locations.length > 0;

      if (wasFound !== isNowFound) {
        this.foundWords.set(word, isNowFound);
        changed = true;
      }

      if (isNowFound) {
        // Collect tile positions for highlighting
        for (const loc of locations) {
          for (const pos of loc.positions) {
            tilesToHighlight.push({
              faceIdx: loc.face,
              row: pos.row,
              col: pos.col
            });
          }
        }
      }

      if (!isNowFound) allFound = false;
    }

    if (changed) {
      this._renderWordList();
      this._saveSession();

      // Update highlights
      if (tilesToHighlight.length > 0) {
        this.cube.highlightTiles(tilesToHighlight);
      } else {
        this.cube.clearHighlights();
      }
    }

    // Check win condition
    if (allFound && this.state === 'playing') {
      this._onGameComplete();
    }
  }

  // Handle game completion
  async _onGameComplete() {
    this.state = 'complete';
    const elapsed = this.timer.stop();

    // Validate against server time (abuse detection)
    const endServerTime = await getServerTime();
    const serverElapsed = (endServerTime - this.startServerTime) / 1000;

    let valid = true;
    if (Math.abs(elapsed - serverElapsed) > 2.0) {
      console.warn('[Game] Time validation failed: client=', elapsed, 'server=', serverElapsed);
      valid = false;
    }

    // Save score
    const user = getCurrentUser();
    if (user && valid) {
      // Validate score data shape before writing
      const sanitizedName = typeof user.name === 'string' ? user.name.slice(0, 30) : 'Player';
      const sanitizedCountry = typeof user.country === 'string' && /^[A-Z]{2}$/i.test(user.country) ? user.country.toUpperCase() : 'US';

      if (typeof elapsed !== 'number' || elapsed <= 0 || elapsed > 86400) {
        console.warn('[Game] Invalid elapsed time, skipping score save');
        this._clearSession();
        if (this.onGameComplete) this.onGameComplete(elapsed, false);
        return;
      }

      const scoreData = {
        userId: user.id,
        userName: sanitizedName,
        userCountry: sanitizedCountry,
        cubeSize: this.cubeSize,
        time: Math.round(elapsed * 1000) / 1000, // max 3 decimal places
        seed: this.seed,
        date: new Date().toISOString(),
        valid: true
      };

      await setDoc('scores', generateId(), scoreData);

      // Save to play history
      const historyData = {
        userId: user.id,
        cubeSize: this.cubeSize,
        time: elapsed,
        seed: this.seed,
        date: new Date().toISOString()
      };
      await setDoc('history', generateId(), historyData);
    }

    // Clear session
    this._clearSession();

    // Fire callback
    if (this.onGameComplete) {
      this.onGameComplete(elapsed, valid);
    }
  }

  // Force complete game (admin testing)
  forceComplete() {
    if (this.state !== 'playing') return;
    this.state = 'complete';
    const elapsed = this.timer.stop();

    // Mark all words as found
    for (const word of this.targetWords) {
      this.foundWords.set(word, true);
    }
    this._renderWordList();

    // Clear session
    this._clearSession();

    // Fire callback (score NOT saved for forced completions)
    if (this.onGameComplete) {
      this.onGameComplete(elapsed, false);
    }
  }

  // Render word list UI
  _renderWordList() {
    if (!this.wordListEl) return;
    this.wordListEl.innerHTML = '';

    for (const word of this.targetWords) {
      const isFound = this.foundWords.get(word);
      const el = document.createElement('div');
      el.className = `word-item${isFound ? ' found' : ''}`;
      el.innerHTML = `
        <span class="word-check">${isFound ? '&#10003;' : '&#9675;'}</span>
        <span class="word-text">${word}</span>
      `;
      this.wordListEl.appendChild(el);
    }

    if (this.onWordsUpdated) {
      this.onWordsUpdated(this.foundWords);
    }
  }

  // Apply settings to cube
  _applySettings() {
    if (!this.cube) return;
    const settings = Game.loadSettings();
    this.cube.setSettings(
      settings.sensitivity,
      settings.invertRotation,
      settings.clickFeedback
    );
  }

  // ===== Sessions Persistence =====
  _saveSession() {
    if (this.state !== 'playing') return;
    try {
      const data = {
        cubeSize: this.cubeSize,
        seed: this.seed,
        targetWords: this.targetWords,
        foundWords: Object.fromEntries(this.foundWords),
        faceGrids: this.cube ? this.cube.getFaceGrids() : null,
        tileRotations: this.cube ? this.cube.getTileRotations() : null,
        moveHistory: this.cube ? this.cube.moveHistory : [],
        orbitQuaternion: this.cube ? this.cube.getOrbitQuaternion() : null,
        startServerTime: this.startServerTime,
        timestamp: Date.now()
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  _clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  // Try to restore a previous game session
  async tryRestore() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);

      // Only restore if saved within last 24 hours
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        this._clearSession();
        return false;
      }

      this.cubeSize = data.cubeSize;
      this.seed = data.seed;
      this.targetWords = data.targetWords;
      this.foundWords = new Map(Object.entries(data.foundWords));
      this.startServerTime = data.startServerTime;
      this.state = 'playing';

      // Recreate cube
      if (this.cube) this.cube.destroy();
      this.cube = new WordCube(this.containerEl, this.cubeSize);

      if (data.faceGrids) {
        this.cube.setFaceGrids(data.faceGrids);
      }
      // Restore in-plane tile rotations (must be after setFaceGrids)
      if (data.tileRotations) {
        this.cube.setTileRotations(data.tileRotations);
      }
      if (data.moveHistory) {
        this.cube.moveHistory = data.moveHistory;
      }
      // Restore viewing angle
      if (data.orbitQuaternion) {
        this.cube.setOrbitQuaternion(data.orbitQuaternion);
      }

      this.cube.onRotationComplete = (grids) => {
        this._checkWords(grids);
        this._notifyMoveHistoryChange();
      };

      this._applySettings();
      this._renderWordList();

      // Restore timer using saved start time (always resume, never restart)
      this.timer.resume(this.startServerTime, 0);

      // Check current words
      this._checkWords(this.cube.getFaceGrids());

      return true;
    } catch (e) {
      console.warn('[Game] Session restore failed', e);
      this._clearSession();
      return false;
    }
  }

  // Clean up (preserves session for later restore)
  destroy() {
    if (this.cube) {
      this.cube.destroy();
      this.cube = null;
    }
    this.timer.stop(false); // Don't clear timer session
  }

  // ===== Leaderboard =====
  static async getLeaderboard(cubeSize, limit = 10, mode = 'alltime') {
    try {
      const where = [{ field: 'cubeSize', op: '==', value: cubeSize }];

      if (mode === 'daily') {
        // UTC today: YYYY-MM-DDT00:00:00.000Z to YYYY-MM-DDT23:59:59.999Z
        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
        const tomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
        where.push({ field: 'date', op: '>=', value: todayStart });
        where.push({ field: 'date', op: '<', value: tomorrowStart });
      }

      const results = await queryCollection('scores', {
        where,
        orderBy: { field: 'time', direction: 'asc' },
        limit
      });
      return results;
    } catch (e) {
      console.warn('[Game] Leaderboard fetch failed', e);
      return [];
    }
  }

  // ===== Play History =====
  static async getPlayHistory(userId, limit = 50) {
    try {
      const results = await queryCollection('history', {
        where: [{ field: 'userId', op: '==', value: userId }],
        orderBy: { field: 'date', direction: 'desc' },
        limit
      });
      return results;
    } catch (e) {
      console.warn('[Game] History fetch failed', e);
      return [];
    }
  }

  // ===== Settings =====
  static loadSettings() {
    try {
      const data = localStorage.getItem('wordcube_settings');
      if (data) return JSON.parse(data);
    } catch {}
    return {
      sensitivity: 5,
      invertRotation: false,
      clickFeedback: true
    };
  }

  static saveSettings(settings) {
    try {
      localStorage.setItem('wordcube_settings', JSON.stringify(settings));
    } catch {}
  }
}
