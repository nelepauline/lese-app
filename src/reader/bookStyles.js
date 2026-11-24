// Erzeugt das CSS, das in die Buchseiten eingespielt wird (Schrift, Farben, Abstände).
import { THEMES, FONTS } from '../settings/settings.js'

// page: Farben der Buchseite (siehe pageTheme in settings.js)
export function bookCss(settings, page) {
  const t = page ?? THEMES[settings.theme] ?? THEMES.light
  const font = FONTS[settings.font]?.css
  const align = settings.justify ? 'justify' : 'start'
  const hyph = settings.justify ? 'auto' : 'manual'

  return `
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: ${t.dark ? 'dark' : 'light'};
  background: ${t.bg} !important;
  color: ${t.fg} !important;
  font-size: ${settings.fontSize}% !important;
  -webkit-text-size-adjust: none;
}
body { background: transparent !important; color: inherit !important; }
body :is(p, div, span, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, em, i, b, strong, small, cite, figcaption) {
  color: inherit !important;
  background-color: transparent !important;
}
${font ? `body, body :is(p, div, span, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, em, i, b, strong, small, cite, a) {
  font-family: ${font} !important;
}` : ''}
p, li, blockquote, dd {
  line-height: ${settings.lineHeight} !important;
  text-align: ${align};
  -webkit-hyphens: ${hyph};
  hyphens: ${hyph};
  -webkit-hyphenate-limit-before: 3;
  -webkit-hyphenate-limit-after: 2;
  hanging-punctuation: allow-end last;
  widows: 2;
  orphans: 2;
}
[align="left"] { text-align: left; }
[align="right"] { text-align: right; }
[align="center"] { text-align: center; }
a:any-link { color: ${t.link} !important; }
pre { white-space: pre-wrap !important; }
img, svg { max-width: 100%; }
${t.dark ? 'img { opacity: .9; }' : ''}
::selection { background: ${t.dark ? 'rgba(143,180,255,.35)' : 'rgba(42,93,176,.22)'}; }
aside[epub|type~="endnote"],
aside[epub|type~="footnote"],
aside[epub|type~="note"],
aside[epub|type~="rearnote"] { display: none; }
`
}
