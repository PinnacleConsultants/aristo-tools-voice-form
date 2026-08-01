const nullable = (type) => ({ type: [type, 'null'] });

const complaintSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    complaint: nullable('string'), frequency: nullable('string'), severity: nullable('string'),
    duration_value: nullable('integer'), duration_unit: nullable('string'), date: nullable('string'),
  },
  required: ['complaint', 'frequency', 'severity', 'duration_value', 'duration_unit', 'date'],
};

const diagnosisSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    diagnosis: nullable('string'), duration_value: nullable('integer'), duration_unit: nullable('string'),
    comments: nullable('string'), date: nullable('string'),
  },
  required: ['diagnosis', 'duration_value', 'duration_unit', 'comments', 'date'],
};

const prescriptionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    medicine: nullable('string'), dose: nullable('string'), when: nullable('string'),
    duration_value: nullable('integer'), duration_unit: nullable('string'), instructions: nullable('string'),
    date: nullable('string'),
  },
  required: ['medicine', 'dose', 'when', 'duration_value', 'duration_unit', 'instructions', 'date'],
};

const treatmentSchema = {
  type: 'object', additionalProperties: false,
  properties: { treatment_type: nullable('string'), description: nullable('string'), date: nullable('string') },
  required: ['treatment_type', 'description', 'date'],
};

export const VISIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    visit_date: nullable('string'), record_time: nullable('string'),
    vitals: {
      type: 'object', additionalProperties: false,
      properties: {
        height_cm: nullable('number'), weight_kg: nullable('number'), pulse_bpm: nullable('integer'),
        temperature_f: nullable('number'), spo2_percent: nullable('integer'), respiratory_rate_bpm: nullable('integer'),
        blood_glucose_mg_dl: nullable('integer'), glucose_test_type: nullable('string'), bsa: nullable('number'), bmi: nullable('number'),
        bp: { type: 'object', additionalProperties: false, properties: { systolic: nullable('integer'), diastolic: nullable('integer') }, required: ['systolic', 'diastolic'] },
      },
      required: ['height_cm', 'weight_kg', 'pulse_bpm', 'temperature_f', 'spo2_percent', 'respiratory_rate_bpm', 'blood_glucose_mg_dl', 'glucose_test_type', 'bsa', 'bmi', 'bp'],
    },
    chief_complaints: { type: 'array', items: complaintSchema },
    history_of_present_illness: nullable('string'),
    clinical_assessment: {
      type: 'object', additionalProperties: false,
      properties: { status_of_disease: nullable('string'), ecog: nullable('string'), kps: nullable('string'), on_examination: nullable('string') },
      required: ['status_of_disease', 'ecog', 'kps', 'on_examination'],
    },
    secondary_diagnosis: { type: 'array', items: diagnosisSchema },
    doctor_prescription: { type: 'array', items: prescriptionSchema },
    treatment: { type: 'array', items: treatmentSchema },
    advice_notes: nullable('string'), tests_requested: { type: 'array', items: { type: 'string' } },
    refer_to: nullable('string'), next_visit: {
      type: 'object', additionalProperties: false,
      properties: { duration_value: nullable('integer'), duration_unit: nullable('string') },
      required: ['duration_value', 'duration_unit'],
    },
    review_notes: nullable('string'),
  },
  required: ['visit_date', 'record_time', 'vitals', 'chief_complaints', 'history_of_present_illness', 'clinical_assessment', 'secondary_diagnosis', 'doctor_prescription', 'treatment', 'advice_notes', 'tests_requested', 'refer_to', 'next_visit', 'review_notes'],
};

export const emptyVisit = (today = new Date()) => {
  const date = today.toISOString().slice(0, 10);
  return {
    visit_date: date, record_time: null,
    vitals: { height_cm: null, weight_kg: null, pulse_bpm: null, temperature_f: null, spo2_percent: null, respiratory_rate_bpm: null, blood_glucose_mg_dl: null, glucose_test_type: null, bsa: null, bmi: null, bp: { systolic: null, diastolic: null } },
    chief_complaints: [], history_of_present_illness: null,
    clinical_assessment: { status_of_disease: null, ecog: null, kps: null, on_examination: null },
    secondary_diagnosis: [], doctor_prescription: [], treatment: [], advice_notes: null, tests_requested: [], refer_to: null,
    next_visit: { duration_value: null, duration_unit: null }, review_notes: null,
  };
};

const asNumber = (value, integer = false) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? (integer ? Math.round(n) : n) : null;
};
const asString = (value) => value === null || value === undefined || value === '' ? null : String(value);
const row = (source, keys) => Object.fromEntries(keys.map((key) => [key, key.includes('value') ? asNumber(source?.[key], true) : asString(source?.[key])]));

export function normalizeVisit(input = {}) {
  const base = emptyVisit();
  const vitals = input.vitals || {};
  const bp = vitals.bp || {};
  const normalizeRows = (items, keys) => Array.isArray(items) ? items.map((item) => row(item || {}, keys)) : [];
  return {
    ...base,
    visit_date: asString(input.visit_date),
    record_time: asString(input.record_time),
    vitals: {
      height_cm: asNumber(vitals.height_cm), weight_kg: asNumber(vitals.weight_kg), pulse_bpm: asNumber(vitals.pulse_bpm, true),
      temperature_f: asNumber(vitals.temperature_f), spo2_percent: asNumber(vitals.spo2_percent, true), respiratory_rate_bpm: asNumber(vitals.respiratory_rate_bpm, true),
      blood_glucose_mg_dl: asNumber(vitals.blood_glucose_mg_dl, true), glucose_test_type: asString(vitals.glucose_test_type), bsa: asNumber(vitals.bsa), bmi: asNumber(vitals.bmi),
      bp: { systolic: asNumber(bp.systolic, true), diastolic: asNumber(bp.diastolic, true) },
    },
    chief_complaints: normalizeRows(input.chief_complaints, ['complaint', 'frequency', 'severity', 'duration_value', 'duration_unit', 'date']),
    history_of_present_illness: asString(input.history_of_present_illness),
    clinical_assessment: { status_of_disease: asString(input.clinical_assessment?.status_of_disease), ecog: asString(input.clinical_assessment?.ecog), kps: asString(input.clinical_assessment?.kps), on_examination: asString(input.clinical_assessment?.on_examination) },
    secondary_diagnosis: normalizeRows(input.secondary_diagnosis, ['diagnosis', 'duration_value', 'duration_unit', 'comments', 'date']),
    doctor_prescription: normalizeRows(input.doctor_prescription, ['medicine', 'dose', 'when', 'duration_value', 'duration_unit', 'instructions', 'date']),
    treatment: normalizeRows(input.treatment, ['treatment_type', 'description', 'date']),
    advice_notes: asString(input.advice_notes), tests_requested: Array.isArray(input.tests_requested) ? input.tests_requested.map(String).filter(Boolean) : [],
    refer_to: asString(input.refer_to), next_visit: { duration_value: asNumber(input.next_visit?.duration_value, true), duration_unit: asString(input.next_visit?.duration_unit) }, review_notes: asString(input.review_notes),
  };
}
