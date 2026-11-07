import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OutputFrame from './OutputFrame';

test('does not post a live update before the iframe has fired onLoad', () => {
  const { rerender } = render(
    <OutputFrame html="<p>a</p>" css="" js="" runToken={0} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  const postMessage = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

  // No fireEvent.load yet -- the app has not been told the sandboxed
  // document (and its bridge script's message listener) actually exists.
  rerender(<OutputFrame html="<p>b</p>" css="" js="" runToken={0} onWindowReady={() => {}} />);

  expect(postMessage).not.toHaveBeenCalled();
});

test('posts a live update with the latest html/css when they change, without remounting the iframe', () => {
  const { rerender } = render(
    <OutputFrame html="<p>a</p>" css="p{color:red}" js="" runToken={0} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  fireEvent.load(iframe);
  const postMessage = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

  rerender(<OutputFrame html="<p>b</p>" css="p{color:blue}" js="" runToken={0} onWindowReady={() => {}} />);

  expect(postMessage).toHaveBeenCalledWith({ type: 'update', html: '<p>b</p>', css: 'p{color:blue}' }, '*');
  // Same element, not torn down and recreated -- a remount would re-run the
  // user's JS, which is exactly what this live path must never do.
  expect(screen.getByTitle<HTMLIFrameElement>('Output')).toBe(iframe);
});

test('does not post a live update when only js changes', () => {
  const { rerender } = render(
    <OutputFrame html="<p>a</p>" css="" js="console.log(1)" runToken={0} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  fireEvent.load(iframe);
  const postMessage = vi.spyOn(iframe.contentWindow as Window, 'postMessage');

  rerender(<OutputFrame html="<p>a</p>" css="" js="console.log(2)" runToken={0} onWindowReady={() => {}} />);

  expect(postMessage).not.toHaveBeenCalled();
});

// Without 'allow-modals', the browser silently swallows alert/confirm/prompt
// calls from user JS ("Ignored call to 'alert()'...") -- surprising in a
// code playground where showing a dialog is a completely normal thing to
// write. Safe to allow: runToken is local React state (see
// SessionWorkspace.tsx), never broadcast, so the dialog only ever blocks the
// tab of whoever clicked Run themselves, not other participants' browsers.
test('allows modal dialogs (alert/confirm/prompt) from user code', () => {
  render(<OutputFrame html="" css="" js="" runToken={0} onWindowReady={() => {}} />);
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');

  expect(iframe.getAttribute('sandbox')).toContain('allow-modals');
});

test('builds a React sandbox document on Run for a react session', () => {
  render(
    <OutputFrame sessionType="react" appJsx="function App(){return null;}" componentsJsx="" reactCss=""
      runToken={1} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  expect(iframe.srcdoc).toContain('Babel.transform');
});

test('does not post html/css live-update messages for a react session', () => {
  const { rerender } = render(
    <OutputFrame sessionType="react" appJsx="a" componentsJsx="" reactCss="" runToken={0} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  fireEvent.load(iframe);
  const postMessage = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
  rerender(<OutputFrame sessionType="react" appJsx="b" componentsJsx="" reactCss="" runToken={0} onWindowReady={() => {}} />);
  expect(postMessage).not.toHaveBeenCalled();
});
