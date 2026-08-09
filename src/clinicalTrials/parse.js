/**
 * Parsing + validation of ClinicalTrials.gov API v2 responses.
 * Pure functions — safe against missing/nested fields.
 */

export const ACTIVE_STATUSES = ['RECRUITING', 'NOT_YET_RECRUITING', 'ENROLLING_BY_INVITATION', 'ACTIVE_NOT_RECRUITING'];
export const COMPLETED_STATUS = 'COMPLETED';

/** Maps a raw API study object into a flat, normalized trial record. */
export function parseStudy(study) {
  const ps = study?.protocolSection || {};
  const id = ps.identificationModule || {};
  const status = ps.statusModule || {};
  const desc = ps.descriptionModule || {};
  const conditions = ps.conditionsModule || {};
  const design = ps.designModule || {};
  const arms = ps.armsInterventionsModule || {};
  return {
    nctId: id.nctId || null,
    title: id.briefTitle || null,
    description: desc.briefSummary || null,
    status: status.overallStatus || null,
    phase: design.phases || [],
    startDate: status.startDateStruct?.date || null,
    completionDate: status.completionDateStruct?.date || null,
    lastUpdateDate: status.lastUpdatePostDateStruct?.date || null,
    conditions: conditions.conditions || [],
    interventions: (arms.interventions || []).map((item) => item.name).filter(Boolean),
    url: id.nctId ? `https://clinicaltrials.gov/study/${id.nctId}` : null,
  };
}

/** Discards malformed records that lack an NCT ID or a title. */
export function validateTrial(trial) {
  return Boolean(trial && trial.nctId && trial.title);
}

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(status);
}

/** True when a trial is COMPLETED with a completion date inside [since, until]. */
export function isRecentlyCompleted(trial, { since, until }) {
  if (!trial || trial.status !== COMPLETED_STATUS || !trial.completionDate) return false;
  return trial.completionDate >= since && trial.completionDate <= until;
}