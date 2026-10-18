export type Token = { text: string; tag?: 'com' | 'str' | 'key' | 'num' | 'fn' };

const RX_JS = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(`(?:\\[\s\S]|[^`\\])*`?|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?)|\b(const|let|var|function|return|if|else|for|while|do|new|async|await|try|catch|finally|throw|class|extends|import|export|from|of|in|typeof|instanceof|true|false|null|undefined|this|switch|case|break|continue|default)\b|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()/g;

// Capture group index -> tag (group 0 is the whole match, so this array is
// indexed 1-5 for the regex's 5 capturing groups above, in order: comment,
// string, keyword, number, function-call-position identifier):
const MAP_JS = [0, 'com', 'str', 'key', 'num', 'fn'] as const;

export function tokenizeJs(code: string): Token[] {
  // RX_JS is a module-level /g regex, so its `lastIndex` carries over between
  // calls -- resetting it here is what makes reusing the single instance
  // equivalent to the fresh `new RegExp(RX_JS.source, 'g')` this used to
  // allocate on every call. (OrbitVisual's typing loop calls this ~17x/sec.)
  RX_JS.lastIndex = 0;
  const re = RX_JS;
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }

    // untagged text before this match
    if (m.index > last) {
      out.push({ text: code.slice(last, m.index) });
    }

    // find which capturing group matched
    let g = 1;
    while (m[g] === undefined) {
      g++;
    }

    // the match itself, tagged
    const tag = MAP_JS[g as 1 | 2 | 3 | 4 | 5];
    out.push({ text: m[0], tag });

    last = m.index + m[0].length;
  }

  // trailing untagged text
  if (last < code.length) {
    out.push({ text: code.slice(last) });
  }

  return out;
}
