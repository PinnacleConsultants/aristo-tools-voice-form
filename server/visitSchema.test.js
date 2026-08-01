import { describe, expect, it } from 'vitest';
import { emptyVisit, normalizeVisit } from './visitSchema.js';

describe('OP Visit schema normalization', () => {
  it('keeps absent values null and normalizes numeric strings', () => {
    const visit = normalizeVisit({ vitals: { pulse_bpm: '78', weight_kg: '62.5' }, advice_notes: '' });
    expect(visit.vitals.pulse_bpm).toBe(78);
    expect(visit.vitals.weight_kg).toBe(62.5);
    expect(visit.vitals.bp.systolic).toBeNull();
    expect(visit.advice_notes).toBeNull();
  });

  it('normalizes dynamic rows and drops malformed list values', () => {
    const visit = normalizeVisit({ chief_complaints: [{ complaint: 'fever', duration_value: '3' }], treatment: 'not-an-array' });
    expect(visit.chief_complaints[0]).toMatchObject({ complaint: 'fever', duration_value: 3, duration_unit: null });
    expect(visit.treatment).toEqual([]);
  });

  it('provides the complete empty contract', () => {
    const visit = emptyVisit();
    expect(visit).toHaveProperty('vitals.bp');
    expect(visit).toHaveProperty('clinical_assessment');
    expect(visit).toHaveProperty('next_visit');
    expect(visit.tests_requested).toEqual([]);
  });
});
