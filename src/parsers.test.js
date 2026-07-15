import { describe, it, expect } from 'vitest';
import {
  extractNumber,
  cleanName,
  parseAge,
  parseWeight,
  cleanAddress,
  smartParse,
} from './parsers.js';

describe('extractNumber', () => {
  it('extracts a simple integer', () => {
    expect(extractNumber('my age is 29')).toBe('29');
  });
  it('extracts a decimal', () => {
    expect(extractNumber('weight 62.5')).toBe('62.5');
  });
  it('returns "" when no number is present', () => {
    expect(extractNumber('hello world')).toBe('');
  });
  it('rounds to integer when requested', () => {
    expect(extractNumber('age 29.7', { integer: true })).toBe('30');
  });
});

describe('cleanName', () => {
  it('strips English filler phrases', () => {
    expect(cleanName('my name is Anya')).toBe('Anya');
    expect(cleanName("I'm Rahul")).toBe('Rahul');
    expect(cleanName('call me Arjun')).toBe('Arjun');
  });
  it('strips Hindi filler', () => {
    expect(cleanName('मेरा नाम राहुल')).toBe('राहुल');
  });
  it('strips trailing punctuation', () => {
    expect(cleanName('my name is Anya.')).toBe('Anya');
  });
  it('handles plain names', () => {
    expect(cleanName('Priya')).toBe('Priya');
  });
});

describe('parseAge', () => {
  it('extracts and clamps age', () => {
    expect(parseAge('I am 25')).toBe('25');
    expect(parseAge('age 130')).toBe('130');
    expect(parseAge('age 200')).toBe('130');     // clamped
    expect(parseAge('age -5')).toBe('0');        // clamped
  });
  it('returns "" for no number', () => {
    expect(parseAge('no number here')).toBe('');
  });
});

describe('parseWeight', () => {
  it('keeps kg as-is', () => {
    expect(parseWeight('62 kilos')).toBe('62.0');
  });
  it('converts pounds to kg', () => {
    const kg = parseFloat(parseWeight('150 pounds'));
    expect(kg).toBeCloseTo(68.04, 1);
  });
  it('rounds to 1 decimal', () => {
    expect(parseWeight('62.45')).toBe('62.5');
  });
});

describe('cleanAddress', () => {
  it('replaces spoken "new line" with comma', () => {
    expect(cleanAddress('221 Baker Street new line London')).toBe('221 Baker Street, London');
  });
  it('replaces spoken "comma" with ,', () => {
    expect(cleanAddress('flat 4 comma baker street')).toBe('flat 4, baker street');
  });
  it('normalises whitespace', () => {
    expect(cleanAddress('  221   Baker   Street  ')).toBe('221 Baker Street');
  });
});

describe('smartParse', () => {
  it('parses a full English sentence', () => {
    const r = smartParse('my name is Anya, I am 29, I weigh 62 kilos, my address is 221 Baker Street London');
    expect(r.name).toBe('Anya');
    expect(r.age).toBe('29');
    expect(r.weight).toBe('62.0');
    expect(r.address).toContain('221 Baker Street');
  });
  it('parses Hindi triggers', () => {
    const r = smartParse('मेरा नाम राहुल, उम्र 25, वजन 70 किलो, मेरा पता दिल्ली');
    expect(r.name).toBe('राहुल');
    expect(r.age).toBe('25');
    expect(r.weight).toBe('70.0');
    expect(r.address).toContain('दिल्ली');
  });
  it('parses Marathi triggers', () => {
    const r = smartParse('माझं नाव अर्जुन, वय 28, वजन 75');
    expect(r.name).toBe('अर्जुन');
    expect(r.age).toBe('28');
    expect(r.weight).toBe('75.0');
  });
  it('returns empty strings when no triggers found', () => {
    const r = smartParse('just some random text');
    expect(r).toEqual({ name: '', age: '', weight: '', address: '' });
  });
});
