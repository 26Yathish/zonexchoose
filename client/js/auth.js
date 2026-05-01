document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'login') setupLoginPage();
  if (page === 'admin-login') setupAdminLoginPage();
  if (page === 'register') setupRegisterPage();
  if (page === 'forgot-password') setupForgotPasswordPage();
  if (page === 'dashboard') setupDashboardPage();
  if (page === 'upload-docs') setupUploadDocsPage();
});

function getAuthenticatedRedirect() {
  const user = App.getUser();

  if (user?.role === 'admin') {
    return '/admin.html';
  }

  if (user?.role === 'voter') {
    return '/dashboard.html';
  }

  return '';
}

function setupLoginPage() {
  const redirectPath = getAuthenticatedRedirect();
  if (redirectPath) {
    window.location.href = redirectPath;
    return;
  }

  const passwordForm = document.getElementById('loginForm');
  const passwordSubmitBtn = passwordForm.querySelector('button[type="submit"]');
  const otpForm = document.getElementById('otpLoginForm');
  const otpSendBtn = document.getElementById('sendLoginOtpBtn');
  const otpSubmitBtn = otpForm.querySelector('button[type="submit"]');

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = passwordForm.email.value.trim().toLowerCase();
    const password = passwordForm.password.value;

    if (!email || !password) {
      App.toast('Email and password are required.', 'error', true);
      return;
    }

    try {
      App.setButtonLoading(passwordSubmitBtn, true, 'Open Voter Dashboard', 'Signing in...');
      const data = await App.api('/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: { email, password }
      });

      if (data.user.role !== 'voter') {
        App.clearSession();
        App.toast('This login page is for voters only. Use the admin login page instead.', 'error', true);
        window.location.href = '/admin-login.html';
        return;
      }

      App.setSession(data);
      App.toast('Voter login successful.', 'success', true);
      window.location.href = '/dashboard.html';
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(passwordSubmitBtn, false, 'Open Voter Dashboard', 'Signing in...');
    }
  });

  otpSendBtn.addEventListener('click', async () => {
    const email = otpForm.email.value.trim().toLowerCase();

    if (!email) {
      App.toast('Enter your registered email address to receive a login OTP.', 'error', true);
      return;
    }

    try {
      App.setButtonLoading(otpSendBtn, true, 'Send Login OTP', 'Sending OTP...');
      const data = await App.api('/auth/send-login-otp', {
        method: 'POST',
        skipAuth: true,
        body: { email }
      });

      document.getElementById('otpLoginEmailText').textContent = email;
      otpForm.otp.focus();
      App.toast(data.message, 'success', true);
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(otpSendBtn, false, 'Send Login OTP', 'Sending OTP...');
    }
  });

  otpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = otpForm.email.value.trim().toLowerCase();
    const otp = otpForm.otp.value.trim();

    if (!email || !otp) {
      App.toast('Enter your email address and the 6-digit OTP.', 'error', true);
      return;
    }

    try {
      App.setButtonLoading(otpSubmitBtn, true, 'Login with OTP', 'Verifying OTP...');
      const data = await App.api('/auth/login-with-otp', {
        method: 'POST',
        skipAuth: true,
        body: { email, otp }
      });

      App.setSession(data);
      App.toast('OTP login successful.', 'success', true);
      window.location.href = '/dashboard.html';
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(otpSubmitBtn, false, 'Login with OTP', 'Verifying OTP...');
    }
  });
}

function setupAdminLoginPage() {
  const user = App.getUser();
  if (user?.role === 'admin') {
    window.location.href = '/admin.html';
    return;
  }
  if (user?.role === 'voter') {
    window.location.href = '/dashboard.html';
    return;
  }

  const form = document.getElementById('adminLoginForm');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;

    if (!email || !password) {
      App.toast('Admin email and password are required.', 'error', true);
      return;
    }

    try {
      App.setButtonLoading(submitBtn, true, 'Open Admin Panel', 'Signing in...');
      const data = await App.api('/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: { email, password }
      });

      if (data.user.role !== 'admin') {
        App.clearSession();
        App.toast('This login page is for administrators only.', 'error', true);
        window.location.href = '/login.html';
        return;
      }

      App.setSession(data);
      App.toast('Administrator login successful.', 'success', true);
      window.location.href = '/admin.html';
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(submitBtn, false, 'Open Admin Panel', 'Signing in...');
    }
  });
}

function setupRegisterPage() {
  const state = {
    email: '',
    studentId: '',
    registrationToken: ''
  };

  const stepOtp = document.getElementById('stepOtp');
  const stepVerify = document.getElementById('stepVerify');
  const stepAccount = document.getElementById('stepAccount');
  const requestOtpForm = document.getElementById('requestOtpForm');
  const verifyOtpForm = document.getElementById('verifyOtpForm');
  const registerForm = document.getElementById('registerForm');
  const requestOtpBtn = requestOtpForm.querySelector('button[type="submit"]');
  const verifyOtpBtn = verifyOtpForm.querySelector('button[type="submit"]');
  const registerBtn = registerForm.querySelector('button[type="submit"]');

  const activateStep = (step) => {
    [stepOtp, stepVerify, stepAccount].forEach((section) => section.classList.remove('active'));
    step.classList.add('active');
  };

  activateStep(stepOtp);

  requestOtpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = requestOtpForm.email.value.trim().toLowerCase();
    const studentId = requestOtpForm.studentId.value.trim().toUpperCase();

    try {
      App.setButtonLoading(requestOtpBtn, true, 'Send OTP Code', 'Sending OTP...');
      await App.api('/auth/send-otp', {
        method: 'POST',
        skipAuth: true,
        body: { email, studentId }
      });
      state.email = email;
      state.studentId = studentId;
      document.getElementById('verifiedEmailText').textContent = email;
      activateStep(stepVerify);
      App.toast('OTP sent successfully. Check your inbox.', 'success', true);
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(requestOtpBtn, false, 'Send OTP Code', 'Sending OTP...');
    }
  });

  verifyOtpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const otp = verifyOtpForm.otp.value.trim();

    try {
      App.setButtonLoading(verifyOtpBtn, true, 'Verify OTP', 'Verifying...');
      const data = await App.api('/auth/verify-otp', {
        method: 'POST',
        skipAuth: true,
        body: { email: state.email, studentId: state.studentId, otp }
      });
      state.registrationToken = data.registrationToken;
      registerForm.email.value = state.email;
      registerForm.studentId.value = state.studentId;
      activateStep(stepAccount);
      App.toast('OTP verified. Complete your account setup.', 'success', true);
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(verifyOtpBtn, false, 'Verify OTP', 'Verifying...');
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: registerForm.name.value.trim(),
      email: registerForm.email.value.trim().toLowerCase(),
      studentId: registerForm.studentId.value.trim().toUpperCase(),
      password: registerForm.password.value,
      registrationToken: state.registrationToken
    };

    try {
      App.setButtonLoading(registerBtn, true, 'Create Secure Account', 'Creating account...');
      const data = await App.api('/auth/register', {
        method: 'POST',
        skipAuth: true,
        body: payload
      });
      App.setSession(data);
      App.toast('Registration complete. Welcome to Zonexchoose.', 'success', true);
      window.location.href = '/dashboard.html';
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(registerBtn, false, 'Create Secure Account', 'Creating account...');
    }
  });
}

function setupForgotPasswordPage() {
  const redirectPath = getAuthenticatedRedirect();
  if (redirectPath) {
    window.location.href = redirectPath;
    return;
  }

  const state = {
    email: '',
    resetToken: ''
  };

  const stepRequest = document.getElementById('stepForgotRequest');
  const stepVerify = document.getElementById('stepForgotVerify');
  const stepReset = document.getElementById('stepForgotReset');
  const requestForm = document.getElementById('forgotPasswordForm');
  const verifyForm = document.getElementById('verifyResetOtpForm');
  const resetForm = document.getElementById('resetPasswordForm');
  const requestBtn = requestForm.querySelector('button[type="submit"]');
  const verifyBtn = verifyForm.querySelector('button[type="submit"]');
  const resetBtn = resetForm.querySelector('button[type="submit"]');

  const activateStep = (step) => {
    [stepRequest, stepVerify, stepReset].forEach((section) => section.classList.remove('active'));
    step.classList.add('active');
  };

  activateStep(stepRequest);

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = requestForm.email.value.trim().toLowerCase();

    try {
      App.setButtonLoading(requestBtn, true, 'Send Reset OTP', 'Sending OTP...');
      const data = await App.api('/auth/forgot-password', {
        method: 'POST',
        skipAuth: true,
        body: { email }
      });

      state.email = email;
      document.getElementById('resetEmailText').textContent = email;
      activateStep(stepVerify);
      App.toast(data.message, 'success', true);
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(requestBtn, false, 'Send Reset OTP', 'Sending OTP...');
    }
  });

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const otp = verifyForm.otp.value.trim();

    try {
      App.setButtonLoading(verifyBtn, true, 'Verify Reset OTP', 'Verifying...');
      const data = await App.api('/auth/verify-reset-otp', {
        method: 'POST',
        skipAuth: true,
        body: { email: state.email, otp }
      });

      state.resetToken = data.resetToken;
      activateStep(stepReset);
      App.toast('OTP verified. You can now create a new password.', 'success', true);
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(verifyBtn, false, 'Verify Reset OTP', 'Verifying...');
    }
  });

  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = resetForm.password.value;
    const confirmPassword = resetForm.confirmPassword.value;

    if (password !== confirmPassword) {
      App.toast('Passwords do not match.', 'error', true);
      return;
    }

    try {
      App.setButtonLoading(resetBtn, true, 'Reset Password', 'Resetting password...');
      const data = await App.api('/auth/reset-password', {
        method: 'POST',
        skipAuth: true,
        body: {
          resetToken: state.resetToken,
          password
        }
      });

      App.toast(data.message, 'success', true);
      window.location.href = '/login.html';
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(resetBtn, false, 'Reset Password', 'Resetting password...');
    }
  });
}

async function setupDashboardPage() {
  const user = await App.requireAuth();
  if (!user) return;

  if (user.role === 'admin') {
    window.location.href = '/admin.html';
    return;
  }

  const welcome = document.getElementById('welcomeName');
  const accountInfo = document.getElementById('accountInfo');
  const voteStatus = document.getElementById('voteStatus');
  const turnoutValue = document.getElementById('dashboardTurnout');
  const turnoutRing = document.getElementById('turnoutRing');
  const voteAction = document.getElementById('voteAction');
  const voteActionCopy = document.getElementById('voteActionCopy');

  welcome.textContent = user.name;
  accountInfo.textContent = `${user.email} - ${user.studentId}`;
  voteStatus.textContent = user.hasVoted ? 'Vote recorded' : 'Vote pending';
  voteStatus.className = `status-chip ${user.hasVoted ? 'status-approved' : 'status-pending_review'}`;

  try {
    const turnout = await App.api('/vote/turnout', { skipAuth: true });
    turnoutValue.textContent = `${turnout.turnoutPercentage}%`;
    turnoutRing.style.setProperty('--turnout', `${turnout.turnoutPercentage}%`);
    document.getElementById('turnoutMeta').textContent = `${turnout.votesCast} of ${turnout.totalVoters} approved voters have voted.`;
    document.getElementById('votingMode').textContent = turnout.votingEnabled
      ? 'Voting is open.'
      : 'Voting is currently closed by the administrator.';
  } catch (error) {
    turnoutValue.textContent = 'N/A';
    document.getElementById('turnoutMeta').textContent = 'Turnout data is currently unavailable.';
  }

  if (user.hasVoted) {
    voteAction.className = 'btn btn-lg disabled';
    voteAction.textContent = 'Already Voted';
    voteAction.setAttribute('aria-disabled', 'true');
    voteActionCopy.textContent = 'Your single vote has been securely locked in.';
  } else {
    voteAction.href = '/vote.html';
    voteAction.textContent = 'Proceed to Vote';
    voteActionCopy.textContent = 'When voting is enabled, you can cast one secure vote.';
  }
}

async function setupUploadDocsPage() {
  const token = new URLSearchParams(window.location.search).get('token');
  const form = document.getElementById('uploadDocsForm');
  const submitBtn = form.querySelector('button[type="submit"]');
  const candidateSummary = document.getElementById('candidateSummary');

  if (!token) {
    candidateSummary.innerHTML = '<div class="empty-state">This nomination link is missing a token.</div>';
    form.classList.add('d-none');
    return;
  }

  try {
    App.showLoader('Validating secure upload link...');
    const data = await App.api(`/candidates/by-token/${token}`, { skipAuth: true });
    candidateSummary.innerHTML = `
      <div class="glass-card p-4 h-100">
        <span class="section-eyebrow mb-3">Candidate Invitation</span>
        <h2 class="h4 mb-2">${data.candidate.name}</h2>
        <p class="muted-text mb-1">${data.candidate.email}</p>
        <p class="muted-text mb-1">${data.candidate.position}</p>
        <p class="muted-text mb-3">Unique candidate ID: ${data.candidate.studentId}</p>
        <p class="mb-0">${data.candidate.manifesto}</p>
      </div>
    `;
  } catch (error) {
    candidateSummary.innerHTML = `<div class="empty-state">${error.message}</div>`;
    form.classList.add('d-none');
  } finally {
    App.hideLoader();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const candidateId = form.candidateId.value.trim().toUpperCase().replace(/\s+/g, '');

    if (!candidateId) {
      App.toast('Enter your unique candidate ID before uploading.', 'error', true);
      return;
    }

    formData.set('candidateId', candidateId);

    try {
      App.setButtonLoading(submitBtn, true, 'Submit Verification Documents', 'Uploading...');
      App.showLoader('Uploading documents securely...');
      const data = await App.api(`/candidates/upload/${token}`, {
        method: 'POST',
        skipAuth: true,
        body: formData
      });
      App.toast(data.message, 'success', true);
      form.reset();
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.hideLoader();
      App.setButtonLoading(submitBtn, false, 'Submit Verification Documents', 'Uploading...');
    }
  });
}
