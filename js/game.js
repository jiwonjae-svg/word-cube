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

    return this.puzzle;
  }

  // After user reviews solved state, scramble and begin
  async beginScramble() {
    this.state = 'playing';

    // Animated scramble
    await this.cube.animatedScramble(this.puzzle.scrambleMoves);

    // Set up rotation callback
    this.cube.onRotationComplete = (grids) => {
      this._checkWords(grids);
    };

    // Initial word check (some might be formed after scramble)
    this._checkWords(this.cube.getFaceGrids());

    // Start timer
    this.startServerTime = await getServerTime();
    this.timer.start(this.startServerTime);

    // Save session
    this._saveSession();
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
      const scoreData = {
        userId: user.id,
        userName: user.name,
        userCountry: user.country || 'US',
        cubeSize: this.cubeSize,
        time: elapsed,
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
        startServerTime: this.startServerTime,
        timestamp: Date.now()
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  _clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  // Try to restore a previous game session
  async tryRestore() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);

      // Only restore if saved within last 30 minutes
      if (Date.now() - data.timestamp > 30 * 60 * 1000) {
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

      this.cube.onRotationComplete = (grids) => {
        this._checkWords(grids);
      };

      this._applySettings();
      this._renderWordList();

      // Restore timer
      const timerState = GameTimer.tryRestore();
      if (timerState) {
        this.timer.resume(timerState.startTime, timerState.serverOffset);
      } else {
        this.timer.start(this.startServerTime);
      }

      // Check current words
      this._checkWords(this.cube.getFaceGrids());

      return true;
    } catch (e) {
      console.warn('[Game] Session restore failed', e);
      this._clearSession();
      return false;
    }
  }

  // Clean up
  destroy() {
    if (this.cube) {
      this.cube.destroy();
      this.cube = null;
    }
    this.timer.stop();
  }

  // ===== Leaderboard =====
  static async getLeaderboard(cubeSize, limit = 10) {
    try {
      const results = await queryCollection('scores', {
        where: [{ field: 'cubeSize', op: '==', value: cubeSize }],
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
