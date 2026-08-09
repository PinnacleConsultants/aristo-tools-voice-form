/**
 * ClinicalTrials.gov query construction + patient-input normalization.
 * Pure functions — no DOM, no fetch — so they can be lifted into the main
 * application and unit-tested without a browser.
 */

/** Cancer-type suffixes — if already present, do not blindly append "Cancer". */
const CANCER_SUFFIXES = ['cancer', 'carcinoma', 'tumor', 'tumour', 'neoplasm', 'sarcoma', 'lymphoma', 'leukemia', 'leukaemia', 'melanoma', 'glioma', 'blastoma'];

/**
 * Biomarker alias map — canonical key -> accepted variants.
 * Canonical keys are normalized ARISTO gene names; the ARISTO display forms
 * (e.g. "HER2/neu (FISH)", "Somatic BRCA 2 mutation") are included as aliases
 * along with common clinical synonyms. Unknown biomarkers not listed here still
 * work: canonicalBiomarker falls back to the flattened token, so markers added
 * to the data later are handled without code changes.
 */
export const BIOMARKER_ALIASES = {
  // ---- Existing / lung-focused markers ----
  PDL1: ['PDL1', 'PD-L1', 'PD L1', 'CD274'],
  HER2: ['HER2', 'HER-2', 'ERBB2', 'HER2NEU', 'HER2NEUFISH', 'HER2NEUIHC'],
  EGFR: ['EGFR', 'ERBB1'],
  ALK: ['ALK'],
  ROS1: ['ROS1', 'ROS 1'],
  KRAS: ['KRAS'],
  BRAF: ['BRAF', 'BRAFV600E', 'BRAFV600K'],
  BRCA1: ['BRCA1', 'BRCA 1', 'SOMATICBRCA1', 'GERMLINEBRCA1'],
  BRCA2: ['BRCA2', 'BRCA 2', 'SOMATICBRCA2', 'GERMLINEBRCA2'],
  NTRK: ['NTRK', 'NTRK1', 'NTRK2', 'NTRK3', 'NTRK123'],
  MET: ['MET', 'METEXON14', 'METEXON14SKIPPING'],
  RET: ['RET'],
  FGFR: ['FGFR'],
  MSIH: ['MSI-H', 'MSIH', 'MSI H'],
  TMBH: ['TMB-H', 'TMBH', 'TMB H'],
  // ---- ARISTO biomarker list ----
  MSH6: ['MSH6'],
  MSI: ['MSI'],
  MLH1: ['MLH1'],
  KIT: ['KIT', 'C-KIT', 'CKIT', 'CD117'],
  AR: ['AR', 'ANDROGENRECEPTOR', 'ANDROGEN RECEPTOR'],
  IDH: ['IDH'],
  IDH1: ['IDH1'],
  IDH2: ['IDH2'],
  ATRX: ['ATRX'],
  TP53: ['TP53', 'P53'],
  SDH: ['SDH', 'SDHSUCCINATEDEHYDROGENASE', 'SDHSUCCINATE', 'SUCCINATEDEHYDROGENASE'],
  KI67: ['KI67', 'KI 67', 'MIB67'],
  NRAS: ['NRAS'],
  PMS2: ['PMS2'],
  MMR: ['MMR', 'MMRIHC'],
  NF1: ['NF1', 'NF1NEUROFIBROMATOSIS'],
  '1P19Q': ['1P19Q', '1P19QDELETION', '1P/19Q'],
  PR: ['PR'],
  ER: ['ER'],
  P16: ['P16', 'CDKN2A'],
  P40: ['P40'],
  TTF1: ['TTF1', 'TTF-1', 'NKX21'],
  WT1: ['WT1'],
  MIB1: ['MIB1', 'MIB 1'],
};

/** Qualifier words stripped from biomarker input (e.g. "EGFR mutation" -> "EGFR"). */
const BIOMARKER_QUALIFIERS = [
  'mutation', 'positive', 'negative', 'rearrangement', 'amplification', 'overexpression',
  'fusion', 'expression', 'status', 'wild', 'type', 'test', 'amplified', 'overexpressed',
  'fish', 'ihc', 'skipping', 'gene', 'deletion',
];

/** Minimal field set needed for the UI and post-processing. */
export const FIELDS = [
  'protocolSection.identificationModule.nctId',
  'protocolSection.identificationModule.briefTitle',
  'protocolSection.statusModule.overallStatus',
  'protocolSection.statusModule.startDateStruct.date',
  'protocolSection.statusModule.completionDateStruct.date',
  'protocolSection.statusModule.lastUpdatePostDateStruct.date',
  'protocolSection.descriptionModule.briefSummary',
  'protocolSection.conditionsModule.conditions',
  'protocolSection.designModule.phases',
  'protocolSection.armsInterventionsModule.interventions',
];

export const PAGE_SIZE = 20;

/** Progressive fallback levels — most specific first. */
export const SEARCH_LEVELS = [
  { level: 1, useHistology: true, useBiomarkers: true },
  { level: 2, useHistology: false, useBiomarkers: true },
  { level: 3, useHistology: true, useBiomarkers: false },
  { level: 4, useHistology: false, useBiomarkers: false },
];

/** "Lung" -> "Lung Cancer"; leaves values that already carry a cancer type untouched. */
export function normalizePrimarySite(input) {
  const value = String(input || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  const lower = value.toLowerCase();
  if (CANCER_SUFFIXES.some((suffix) => lower.includes(suffix))) return value;
  return `${value} Cancer`;
}

/** Title-cases a histology value ("adenocarcinoma" -> "Adenocarcinoma"). */
export function normalizeHistology(input) {
  const value = String(input || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Canonical form of a single biomarker token ("PD-L1" -> "PDL1"). */
export function canonicalBiomarker(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '';
  let core = value.replace(/[^A-Z0-9]/g, '');
  for (const qualifier of BIOMARKER_QUALIFIERS) {
    const q = qualifier.toUpperCase();
    if (core.endsWith(q) && core.length > q.length) core = core.slice(0, -q.length);
  }
  for (const [canonical, aliases] of Object.entries(BIOMARKER_ALIASES)) {
    if (aliases.some((alias) => alias.toUpperCase().replace(/[^A-Z0-9]/g, '') === core)) return canonical;
  }
  return core;
}

/** Normalizes a list of positive biomarkers to deduplicated canonical tokens. */
export function normalizeBiomarkers(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const canonical = canonicalBiomarker(item);
    if (canonical && !seen.has(canonical)) { seen.add(canonical); out.push(canonical); }
  }
  return out;
}

/** Flattened alias forms for a canonical biomarker (used for local matching). */
export function biomarkerAliasForms(canonical) {
  const aliases = BIOMARKER_ALIASES[canonical] || [canonical];
  return aliases.map((alias) => alias.toUpperCase().replace(/[^A-Z0-9]/g, ''));
}

/** YYYY-MM-DD for a local date. */
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dynamic "recently completed" window: [today - months, today]. Never hard-coded. */
export function recentCompletionRange(months = 6, now = new Date()) {
  const until = toISODate(now);
  const since = new Date(now);
  since.setMonth(since.getMonth() - months);
  return { since: toISODate(since), until };
}

/**
 * Builds the /studies query for a given fallback level.
 * patient: { primary_site, histology_description, biomarkers[] }
 * options: { statuses, completionDate: {since, until} }
 * Returns null when no primary site is supplied.
 */
export function buildQuery(patient, level, { statuses = [], completionDate = null } = {}) {
  const site = normalizePrimarySite(patient.primary_site);
  if (!site) return null;
  const histology = normalizeHistology(patient.histology_description);
  const biomarkers = normalizeBiomarkers(patient.biomarkers);
  const config = SEARCH_LEVELS.find((item) => item.level === level) || SEARCH_LEVELS[SEARCH_LEVELS.length - 1];

  const params = new URLSearchParams();
  const condParts = [site];
  if (config.useHistology && histology) condParts.push(histology);
  params.set('query.cond', condParts.join(' AND '));

  if (config.useBiomarkers && biomarkers.length) params.set('query.term', biomarkers.join(' OR '));
  if (statuses.length) params.set('filter.overallStatus', statuses.join(','));
  if (completionDate) params.set('filter.advanced', `AREA[CompletionDate]RANGE[${completionDate.since},${completionDate.until}]`);
  params.set('fields', FIELDS.join(','));
  params.set('pageSize', String(PAGE_SIZE));
  return params;
}