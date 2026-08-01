export const today = () => new Date().toISOString().slice(0, 10);

export function emptyOpVisit() {
  return {
    visit_date: today(), record_time: '',
    vitals: { height_cm: '', weight_kg: '', pulse_bpm: '', temperature_f: '', spo2_percent: '', respiratory_rate_bpm: '', blood_glucose_mg_dl: '', glucose_test_type: '', bsa: '', bmi: '', bp: { systolic: '', diastolic: '' } },
    chief_complaints: [{ complaint: '', frequency: '', severity: '', duration_value: '', duration_unit: 'Days', date: today() }],
    history_of_present_illness: '',
    clinical_assessment: { status_of_disease: '', ecog: '', kps: '', on_examination: '' },
    secondary_diagnosis: [{ diagnosis: '', duration_value: '', duration_unit: 'Days', comments: '', date: today() }],
    doctor_prescription: [{ medicine: '', dose: '', when: '', duration_value: '', duration_unit: 'Days', instructions: '', date: today() }],
    treatment: [{ treatment_type: '', description: '', date: today() }],
    advice_notes: '', tests_requested: [], refer_to: '', next_visit: { duration_value: '', duration_unit: 'Days' }, review_notes: '',
  };
}

export const LOOKUPS = {
  complaints: ['Fever', 'Pain', 'Cough', 'Breathlessness', 'Nausea', 'Fatigue', 'Vomiting'],
  frequency: ['Intermittent', 'Continuous', 'Daily', 'Occasional'],
  severity: ['Mild', 'Moderate', 'Severe'],
  status: ['New', 'Stable', 'Improved', 'Progressive', 'In remission'],
  diagnoses: ['Hypertension', 'Type 2 diabetes', 'Upper respiratory infection', 'Anemia', 'Asthma', 'Other'],
  medicines: ['Paracetamol', 'Amoxicillin', 'Metformin', 'Amlodipine', 'Omeprazole', 'Other'],
  treatments: ['Medication', 'Procedure', 'Physiotherapy', 'Counselling', 'Other'],
  tests: ['CBC', 'HbA1c', 'Blood glucose', 'LFT', 'RFT', 'Chest X-ray', 'Urine routine'],
};

export const scalarPaths = [
  ['visit_date', 'Visit date'], ['record_time', 'Record time'], ['vitals.height_cm', 'Height'], ['vitals.weight_kg', 'Weight'],
  ['vitals.pulse_bpm', 'Pulse'], ['vitals.temperature_f', 'Temperature'], ['vitals.bp.systolic', 'BP systolic'], ['vitals.bp.diastolic', 'BP diastolic'],
  ['vitals.spo2_percent', 'SpO2'], ['vitals.respiratory_rate_bpm', 'Respiratory rate'], ['vitals.blood_glucose_mg_dl', 'Blood glucose'], ['vitals.glucose_test_type', 'Glucose test type'],
  ['vitals.bsa', 'BSA'], ['vitals.bmi', 'BMI'], ['history_of_present_illness', 'History of present illness'], ['clinical_assessment.status_of_disease', 'Disease status'],
  ['clinical_assessment.ecog', 'ECOG'], ['clinical_assessment.kps', 'KPS'], ['clinical_assessment.on_examination', 'On examination'], ['advice_notes', 'Advice / notes'],
  ['refer_to', 'Refer to'], ['next_visit.duration_value', 'Next visit after'], ['next_visit.duration_unit', 'Next visit unit'], ['review_notes', 'Review notes'],
];

export function getAtPath(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
export function setAtPath(object, path, value) {
  const keys = path.split('.'); const result = structuredClone(object); let cursor = result;
  keys.slice(0, -1).forEach((key) => { cursor[key] = { ...cursor[key] }; cursor = cursor[key]; }); cursor[keys.at(-1)] = value; return result;
}

export function hasValue(value) { return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0); }
