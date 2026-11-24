// Süße Katzen für die Regal-Ansicht (reine Deko).
// Vier Posen × fünf Fellfarben; gezeichnet als SVG im gleichen Format wie Plant.jsx.

const FURS = [
  { body: '#9aa3ad', dark: '#7d8792', light: '#c4cad1' }, // grau
  { body: '#eaa86f', dark: '#d58a4f', light: '#f6cfa6' }, // rot getigert
  { body: '#47434b', dark: '#2f2c33', light: '#6b6670' }, // schwarz
  { body: '#efe2cc', dark: '#d9c6a6', light: '#fbf4e8' }, // creme
  { body: '#f7f3ee', dark: '#e3a466', light: '#4a4549', calico: true }, // glückskatze
]
const PINK = '#f2a7b5'

// Gesicht: große Augen mit Glanz, rosa Bäckchen, kleine Nase
function Face({ cx, cy, sleepy, s = 1, fur }) {
  const eye = fur.body === '#47434b' ? '#f3e7a1' : '#2d2a30'
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      {sleepy ? (
        <>
          <path d="M-8 0 q3 3 6 0" stroke="#2d2a30" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M2 0 q3 3 6 0" stroke="#2d2a30" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="-5" cy="0" rx="2.6" ry="3.2" fill={eye} />
          <ellipse cx="5" cy="0" rx="2.6" ry="3.2" fill={eye} />
          <circle cx="-4.2" cy="-1.1" r=".9" fill="#fff" />
          <circle cx="5.8" cy="-1.1" r=".9" fill="#fff" />
        </>
      )}
      <ellipse cx="-9" cy="4.5" rx="2.6" ry="1.6" fill={PINK} opacity=".7" />
      <ellipse cx="9" cy="4.5" rx="2.6" ry="1.6" fill={PINK} opacity=".7" />
      <path d="M-1.3 3.4 h2.6 l-1.3 1.5 z" fill={PINK} />
      <path d="M0 4.9 q-1.5 2 -3 1 M0 4.9 q1.5 2 3 1" stroke="#2d2a30" strokeWidth=".9" fill="none" strokeLinecap="round" />
    </g>
  )
}

function Ears({ cx, cy, w = 22, fur }) {
  const h = w / 2
  return (
    <g>
      <path d={`M${cx - h} ${cy + 2} L${cx - h + 2} ${cy - 9} L${cx - h + 9} ${cy - 1} z`} fill={fur.body} />
      <path d={`M${cx + h} ${cy + 2} L${cx + h - 2} ${cy - 9} L${cx + h - 9} ${cy - 1} z`} fill={fur.calico ? fur.light : fur.body} />
      <path d={`M${cx - h + 2.5} ${cy} L${cx - h + 3.2} ${cy - 5.5} L${cx - h + 7} ${cy - 1.2} z`} fill={PINK} />
      <path d={`M${cx + h - 2.5} ${cy} L${cx + h - 3.2} ${cy - 5.5} L${cx + h - 7} ${cy - 1.2} z`} fill={PINK} />
    </g>
  )
}

const POSES = [
  // Sitzt aufrecht, Schwanz um die Pfoten gelegt
  fur => (
    <>
      <path d="M44 92 C58 92 60 78 52 74" stroke={fur.dark} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M18 96 C16 74 22 58 32 58 C42 58 48 74 46 96 z" fill={fur.body} />
      {fur.calico && <path d="M34 62 C44 64 46 78 44 88 C38 82 34 72 34 62 z" fill={fur.dark} />}
      <ellipse cx="32" cy="80" rx="8" ry="11" fill={fur.light} opacity=".7" />
      <ellipse cx="26" cy="94" rx="5" ry="3" fill={fur.light} />
      <ellipse cx="38" cy="94" rx="5" ry="3" fill={fur.light} />
      <Ears cx={32} cy={42} fur={fur} />
      <ellipse cx="32" cy="46" rx="15" ry="13" fill={fur.body} />
      {fur.calico && <path d="M20 40 C22 34 30 33 31 37 C27 40 24 44 20 46 z" fill={fur.light} />}
      <Face cx={32} cy={46} fur={fur} />
    </>
  ),
  // "Brotlaib": liegt kompakt, Augen zufrieden zu
  fur => (
    <>
      <path d="M10 96 C8 80 18 72 34 72 C50 72 58 80 56 96 z" fill={fur.body} />
      {fur.calico && <path d="M38 73 C50 74 56 84 55 94 C46 90 40 82 38 73 z" fill={fur.dark} />}
      <path d="M54 92 C60 92 62 88 60 84" stroke={fur.dark} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Ears cx={24} cy={64} w={20} fur={fur} />
      <ellipse cx="24" cy="70" rx="13" ry="11" fill={fur.body} />
      {fur.calico && <path d="M28 61 C34 62 37 68 36 72 C32 70 29 66 28 61 z" fill={fur.light} />}
      <Face cx={24} cy={70} sleepy s={.9} fur={fur} />
    </>
  ),
  // Schläft eingerollt wie ein Kringel
  fur => (
    <>
      <ellipse cx="32" cy="84" rx="24" ry="12" fill={fur.body} />
      {fur.calico && <ellipse cx="42" cy="80" rx="10" ry="6" fill={fur.dark} />}
      <path d="M54 88 C52 98 26 99 16 93" stroke={fur.dark} strokeWidth="6" fill="none" strokeLinecap="round" />
      <Ears cx={22} cy={76} w={18} fur={fur} />
      <ellipse cx="22" cy="81" rx="11" ry="9" fill={fur.body} />
      <Face cx={22} cy={82} sleepy s={.8} fur={fur} />
      <text x="40" y="66" fontSize="9" fill="#9a93a8" fontFamily="Georgia, serif" fontStyle="italic">z</text>
      <text x="46" y="58" fontSize="7" fill="#9a93a8" fontFamily="Georgia, serif" fontStyle="italic">z</text>
    </>
  ),
  // Liegt auf dem Brett, der Schwanz baumelt über die Kante
  fur => (
    <>
      <path d="M48 92 C54 98 54 110 50 118" stroke={fur.dark} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M8 96 C8 84 18 80 36 80 C52 80 58 86 56 96 z" fill={fur.body} />
      {fur.calico && <path d="M30 81 C40 80 46 86 44 94 C36 92 32 88 30 81 z" fill={fur.dark} />}
      <ellipse cx="14" cy="94" rx="5" ry="2.6" fill={fur.light} />
      <ellipse cx="24" cy="95" rx="5" ry="2.6" fill={fur.light} />
      <Ears cx={18} cy={70} w={20} fur={fur} />
      <ellipse cx="18" cy="76" rx="13" ry="11" fill={fur.body} />
      <Face cx={18} cy={76} s={.9} fur={fur} />
    </>
  ),
]

export default function Cat({ seed }) {
  const pose = POSES[seed % POSES.length]
  const fur = FURS[Math.floor(seed / 7) % FURS.length]
  return (
    <svg className="plant shelf-cat" viewBox="0 0 64 96" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      {pose(fur)}
    </svg>
  )
}
