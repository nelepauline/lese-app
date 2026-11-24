// Kleine Zimmerpflanzen für die Regal-Ansicht (reine Deko).
// Fünf Sorten, gezeichnet als SVG; Töpfe in Pastelltönen.

const POTS = ['#e8b9a0', '#d9c7e8', '#b9d6c4', '#f1d9a6', '#c9dbe8', '#efc2cc']
const LEAF = '#6f9a62', LEAF_DARK = '#557e4b', LEAF_LIGHT = '#8db57e'

function Pot({ color, x = 18, w = 28, y = 70, h = 26 }) {
  return (
    <g>
      <path d={`M${x} ${y} h${w} l-3 ${h} h-${w - 6} z`} fill={color} />
      <rect x={x - 2} y={y - 5} width={w + 4} height={7} rx={2} fill={color} style={{ filter: 'brightness(.93)' }} />
    </g>
  )
}

const KINDS = [
  // Monstera-artig: große runde Blätter
  pot => (
    <>
      <path d="M32 66 C31 52 28 44 22 36" stroke={LEAF_DARK} strokeWidth="2" fill="none" />
      <path d="M32 66 C33 50 38 40 46 33" stroke={LEAF_DARK} strokeWidth="2" fill="none" />
      <path d="M32 66 V40" stroke={LEAF_DARK} strokeWidth="2" fill="none" />
      <ellipse cx="19" cy="32" rx="11" ry="9" fill={LEAF} transform="rotate(-25 19 32)" />
      <ellipse cx="47" cy="29" rx="12" ry="9" fill={LEAF_LIGHT} transform="rotate(25 47 29)" />
      <ellipse cx="32" cy="24" rx="10" ry="13" fill={LEAF_DARK} />
      <path d="M32 14 V34 M27 22 l5 4 M37 22 l-5 4" stroke="#fff" strokeOpacity=".25" strokeWidth="1.2" fill="none" />
      <Pot color={pot} />
    </>
  ),
  // Kaktus
  pot => (
    <>
      <rect x="26" y="26" width="12" height="44" rx="6" fill={LEAF} />
      <path d="M26 48 h-6 a4 4 0 0 1 -4 -4 v-8" stroke={LEAF} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M38 42 h5 a4 4 0 0 0 4 -4 v-6" stroke={LEAF_LIGHT} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M32 30 V66" stroke={LEAF_DARK} strokeWidth="1" opacity=".5" />
      <circle cx="32" cy="24" r="3" fill="#f2a7b8" />
      <Pot color={pot} x={20} w={24} />
    </>
  ),
  // Bogenhanf: hohe spitze Blätter
  pot => (
    <>
      <path d="M24 68 C20 48 20 30 25 14 C29 30 29 50 28 68 z" fill={LEAF_DARK} />
      <path d="M31 68 C29 44 31 22 35 6 C39 24 38 46 35 68 z" fill={LEAF} />
      <path d="M37 68 C38 50 40 36 45 24 C46 40 44 54 41 68 z" fill={LEAF_LIGHT} />
      <path d="M25 50 l3 -2 M33 40 l3 -2 M33 28 l3 -2" stroke="#e9e3a6" strokeWidth="1.4" opacity=".6" />
      <Pot color={pot} />
    </>
  ),
  // Efeutute: hängt über die Regalkante
  pot => (
    <>
      <Pot color={pot} y={72} h={24} />
      {/* Ranken hängen über die Regalkante (über den Bildrand hinaus) */}
      <path d="M20 70 C10 80 9 100 12 118" stroke={LEAF_DARK} strokeWidth="1.6" fill="none" />
      <path d="M44 70 C54 80 55 96 52 110" stroke={LEAF_DARK} strokeWidth="1.6" fill="none" />
      {[[14, 78], [10, 90], [11, 102], [12, 114], [50, 78], [54, 90], [53, 102]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="4.5" ry="3.4" fill={i % 2 ? LEAF : LEAF_LIGHT} transform={`rotate(${i % 2 ? 30 : -30} ${x} ${y})`} />
      ))}
      <ellipse cx="25" cy="62" rx="8" ry="5.5" fill={LEAF} transform="rotate(-20 25 62)" />
      <ellipse cx="39" cy="61" rx="8" ry="5.5" fill={LEAF_LIGHT} transform="rotate(20 39 61)" />
      <ellipse cx="32" cy="55" rx="6" ry="7" fill={LEAF_DARK} />
    </>
  ),
  // Sukkulente: kleine Rosette
  pot => (
    <>
      {[-60, -30, 0, 30, 60].map((a, i) => (
        <ellipse key={i} cx="32" cy="56" rx="4.5" ry="12" fill={i % 2 ? LEAF_LIGHT : '#86b39a'} transform={`rotate(${a} 32 66)`} />
      ))}
      <ellipse cx="32" cy="60" rx="5" ry="7" fill="#a7cdb7" />
      <Pot color={pot} x={21} w={22} y={72} h={22} />
    </>
  ),
]

export default function Plant({ seed }) {
  const kind = KINDS[seed % KINDS.length]
  const pot = POTS[Math.floor(seed / KINDS.length) % POTS.length]
  return (
    <svg className="plant" viewBox="0 0 64 96" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      {kind(pot)}
    </svg>
  )
}

// Kleiner, stabiler Zufall: gleiche Eingabe → gleiche Zahl (Pflanzen springen nicht herum)
export function seeded(text) {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (h >>> 0)
}
