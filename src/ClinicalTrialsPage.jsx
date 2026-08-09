/**
 * Clinical Trials Discovery POC page.
 *
 * Patient input form (primary site, histology, positive biomarkers) wired to
 * the ClinicalTrials.gov search service and the reusable ClinicalTrialsSidebar.
 * The sidebar itself knows nothing about the API — in ARISTO the form values
 * would come from the extracted patient profile instead.
 */
import { useCallback, useState } from 'react';
import { searchClinicalTrials } from './clinicalTrials/service.js';
import { ClinicalTrialsSidebar } from './clinicalTrials/ClinicalTrialsSidebar.jsx';
import './clinicalTrials/clinicalTrials.css';

const COMMON_SITES = ['Lung', 'Breast', 'Colon', 'Rectum', 'Prostate', 'Ovary', 'Pancreas', 'Stomach', 'Liver', 'Kidney', 'Bladder', 'Cervix', 'Uterus', 'Esophagus', 'Head and Neck', 'Skin', 'Brain', 'Thyroid', 'Colorectal'];
const COMMON_HISTOLOGIES = ['Adenocarcinoma', 'Squamous cell carcinoma', 'Invasive ductal carcinoma', 'Small cell carcinoma', 'Non-small cell carcinoma', 'Clear cell carcinoma', 'Mucinous carcinoma'];
const COMMON_BIOMARKERS = [
  'PD-L1', 'EGFR', 'ALK', 'ROS1', 'KRAS', 'BRAF', 'HER2', 'BRCA1', 'BRCA2', 'NTRK', 'MET', 'RET', 'FGFR', 'MSI-H', 'TMB-H',
  'MSH6', 'MSI', 'MLH1', 'c-KIT', 'Androgen Receptor', 'IDH', 'IDH1', 'IDH2', 'ATRX', 'p53', 'SDH', 'Ki-67', 'NRAS', 'PMS2', 'MMR', 'NF1', '1p19q', 'PR', 'ER', 'p16', 'p40', 'TTF1', 'WT1', 'MIB1',
];

export function ClinicalTrialsPage() {
  const [site, setSite] = useState('');
  const [histology, setHistology] = useState('');
  const [biomarkers, setBiomarkers] = useState([]);
  const [biomarkerInput, setBiomarkerInput] = useState('');
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState(null);

  const addBiomarker = () => {
    const value = biomarkerInput.trim();
    if (!value) return;
    setBiomarkers((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setBiomarkerInput('');
  };

  const runSearch = useCallback(async () => {
    if (!site.trim()) return;
    setLoading(true);
    setError(null);
    setTrials([]);
    setDebug(null);
    try {
      const result = await searchClinicalTrials({ primary_site: site, histology_description: histology, biomarkers });
      setTrials(result.trials);
      setDebug(result.debug);
    } catch (err) {
      console.error('Clinical trials search failed:', err);
      setError('ClinicalTrials.gov is currently unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [site, histology, biomarkers]);

  return (
    <div className="ct-page">
      <header className="ct-header">
        <div>
          <span className="eyebrow">Clinical POC · Clinical Trials Discovery</span>
          <h1>Clinical Trials Discovery</h1>
          <p>Find ongoing and recently completed cancer trials relevant to the patient profile.</p>
        </div>
      </header>

      <div className="ct-layout">
        <form className="ct-form" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
          <label className="ct-field">
            <span>Primary Site <b>*</b></span>
            <input list="ct-sites" value={site} onChange={(event) => setSite(event.target.value)} placeholder="e.g. Lung" required />
            <datalist id="ct-sites">{COMMON_SITES.map((item) => <option key={item} value={item} />)}</datalist>
          </label>

          <label className="ct-field">
            <span>Histology</span>
            <input list="ct-histologies" value={histology} onChange={(event) => setHistology(event.target.value)} placeholder="e.g. Adenocarcinoma" />
            <datalist id="ct-histologies">{COMMON_HISTOLOGIES.map((item) => <option key={item} value={item} />)}</datalist>
          </label>

          <div className="ct-field">
            <span>Positive Biomarkers</span>
            <div className="ct-biomarker-input">
              <input
                list="ct-biomarkers"
                value={biomarkerInput}
                onChange={(event) => setBiomarkerInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addBiomarker(); } }}
                placeholder="e.g. EGFR"
              />
              <button type="button" onClick={addBiomarker}>Add</button>
            </div>
            <datalist id="ct-biomarkers">{COMMON_BIOMARKERS.map((item) => <option key={item} value={item} />)}</datalist>
            {biomarkers.length > 0 && (
              <div className="ct-chips">
                {biomarkers.map((item) => (
                  <span key={item} className="ct-chip">
                    {item}
                    <button type="button" aria-label={`Remove ${item}`} onClick={() => setBiomarkers((prev) => prev.filter((value) => value !== item))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="ct-submit" disabled={loading}>
            {loading ? 'Searching…' : 'Find Clinical Trials'}
          </button>

          {debug && (
            <details className="ct-debug">
              <summary>Debug / search details</summary>
              <pre>{JSON.stringify(debug, null, 2)}</pre>
            </details>
          )}
        </form>

        <ClinicalTrialsSidebar trials={trials} loading={loading} error={error} onRetry={runSearch} />
      </div>
    </div>
  );
}