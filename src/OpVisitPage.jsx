import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { emptyOpVisit, getAtPath, hasValue, LOOKUPS, scalarPaths, setAtPath, today } from './opVisitData';
import './opVisit.css';

const MIC = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" /></svg>;

async function readApiResponse(response) {
  const body = await response.text();
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch { /* proxy/server returned non-JSON */ }
  if (!response.ok) throw new Error(data.error || `API unavailable (${response.status}). Start the API with npm run dev:server.`);
  if (!data.visit) throw new Error('The API returned an incomplete response. Check that the API server is running.');
  return data;
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}

function Input({ label, value, onChange, type = 'text', placeholder, options, className = '' }) {
  return <label className={`op-field ${className}`}><span>{label}</span>{options ? <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Select</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}</label>;
}

function TextArea({ label, value, onChange }) { return <label className="op-field op-wide"><span>{label}</span><textarea rows="3" value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>; }

function Section({ title, children, action }) { return <section className="op-section"><div className="op-section-title"><h2>{title}</h2>{action}</div>{children}</section>; }

function TableEditor({ columns, rows, onChange, onAdd, onRemove }) {
  return <div className="op-table-wrap"><table className="op-table"><thead><tr><th>#</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th /></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}><td>{index + 1}</td>{columns.map((column) => <td key={column.key}>{column.options ? <><select value={column.options.includes(row[column.key]) ? row[column.key] : (row[column.key] ? 'Other' : '')} onChange={(e) => onChange(index, column.key, e.target.value)}><option value="">Select</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>{column.options.includes('Other') && (row[column.key] === 'Other' || (row[column.key] && !column.options.includes(row[column.key]))) && <input className="custom-option" value={row[column.key] === 'Other' ? '' : row[column.key]} placeholder="Enter custom value" onChange={(e) => onChange(index, column.key, e.target.value)} />}</> : <input type={column.type || 'text'} value={row[column.key] ?? ''} placeholder={column.placeholder} onChange={(e) => onChange(index, column.key, e.target.value)} />}</td>)}<td><button type="button" className="op-remove" onClick={() => onRemove(index)} aria-label="Remove row">×</button></td></tr>)}</tbody></table><button type="button" className="op-add" onClick={onAdd}>+ Add row</button></div>;
}

function ReviewPanel({ transcript, proposal, onChange, selected, setSelected, onApply, onClose, busy }) {
  const [tab, setTab] = useState('review');
  const toggle = (id) => setSelected((current) => ({ ...current, [id]: !current[id] }));
  const suggestions = scalarPaths.map(([path, label]) => ({ id: path, path, label, value: getAtPath(proposal, path) })).filter((item) => hasValue(item.value));
  const lists = [
    ['chief_complaints', 'Chief complaints'], ['secondary_diagnosis', 'Secondary diagnosis'], ['doctor_prescription', 'Doctor prescriptions'], ['treatment', 'Treatment'],
  ].map(([id, label]) => ({ id, label, rows: proposal[id] || [] })).filter((item) => item.rows.length);
  const editRow = (section, rowIndex, key, value) => onChange({ ...proposal, [section]: proposal[section].map((row, index) => index === rowIndex ? { ...row, [key]: value } : row) });
  return <aside className="review-panel"><div className="review-head"><div><span className="eyebrow">AI suggestion</span><h2>Review before applying</h2></div><button type="button" className="icon-close" onClick={onClose} aria-label="Close review">×</button></div><div className="review-tabs"><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Proposed fields</button><button className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>Transcript</button></div>{tab === 'transcript' ? <div className="transcript-box">{transcript}</div> : <><p className="review-help">Edit any suggestion, uncheck anything you do not want to apply, then apply the selected values.</p>{suggestions.length ? <div className="suggestion-list">{suggestions.map((item) => <label className="suggestion" key={item.id}><input type="checkbox" checked={selected[item.id] !== false} onChange={() => toggle(item.id)} /><span><b>{item.label}</b><input value={item.value} onChange={(e) => onChange(setAtPath(proposal, item.path, e.target.value))} /></span></label>)}</div> : null}{lists.map((list) => <div className="suggestion-list" key={list.id}><label className="suggestion section-check"><input type="checkbox" checked={selected[list.id] !== false} onChange={() => toggle(list.id)} /><b>{list.label} ({list.rows.length})</b></label>{selected[list.id] !== false && list.rows.map((row, rowIndex) => <div className="review-row" key={rowIndex}><b>Row {rowIndex + 1}</b>{Object.entries(row).map(([key, value]) => <label key={key}><span>{key.replaceAll('_', ' ')}</span><input value={value ?? ''} onChange={(e) => editRow(list.id, rowIndex, key, e.target.value)} /></label>)}</div>)}</div>)}{!suggestions.length && !lists.length && <div className="empty-review">No form fields were found in this dictation.</div>}</>}{tab === 'review' && <div className="review-actions"><button type="button" className="btn ghost" onClick={onClose}>Discard</button><button type="button" className="btn primary" disabled={busy || (!suggestions.length && !lists.length)} onClick={onApply}>Apply selected</button></div>}</aside>;
}

export function OpVisitPage() {
  const [form, setForm] = useState(emptyOpVisit);
  const [engine, setEngine] = useState('browser');
  const [status, setStatus] = useState({ label: 'Ready for dictation', kind: 'ready' });
  const [transcript, setTranscript] = useState('');
  const [proposal, setProposal] = useState(null);
  const [selected, setSelected] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorder = useRef(null); const mediaStream = useRef(null); const chunks = useRef([]); const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  const processTranscript = useCallback(async (text) => {
    if (!text?.trim()) return;
    setTranscript(text); setIsProcessing(true); setStatus({ label: 'Extracting form fields…', kind: 'processing' });
    try {
      const response = await fetch('/api/op-visit/process', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: text }) });
      const data = await readApiResponse(response);
      setProposal(data.visit); setSelected({}); setStatus({ label: 'Ready for review', kind: 'success' });
    } catch (error) { setStatus({ label: error.message, kind: 'error' }); } finally { setIsProcessing(false); }
  }, []);

  const browserRecognition = useSpeechRecognition({ lang: 'en-IN', long: true, onResult: processTranscript, onError: (e) => setStatus({ label: `Browser microphone error: ${e.error}`, kind: 'error' }), onStatus: (label) => setStatus({ label, kind: 'recording' }) });

  useEffect(() => { if (engine !== 'browser' && browserRecognition.isListening) browserRecognition.stop(); }, [engine]);
  useEffect(() => () => { mediaRecorder.current?.stop(); mediaStream.current?.getTracks().forEach((track) => track.stop()); }, []);

  const startSarvam = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setStatus({ label: 'Audio recording is not supported in this browser.', kind: 'error' }); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaStream.current = stream; chunks.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); mediaRecorder.current = recorder; startedAt.current = Date.now(); setElapsed(0);
      const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000); recorder._tick = tick;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.onstop = async () => { clearInterval(tick); stream.getTracks().forEach((track) => track.stop()); mediaStream.current = null; if (!chunks.current.length) { setStatus({ label: 'No audio recorded.', kind: 'error' }); return; } setIsProcessing(true); setStatus({ label: 'Transcribing with Sarvam…', kind: 'processing' }); const audio = new Blob(chunks.current, { type: 'audio/webm' }); try { const response = await fetch('/api/op-visit/process', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audioBase64: await blobToBase64(audio), mimeType: 'audio/webm', filename: 'op-visit.webm', languageCode: 'unknown' }) }); const data = await readApiResponse(response); setTranscript(data.transcript); setProposal(data.visit); setSelected({}); setStatus({ label: 'Ready for review', kind: 'success' }); } catch (error) { setStatus({ label: error.message, kind: 'error' }); } finally { setIsProcessing(false); } };
      recorder.start(); setStatus({ label: 'Recording… tap Stop when finished', kind: 'recording' });
    } catch { setStatus({ label: 'Microphone permission was not granted.', kind: 'error' }); }
  };
  const stopSarvam = () => mediaRecorder.current?.stop();
  const recording = engine === 'browser' ? browserRecognition.isListening : mediaRecorder.current?.state === 'recording';

  const update = (path, value) => setForm((current) => setAtPath(current, path, value));
  const updateRow = (section, index, key, value) => setForm((current) => ({ ...current, [section]: current[section].map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  const addRow = (section, row) => setForm((current) => ({ ...current, [section]: [...current[section], { ...row, date: today() }] }));
  const removeRow = (section, index) => setForm((current) => ({ ...current, [section]: current[section].length > 1 ? current[section].filter((_, rowIndex) => rowIndex !== index) : current[section] }));
  const applyReview = () => { if (!proposal) return; setForm((current) => { let next = current; scalarPaths.forEach(([path]) => { if (selected[path] !== false && hasValue(getAtPath(proposal, path))) next = setAtPath(next, path, getAtPath(proposal, path)); }); ['chief_complaints', 'secondary_diagnosis', 'doctor_prescription', 'treatment'].forEach((section) => { if (selected[section] !== false && proposal[section]?.length) next = { ...next, [section]: [...next[section].filter((row) => Object.values(row).some(hasValue)), ...proposal[section]] }; }); return next; }); setProposal(null); setStatus({ label: 'Applied. Review the form before saving.', kind: 'success' }); };
  const begin = () => { if (isProcessing) return; if (engine === 'browser') { if (browserRecognition.isListening) browserRecognition.stop(); else browserRecognition.start(); } else if (recording) stopSarvam(); else startSarvam(); };

  const testToggle = (name) => <button type="button" className={`engine-toggle ${engine === name ? 'active' : ''}`} onClick={() => setEngine(name)}>{name === 'browser' ? 'Browser recognition' : 'Sarvam AI'}</button>;
  return <div className="op-page"><header className="op-header"><div><span className="eyebrow">Clinical POC · OP Visit</span><h1>Outpatient visit</h1><p>Dictate a visit, review the suggested fields, then apply them to the form.</p></div><div className="dictation-card"><div className="engine-toggle-group" aria-label="Transcription engine">{testToggle('browser')}{testToggle('sarvam')}</div><button type="button" className={`record-button ${recording ? 'recording' : ''}`} onClick={begin} disabled={isProcessing}>{recording ? '■ Stop dictation' : MIC}<span>{recording ? (engine === 'sarvam' ? `${elapsed}s` : 'Listening…') : 'Start smart dictation'}</span></button><div className={`capture-status ${status.kind}`}><span className="status-dot" />{status.label}</div>{engine === 'browser' && browserRecognition.interim && <div className="interim">{browserRecognition.interim}</div>}</div></header>
    <main className="op-form-card"><div className="op-form-top"><div><span className="eyebrow">Visit details</span><h2>OP visit form</h2></div><div className="op-actions"><button type="button" className="btn ghost" onClick={() => setForm(emptyOpVisit())}>Reset</button><button type="button" className="btn primary" onClick={() => navigator.clipboard?.writeText(JSON.stringify(form, null, 2))}>Copy JSON</button></div></div>
      <Section title="Visit details"><div className="op-grid"><Input label="Visit date" type="date" value={form.visit_date} onChange={(value) => update('visit_date', value)} /><Input label="Record time" type="time" value={form.record_time} onChange={(value) => update('record_time', value)} /></div></Section>
      <Section title="Vitals"><div className="op-grid vitals-grid"><Input label="Height (cm)" type="number" value={form.vitals.height_cm} onChange={(value) => update('vitals.height_cm', value)} /><Input label="Weight (kg)" type="number" value={form.vitals.weight_kg} onChange={(value) => update('vitals.weight_kg', value)} /><Input label="Pulse (bpm)" type="number" value={form.vitals.pulse_bpm} onChange={(value) => update('vitals.pulse_bpm', value)} /><Input label="Temperature (°F)" type="number" value={form.vitals.temperature_f} onChange={(value) => update('vitals.temperature_f', value)} /><Input label="BP systolic" type="number" value={form.vitals.bp.systolic} onChange={(value) => update('vitals.bp.systolic', value)} /><Input label="BP diastolic" type="number" value={form.vitals.bp.diastolic} onChange={(value) => update('vitals.bp.diastolic', value)} /><Input label="SpO₂ (%)" type="number" value={form.vitals.spo2_percent} onChange={(value) => update('vitals.spo2_percent', value)} /><Input label="Respiratory rate" type="number" value={form.vitals.respiratory_rate_bpm} onChange={(value) => update('vitals.respiratory_rate_bpm', value)} /><Input label="Blood glucose" type="number" value={form.vitals.blood_glucose_mg_dl} onChange={(value) => update('vitals.blood_glucose_mg_dl', value)} /><Input label="Glucose test" options={['Fasting', 'Random', 'Post Prandial']} value={form.vitals.glucose_test_type} onChange={(value) => update('vitals.glucose_test_type', value)} /><Input label="BSA" type="number" value={form.vitals.bsa} onChange={(value) => update('vitals.bsa', value)} /><Input label="BMI" type="number" value={form.vitals.bmi} onChange={(value) => update('vitals.bmi', value)} /></div></Section>
      <Section title="Chief complaints"><TableEditor rows={form.chief_complaints} onChange={(i, k, v) => updateRow('chief_complaints', i, k, v)} onAdd={() => addRow('chief_complaints', { complaint: '', frequency: '', severity: '', duration_value: '', duration_unit: 'Days' })} onRemove={(i) => removeRow('chief_complaints', i)} columns={[{ key: 'complaint', label: 'Complaint', options: LOOKUPS.complaints }, { key: 'frequency', label: 'Frequency', options: LOOKUPS.frequency }, { key: 'severity', label: 'Severity', options: LOOKUPS.severity }, { key: 'duration_value', label: 'Duration', type: 'number' }, { key: 'duration_unit', label: 'Unit', options: ['Days', 'Weeks', 'Months'] }, { key: 'date', label: 'Date', type: 'date' }]} /></Section>
      <Section title="History of present illness"><TextArea label="Narrative" value={form.history_of_present_illness} onChange={(value) => update('history_of_present_illness', value)} /></Section>
      <Section title="Clinical assessment"><div className="op-grid"><Input label="Status of disease" options={LOOKUPS.status} value={form.clinical_assessment.status_of_disease} onChange={(value) => update('clinical_assessment.status_of_disease', value)} /><Input label="ECOG" options={['0', '1', '2', '3', '4']} value={form.clinical_assessment.ecog} onChange={(value) => update('clinical_assessment.ecog', value)} /><Input label="KPS" options={['100', '90', '80', '70', '60', '50', '40', '30', '20', '10', '0']} value={form.clinical_assessment.kps} onChange={(value) => update('clinical_assessment.kps', value)} /><TextArea label="On examination" value={form.clinical_assessment.on_examination} onChange={(value) => update('clinical_assessment.on_examination', value)} /></div></Section>
      <Section title="Secondary diagnosis"><TableEditor rows={form.secondary_diagnosis} onChange={(i, k, v) => updateRow('secondary_diagnosis', i, k, v)} onAdd={() => addRow('secondary_diagnosis', { diagnosis: '', duration_value: '', duration_unit: 'Days', comments: '' })} onRemove={(i) => removeRow('secondary_diagnosis', i)} columns={[{ key: 'diagnosis', label: 'Diagnosis', options: LOOKUPS.diagnoses }, { key: 'duration_value', label: 'Duration', type: 'number' }, { key: 'duration_unit', label: 'Unit', options: ['Days', 'Weeks', 'Months'] }, { key: 'comments', label: 'Comments' }, { key: 'date', label: 'Date', type: 'date' }]} /></Section>
      <Section title="Doctor prescription"><TableEditor rows={form.doctor_prescription} onChange={(i, k, v) => updateRow('doctor_prescription', i, k, v)} onAdd={() => addRow('doctor_prescription', { medicine: '', dose: '', when: '', duration_value: '', duration_unit: 'Days', instructions: '' })} onRemove={(i) => removeRow('doctor_prescription', i)} columns={[{ key: 'medicine', label: 'Medicine', options: LOOKUPS.medicines }, { key: 'dose', label: 'Dose' }, { key: 'when', label: 'When' }, { key: 'duration_value', label: 'Duration', type: 'number' }, { key: 'duration_unit', label: 'Unit', options: ['Days', 'Weeks', 'Months'] }, { key: 'instructions', label: 'Instructions' }, { key: 'date', label: 'Date', type: 'date' }]} /></Section>
      <Section title="Treatment"><TableEditor rows={form.treatment} onChange={(i, k, v) => updateRow('treatment', i, k, v)} onAdd={() => addRow('treatment', { treatment_type: '', description: '' })} onRemove={(i) => removeRow('treatment', i)} columns={[{ key: 'treatment_type', label: 'Treatment type', options: LOOKUPS.treatments }, { key: 'description', label: 'Description' }, { key: 'date', label: 'Date', type: 'date' }]} /></Section>
      <Section title="Plan and follow-up"><div className="op-grid"><TextArea label="Advice / notes" value={form.advice_notes} onChange={(value) => update('advice_notes', value)} /><Input label="Refer to" value={form.refer_to} onChange={(value) => update('refer_to', value)} /><Input label="Next visit after" type="number" value={form.next_visit.duration_value} onChange={(value) => update('next_visit.duration_value', value)} /><Input label="Next visit unit" options={['Days', 'Weeks', 'Months']} value={form.next_visit.duration_unit} onChange={(value) => update('next_visit.duration_unit', value)} /><TextArea label="Review notes by primary consultant" value={form.review_notes} onChange={(value) => update('review_notes', value)} /></div><label className="op-field op-wide"><span>Tests requested</span><div className="check-grid">{LOOKUPS.tests.map((test) => <label key={test}><input type="checkbox" checked={form.tests_requested.includes(test)} onChange={(e) => setForm((current) => ({ ...current, tests_requested: e.target.checked ? [...current.tests_requested, test] : current.tests_requested.filter((item) => item !== test) }))} /> {test}</label>)}</div></label></Section>
    </main>{proposal && <ReviewPanel transcript={transcript} proposal={proposal} onChange={setProposal} selected={selected} setSelected={setSelected} onApply={applyReview} onClose={() => setProposal(null)} busy={isProcessing} />}</div>;
}
