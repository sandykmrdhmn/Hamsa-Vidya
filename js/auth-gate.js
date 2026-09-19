/**
 * HAMSA VIDYA — Auth Gate controller
 *
 * The app boots straight into the dashboard, which is fine for a returning user
 * but wrong for a first visit: there is no moment to introduce the product, no
 * account creation step, and no way to distinguish a guest from an
 * eventually-Google-authenticated user. This module puts a login screen in
 * front of the SPA and only calls `window.app.init()` once the visitor has
 * chosen how they want to enter.
 *
 * WHAT IS PERSISTED
 * The chosen mode is written to localStorage under `hamsa_auth_mode`. The value
 * is a string: 'GUEST' today, and 'GOOGLE' once that backend lands. Anything
 * else (missing, empty, unexpected) means "not signed in yet" and the gate
 * shows again next visit.
 *
 * WHY GOOGLE IS INTENTIONALLY INERT
 * The user explicitly asked for the Google button to be visible without a
 * backend behind it — so it must not fake a sign-in, must not silently
 * downgrade to guest mode, and must not lie in a toast about being connected.
 * It surfaces a clear "coming soon" message and does nothing else, so that
 * when the OAuth flow is wired later, the visible affordance is already right
 * and only the click handler swaps out.
 *
 * TESTABILITY
 * The controller is a class exposed as `window.authGate` with `isAuthenticated`,
 * `show`, `hide`, `continueAsGuest`, and `signOut`. Every path (including the
 * inert Google click) is reachable from that surface so scratch/ suites can
 * drive it directly without simulating clicks.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'hamsa_auth_mode';
  const VALID_MODES = new Set(['GUEST', 'GOOGLE']);

  class AuthGate {
    constructor() {
      this._gateEl = null;
      this._appRootEl = null;
      this._onEnter = null;
    }

    /**
     * Has the visitor already chosen a mode in a previous session?
     * A hostile localStorage value (anything not in VALID_MODES) is treated as
     * unauthenticated. That means a corrupted key can never grant entry, only
     * force a re-choose — the safer failure direction.
     */
    isAuthenticated() {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        return typeof v === 'string' && VALID_MODES.has(v);
      } catch (_) {
        // localStorage can throw in private mode on some browsers. Fall through
        // to "not authed", which just shows the gate again. The gate remembers
        // nothing across reloads in that case, but the app still works.
        return false;
      }
    }

    /** The mode the visitor is currently signed in as, or `null`. */
    currentMode() {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        return VALID_MODES.has(v) ? v : null;
      } catch (_) {
        return null;
      }
    }

    /**
     * Show the gate and call `onEnter` once the visitor has chosen an option.
     * If the DOM has not caught up yet, waits for `DOMContentLoaded`.
     */
    show(onEnter) {
      this._onEnter = typeof onEnter === 'function' ? onEnter : null;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._mount(), { once: true });
      } else {
        this._mount();
      }
    }

    _mount() {
      this._gateEl = document.getElementById('auth-gate');
      this._appRootEl = document.getElementById('app-root');

      if (!this._gateEl) {
        // The markup is required; if it is missing something has gone wrong
        // with the deploy. Let the app boot anyway rather than trap the user
        // behind an invisible gate.
        console.warn('[auth-gate] #auth-gate not found — booting app without a gate');
        this._finish();
        return;
      }

      // Reveal the gate and hide the app until a choice is made.
      this._gateEl.removeAttribute('hidden');
      if (this._appRootEl) this._appRootEl.setAttribute('hidden', '');
      document.body.classList.add('auth-gate-open');

      // Wire the buttons. Idempotent — mount() might run twice if the caller
      // signs out and shows the gate again.
      const guestBtn = document.getElementById('auth-guest-btn');
      const googleBtn = document.getElementById('auth-google-btn');
      if (guestBtn && !guestBtn._authWired) {
        guestBtn.addEventListener('click', () => this.continueAsGuest());
        guestBtn._authWired = true;
      }
      if (googleBtn && !googleBtn._authWired) {
        googleBtn.addEventListener('click', () => this._signalGoogleUnavailable());
        googleBtn._authWired = true;
      }

      // Move focus to the primary CTA so a keyboard user is not stranded.
      // Called on the next frame so the entrance animation is already running.
      // `requestAnimationFrame` is missing on some environments (older jsdom
      // versions in tests, some embedded webviews), so fall through to a plain
      // setTimeout rather than throw and abort the mount.
      if (guestBtn) {
        const focusIt = () => {
          try { guestBtn.focus({ preventScroll: true }); }
          catch (_) { guestBtn.focus(); }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusIt);
        else setTimeout(focusIt, 0);
      }

      // Refresh Lucide icons inside the gate, in case the library is present.
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (_) { /* non-fatal */ }
      }
    }

    /**
     * Sign in as a guest, hide the gate, and hand control to the app.
     */
    continueAsGuest() {
      try { localStorage.setItem(STORAGE_KEY, 'GUEST'); }
      catch (_) { /* private mode: mode won't persist, session still works */ }
      this._dismissAndBoot();
    }

    /**
     * Called by the Google button. Backend not wired yet. Do NOT set the
     * storage key here — that would grant entry without a real session.
     */
    _signalGoogleUnavailable() {
      const msg = 'Google sign-in is coming soon. For now, continue as a guest.';
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast(msg, 'info');
      } else {
        // The gate can be shown before app.js has parsed, so a fallback matters.
        // A small dismissible inline note is friendlier than an alert().
        this._showInlineNotice(msg);
      }
    }

    _showInlineNotice(text) {
      const slot = document.getElementById('auth-inline-notice');
      if (!slot) return;
      slot.textContent = text;
      slot.hidden = false;
      slot.classList.add('is-visible');
      // Auto-dismiss after 4s so it does not shove the layout permanently.
      clearTimeout(this._noticeTimer);
      this._noticeTimer = setTimeout(() => {
        slot.classList.remove('is-visible');
        slot.hidden = true;
      }, 4000);
    }

    _dismissAndBoot() {
      if (!this._gateEl) { this._finish(); return; }

      this._gateEl.classList.add('is-leaving');
      const cleanup = () => {
        if (!this._gateEl) return;
        this._gateEl.setAttribute('hidden', '');
        this._gateEl.classList.remove('is-leaving');
        if (this._appRootEl) this._appRootEl.removeAttribute('hidden');
        document.body.classList.remove('auth-gate-open');
        this._finish();
      };

      // 260ms matches the fade-out keyframe in css/auth-gate.css. `animationend`
      // is authoritative if it fires; the timeout is the fallback if the user
      // has `prefers-reduced-motion` and no animation runs at all.
      let done = false;
      const wrap = () => { if (done) return; done = true; cleanup(); };
      this._gateEl.addEventListener('animationend', wrap, { once: true });
      setTimeout(wrap, 400);
    }

    _finish() {
      const cb = this._onEnter;
      this._onEnter = null;
      if (cb) {
        try { cb(); } catch (e) { console.error('[auth-gate] boot callback failed', e); }
      }
    }

    /**
     * Force the gate back on. Not wired to any UI yet — provided so a future
     * settings action can log the guest out cleanly.
     */
    signOut(onEnter) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
      this.show(onEnter);
    }

    /**
     * Handler for social-icon clicks while their real URLs are still `#`.
     * Emits an inline toast, and calls `event.preventDefault()` so the browser
     * does not navigate to `#` and scroll to top.
     */
    handleSocialClick(event, network) {
      // Only intercept placeholder links. If a real URL is set the browser
      // handles it normally.
      const link = event.currentTarget;
      const href = link && link.getAttribute('href');
      if (href && href !== '#') return;                     // real link, let it through

      event.preventDefault();
      const label = network === 'instagram' ? 'Instagram' : network === 'x' ? 'X (Twitter)' : 'Social';
      const msg = `${label} link will be added soon — the profile is not live yet.`;
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast(msg, 'info');
      } else {
        this._showInlineNotice(msg);
      }
    }
  }

  window.authGate = new AuthGate();
})();
