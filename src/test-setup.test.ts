it('provides a window.matchMedia stub', () => {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  expect(typeof mql.addEventListener).toBe('function');
  expect(() => mql.addEventListener('change', () => {})).not.toThrow();
});
