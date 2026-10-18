import { tokenizeJs } from './highlightJs';

it('tags keywords, strings, and call-position identifiers, leaving plain text untagged', () => {
  const tokens = tokenizeJs("function greet(name) {\n  console.log(`Hi`);\n}");
  expect(tokens).toEqual(expect.arrayContaining([
    { text: 'function', tag: 'key' },
    { text: 'greet', tag: 'fn' },
    { text: '`Hi`', tag: 'str' },
  ]));
  expect(tokens.some((t) => t.text === '(' && !t.tag)).toBe(true);
});

it('tags line comments', () => {
  expect(tokenizeJs('// hi\nx')).toEqual(expect.arrayContaining([{ text: '// hi', tag: 'com' }]));
});
