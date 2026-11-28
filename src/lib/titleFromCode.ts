import type { SessionType } from '../features/session/sessionType';

export function titleFromCode(
  sessionType: SessionType,
  content: { html: string; js: string; app_jsx: string }
): string {
  let title: string | null = null;

  if (sessionType === 'web') {
    // Try to extract from <title> tag
    title = extractTitleTag(content.html);

    // Try to extract first heading
    if (!title) {
      title = extractFirstHeading(content.html);
    }

    // Try to extract first // comment in JS
    if (!title) {
      title = extractFirstJSComment(content.js);
    }

    // Fallback
    if (!title) {
      title = 'Untitled Web Room';
    }
  } else if (sessionType === 'react') {
    // Try to extract first JSX text content
    title = extractJSXText(content.app_jsx);

    // Try to extract function name
    if (!title) {
      title = extractFunctionName(content.app_jsx);
    }

    // Fallback
    if (!title) {
      title = 'Untitled React Room';
    }
  }

  // Trim and truncate to 60 characters
  return (title || '').trim().slice(0, 60);
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractFirstHeading(html: string): string | null {
  const match = html.match(/<h[1-6][^>]*>([^<]*)<\/h[1-6]>/i);
  return match ? match[1].trim() : null;
}

function extractFirstJSComment(js: string): string | null {
  const match = js.match(/\/\/\s*(.+)/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

function extractJSXText(app_jsx: string): string | null {
  // Look for text between > and < that isn't pure whitespace
  const match = app_jsx.match(/>([^<]+)<\/[a-zA-Z]/);
  if (match) {
    const text = match[1].trim();
    if (text.length > 0 && text !== '') {
      return text;
    }
  }
  return null;
}

function extractFunctionName(app_jsx: string): string | null {
  const match = app_jsx.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  return match ? match[1] : null;
}
