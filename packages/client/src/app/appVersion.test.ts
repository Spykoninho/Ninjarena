import { describe, expect, it } from 'vitest';
import { isOutdated } from './appVersion';

const index = (script: string) =>
  `<head><script type="module" crossorigin src="${script}"></script></head>`;

describe('isOutdated', () => {
  it('keeps the running bundle while the server still serves it', () => {
    expect(
      isOutdated('/ninjarena/assets/index-a1.js', index('/ninjarena/assets/index-a1.js')),
    ).toBe(false);
  });

  it('asks for a reload once a deployment serves another bundle', () => {
    expect(
      isOutdated('/ninjarena/assets/index-a1.js', index('/ninjarena/assets/index-b2.js')),
    ).toBe(true);
  });

  it('ignores an error page or an empty answer', () => {
    expect(isOutdated('/ninjarena/assets/index-a1.js', '<h1>502 Bad Gateway</h1>')).toBe(false);
    expect(isOutdated('/ninjarena/assets/index-a1.js', '')).toBe(false);
  });
});
