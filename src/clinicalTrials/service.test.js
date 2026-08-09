import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStudies, rankTrials, scoreTrial, searchClinicalTrials } from './service.js';

const NOW = new Date('2026-08-09T12:00:00');
const PATIENT = { primary_site: 'Lung', histology_description: 'Adenocarcinoma', biomarkers: ['EGFR'] };

function mockResponse({ status = 200, contentType = 'application/json', body = '{}' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
  };
}

function jsonResponse(studies) {
  return mockResponse({ body: JSON.stringify({ studies }) });
}

function study(nctId, { status = 'RECRUITING', title = `Trial ${nctId}`, completionDate = null, conditions = ['Lung Cancer'], interventions = [] } = {}) {
  return {
    protocolSection: {
      identificationModule: { nctId, briefTitle: title },
      statusModule: {
        overallStatus: status,
        startDateStruct: { date: '2025-01-01' },
        completionDateStruct: completionDate ? { date: completionDate } : {},
        lastUpdatePostDateStruct: { date: '2026-01-01' },
      },
      descriptionModule: { briefSummary: 'A short description.' },
      conditionsModule: { conditions },
      designModule: { phases: ['PHASE1'] },
      armsInterventionsModule: { interventions: interventions.map((name) => ({ name })) },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('searchClinicalTrials', () => {
  it('stops at level 1 when enough results are found', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([study('NCT1'), study('NCT2'), study('NCT3')]))
      .mockResolvedValueOnce(jsonResponse([study('NCT4', { status: 'COMPLETED', completionDate: '2026-05-01' })]));
    vi.stubGlobal('fetch', fetchMock);

    const { trials, debug } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(trials.length).toBe(4);
    expect(debug.levels.length).toBe(1);
  });

  it('progressively falls back until enough results', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([study('NCT1')]))
      .mockResolvedValueOnce(jsonResponse([study('NCT2', { status: 'COMPLETED', completionDate: '2026-05-01' })]))
      .mockResolvedValueOnce(jsonResponse([study('NCT3'), study('NCT4')]))
      .mockResolvedValueOnce(jsonResponse([study('NCT5', { status: 'COMPLETED', completionDate: '2026-06-01' })]));
    vi.stubGlobal('fetch', fetchMock);

    const { trials, debug } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(trials.length).toBe(5);
    expect(debug.levels.length).toBe(2);
  });

  it('deduplicates the same NCT ID across searches', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([study('NCT1'), study('NCT2')]))
      .mockResolvedValueOnce(jsonResponse([study('NCT1', { status: 'COMPLETED', completionDate: '2026-05-01' }), study('NCT3', { status: 'COMPLETED', completionDate: '2026-05-01' })]));
    vi.stubGlobal('fetch', fetchMock);

    const { trials, debug } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(trials.length).toBe(3);
    expect(debug.dedupRemoved).toBe(1);
  });

  it('drops malformed records during validation', async () => {
    const malformed = { protocolSection: { identificationModule: { nctId: null, briefTitle: null } } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([study('NCT1'), study('NCT2'), study('NCT3'), malformed]))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { trials, debug } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(trials.length).toBe(3);
    expect(debug.validationRemoved).toBe(1);
  });

  it('caps results at 15', async () => {
    const active = Array.from({ length: 20 }, (_, i) => study(`NCT${i + 1}`));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(active))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { trials, debug } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(trials.length).toBe(15);
    expect(debug.finalCount).toBe(15);
  });

  it('keeps both sections when many active and completed trials exist', async () => {
    const active = Array.from({ length: 20 }, (_, i) => study(`NCT${i + 1}`));
    const completed = Array.from({ length: 20 }, (_, i) => study(`NCT${i + 101}`, { status: 'COMPLETED', completionDate: '2026-05-01' }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(active))
      .mockResolvedValueOnce(jsonResponse(completed));
    vi.stubGlobal('fetch', fetchMock);

    const { trials } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(trials.length).toBe(15);
    expect(trials.filter((t) => t.status === 'COMPLETED').length).toBe(5);
    expect(trials.filter((t) => t.status !== 'COMPLETED').length).toBe(10);
  });

  it('fills remaining slots when one section is scarce', async () => {
    const active = Array.from({ length: 3 }, (_, i) => study(`NCT${i + 1}`));
    const completed = Array.from({ length: 12 }, (_, i) => study(`NCT${i + 101}`, { status: 'COMPLETED', completionDate: '2026-05-01' }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(active))
      .mockResolvedValueOnce(jsonResponse(completed));
    vi.stubGlobal('fetch', fetchMock);

    const { trials } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(trials.length).toBe(15);
    expect(trials.filter((t) => t.status === 'COMPLETED').length).toBe(12);
    expect(trials.filter((t) => t.status !== 'COMPLETED').length).toBe(3);
  });

  it('still returns active trials when the completed search fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([study('NCT1'), study('NCT2'), study('NCT3')]))
      .mockRejectedValue(new Error('completed search failed'));
    vi.stubGlobal('fetch', fetchMock);

    const { trials, debug } = await searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 });
    expect(trials.length).toBe(3);
    expect(debug.levels[0].error).toBe('completed search failed');
  });

  it('throws when every search fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchClinicalTrials(PATIENT, { now: NOW, retryDelayMs: 0 })).rejects.toThrow('network down');
  });

  it('requires a primary site', async () => {
    await expect(searchClinicalTrials({ primary_site: '', histology_description: '', biomarkers: [] })).rejects.toThrow('Primary site is required.');
  });
});

describe('fetchStudies retry', () => {
  it('retries HTML responses up to 5 attempts then fails', async () => {
    const html = mockResponse({ contentType: 'text/html', body: '<!DOCTYPE html><html></html>' });
    const fetchMock = vi.fn().mockResolvedValue(html);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStudies(new URLSearchParams({ q: 'x' }), { retryDelayMs: 0 })).rejects.toThrow('non-JSON');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('succeeds when a later attempt returns JSON', async () => {
    const html = mockResponse({ contentType: 'text/html', body: '<html></html>' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(html)
      .mockResolvedValueOnce(html)
      .mockResolvedValueOnce(html)
      .mockResolvedValueOnce(jsonResponse([study('NCT1')]));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchStudies(new URLSearchParams({ q: 'x' }), { retryDelayMs: 0 });
    expect(data.studies.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a clean JSON error response', async () => {
    const err = mockResponse({ status: 400, body: JSON.stringify({ error: 'bad request' }) });
    const fetchMock = vi.fn().mockResolvedValue(err);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStudies(new URLSearchParams({ q: 'x' }), { retryDelayMs: 0 })).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ranking', () => {
  it('scores site, histology and biomarker matches', () => {
    const trial = { title: 'Lung Cancer Adenocarcinoma EGFR', conditions: ['Lung Cancer'], interventions: [] };
    expect(scoreTrial(trial, { site: 'lung cancer', histology: 'adenocarcinoma', biomarkers: ['EGFR'] })).toBe(7);
    expect(scoreTrial({ title: 'Breast Cancer', conditions: [], interventions: [] }, { site: 'lung cancer', histology: 'adenocarcinoma', biomarkers: ['EGFR'] })).toBe(0);
  });

  it('ranks active trials first and higher match scores first', () => {
    const trials = [
      { nctId: 'NCT1', title: 'Lung Cancer Adenocarcinoma EGFR', status: 'RECRUITING', conditions: ['Lung Cancer'], interventions: [], completionDate: null, startDate: '2025-01-01' },
      { nctId: 'NCT2', title: 'Lung Cancer trial', status: 'RECRUITING', conditions: ['Lung Cancer'], interventions: [], completionDate: null, startDate: '2025-01-01' },
      { nctId: 'NCT3', title: 'Lung Cancer trial', status: 'COMPLETED', conditions: ['Lung Cancer'], interventions: [], completionDate: '2026-05-01', startDate: '2024-01-01' },
    ];
    const ranked = rankTrials(trials, PATIENT);
    expect(ranked.map((t) => t.nctId)).toEqual(['NCT1', 'NCT2', 'NCT3']);
  });
});