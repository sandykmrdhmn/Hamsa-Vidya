/**
 * HAMSA VIDYA (हंस विद्या) — Web Audio Synthesizer Engine
 * Studio-Grade, Zero-Latency Organic Audio Feedback
 * 100% Offline, synthesized directly via Web Audio API (No external MP3 files)
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('hamsa_sound_muted') === 'true';
    this.initialized = false;

    // Initialize AudioContext on first user interaction to satisfy browser autoplay policy
    const initAudio = () => {
      this.ensureContext();
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };

    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);
    window.addEventListener('touchstart', initAudio);
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('hamsa_sound_muted', String(this.isMuted));
    this.updateSoundIcon();

    if (window.app && window.app.showToast) {
      window.app.showToast(
        this.isMuted ? 'Sound effects muted 🔇' : 'Sound effects enabled 🔊',
        'info'
      );
    }

    if (!this.isMuted) {
      this.playClick();
    }
  }

  updateSoundIcon() {
    const iconBtn = document.getElementById('sound-toggle-btn');
    if (!iconBtn) return;

    iconBtn.innerHTML = this.isMuted
      ? '<i data-lucide="volume-x" style="width:20px;height:20px;color:var(--text-muted);"></i>'
      : '<i data-lucide="volume-2" style="width:20px;height:20px;color:var(--color-primary-light);"></i>';

    iconBtn.title = this.isMuted ? 'Sound Effects Muted (Click to Unmute)' : 'Sound Effects Active (Click to Mute)';
    if (window.lucide) window.lucide.createIcons();
  }

  // =========================================================================
  // ORGANIC SYNTHESIZED SOUNDS
  // =========================================================================

  /**
   * 1. Tab Switch Whoosh (Soft harmonic ethereal sweep)
   */
  playTabSwitch() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(320, now);
      osc1.frequency.exponentialRampToValueAtTime(560, now + 0.16);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(480, now);
      osc2.frequency.exponentialRampToValueAtTime(740, now + 0.16);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.19);
      osc2.stop(now + 0.19);
    } catch (e) {}
  }

  /**
   * 2. Crisp Haptic Click (Linear/Apple UI tactile micro-click)
   */
  playClick() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.035);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.038);
    } catch (e) {}
  }

  /**
   * 3. Option Select Pop (Snappy, cheerful bubble tap)
   */
  playOptionSelect() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.07);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.085);
    } catch (e) {}
  }

  /**
   * 4. Correct Answer Chime (Radiant major harmonic chord)
   */
  playCorrect() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Radiant major triad: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
      const freqs = [523.25, 659.25, 783.99, 1046.50];

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.48);
      });
    } catch (e) {}
  }

  /**
   * 5. Wrong Answer Note (Gentle subdued low harmonic note)
   */
  playWrong() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now);

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(185, now);
      osc1.frequency.exponentialRampToValueAtTime(130, now + 0.22);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(140, now);
      osc2.frequency.exponentialRampToValueAtTime(110, now + 0.22);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.25);
      osc2.stop(now + 0.25);
    } catch (e) {}
  }

  /**
   * 6. Cosmic Batch Ping (Energy bell for batch progression)
   */
  playBatchPing() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch (e) {}
  }

  /**
   * 7. Celebratory Fanfare (Joyful sparkle arpeggio on Quiz Completion)
   */
  playFanfare() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51];

      notes.forEach((note, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + i * 0.07;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.09, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });
    } catch (e) {}
  }

  /**
   * 8. High-Tech Laser Scan Tick (Subtle electronic sonar tick)
   */
  playScannerBeep() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(2200, now + 0.025);

      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.032);
    } catch (e) {}
  }

  /**
   * 9. Sacred Vedic Temple Bell / Singing Bowl Chime (Gurukul Wisdom Chime)
   * Warm, resonant bronze chime with fundamental at 432Hz and gentle harmonic overtones.
   */
  playTempleBell() {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Harmonic frequencies of a sacred Tibetan singing bowl / bronze bell:
      // Fundamental: 432 Hz, Octave: 864 Hz, Minor 3rd harmonic: 1036.8 Hz, Overtone: 1296 Hz
      const harmonics = [
        { freq: 432.0, gain: 0.12, decay: 2.2, type: 'sine' },
        { freq: 864.0, gain: 0.06, decay: 1.8, type: 'sine' },
        { freq: 1036.8, gain: 0.03, decay: 1.4, type: 'triangle' },
        { freq: 1296.0, gain: 0.02, decay: 1.0, type: 'sine' }
      ];

      harmonics.forEach(({ freq, gain, decay, type }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(gain, now + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decay);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + decay + 0.05);
      });
    } catch (e) {}
  }
}

window.audioEngine = new AudioEngine();

