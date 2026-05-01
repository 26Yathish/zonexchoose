document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'vote') {
    setupVotePage();
  }
});

async function setupVotePage() {
  const user = await App.requireAuth({ voterOnly: true });
  if (!user) return;

  const candidateGrid = document.getElementById('candidateGrid');
  const turnoutCopy = document.getElementById('voteTurnout');
  const statusBanner = document.getElementById('voteStatusBanner');
  const submitBtn = document.getElementById('castVoteBtn');
  const voteForm = document.getElementById('voteForm');
  const voteState = {
    hasSelection: false,
    isSubmitting: false,
    isComplete: user.hasVoted,
    isVotingEnabled: true,
    hasCandidates: false,
    hasLoadError: false
  };

  const renderStatusBanner = (message, className = 'empty-state') => {
    statusBanner.innerHTML = message ? `<div class="${className}">${message}</div>` : '';
  };

  const syncSubmitState = () => {
    if (voteState.isSubmitting) return;

    if (voteState.isComplete) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Vote Recorded';
      return;
    }

    if (voteState.hasLoadError) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Ballot Unavailable';
      return;
    }

    if (!voteState.isVotingEnabled) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Voting Closed';
      return;
    }

    if (!voteState.hasCandidates) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'No Candidates Available';
      return;
    }

    submitBtn.disabled = !voteState.hasSelection;
    submitBtn.textContent = voteState.hasSelection ? 'Cast Secure Vote' : 'Select a Candidate';
  };

  if (user.hasVoted) {
    renderStatusBanner(
      'Your vote has already been recorded. Results remain hidden until the administrator publishes them.'
    );
  }

  if (!user.hasVoted) {
    renderStatusBanner('Select one approved candidate to enable the vote button.');
  }

  syncSubmitState();

  try {
    const [candidateData, turnout] = await Promise.all([
      App.api('/vote/candidates'),
      App.api('/vote/turnout', { skipAuth: true })
    ]);

    turnoutCopy.textContent = `${turnout.turnoutPercentage}% turnout - ${turnout.votesCast}/${turnout.totalVoters} votes cast`;
    voteState.isVotingEnabled = candidateData.votingEnabled;
    voteState.hasCandidates = candidateData.candidates.length > 0;

    if (!candidateData.votingEnabled) {
      renderStatusBanner('Voting is currently disabled by the administrator.');
    }

    if (!candidateData.candidates.length) {
      candidateGrid.innerHTML = '<div class="empty-state">No approved candidates are available yet.</div>';
      if (candidateData.votingEnabled) {
        renderStatusBanner('No approved candidates are available yet.');
      }
      syncSubmitState();
      return;
    }

    candidateGrid.innerHTML = candidateData.candidates
      .map(
        (candidate) => `
          <label class="candidate-card" tabindex="0">
            <div class="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h2 class="h5 mb-1">${candidate.name}</h2>
                <p class="muted-text mb-0">${candidate.position}</p>
              </div>
              <input type="radio" name="candidateId" value="${candidate._id}" aria-label="Select ${candidate.name}" />
            </div>
            ${
              candidate.photoPath
                ? `<img src="${candidate.photoPath}" alt="${candidate.name} campaign portrait" class="mb-3" />`
                : ''
            }
            <p class="mb-2">${candidate.manifesto}</p>
            <p class="muted-text mb-0">${candidate.bio || 'Verified candidate awaiting your choice.'}</p>
          </label>
        `
      )
      .join('');

    candidateGrid.querySelectorAll('.candidate-card').forEach((card) => {
      card.addEventListener('click', () => selectCandidate(card));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCandidate(card);
        }
      });
    });

    voteForm.querySelectorAll('input[name="candidateId"]').forEach((input) => {
      input.addEventListener('change', () => {
        voteState.hasSelection = Boolean(
          voteForm.querySelector('input[name="candidateId"]:checked')
        );

        if (voteState.hasSelection) {
          renderStatusBanner(
            'Candidate selected. Press "Cast Secure Vote" to submit your final choice.'
          );
        }

        syncSubmitState();
      });
    });
  } catch (error) {
    voteState.hasLoadError = true;
    candidateGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
    renderStatusBanner('The ballot could not be loaded. Please refresh and try again.');
  }

  syncSubmitState();

  voteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const choice = voteForm.querySelector('input[name="candidateId"]:checked');
    if (!choice) {
      App.toast('Select one candidate before submitting your vote.', 'error', true);
      return;
    }

    const confirmed = window.confirm('Submit your single vote now? This action cannot be undone.');
    if (!confirmed) return;

    try {
      voteState.isSubmitting = true;
      App.setButtonLoading(submitBtn, true, 'Cast Secure Vote', 'Recording vote...');
      App.showLoader('Recording your vote...');
      const data = await App.api('/vote/cast', {
        method: 'POST',
        body: { candidateId: choice.value }
      });

      const updatedUser = { ...App.getUser(), hasVoted: true };
      App.setSession({ user: updatedUser });
      voteState.isComplete = true;
      App.toast(data.message, 'success', true);
      App.playSuccessTone();
      renderStatusBanner(
        'Vote confirmed. Audio confirmation has been played for accessibility support.',
        'success-banner'
      );
      voteForm.querySelectorAll('input, button').forEach((element) => {
        element.disabled = true;
      });
      submitBtn.textContent = 'Vote Recorded';
    } catch (error) {
      App.toast(error.message, 'error', true);
    } finally {
      voteState.isSubmitting = false;
      App.hideLoader();
      if (!voteState.isComplete) {
        App.setButtonLoading(submitBtn, false, 'Cast Secure Vote', 'Recording vote...');
      }
      syncSubmitState();
    }
  });
}

function selectCandidate(card) {
  document.querySelectorAll('.candidate-card').forEach((item) => item.classList.remove('selected'));
  card.classList.add('selected');
  const radio = card.querySelector('input[type="radio"]');
  if (radio && !radio.checked) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
