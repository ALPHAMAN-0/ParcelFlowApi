import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP = 5;
const GROUPS = 2;

export const TRACKING_CODE_PATTERN = new RegExp(`^PF-[${ALPHABET}]{${GROUP}}-[${ALPHABET}]{${GROUP}}$`);


export function generateTrackingCode() {
  const groups = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let chunk = '';
    for (let i = 0; i < GROUP; i += 1) chunk += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(chunk);
  }
  return `PF-${groups.join('-')}`;
}

export function normalizeTrackingCode(input) {
  return String(input ?? '').trim().toUpperCase();
}