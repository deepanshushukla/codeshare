import type { SessionType } from '../features/session/sessionType';

export const UNTITLED_WEB = 'Untitled Web Room';
export const UNTITLED_REACT = 'Untitled React Room';

type TitleSource = {
  html: string;
  js: string;
  app_jsx: string;
  components_jsx?: string;
};

// Text every new room starts with (the starter heading) and the fallbacks.
// Compared loosely -- case, emoji, spacing and punctuation ignored -- so
// "Welcome to CodeShare 👋" and "welcome to codeshare!" both count.
const GENERIC = new Set(['welcometocodeshare', 'untitledwebroom', 'untitledreactroom', 'app', 'hello', 'helloworld']);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True for an empty title or one that only reflects the starter content. */
export function isGenericTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const key = normalize(title);
  return key === '' || GENERIC.has(key);
}

/**
 * Derives a room's title from its code: the first meaningful <title>, heading,
 * comment or named function/component. The starter text every room is born
 * with ("Welcome to CodeShare 👋") is skipped, so a room is named after what
 * its author actually wrote; with nothing to go on it stays "Untitled …"
 * (My Rooms numbers those so they stay tell-apart-able).
 */
export function titleFromCode(sessionType: SessionType, content: TitleSource): string {
  const candidates =
    sessionType === 'react'
      ? [
          ...jsxTexts(content.app_jsx),
          ...comments(content.app_jsx),
          ...functionNames(content.app_jsx),
          ...functionNames(content.components_jsx ?? ''),
        ]
      : [
          ...tagTexts(content.html, 'title'),
          ...tagTexts(content.html, 'h[1-6]'),
          ...comments(content.js),
          ...htmlComments(content.html),
          ...functionNames(content.js),
        ];

  const title = candidates.map(clean).find((text) => text && !isGenericTitle(text));
  return (title ?? (sessionType === 'react' ? UNTITLED_REACT : UNTITLED_WEB)).slice(0, 60);
}

function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function allMatches(source: string, re: RegExp): string[] {
  return Array.from(source.matchAll(re), (m) => m[1] ?? '');
}

function tagTexts(html: string, tag: string): string[] {
  return allMatches(html, new RegExp(`<(?:${tag})\\b[^>]*>([\\s\\S]*?)</(?:${tag})>`, 'gi'));
}

function htmlComments(html: string): string[] {
  return allMatches(html, /<!--([\s\S]*?)-->/g);
}

function comments(js: string): string[] {
  return [
    ...allMatches(js, /\/\/[ \t]*(.+)/g),
    ...allMatches(js, /\/\*+([\s\S]*?)\*\//g).map((c) => c.replace(/^\s*\*/gm, '')),
  ];
}

function jsxTexts(jsx: string): string[] {
  return allMatches(jsx, />([^<>]+)</g).filter((t) => /[a-z]/i.test(t.replace(/\{[^}]*\}/g, '')));
}

/** Named functions/classes/arrow components, split into words: "TodoList" → "Todo List". */
function functionNames(js: string): string[] {
  const names = [
    ...allMatches(js, /\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g),
    ...allMatches(js, /\bconst\s+([A-Z][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g),
  ];
  return names.map((n) => {
    const words = n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  });
}
