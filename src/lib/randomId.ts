const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateSessionId(length = 10): string {
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}
