// timer.js - High-precision timer with server sync and lerp smoothing

export class GameTimer {
  constructor() {
    this.startTime = 0;        // Server start timestamp (ms)
    this.serverOffset = 0;     // Estimated (serverTime - clientTime) offset
    this.displayTime = 0;      // Current displayed time (seconds)
    this.running = false;
    this.paused = false;
    this.onUpdate = null;      // Callback: (formattedTime, rawSeconds) => void
    this.rafId = null;
    this.lastRawTime = 0;      // For lerp anti-jump
    this.lerpFactor = 0.1;     // Smoothing factor for time corrections

    // Session persistence
    this._sessionKey = 'wordcube_timer_state';
  }

  // Initialize with server time for sync
  // In offline mode, serverNow = Date.now()
  start(serverNow = null) {
    if (!serverNow) serverNow = Date.now();

    this.serverOffset = serverNow - Date.now();
    this.startTime = serverNow;
    this.displayTime = 0;
    this.lastRawTime = 0;
    this.running = true;
    this.paused = false;

    this._saveSession();
    this._tick();
  }

  // Resume from saved session
  resume(startTime, serverOffset) {
    this.startTime = startTime;
    this.serverOffset = serverOffset;
    this.running = true;
    this.paused = false;
    this._tick();
  }

  pause() {
    this.paused = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  stop(clearSession = true) {
    this.running = false;
    this.paused = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (clearSession) this._clearSession();
    return this.displayTime;
  }

  // Get current elapsed time in seconds
  getElapsedSeconds() {
    return this.displayTime;
  }

  // Get the formatted display string
  getFormattedTime() {
    return GameTimer.formatTime(this.displayTime);
  }

  // Receive a server time correction
  syncServerTime(serverNow) {
    const newOffset = serverNow - Date.now();
    // Lerp the offset to avoid jumps
    this.serverOffset = this.serverOffset + (newOffset - this.serverOffset) * this.lerpFactor;
  }

  // Validate end time against server (abuse detection: 2s tolerance)
  validateEndTime(clientElapsed, serverElapsed) {
    return Math.abs(clientElapsed - serverElapsed) < 2.0;
  }

  // Internal tick using requestAnimationFrame
  _tick() {
    if (!this.running || this.paused) return;

    const currentServerTime = Date.now() + this.serverOffset;
    const rawElapsed = (currentServerTime - this.startTime) / 1000;

    // Lerp to avoid backward jumps
    if (rawElapsed >= this.lastRawTime) {
      this.displayTime = rawElapsed;
    } else {
      // Server time jumped backward (network jitter) - lerp smoothly
      this.displayTime = this.displayTime + (rawElapsed - this.displayTime) * this.lerpFactor;
    }
    this.lastRawTime = rawElapsed;

    // Ensure time never goes backward
    if (this.displayTime < 0) this.displayTime = 0;

    // Call update callback
    if (this.onUpdate) {
      this.onUpdate(GameTimer.formatTime(this.displayTime), this.displayTime);
    }

    // Save to session storage periodically (every ~10 frames)
    if (Math.floor(rawElapsed * 10) % 5 === 0) {
      this._saveSession();
    }

    this.rafId = requestAnimationFrame(() => this._tick());
  }

  // Session persistence for crash recovery
  _saveSession() {
    try {
      localStorage.setItem(this._sessionKey, JSON.stringify({
        startTime: this.startTime,
        serverOffset: this.serverOffset,
        running: this.running,
        timestamp: Date.now()
      }));
    } catch (e) { /* quota exceeded, ignore */ }
  }

  _clearSession() {
    try { localStorage.removeItem(this._sessionKey); } catch (e) {}
  }

  // Try to restore from session
  static tryRestore() {
    try {
      const data = localStorage.getItem('wordcube_timer_state');
      if (!data) return null;
      const state = JSON.parse(data);
      // Only restore if saved within last 30 minutes
      if (Date.now() - state.timestamp > 30 * 60 * 1000) return null;
      if (!state.running) return null;
      return state;
    } catch (e) {
      return null;
    }
  }

  // Format seconds to MM:SS.d
  static formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  }
}
