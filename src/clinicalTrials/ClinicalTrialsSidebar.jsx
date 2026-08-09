/**
 * ClinicalTrialsSidebar — reusable, presentation-only results panel.
 *
 * Accepts normalized trial data (not API knowledge) so it can be copied into
 * the main ARISTO application with minimal changes. The search/API logic lives
 * outside this component.
 *
 * Props: { trials, loading, error, onRetry }
 */
import { useState } from 'react';
import './clinicalTrials.css';

const STATUS_LABELS = {
  RECRUITING: 'Recruiting',
  NOT_YET_RECRUITING: 'Not yet recruiting',
  ENROLLING_BY_INVITATION: 'Enrolling by invitation',
  ACTIVE_NOT_RECRUITING: 'Active, not recruiting',
  COMPLETED: 'Completed',
};

function formatDate(date) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TrialCard({ trial }) {
  const [expanded, setExpanded] = useState(false);
  const completed = trial.status === 'COMPLETED';
  const dateLabel = completed ? 'Completed' : 'Started';
  const dateValue = completed ? trial.completionDate : (trial.startDate || trial.lastUpdateDate);
  const hasDetails = Boolean(trial.description) || (trial.interventions?.length > 0);
  return (
    <article className={`ct-card ct-status-${(trial.status || '').toLowerCase()}`}>
      <h3 className="ct-card-title">{trial.title}</h3>
      <div className="ct-card-meta">
        <span className="ct-status">{STATUS_LABELS[trial.status] || trial.status}</span>
        {trial.phase?.length > 0 && <span className="ct-phase">{trial.phase.join(', ')}</span>}
        {dateValue && <span className="ct-date">{dateLabel}: {formatDate(dateValue)}</span>}
      </div>
      {hasDetails && (
        <button type="button" className="ct-card-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? 'Hide details' : 'Show details'}
          <span className={`ct-chevron${expanded ? ' ct-chevron-open' : ''}`} aria-hidden="true">▾</span>
        </button>
      )}
      {expanded && (
        <div className="ct-card-details">
          {trial.description && <p className="ct-card-desc">{trial.description}</p>}
          {trial.interventions?.length > 0 && <p className="ct-card-interventions">Interventions: {trial.interventions.join(', ')}</p>}
        </div>
      )}
      <div className="ct-card-foot">
        <span className="ct-nct">{trial.nctId}</span>
        <a className="ct-open" href={trial.url} target="_blank" rel="noopener noreferrer">Open Clinical Trial</a>
      </div>
    </article>
  );
}

function TrialSection({ title, trials }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="ct-section">
      <button type="button" className="ct-section-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="ct-section-title">{title}</span>
        <span className="ct-section-count">{trials.length}</span>
        <span className={`ct-chevron${open ? ' ct-chevron-open' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="ct-section-body">
          {trials.map((trial) => <TrialCard key={trial.nctId} trial={trial} />)}
        </div>
      )}
    </section>
  );
}

export function ClinicalTrialsSidebar({ trials = [], loading = false, error = null, onRetry }) {
  const ongoing = trials.filter((trial) => trial.status !== 'COMPLETED');
  const completed = trials.filter((trial) => trial.status === 'COMPLETED');
  return (
    <aside className="ct-sidebar">
      <div className="ct-sidebar-head">
        <h2>Recent / Ongoing Clinical Trials</h2>
        <span className="ct-source">Source: ClinicalTrials.gov</span>
      </div>

      {loading && <div className="ct-state">Searching ClinicalTrials.gov…</div>}

      {!loading && error && (
        <div className="ct-state ct-error">
          <p>{error}</p>
          {onRetry && <button type="button" className="ct-retry" onClick={onRetry}>Try again</button>}
        </div>
      )}

      {!loading && !error && trials.length === 0 && (
        <div className="ct-state">No relevant clinical trials found.</div>
      )}

      {!loading && !error && trials.length > 0 && (
        <>
          {ongoing.length > 0 && <TrialSection title="Ongoing" trials={ongoing} />}
          {completed.length > 0 && <TrialSection title="Recently Completed" trials={completed} />}
        </>
      )}

      <p className="ct-disclaimer">
        Clinical trial listings are retrieved from ClinicalTrials.gov based on the provided patient
        information. Trial eligibility must be confirmed against the official study criteria by the
        clinical team.
      </p>
    </aside>
  );
}