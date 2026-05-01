(function () {
  const storageKeys = {
    token: 'zonex_token',
    user: 'zonex_user',
    theme: 'zonex_theme',
    voice: 'zonex_voice'
  };

  const App = {
    apiBase: '/api',

    init() {
      this.ensureThemePreference();
      this.applyTheme();
      this.applyVoice();
      this.bindGlobalControls();
      this.bindPasswordToggles();
      this.updateAuthLinks();
      this.updatePageTurnout();
    },

    ensureThemePreference() {
      if (!localStorage.getItem(storageKeys.theme)) {
        localStorage.setItem(storageKeys.theme, 'midnight');
      }
    },

    getToken() {
      return localStorage.getItem(storageKeys.token) || '';
    },

    getUser() {
      const raw = localStorage.getItem(storageKeys.user);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (error) {
        return null;
      }
    },

    setSession(payload) {
      if (payload.token) {
        localStorage.setItem(storageKeys.token, payload.token);
      }
      if (payload.user) {
        localStorage.setItem(storageKeys.user, JSON.stringify(payload.user));
      }
      this.updateAuthLinks();
    },

    clearSession() {
      localStorage.removeItem(storageKeys.token);
      localStorage.removeItem(storageKeys.user);
      this.updateAuthLinks();
    },

    async api(path, options = {}) {
      const config = { method: 'GET', headers: {}, ...options };
      const token = this.getToken();

      if (!(config.body instanceof FormData)) {
        config.headers['Content-Type'] = 'application/json';
        if (config.body && typeof config.body !== 'string') {
          config.body = JSON.stringify(config.body);
        }
      }

      if (token && !config.skipAuth) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      delete config.skipAuth;

      const response = await fetch(`${this.apiBase}${path}`, config);
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : {};

      if (!response.ok) {
        if (response.status === 401 && token) {
          this.clearSession();
        }
        throw new Error(data.message || 'Request failed.');
      }

      return data;
    },

    async requireAuth(options = {}) {
      const token = this.getToken();
      if (!token) {
        window.location.href = '/login.html';
        return null;
      }

      try {
        const data = await this.api('/auth/me');
        const user = data.user;
        this.setSession({ user });

        if (options.adminOnly && user.role !== 'admin') {
          this.toast('This page is restricted to administrators.', 'error', true);
          window.location.href = '/dashboard.html';
          return null;
        }

        if (options.voterOnly && user.role !== 'voter') {
          this.toast('This page is for voter accounts.', 'error', true);
          window.location.href = '/admin.html';
          return null;
        }

        return user;
      } catch (error) {
        this.toast(error.message, 'error', true);
        window.location.href = '/login.html';
        return null;
      }
    },

    toast(message, type = 'info', speak = false) {
      const stack = document.getElementById('toastStack') || this.createToastStack();
      const item = document.createElement('div');
      item.className = `toast-card ${type}`;
      item.setAttribute('role', 'status');
      item.setAttribute('aria-live', 'polite');
      item.innerHTML = `<div class="fw-semibold mb-1 text-capitalize">${type}</div><div>${message}</div>`;
      stack.appendChild(item);
      if (speak) this.speak(message);
      window.setTimeout(() => item.remove(), 4200);
    },

    createToastStack() {
      const stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
      return stack;
    },

    showLoader(message = 'Working securely...') {
      const overlay = document.getElementById('loadingOverlay');
      if (!overlay) return;
      overlay.classList.add('active');
      const text = overlay.querySelector('[data-loader-text]');
      if (text) text.textContent = message;
    },

    hideLoader() {
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.classList.remove('active');
    },

    speak(message) {
      const voiceEnabled = localStorage.getItem(storageKeys.voice) !== 'off';
      if (!voiceEnabled || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },

    playSuccessTone() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.4);
    },

    setButtonLoading(button, isLoading, idleText, busyText) {
      if (!button) return;
      button.disabled = isLoading;
      button.innerHTML = isLoading
        ? `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${busyText}`
        : idleText;
    },

    bindGlobalControls() {
      document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => this.toggleTheme());
      });

      document.querySelectorAll('[data-voice-toggle]').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => this.toggleVoice());
      });

      document.querySelectorAll('[data-logout]').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
          this.clearSession();
          this.toast('You have been logged out.', 'info', false);
          window.location.href = '/login.html';
        });
      });
    },

    bindPasswordToggles() {
      document.querySelectorAll('[data-password-toggle]').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
          const targetId = button.getAttribute('data-password-toggle');
          const input = document.getElementById(targetId);
          if (!input) return;
          const reveal = input.type === 'password';
          input.type = reveal ? 'text' : 'password';
          button.textContent = reveal ? 'Hide' : 'Show';
          button.setAttribute('aria-pressed', String(reveal));
        });
      });
    },

    toggleTheme() {
      const nextTheme =
        localStorage.getItem(storageKeys.theme) === 'ocean' ? 'midnight' : 'ocean';
      localStorage.setItem(storageKeys.theme, nextTheme);
      this.applyTheme();
    },

    applyTheme() {
      const theme = localStorage.getItem(storageKeys.theme) || 'midnight';
      document.body.classList.toggle('theme-ocean', theme === 'ocean');
      document.querySelectorAll('[data-theme-label]').forEach((node) => {
        node.textContent = theme === 'ocean' ? 'Theme: Ocean' : 'Theme: Midnight';
      });
    },

    toggleVoice() {
      const next = localStorage.getItem(storageKeys.voice) === 'off' ? 'on' : 'off';
      localStorage.setItem(storageKeys.voice, next);
      this.applyVoice();
      this.toast(next === 'on' ? 'Voice assistance enabled.' : 'Voice assistance muted.', 'info');
    },

    applyVoice() {
      const isOn = localStorage.getItem(storageKeys.voice) !== 'off';
      document.querySelectorAll('[data-voice-label]').forEach((node) => {
        node.textContent = isOn ? 'Voice: On' : 'Voice: Off';
      });
    },

    updateAuthLinks() {
      const user = this.getUser();
      document.querySelectorAll('[data-auth-state]').forEach((wrapper) => {
        wrapper.innerHTML = user
          ? `
            <a href="${user.role === 'admin' ? '/admin.html' : '/dashboard.html'}" class="btn btn-sm me-2">Dashboard</a>
            <button type="button" class="btn btn-sm" data-logout>Logout</button>
          `
          : `
            <a href="/login.html" class="btn btn-sm me-2">Voter Login</a>
            <a href="/admin-login.html" class="btn btn-sm me-2">Admin Login</a>
            <a href="/register.html" class="btn btn-sm">Register</a>
          `;
      });
      this.bindGlobalControls();
    },

    async updatePageTurnout() {
      const turnoutTargets = document.querySelectorAll('[data-turnout-source]');
      if (!turnoutTargets.length) return;

      try {
        const turnout = await this.api('/vote/turnout', { skipAuth: true });
        turnoutTargets.forEach((target) => {
          target.textContent = `${turnout.turnoutPercentage}% turnout`;
        });
      } catch (error) {
        turnoutTargets.forEach((target) => {
          target.textContent = 'Turnout unavailable';
        });
      }
    },

    formatStatus(status) {
      return String(status || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
