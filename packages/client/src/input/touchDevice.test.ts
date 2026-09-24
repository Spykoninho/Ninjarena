import { describe, expect, it } from 'vitest';
import { TOUCH_MEDIA_QUERY, usesTouchControls } from './touchDevice';

describe('usesTouchControls', () => {
  it('turns the controls on for a touch-only device and off for a mouse', () => {
    expect(usesTouchControls(null, (query) => query === TOUCH_MEDIA_QUERY)).toBe(true);
    expect(usesTouchControls(null, () => false)).toBe(false);
  });

  it('lets the query string override the device', () => {
    expect(usesTouchControls(true, () => false)).toBe(true);
    expect(usesTouchControls(false, () => true)).toBe(false);
  });
});
