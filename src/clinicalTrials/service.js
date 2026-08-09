/**
 * ClinicalTrials.gov search orchestration.
 *
 * Browser-side fetch only (no auth, no API key). Runs two logical searches per
 * fallback level — active trials and recently completed trials — then parses,
 * deduplicates, validates, ranks and caps the results. The HTTP layer is
 * isolated in `fetchStudies` so it can later be moved behind an ARISTO backend
 * endpoint without touching the rest of the module.
 */

import { biomarkerAliasForms, buildQuery, normalizeBiomarkers, normalizeHistology, normalizePrimarySite, SEARCH_LEVELS, recentCompletionRange } from './query.js';
import { ACTIVE_STATUSES, COMPLETED_STATUS, isActiveStatus, isRecentlyCompleted, parseStudy, validateTrial } from './parse.js';

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';
const MIN_RESULTS = 3;
const MAX_RESULTS = 15;
const ACTIVE_CAP = 10;
const COMPLETED_CAP = 5;

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** Errors that should be retried (HTML/non-JSON responses, 5xx, network). */
class RetryableError extends Error {
  constructor(message) { super(message); this.retryable = true; }
}

/**
 * Fetches one /studies page. Retries a call up to `maxAttempts` times when the
 * response is HTML/non-JSON (e.g. a proxy or edge error page) or a 5xx, and on
 * network errors. A clean JSON error response (e.g. 4xx) is not retried.
 */
export async function fetchStudies(params, { maxAttempts = 5, retryDelayMs = 500 } = {}) {
  const url = `${BASE_URL}?${params.toString()}`;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
      const nonJson = data === null || contentType.includes('html');
      if (nonJson || response.status >= 500) {
        throw new RetryableError(nonJson ? 'ClinicalTrials.gov returned a non-JSON response.' : `ClinicalTrials.gov request failed (${response.status}).`);
      }
      if (!response.ok) throw new Error(`ClinicalTrials.gov request failed (${response.status}).`);
      return data;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableError || error instanceof TypeError;
      if (retryable && attempt < maxAttempts) { await delay(retryDelayMs * attempt); continue; }
      throw error;
    }
  }
  throw lastError;
}

/** Deterministic, explainable relevance score: site > histology > biomarker. */
export function scoreTrial(trial, { site, histology, biomarkers }) {
  const haystack = [trial.title || '', ...(trial.conditions || []), ...(trial.interventions || [])].join(' ').toLowerCase();
  const flat = haystack.replace(/[^a-z0-9]/g, '');
  const siteTokens = site.split(' ').filter((word) => word.length > 2 && !GENERIC_SITE_WORDS.has(word));
  let score = 0;
  if (siteTokens.some((token) => haystack.includes(token))) score += 4;
  if (histology && haystack.includes(histology)) score += 2;
  if (biomarkers.length && biomarkers.some((b) => biomarkerAliasForms(b).some((form) => flat.includes(form.toLowerCase())))) score += 1;
  return score;
}

const GENERIC_SITE_WORDS = new Set(['cancer', 'carcinoma', 'tumor', 'tumour', 'neoplasm', 'sarcoma', 'lymphoma', 'leukemia', 'leukaemia', 'melanoma', 'glioma', 'blastoma', 'cell', 'small', 'large', 'non', 'advanced', 'metastatic', 'squamous', 'adeno']);

/** Active trials first, then match score, then recency, then API relevance order. */
export function rankTrials(trials, patient) {
  const site = normalizePrimarySite(patient.primary_site).toLowerCase();
  const histology = normalizeHistology(patient.histology_description).toLowerCase();
  const biomarkers = normalizeBiomarkers(patient.biomarkers);
  return trials
    .map((trial, index) => ({ trial, index, score: scoreTrial(trial, { site, histology, biomarkers }) }))
    .sort((a, b) => {
      const aActive = isActiveStatus(a.trial.status) ? 0 : 1;
      const bActive = isActiveStatus(b.trial.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (b.score !== a.score) return b.score - a.score;
      const aDate = a.trial.completionDate || a.trial.startDate || '';
      const bDate = b.trial.completionDate || b.trial.startDate || '';
      if (bDate !== aDate) return bDate < aDate ? -1 : 1;
      return a.index - b.index;
    })
    .map((item) => item.trial);
}

/**
 * Caps the ranked list at 15 while keeping both sections represented: up to 10
 * active trials and up to 5 recently completed trials, filling any remaining
 * slots from the rest of the ranked list (active first).
 */
export function capTrials(ranked) {
  const active = ranked.filter((trial) => isActiveStatus(trial.status));
  const completed = ranked.filter((trial) => trial.status === COMPLETED_STATUS);
  return [
    ...active.slice(0, ACTIVE_CAP),
    ...completed.slice(0, COMPLETED_CAP),
    ...active.slice(ACTIVE_CAP),
    ...completed.slice(COMPLETED_CAP),
  ].slice(0, MAX_RESULTS);
}

/**
 * Searches ClinicalTrials.gov for a patient profile.
 * patient: { primary_site, histology_description, biomarkers[] }
 * Returns { trials, debug } where debug exposes the constructed queries, the
 * fallback level used, per-call counts, and dedup/validation removals.
 */
export async function searchClinicalTrials(patient, { now = new Date(), maxAttempts = 5, retryDelayMs = 500 } = {}) {
  if (!normalizePrimarySite(patient.primary_site)) throw new Error('Primary site is required.');
  const completionRange = recentCompletionRange(6, now);
  const collected = new Map();
  const debug = { levels: [], dedupRemoved: 0, validationRemoved: 0, finalCount: 0 };
  let lastError = null;

  for (const level of SEARCH_LEVELS) {
    const levelDebug = { level: level.level, active: 0, completed: 0, error: null };
    try {
      const activeParams = buildQuery(patient, level.level, { statuses: ACTIVE_STATUSES });
      if (activeParams) {
        const activeData = await fetchStudies(activeParams, { maxAttempts, retryDelayMs });
        const activeTrials = (activeData.studies || []).map(parseStudy);
        levelDebug.active = activeTrials.length;
        collect(activeTrials, collected, debug, completionRange);
      }

      const completedParams = buildQuery(patient, level.level, { statuses: [COMPLETED_STATUS], completionDate: completionRange });
      if (completedParams) {
        const completedData = await fetchStudies(completedParams, { maxAttempts, retryDelayMs });
        const completedTrials = (completedData.studies || []).map(parseStudy);
        levelDebug.completed = completedTrials.length;
        collect(completedTrials, collected, debug, completionRange);
      }
    } catch (error) {
      lastError = error;
      levelDebug.error = error.message;
    }
    debug.levels.push(levelDebug);
    if (collected.size >= MIN_RESULTS) break;
  }

  const trials = capTrials(rankTrials([...collected.values()], patient));
  debug.finalCount = trials.length;
  if (trials.length === 0 && lastError) throw lastError;
  return { trials, debug };
}

function collect(trials, collected, debug, completionRange) {
  for (const trial of trials) {
    if (!validateTrial(trial)) { debug.validationRemoved++; continue; }
    if (trial.status === COMPLETED_STATUS) {
      if (!isRecentlyCompleted(trial, completionRange)) { debug.validationRemoved++; continue; }
    } else if (!isActiveStatus(trial.status)) {
      debug.validationRemoved++; continue;
    }
    if (collected.has(trial.nctId)) { debug.dedupRemoved++; continue; }
    collected.set(trial.nctId, trial);
  }
}