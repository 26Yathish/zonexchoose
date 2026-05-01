document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'admin') {
    setupAdminPage();
  }
});

function splitCsvRow(row) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const nextChar = row[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseApprovedVoterCsv(text) {
  const content = String(text || '').replace(/^\uFEFF/, '');
  const rows = content.split(/\r?\n/);
  const headerRow = rows.find((row) => row.trim());

  if (!headerRow) {
    throw new Error('The CSV file is empty.');
  }

  const headerCells = splitCsvRow(headerRow).map((cell) => cell.trim().toLowerCase());
  const emailIndex = headerCells.indexOf('email');
  const studentIdIndex = headerCells.indexOf('studentid');

  if (emailIndex === -1 || studentIdIndex === -1) {
    throw new Error('Use CSV headers exactly as: email,studentId');
  }

  const headerRowIndex = rows.indexOf(headerRow);
  const voters = [];

  rows.slice(headerRowIndex + 1).forEach((row) => {
    if (!row.trim()) return;

    const cells = splitCsvRow(row);
    const email = (cells[emailIndex] || '').trim();
    const studentId = (cells[studentIdIndex] || '').trim();

    if (!email && !studentId) {
      return;
    }

    voters.push({ email, studentId });
  });

  return voters;
}

async function setupAdminPage() {
  const user = await App.requireAuth({ adminOnly: true });
  if (!user) return;

  const configForm = document.getElementById('configForm');
  const voterForm = document.getElementById('approvedVoterForm');
  const bulkVoterForm = document.getElementById('approvedVoterBulkForm');
  const bulkVoterFileInput = document.getElementById('approvedVoterCsv');
  const candidateForm = document.getElementById('candidateInviteForm');
  const resultsContainer = document.getElementById('resultsContainer');

  async function loadSummary() {
    try {
      App.showLoader('Loading administrator controls...');
      const data = await App.api('/admin/summary');
      renderAdminSummary(data);
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.hideLoader();
    }
  }

  configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = configForm.querySelector('button[type="submit"]');
    const payload = {
      votingEnabled: configForm.votingEnabled.checked,
      showResults: configForm.showResults.checked,
      nominationEnabled: configForm.nominationEnabled.checked
    };

    try {
      App.setButtonLoading(submitBtn, true, 'Save Control Settings', 'Saving...');
      const data = await App.api('/admin/toggle-voting', {
        method: 'POST',
        body: payload
      });
      App.toast(data.message, 'success', true);
      await loadSummary();
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(submitBtn, false, 'Save Control Settings', 'Saving...');
    }
  });

  voterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = voterForm.querySelector('button[type="submit"]');
    const payload = {
      name: voterForm.name.value.trim(),
      email: voterForm.email.value.trim().toLowerCase(),
      studentId: voterForm.studentId.value.trim().toUpperCase(),
      department: voterForm.department.value.trim()
    };

    try {
      App.setButtonLoading(submitBtn, true, 'Add Approved Voter', 'Adding...');
      const data = await App.api('/admin/approved-voters', {
        method: 'POST',
        body: payload
      });
      App.toast(data.message, 'success', true);
      voterForm.reset();
      await loadSummary();
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(submitBtn, false, 'Add Approved Voter', 'Adding...');
    }
  });

  bulkVoterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = bulkVoterForm.querySelector('button[type="submit"]');
    const file = bulkVoterFileInput.files[0];

    if (!file) {
      App.toast('Choose a CSV file before uploading.', 'error', true);
      return;
    }

    try {
      App.setButtonLoading(submitBtn, true, 'Upload CSV', 'Uploading...');
      const csvText = await file.text();
      const voters = parseApprovedVoterCsv(csvText);

      if (!voters.length) {
        throw new Error('No voter rows were found in the CSV file.');
      }

      const data = await App.api('/admin/approved-voters/bulk', {
        method: 'POST',
        body: voters
      });

      App.toast(
        `${data.message} Inserted: ${data.totalInserted}. Failed: ${data.failedCount}.`,
        'success',
        true
      );
      bulkVoterForm.reset();
      await loadSummary();
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(submitBtn, false, 'Upload CSV', 'Uploading...');
    }
  });

  candidateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = candidateForm.querySelector('button[type="submit"]');
    const payload = {
      name: candidateForm.name.value.trim(),
      email: candidateForm.email.value.trim().toLowerCase(),
      studentId: candidateForm.studentId.value.trim().toUpperCase(),
      position: candidateForm.position.value.trim(),
      manifesto: candidateForm.manifesto.value.trim()
    };

    try {
      App.setButtonLoading(submitBtn, true, 'Send Candidate Invite', 'Sending invite...');
      const data = await App.api('/admin/add-candidate', {
        method: 'POST',
        body: payload
      });
      App.toast(data.message, 'success', true);
      candidateForm.reset();
      await loadSummary();
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      App.setButtonLoading(submitBtn, false, 'Send Candidate Invite', 'Sending invite...');
    }
  });

  document.getElementById('candidateList').addEventListener('click', async (event) => {
    const action = event.target.dataset.action;
    const candidateId = event.target.dataset.id;
    if (!action || !candidateId) return;

    try {
      if (action === 'approve') {
        const notes = window.prompt('Optional approval note:', '') || '';
        const data = await App.api('/admin/approve-candidate', {
          method: 'POST',
          body: { candidateId, notes }
        });
        App.toast(data.message, 'success', true);
      }

      if (action === 'reject') {
        const reason =
          window.prompt('Reason for rejection:', 'Verification requirements not met.') || '';
        const data = await App.api('/admin/reject-candidate', {
          method: 'POST',
          body: { candidateId, reason }
        });
        App.toast(data.message, 'success', true);
      }

      await loadSummary();
    } catch (error) {
      App.toast(error.message, 'error', true);
    }
  });

  document.getElementById('approvedVoterList').addEventListener('click', async (event) => {
    const action = event.target.dataset.action;
    const voterId = event.target.dataset.id;
    if (action !== 'delete-voter' || !voterId) return;

    const confirmed = window.confirm(
      'Delete this approved voter entry? Use this when a record was added with a typo.'
    );
    if (!confirmed) return;

    try {
      const data = await App.api(`/admin/approved-voters/${voterId}`, {
        method: 'DELETE'
      });
      App.toast(data.message, 'success', true);
      await loadSummary();
    } catch (error) {
      App.toast(error.message, 'error', true);
    }
  });

  document.getElementById('loadResultsBtn').addEventListener('click', async () => {
    resultsContainer.innerHTML = '<div class="empty-state">Loading results...</div>';
    try {
      const data = await App.api('/admin/results');
      if (!data.results.length) {
        resultsContainer.innerHTML = '<div class="empty-state">No votes have been recorded yet.</div>';
        return;
      }

      resultsContainer.innerHTML = `
        <div class="table-shell">
          <table class="table align-middle">
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Position</th>
                <th scope="col">Votes</th>
              </tr>
            </thead>
            <tbody>
              ${data.results
                .map(
                  (row) => `
                    <tr>
                      <td>${row.name}</td>
                      <td>${row.position}</td>
                      <td>${row.votes}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="muted-text mb-0">${data.turnout.turnoutPercentage}% turnout with ${data.turnout.votesCast} vote(s) cast.</p>
      `;
    } catch (error) {
      resultsContainer.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
  });

  function renderAdminSummary(data) {
    const { config, turnout, approvedVoters, candidates } = data;
    document.getElementById('adminGreeting').textContent = `Welcome back, ${user.name}`;
    document.getElementById('adminTurnout').textContent = `${turnout.turnoutPercentage}%`;
    document.getElementById('adminVotesCast').textContent = turnout.votesCast;
    document.getElementById('adminVoterCount').textContent = turnout.totalVoters;

    configForm.votingEnabled.checked = config.votingEnabled;
    configForm.showResults.checked = config.showResults;
    configForm.nominationEnabled.checked = config.nominationEnabled;

    document.getElementById('approvedVoterList').innerHTML = approvedVoters.length
      ? `
        <div class="table-shell">
          <table class="table align-middle">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Student ID</th>
                <th scope="col">Department</th>
                <th scope="col">Used</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              ${approvedVoters
                .map(
                  (voter) => `
                    <tr>
                      <td>${voter.name}</td>
                      <td>${voter.email}</td>
                      <td>${voter.studentId}</td>
                      <td>${voter.department || '-'}</td>
                      <td>${voter.isUsed ? 'Yes' : 'No'}</td>
                      <td>
                        <button
                          type="button"
                          class="btn btn-sm"
                          data-action="delete-voter"
                          data-id="${voter._id}"
                          ${voter.isUsed ? 'disabled' : ''}
                        >
                          ${voter.isUsed ? 'Locked' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="empty-state">No approved voters yet.</div>';

    document.getElementById('candidateList').innerHTML = candidates.length
      ? candidates
          .map(
            (candidate) => `
              <article class="list-card mb-3">
                <div class="d-flex flex-column flex-lg-row justify-content-between gap-3">
                  <div>
                    <div class="d-flex align-items-center gap-2 mb-2">
                      <h3 class="h5 mb-0">${candidate.name}</h3>
                      <span class="status-chip status-${candidate.status}">${App.formatStatus(candidate.status)}</span>
                    </div>
                    <p class="mb-1">${candidate.position}</p>
                    <p class="muted-text mb-1">${candidate.email} - ${candidate.studentId}</p>
                    <p class="mb-2">${candidate.manifesto}</p>
                    <p class="muted-text mb-0">
                      Documents: ${candidate.governmentIdPath && candidate.photoPath ? 'Uploaded' : 'Pending'}.
                      ${candidate.rejectionReason ? `Rejection reason: ${candidate.rejectionReason}` : ''}
                    </p>
                  </div>
                  <div class="d-flex gap-2 align-items-start flex-wrap">
                    <button type="button" class="btn btn-sm" data-action="approve" data-id="${candidate._id}">
                      Approve
                    </button>
                    <button type="button" class="btn btn-sm" data-action="reject" data-id="${candidate._id}">
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            `
          )
          .join('')
      : '<div class="empty-state">No candidates have been invited yet.</div>';

    resultsContainer.innerHTML = config.showResults
      ? '<div class="empty-state">Results are unlocked. Use the button above to load the final tally.</div>'
      : '<div class="empty-state">Results are hidden until you enable visibility.</div>';
  }

  await loadSummary();
}
