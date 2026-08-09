import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES, COMPLETED_STATUS, isActiveStatus, isRecentlyCompleted, parseStudy, validateTrial } from './parse.js';

const FULL_STUDY = {
  protocolSection: {
    identificationModule: { nctId: 'NCT06983743', briefTitle: 'A Study of ERAS-0015 in Solid Tumors' },
    statusModule: {
      overallStatus: 'RECRUITING',
      startDateStruct: { date: '2025-06-05' },
      completionDateStruct: { date: '2026-12-31' },
      lastUpdatePostDateStruct: { date: '2026-01-01' },
    },
    descriptionModule: { briefSummary: 'A short description.' },
    conditionsModule: { conditions: ['Lung Cancer'] },
    designModule: { phases: ['PHASE1'] },
    armsInterventionsModule: { interventions: [{ type: 'DRUG', name: 'Testimonib' }] },
  },
};

describe('parseStudy', () => {
  it('maps nested protocolSection fields into a flat record', () => {
    const trial = parseStudy(FULL_STUDY);
    expect(trial.nctId).toBe('NCT06983743');
    expect(trial.title).toBe('A Study of ERAS-0015 in Solid Tumors');
    expect(trial.status).toBe('RECRUITING');
    expect(trial.phase).toEqual(['PHASE1']);
    expect(trial.startDate).toBe('2025-06-05');
    expect(trial.completionDate).toBe('2026-12-31');
    expect(trial.lastUpdateDate).toBe('2026-01-01');
    expect(trial.description).toBe('A short description.');
    expect(trial.conditions).toEqual(['Lung Cancer']);
    expect(trial.interventions).toEqual(['Testimonib']);
    expect(trial.url).toBe('https://clinicaltrials.gov/study/NCT06983743');
  });

  it('handles missing modules safely', () => {
    const trial = parseStudy({ protocolSection: { identificationModule: { nctId: 'NCT1' } } });
    expect(trial.nctId).toBe('NCT1');
    expect(trial.title).toBeNull();
    expect(trial.status).toBeNull();
    expect(trial.phase).toEqual([]);
    expect(trial.startDate).toBeNull();
    expect(trial.completionDate).toBeNull();
    expect(trial.conditions).toEqual([]);
    expect(trial.interventions).toEqual([]);
    expect(trial.url).toBe('https://clinicaltrials.gov/study/NCT1');
  });

  it('handles a completely empty study', () => {
    const trial = parseStudy({});
    expect(trial.nctId).toBeNull();
    expect(trial.url).toBeNull();
  });

  it('filters empty intervention names', () => {
    const trial = parseStudy({ protocolSection: { armsInterventionsModule: { interventions: [{ name: 'Drug A' }, { name: '' }] } } });
    expect(trial.interventions).toEqual(['Drug A']);
  });
});

describe('validateTrial', () => {
  it('accepts records with an NCT ID and title', () => {
    expect(validateTrial({ nctId: 'NCT1', title: 'T' })).toBe(true);
  });

  it('rejects records missing an NCT ID or title', () => {
    expect(validateTrial({ nctId: null, title: 'T' })).toBe(false);
    expect(validateTrial({ nctId: 'NCT1', title: null })).toBe(false);
    expect(validateTrial(null)).toBe(false);
  });
});

describe('status helpers', () => {
  it('recognizes active statuses', () => {
    for (const status of ACTIVE_STATUSES) expect(isActiveStatus(status)).toBe(true);
    expect(isActiveStatus(COMPLETED_STATUS)).toBe(false);
    expect(isActiveStatus('TERMINATED')).toBe(false);
  });

  it('checks recently completed within a window', () => {
    const range = { since: '2026-02-09', until: '2026-08-09' };
    expect(isRecentlyCompleted({ status: 'COMPLETED', completionDate: '2026-05-11' }, range)).toBe(true);
    expect(isRecentlyCompleted({ status: 'COMPLETED', completionDate: '2026-01-01' }, range)).toBe(false);
    expect(isRecentlyCompleted({ status: 'COMPLETED', completionDate: '2026-09-01' }, range)).toBe(false);
    expect(isRecentlyCompleted({ status: 'RECRUITING', completionDate: '2026-05-11' }, range)).toBe(false);
    expect(isRecentlyCompleted({ status: 'COMPLETED', completionDate: null }, range)).toBe(false);
  });
});