import { describe, expect, test } from 'vitest';
import { isGenericTitle, titleFromCode } from './titleFromCode';

describe('titleFromCode', () => {
  test('web: prefers the <title> tag text', () => {
    const title = titleFromCode('web', { html: '<title>My Page</title><h1>Hello</h1>', js: '', app_jsx: '' });
    expect(title).toBe('My Page');
  });

  test('web: falls back to the first heading when there is no <title> tag', () => {
    const title = titleFromCode('web', { html: '<h1>Welcome Aboard</h1>', js: '', app_jsx: '' });
    expect(title).toBe('Welcome Aboard');
  });

  test('web: falls back to the first // comment in JS when HTML has no title or heading', () => {
    const title = titleFromCode('web', { html: '<p>no heading</p>', js: "// Snake game\nconsole.log('hi')", app_jsx: '' });
    expect(title).toBe('Snake game');
  });

  test('web: falls back to "Untitled Web Room" when nothing matches', () => {
    expect(titleFromCode('web', { html: '', js: '', app_jsx: '' })).toBe('Untitled Web Room');
  });

  test('react: prefers the first JSX text content in app_jsx', () => {
    const title = titleFromCode('react', { html: '', js: '', app_jsx: 'function App() {\n  return <h1>Todo List</h1>;\n}' });
    expect(title).toBe('Todo List');
  });

  test('react: falls back to the component function name when there is no JSX text', () => {
    const title = titleFromCode('react', { html: '', js: '', app_jsx: 'function CounterApp() {\n  return <div />;\n}' });
    expect(title).toBe('Counter App');
  });

  test('react: falls back to "Untitled React Room" when nothing matches', () => {
    expect(titleFromCode('react', { html: '', js: '', app_jsx: '' })).toBe('Untitled React Room');
  });

  test('truncates to 60 characters and trims whitespace', () => {
    const long = 'x'.repeat(100);
    const title = titleFromCode('web', { html: `<title>${long}</title>`, js: '', app_jsx: '' });
    expect(title.length).toBe(60);
  });

  test('web: skips the starter heading every room is born with', () => {
    const html = '<h1>Welcome to CodeShare 👋</h1>\n<p>Start typing</p>';
    expect(titleFromCode('web', { html, js: "console.log('Welcome to CodeShare!');", app_jsx: '' })).toBe('Untitled Web Room');
  });

  test('web: a second heading after the starter one names the room', () => {
    const html = '<h1>Welcome to CodeShare 👋</h1>\n<h2>Weather <em>Widget</em></h2>';
    expect(titleFromCode('web', { html, js: '', app_jsx: '' })).toBe('Weather Widget');
  });

  test('web: falls back to a named JS function, split into words', () => {
    expect(titleFromCode('web', { html: '', js: 'function drawSnakeGame() {}', app_jsx: '' })).toBe('Draw Snake Game');
  });

  test('react: skips the starter text and the generic App name', () => {
    const app_jsx = 'function App() {\n  return <h1>Welcome to CodeShare 👋</h1>;\n}';
    expect(titleFromCode('react', { html: '', js: '', app_jsx })).toBe('Untitled React Room');
  });

  test('react: uses a component from components_jsx when App.jsx says nothing', () => {
    const app_jsx = 'function App() {\n  return <TodoList />;\n}';
    const components_jsx = 'const TodoList = () => <ul />;';
    expect(titleFromCode('react', { html: '', js: '', app_jsx, components_jsx })).toBe('Todo List');
  });

  test('isGenericTitle: empty, starter and fallback titles are generic', () => {
    expect(isGenericTitle('')).toBe(true);
    expect(isGenericTitle(null)).toBe(true);
    expect(isGenericTitle('Welcome to CodeShare 👋')).toBe(true);
    expect(isGenericTitle('Untitled React Room')).toBe(true);
    expect(isGenericTitle('Snake')).toBe(false);
  });
});
