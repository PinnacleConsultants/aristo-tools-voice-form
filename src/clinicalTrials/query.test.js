import { describe, expect, it } from 'vitest';
import { biomarkerAliasForms, buildQuery, canonicalBiomarker, normalizeBiomarkers, normalizeHistology, normalizePrimarySite, recentCompletionRange } from './query.js';

describe('normalizePrimarySite', () => {
  it('appends Cancer to a bare site', () => {
    expect(normalizePrimarySite('Lung')).toBe('Lung Cancer');
    expect(normalizePrimarySite('Breast')).toBe('Breast Cancer');
    expect(normalizePrimarySite('Colon')).toBe('Colon Cancer');
  });

  it('does not blindly append Cancer when already present', () => {
    expect(normalizePrimarySite('Lung Cancer')).toBe('Lung Cancer');
    expect(normalizePrimarySite('Non-small cell lung cancer')).toBe('Non-small cell lung cancer');
    expect(normalizePrimarySite('Hepatocellular Carcinoma')).toBe('Hepatocellular Carcinoma');
  });

  it('handles empty input', () => {
    expect(normalizePrimarySite('')).toBe('');
    expect(normalizePrimarySite('   ')).toBe('');
    expect(normalizePrimarySite(null)).toBe('');
  });
});

describe('normalizeHistology', () => {
  it('title-cases a histology value', () => {
    expect(normalizeHistology('adenocarcinoma')).toBe('Adenocarcinoma');
    expect(normalizeHistology('squamous cell carcinoma')).toBe('Squamous cell carcinoma');
  });

  it('handles empty input', () => {
    expect(normalizeHistology('')).toBe('');
    expect(normalizeHistology(undefined)).toBe('');
  });
});

describe('biomarker normalization', () => {
  it('maps simple variants to a canonical form', () => {
    expect(canonicalBiomarker('PD-L1')).toBe('PDL1');
    expect(canonicalBiomarker('PDL1')).toBe('PDL1');
    expect(canonicalBiomarker('PD L1')).toBe('PDL1');
    expect(canonicalBiomarker('HER-2')).toBe('HER2');
    expect(canonicalBiomarker('ERBB2')).toBe('HER2');
  });

  it('strips qualifier words', () => {
    expect(canonicalBiomarker('EGFR mutation')).toBe('EGFR');
    expect(canonicalBiomarker('ALK rearrangement')).toBe('ALK');
    expect(canonicalBiomarker('HER2 positive')).toBe('HER2');
  });

  it('normalizes and deduplicates a list', () => {
    expect(normalizeBiomarkers(['PD-L1', 'EGFR mutation', 'HER2 positive'])).toEqual(['PDL1', 'EGFR', 'HER2']);
    expect(normalizeBiomarkers(['EGFR', 'EGFR', 'ALK'])).toEqual(['EGFR', 'ALK']);
    expect(normalizeBiomarkers([])).toEqual([]);
    expect(normalizeBiomarkers(['', '  '])).toEqual([]);
  });

  it('exposes flattened alias forms for matching', () => {
    expect(biomarkerAliasForms('HER2')).toEqual(['HER2', 'HER2', 'ERBB2', 'HER2NEU', 'HER2NEUFISH', 'HER2NEUIHC']);
    expect(biomarkerAliasForms('PDL1')).toEqual(['PDL1', 'PDL1', 'PDL1', 'CD274']);
  });

  it('maps the ARISTO biomarker list to canonical forms', () => {
    expect(canonicalBiomarker('HER2/neu (FISH)')).toBe('HER2');
    expect(canonicalBiomarker('Her2 neu (IHC)')).toBe('HER2');
    expect(canonicalBiomarker('MSH6')).toBe('MSH6');
    expect(canonicalBiomarker('MSI')).toBe('MSI');
    expect(canonicalBiomarker('MLH1')).toBe('MLH1');
    expect(canonicalBiomarker('c-KIT')).toBe('KIT');
    expect(canonicalBiomarker('KIT mutation')).toBe('KIT');
    expect(canonicalBiomarker('Androgen Receptor')).toBe('AR');
    expect(canonicalBiomarker('IDH mutation')).toBe('IDH');
    expect(canonicalBiomarker('IDH1 mutation')).toBe('IDH1');
    expect(canonicalBiomarker('IDH2 mutation')).toBe('IDH2');
    expect(canonicalBiomarker('Somatic BRCA 2 mutation')).toBe('BRCA2');
    expect(canonicalBiomarker('Germline BRCA 1 mutation')).toBe('BRCA1');
    expect(canonicalBiomarker('ATRX')).toBe('ATRX');
    expect(canonicalBiomarker('p53 mutation')).toBe('TP53');
    expect(canonicalBiomarker('SDH (Succinate Dehydrogenase)')).toBe('SDH');
    expect(canonicalBiomarker('MET exon 14 skipping')).toBe('MET');
    expect(canonicalBiomarker('Ki 67')).toBe('KI67');
    expect(canonicalBiomarker('NTRK 1/2/3 gene fusion')).toBe('NTRK');
    expect(canonicalBiomarker('NRAS mutation')).toBe('NRAS');
    expect(canonicalBiomarker('BRAF V600E mutation')).toBe('BRAF');
    expect(canonicalBiomarker('PMS2')).toBe('PMS2');
    expect(canonicalBiomarker('MMR (IHC)')).toBe('MMR');
    expect(canonicalBiomarker('NF1 (Neurofibromatosis)')).toBe('NF1');
    expect(canonicalBiomarker('1p19q deletion')).toBe('1P19Q');
    expect(canonicalBiomarker('ROS 1 rearrangement')).toBe('ROS1');
    expect(canonicalBiomarker('PR')).toBe('PR');
    expect(canonicalBiomarker('ER')).toBe('ER');
    expect(canonicalBiomarker('p16')).toBe('P16');
    expect(canonicalBiomarker('p40')).toBe('P40');
    expect(canonicalBiomarker('TTF1')).toBe('TTF1');
    expect(canonicalBiomarker('WT1')).toBe('WT1');
    expect(canonicalBiomarker('Mib1')).toBe('MIB1');
  });

  it('falls back to the flattened token for unknown biomarkers', () => {
    expect(canonicalBiomarker('Some Future Marker')).toBe('SOMEFUTUREMARKER');
  });
});

describe('recentCompletionRange', () => {
  it('computes a dynamic 6-month window ending today', () => {
    const now = new Date('2026-08-09T12:00:00');
    const range = recentCompletionRange(6, now);
    expect(range.until).toBe('2026-08-09');
    expect(range.since).toBe('2026-02-09');
  });
});

describe('buildQuery', () => {
  const patient = { primary_site: 'Lung', histology_description: 'Adenocarcinoma', biomarkers: ['PD-L1', 'EGFR'] };

  it('level 1: site + histology + biomarkers', () => {
    const params = buildQuery(patient, 1, { statuses: ['RECRUITING'] });
    expect(params.get('query.cond')).toBe('Lung Cancer AND Adenocarcinoma');
    expect(params.get('query.term')).toBe('PDL1 OR EGFR');
    expect(params.get('filter.overallStatus')).toBe('RECRUITING');
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('fields')).toContain('protocolSection.identificationModule.nctId');
  });

  it('level 2: site + biomarkers only', () => {
    const params = buildQuery(patient, 2, { statuses: ['RECRUITING'] });
    expect(params.get('query.cond')).toBe('Lung Cancer');
    expect(params.get('query.term')).toBe('PDL1 OR EGFR');
  });

  it('level 3: site + histology only', () => {
    const params = buildQuery(patient, 3, { statuses: ['RECRUITING'] });
    expect(params.get('query.cond')).toBe('Lung Cancer AND Adenocarcinoma');
    expect(params.get('query.term')).toBeNull();
  });

  it('level 4: site only', () => {
    const params = buildQuery(patient, 4, { statuses: ['RECRUITING'] });
    expect(params.get('query.cond')).toBe('Lung Cancer');
    expect(params.get('query.term')).toBeNull();
  });

  it('adds the completion date advanced filter', () => {
    const params = buildQuery(patient, 4, { statuses: ['COMPLETED'], completionDate: { since: '2026-02-09', until: '2026-08-09' } });
    expect(params.get('filter.advanced')).toBe('AREA[CompletionDate]RANGE[2026-02-09,2026-08-09]');
  });

  it('omits histology/biomarkers when absent', () => {
    const params = buildQuery({ primary_site: 'Breast', histology_description: '', biomarkers: [] }, 1, { statuses: ['RECRUITING'] });
    expect(params.get('query.cond')).toBe('Breast Cancer');
    expect(params.get('query.term')).toBeNull();
  });

  it('returns null without a primary site', () => {
    expect(buildQuery({ primary_site: '', histology_description: '', biomarkers: [] }, 1)).toBeNull();
  });
});