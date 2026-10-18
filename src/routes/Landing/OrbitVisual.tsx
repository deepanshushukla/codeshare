import { useEffect, useState } from 'react';
import { tokenizeJs, type Token } from '../../lib/highlightJs';
import styles from './OrbitVisual.module.scss';

// Translated from the design handoff's hero visual (`design_handoff_codeshare/
// CodeShare v2.dc.html` lines 89-113 / 331 / 443-446): an orbiting ring of
// file-type chips around a center "editor" card that types out HERO one
// character at a time, then pauses (+50 extra ticks) before looping.
const HERO = "function greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('world');";

// Token tag -> CSS custom property, matching tokens.scss's --tk-* syntax
// palette (same mapping EditorPane's CodeMirror theme draws from).
const TAG_COLOR: Record<NonNullable<Token['tag']>, string> = {
  com: 'var(--tk-com)',
  str: 'var(--tk-str)',
  key: 'var(--tk-key)',
  num: 'var(--tk-num)',
  fn: 'var(--tk-fn)',
};

type OrbitVisualProps = {
  room: string;
};

export default function OrbitVisual({ room }: OrbitVisualProps) {
  const [typed, setTyped] = useState(0);

  // Ticks every 60ms (handoff line 445), incrementing `typed` until
  // HERO.length + 50 (a pause once the full snippet is shown) then looping
  // back to 0. Only runs while this component is mounted.
  useEffect(() => {
    const id = setInterval(() => {
      setTyped(current => (current > HERO.length + 50 ? 0 : current + 1));
    }, 60);
    return () => clearInterval(id);
  }, []);

  const tokens = tokenizeJs(HERO.slice(0, typed));
  const done = typed >= HERO.length;

  return (
    <div className={styles.orbit}>
      <div className={styles.ring} />
      <div className={styles.tickRing} />
      <div className={styles.glow} />

      <div className={styles.chipLayer}>
        <div className={styles.chipSlot} data-slot="top">
          <div className={styles.chip} data-color="html">
            &lt;html&gt;
          </div>
        </div>
        <div className={styles.chipSlot} data-slot="right">
          <div className={styles.chip} data-color="css">
            {'{ css }'}
          </div>
        </div>
        <div className={styles.chipSlot} data-slot="left">
          <div className={styles.chip} data-color="js">
            js()
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitleBar}>
          <span className={styles.cardDot} />
          room/{room}
          <span className={styles.equalizer}>
            <span className={styles.equalizerBar} data-delay="0" />
            <span className={styles.equalizerBar} data-delay="1" />
            <span className={styles.equalizerBar} data-delay="2" />
          </span>
        </div>
        <div className={styles.cardBody}>
          <pre className={styles.code}>
            {tokens.map((token, index) => (
              <span
                key={index}
                style={
                  token.tag
                    ? { color: TAG_COLOR[token.tag], fontStyle: token.tag === 'com' ? 'italic' : undefined }
                    : undefined
                }
              >
                {token.text}
              </span>
            ))}
            <span className={styles.caret} />
          </pre>
        </div>
        <div className={styles.cardFooter}>
          <span className={styles.prompt}>&#10095;</span>
          <span className={styles.footerOutput} style={{ opacity: done ? 1 : 0 }}>
            Hello, world!
          </span>
        </div>
      </div>
    </div>
  );
}
