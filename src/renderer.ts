import type { MotionFrame, ScenePlan, Point } from './domain.ts';

const palettes = {
  teal: { main: '#207e76', light: '#72b9a7', dark: '#164f4c' },
  blue: { main: '#467fb5', light: '#9bbad9', dark: '#264766' },
  coral: { main: '#c36e57', light: '#e6ac8d', dark: '#753f35' },
  violet: { main: '#8771af', light: '#baa9d0', dark: '#51406f' },
};
const f = (n: number) => Number(n.toFixed(2));
const path = (p: Point[]) => p.map((v, i) => `${i ? 'L' : 'M'} ${f(v.x)} ${f(v.y)}`).join(' ');
const degrees = (a: number) => f(a * 180 / Math.PI);

function propMarkup(frame: MotionFrame, teaching: boolean) {
  const { center, angle, width, height } = frame.prop;
  const box = height > 25;
  const art = box ? `
    <rect x="${-width/2}" y="${-height/2}" width="${width}" height="${height}" rx="6" fill="#d39b61" stroke="#95673b" stroke-width="2"/>
    <path d="M -7 ${-height/2} V ${height/2} H 7 V ${-height/2}" fill="#ead0a9" opacity=".75"/>
    <path d="M ${-width/2+10} 7 h 9 m -4.5 -4.5 v 9" stroke="#8c633f" stroke-width="1.5"/>
  ` : `
    <rect x="${-width/2}" y="${-height/2}" width="${width}" height="${height}" rx="6" fill="#c58c54" stroke="#855b35" stroke-width="2"/>
    <path d="M -28 ${-height/2} l 3 -30 h 19 l 3 30" fill="#d8e9e4" stroke="#426b63" stroke-width="2"/>
    <path d="M -24 -23 h 18" stroke="#8bbcb0" stroke-width="9"/>
    <circle cx="22" cy="${-height/2-12}" r="12" fill="#dfab55"/>
    <path d="M 21 -30 q 7 -9 10 -3" fill="none" stroke="#557c56" stroke-width="3" stroke-linecap="round"/>
  `;
  return `<g transform="translate(${f(center.x)} ${f(center.y)}) rotate(${degrees(angle)})">${art}
    ${teaching ? `<path d="M 0 0 H ${width/2+34}" stroke="#dd784d" stroke-width="2" stroke-dasharray="4 4"/>
    <circle data-drag-handle="true" cx="${width/2+34}" cy="0" r="13" fill="#dd784d" stroke="#fff9ee" stroke-width="4" style="cursor:grab"/>
    <path pointer-events="none" d="M ${width/2+29} 0 h 10 m -5 -5 v 10" stroke="#fff" stroke-width="1.6"/>` : ''}
    </g>`;
}

export function renderStage(frame: MotionFrame, plan: ScenePlan, options: { teaching?: boolean; showRig?: boolean } = {}): string {
  const color = palettes[plan.color];
  const robot = plan.actor === 'biped';
  const limb = (rear: boolean) => frame.limbs.filter(l => l.rear === rear).map(l => {
    const stroke = rear ? color.light : color.main;
    const thickness = l.kind === 'leg' ? 10 : 9;
    const end = l.points.at(-1)!;
    return `<g>
      <path d="${path(l.points)}" fill="none" stroke="${stroke}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round"/>
      ${l.points.slice(1,-1).map(p=>`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="6" fill="#f4f1e8" stroke="${stroke}" stroke-width="3"/>`).join('')}
      ${l.kind==='leg'?`<path d="M ${f(end.x-5)} ${f(end.y)} h 14" stroke="${color.dark}" stroke-width="9" stroke-linecap="round"/>`:`<circle cx="${f(end.x)}" cy="${f(end.y)}" r="5" fill="${color.dark}"/>`}
      </g>`;
  }).join('');
  const source = frame.source, dest = frame.destination;
  const phaseLabels = { approach: 'Finding the object', grasp: 'Making contact', carry: 'On the move', place: 'A gentle landing', wave: 'All done.' };
  return `<svg id="scene-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${robot?'Pip the two-legged robot':'Nori the four-legged creature'} ${frame.phase} scene" data-phase="${frame.phase}" data-rule-applied="${frame.ruleApplied}" data-angle="${frame.prop.angle}">
    <defs>
      <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#d7ddd4"/></pattern>
      <linearGradient id="window-light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d9e7db"/><stop offset="1" stop-color="#edf0e5"/></linearGradient>
    </defs>
    <rect width="960" height="540" fill="#f5f3eb"/>
    <rect width="960" height="430" fill="url(#dots)"/>
    <path d="M 108 429 V 164 Q 108 120 152 120 H 808 Q 852 120 852 164 V 429" fill="#ebece1" opacity=".43"/>
    <rect x="143" y="153" width="108" height="119" rx="42" fill="url(#window-light)" stroke="#d7dfd3" stroke-width="2"/>
    <path d="M 197 154 V 271 M 145 213 H 250" stroke="#f7f6ef" stroke-width="5"/>
    <path d="M 174 278 L 244 278 L 403 429 L 248 429 Z" fill="#f8f4d9" opacity=".5"/>
    <rect x="0" y="430" width="960" height="110" fill="#eeeee3"/>
    <path d="M 50 430 H 910" stroke="#bec9bb" stroke-width="1.5"/>
    ${[120,280,440,600,760,920].map(x=>`<path d="M ${x} 430 l -40 110" stroke="#e0e5d8" stroke-width="1"/>`).join('')}
    <path d="M 0 486 H 960" stroke="#e0e5d8"/>
    <g opacity=".8"><ellipse cx="${source.x}" cy="435" rx="58" ry="8" fill="#d7dacf"/>
      <path d="M ${source.x-42} ${source.y+6} V 426 M ${source.x+42} ${source.y+6} V 426" stroke="#b3b9a8" stroke-width="8"/>
      <rect x="${source.x-52}" y="${source.y}" width="104" height="9" rx="4" fill="#c6cbb9"/>
    </g>
    <g><ellipse cx="${dest.x}" cy="435" rx="78" ry="9" fill="#d7dacf"/>
      <path d="M ${dest.x-52} ${dest.y+8} V 427 M ${dest.x+52} ${dest.y+8} V 427" stroke="#a4b5a3" stroke-width="9"/>
      ${plan.destination==='shelf'?`<rect x="${dest.x-57}" y="390" width="114" height="8" rx="3" fill="#c2cbb4"/>`:''}
      <rect x="${dest.x-67}" y="${dest.y}" width="134" height="11" rx="5" fill="#b4c4ad"/>
      <rect x="${dest.x-66}" y="${dest.y}" width="132" height="3" rx="2" fill="#d2dbbf"/>
    </g>
    <g fill="#84917d" font-family="ui-monospace, monospace" font-size="10" letter-spacing="1.5" text-anchor="middle">
      <text x="${source.x}" y="463">PICK UP</text><text x="${dest.x}" y="463">${plan.destination.toUpperCase()}</text>
    </g>
    <ellipse cx="${f(frame.root.x)}" cy="435" rx="${robot?39:62}" ry="8" fill="#c8d6cb" opacity=".7"/>
    ${limb(true)}
    <path d="${path(frame.torso)}" fill="none" stroke="${color.main}" stroke-width="${robot?27:33}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${path(frame.torso)}" fill="none" stroke="${color.light}" stroke-width="${robot?13:17}" stroke-linecap="round" opacity=".5"/>
    <g transform="translate(${f(frame.head.x)} ${f(frame.head.y)})">
      <path d="M 0 -16 v -12" stroke="${color.dark}" stroke-width="3"/>
      <circle cx="0" cy="-31" r="4" fill="#d6a653"/>
      <rect x="-24" y="-19" width="48" height="37" rx="${robot?13:17}" fill="${color.main}"/>
      <rect x="-17" y="-12" width="34" height="22" rx="8" fill="#e4efe5"/>
      <circle cx="-6" cy="-2" r="3" fill="${color.dark}"/><circle cx="7" cy="-2" r="3" fill="${color.dark}"/>
      <path d="M -2 5 h 5" stroke="${color.dark}" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    ${propMarkup(frame, Boolean(options.teaching))}
    ${limb(false)}
    ${options.showRig?`<g fill="none" stroke="#29413c" stroke-width="1" opacity=".55">${frame.limbs.map(l=>`<path d="${path(l.points)}"/>${l.points.map(p=>`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="3" fill="#fff"/>`).join('')}`).join('')}</g>`:''}
    ${options.teaching?`<path d="M ${f(frame.prop.center.x-90)} ${f(frame.prop.center.y)} h 180" stroke="#c8784a" stroke-width="1.5" stroke-dasharray="5 5" opacity=".5"/>
      <text x="${f(frame.prop.center.x)}" y="${f(frame.prop.center.y-75)}" fill="#9a5934" text-anchor="middle" font-size="12" font-family="sans-serif">Drag the orange handle to level the object</text>`:''}
    <g font-family="sans-serif">
      <rect x="24" y="22" width="137" height="27" rx="13.5" fill="#fffef8" stroke="#e0e3d6"/>
      <circle cx="39" cy="35" r="3.5" fill="${frame.ruleApplied?'#328c69':'#aaa88e'}"/>
      <text x="50" y="39" font-size="10" fill="#627565" letter-spacing=".4">${frame.ruleApplied?'MEMORY APPLIED':'KINEMATIC STAGE'}</text>
      <text x="930" y="39" text-anchor="end" font-size="11" fill="#7b8775">${robot?'Pip / 2 legs':'Nori / 4 legs'}</text>
      <text x="480" y="507" text-anchor="middle" font-size="12" fill="#7e8978">${options.teaching?'One correction. A reusable rule.':phaseLabels[frame.phase]}</text>
    </g>
  </svg>`;
}

export function renderMiniProp(angle: number, color: string): string {
  return `<svg viewBox="0 0 130 62" aria-hidden="true"><path d="M 15 43 H 115" stroke="#d5ddd3" stroke-dasharray="3 3"/><g transform="translate(65 31) rotate(${degrees(angle)})"><rect x="-30" y="-15" width="60" height="30" rx="5" fill="${color}"/><rect x="-5" y="-15" width="10" height="30" fill="#ffffff" opacity=".35"/><circle cx="-34" cy="7" r="5" fill="#285b52"/><circle cx="34" cy="7" r="5" fill="#285b52"/></g></svg>`;
}
