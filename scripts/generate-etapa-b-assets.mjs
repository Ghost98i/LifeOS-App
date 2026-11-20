import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ICON_DIR = resolve(ROOT, 'public/gym-icons/v1');

mkdirSync(ICON_DIR, { recursive: true });

const svgWrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n${body.trim()}\n</svg>\n`;

// V2 Palette — "Industrial Alto Contraste — Bloques Sólidos" (works on dark & light UI):
// Primary metal structure:  #94A3B8 (Titanio Medio)
// Pads, bases, depth:       #64748B (Pizarra Media)
// Highlights / shafts:      #CBD5E1 (Acero Claro)
// Functional accent (load): #6366F1 (Índigo LifeOS), #4F46E5 (depth), #818CF8 (minimal highlight)
// FORBIDDEN: #0F172A, #1E293B, #334155

const ICONS = {
  // 1. Individual hexagonal dumbbell
  'dumbbell.svg': `
  <g transform="rotate(-35 32 32)">
    <rect x="17" y="27.5" width="30" height="9" rx="3" fill="#CBD5E1"/>
    <rect x="24" y="27.5" width="16" height="9" fill="#94A3B8"/>
    <polygon points="4,17 13,11 19,17 19,47 13,53 4,47" fill="#4F46E5"/>
    <polygon points="6,19 13,14 17,19 17,36 6,36" fill="#6366F1"/>
    <rect x="9" y="17" width="6" height="4" rx="2" fill="#818CF8"/>
    <polygon points="60,17 51,11 45,17 45,47 51,53 60,47" fill="#4F46E5"/>
    <polygon points="58,19 51,14 47,19 47,36 58,36" fill="#6366F1"/>
    <rect x="49" y="17" width="6" height="4" rx="2" fill="#818CF8"/>
  </g>`,

  // 2. Olympic loaded barbell
  'barbell.svg': `
  <rect x="4" y="29" width="56" height="6" rx="3" fill="#CBD5E1"/>
  <rect x="21" y="29" width="22" height="6" fill="#94A3B8"/>
  <rect x="11" y="10" width="8" height="44" rx="3" fill="#4F46E5"/>
  <rect x="12.5" y="12" width="5" height="22" rx="2" fill="#6366F1"/>
  <rect x="4.5" y="17" width="5.5" height="30" rx="2.5" fill="#6366F1"/>
  <rect x="45" y="10" width="8" height="44" rx="3" fill="#4F46E5"/>
  <rect x="46.5" y="12" width="5" height="22" rx="2" fill="#6366F1"/>
  <rect x="54" y="17" width="5.5" height="30" rx="2.5" fill="#6366F1"/>`,

  // 3. Cambered EZ / W curl bar
  'ez-bar.svg': `
  <path d="M5 32 H16 L23 23 L29 38 H35 L41 23 L48 32 H59" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="10" y="14" width="7" height="36" rx="3" fill="#4F46E5"/>
  <rect x="4" y="20" width="5" height="24" rx="2" fill="#6366F1"/>
  <rect x="47" y="14" width="7" height="36" rx="3" fill="#4F46E5"/>
  <rect x="55" y="20" width="5" height="24" rx="2" fill="#6366F1"/>`,

  // 4. Flat Olympic bench press station
  'bench-press.svg': `
  <rect x="6" y="53" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="13" y="13" width="6" height="43" rx="2.5" fill="#94A3B8"/>
  <rect x="45" y="13" width="6" height="43" rx="2.5" fill="#94A3B8"/>
  <rect x="29" y="42" width="6" height="14" rx="2" fill="#94A3B8"/>
  <rect x="10" y="35" width="44" height="9" rx="3" fill="#64748B"/>
  <rect x="12" y="35" width="40" height="3.5" rx="1.5" fill="#CBD5E1"/>
  <rect x="8" y="18.5" width="48" height="5" rx="2.5" fill="#CBD5E1"/>
  <rect x="4" y="9" width="7" height="24" rx="2.5" fill="#4F46E5"/>
  <rect x="11.5" y="13" width="4.5" height="16" rx="2" fill="#6366F1"/>
  <rect x="53" y="9" width="7" height="24" rx="2.5" fill="#4F46E5"/>
  <rect x="48" y="13" width="4.5" height="16" rx="2" fill="#6366F1"/>`,

  // 5. Incline Olympic bench press station
  'incline-bench-press.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <rect x="12" y="11" width="6" height="45" rx="2.5" fill="#94A3B8"/>
  <rect x="44" y="42" width="6" height="14" rx="2" fill="#94A3B8"/>
  <rect x="20" y="36" width="27" height="9" rx="3" transform="rotate(-40 20 36)" fill="#64748B"/>
  <rect x="38" y="40" width="19" height="8" rx="3" fill="#64748B"/>
  <rect x="6" y="14" width="30" height="5" rx="2.5" fill="#CBD5E1"/>
  <rect x="7" y="6" width="7" height="21" rx="2.5" fill="#4F46E5"/>
  <rect x="28" y="6" width="7" height="21" rx="2.5" fill="#6366F1"/>`,

  // 6. Standalone FID adjustable bench
  'adjustable-bench.svg': `
  <rect x="6" y="52" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="14" y="41" width="6" height="14" rx="2" fill="#94A3B8"/>
  <rect x="45" y="41" width="6" height="14" rx="2" fill="#94A3B8"/>
  <rect x="14" y="41" width="37" height="5.5" rx="2.5" fill="#94A3B8"/>
  <line x1="21" y1="42" x2="29" y2="27" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="13" y="34" width="28" height="9.5" rx="3" transform="rotate(-44 13 34)" fill="#64748B"/>
  <rect x="35" y="33" width="22" height="9" rx="3" fill="#64748B"/>
  <circle cx="29" cy="27" r="4.5" fill="#6366F1"/>
  <rect x="47" y="45" width="9" height="5.5" rx="2.5" fill="#4F46E5"/>`,

  // 7. 45-degree leg press machine
  'leg-press.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <line x1="22" y1="54" x2="55" y2="12" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="49" y="24" width="6" height="32" rx="2.5" fill="#94A3B8"/>
  <rect x="6" y="37" width="21" height="9" rx="3" transform="rotate(-48 6 37)" fill="#64748B"/>
  <rect x="16" y="43" width="16" height="8" rx="3" fill="#64748B"/>
  <rect x="41" y="7" width="18" height="7" rx="2.5" transform="rotate(38 41 7)" fill="#94A3B8"/>
  <circle cx="44" cy="28" r="10.5" fill="#4F46E5"/>
  <circle cx="44" cy="28" r="6" fill="#6366F1"/>
  <circle cx="44" cy="28" r="3" fill="#CBD5E1"/>`,

  // 8. Angled hack squat machine
  'hack-squat.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <polygon points="6,54 27,54 11,38" fill="#94A3B8"/>
  <line x1="26" y1="54" x2="52" y2="8" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="47" y="10" width="6" height="46" rx="2.5" fill="#94A3B8"/>
  <rect x="26" y="25" width="23" height="9.5" rx="3" transform="rotate(-62 26 25)" fill="#64748B"/>
  <rect x="28" y="9" width="14" height="7.5" rx="3" fill="#94A3B8"/>
  <circle cx="44" cy="35" r="10" fill="#4F46E5"/>
  <circle cx="44" cy="35" r="5.5" fill="#6366F1"/>
  <circle cx="44" cy="35" r="2.8" fill="#CBD5E1"/>`,

  // 9. Power rack / squat cage
  'squat-rack.svg': `
  <rect x="7" y="53" width="50" height="6" rx="3" fill="#64748B"/>
  <rect x="13" y="6" width="6.5" height="50" rx="2.5" fill="#94A3B8"/>
  <rect x="44.5" y="6" width="6.5" height="50" rx="2.5" fill="#94A3B8"/>
  <rect x="13" y="6" width="38" height="6" rx="2.5" fill="#CBD5E1"/>
  <rect x="19.5" y="39" width="25" height="5" rx="2" fill="#64748B"/>
  <rect x="5" y="21" width="54" height="5.5" rx="2.5" fill="#CBD5E1"/>
  <rect x="4" y="13" width="7" height="22" rx="2.5" fill="#4F46E5"/>
  <rect x="53" y="13" width="7" height="22" rx="2.5" fill="#4F46E5"/>
  <rect x="5.5" y="15" width="4" height="10" rx="1.5" fill="#6366F1"/>
  <rect x="54.5" y="15" width="4" height="10" rx="1.5" fill="#6366F1"/>`,

  // 10. Seated leg extension machine (protagonist reclined seat + front cam & indigo shin roller)
  'leg-extension.svg': `
  <rect x="6" y="53" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="34" y="38" width="7" height="18" rx="2.5" fill="#94A3B8"/>
  <rect x="44" y="12" width="10" height="27" rx="3" transform="rotate(-12 44 12)" fill="#64748B"/>
  <rect x="24" y="34" width="25" height="9" rx="3" fill="#64748B"/>
  <rect x="26" y="34" width="21" height="3.5" rx="1.5" fill="#94A3B8"/>
  <line x1="25" y1="39" x2="14" y2="50" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="25" cy="39" r="5" fill="#94A3B8"/>
  <rect x="5" y="42" width="15" height="10" rx="5" fill="#4F46E5"/>
  <rect x="7" y="43.5" width="11" height="4.5" rx="2.2" fill="#6366F1"/>
  <rect x="9" y="44.5" width="6" height="2" rx="1" fill="#818CF8"/>`,

  // 11. Lying leg curl machine (protagonist wide angled prone bench + lever & indigo ankle roller)
  'hamstrings.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <rect x="14" y="40" width="6.5" height="16" rx="2.5" fill="#94A3B8"/>
  <rect x="44" y="40" width="6.5" height="16" rx="2.5" fill="#94A3B8"/>
  <rect x="6" y="35" width="26" height="9.5" rx="3" transform="rotate(-14 6 35)" fill="#64748B"/>
  <rect x="29" y="29" width="25" height="9.5" rx="3" transform="rotate(14 29 29)" fill="#64748B"/>
  <line x1="50" y1="39" x2="43" y2="18" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="50" cy="39" r="5" fill="#94A3B8"/>
  <rect x="33" y="10" width="17" height="11" rx="5.5" fill="#4F46E5"/>
  <rect x="35" y="11.5" width="13" height="5" rx="2.5" fill="#6366F1"/>
  <rect x="38" y="12.5" width="7" height="2.2" rx="1.1" fill="#818CF8"/>`,

  // 12. Seated leg curl machine (chair + prominent top thigh lock pad + curved lower indigo calf roller)
  'seated-leg-curl.svg': `
  <rect x="6" y="53" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="35" y="39" width="7" height="17" rx="2.5" fill="#94A3B8"/>
  <rect x="44" y="12" width="10" height="28" rx="3" fill="#64748B"/>
  <rect x="23" y="35" width="26" height="9" rx="3" fill="#64748B"/>
  <rect x="20" y="22" width="16" height="8" rx="4" fill="#CBD5E1"/>
  <rect x="23" y="24" width="10" height="4" rx="2" fill="#94A3B8"/>
  <path d="M24 41 Q15 44 13 38" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="25" cy="40" r="4.5" fill="#94A3B8"/>
  <rect x="5" y="34" width="15" height="10" rx="5" fill="#4F46E5"/>
  <rect x="7" y="35.5" width="11" height="4.5" rx="2.2" fill="#6366F1"/>`,

  // 13. Pec deck / butterfly machine (robust central backrest + twin thick padded fly arms — NO chandelier)
  'pec-deck.svg': `
  <rect x="10" y="53" width="44" height="6" rx="3" fill="#64748B"/>
  <rect x="25" y="8" width="14" height="47" rx="3" fill="#94A3B8"/>
  <rect x="23" y="16" width="18" height="24" rx="3" fill="#64748B"/>
  <rect x="19" y="44" width="26" height="8" rx="3" fill="#64748B"/>
  <path d="M25 14 H10 V38" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M39 14 H54 V38" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="5" y="22" width="11" height="22" rx="3.5" fill="#4F46E5"/>
  <rect x="7" y="24" width="6" height="12" rx="2" fill="#6366F1"/>
  <rect x="48" y="22" width="11" height="22" rx="3.5" fill="#4F46E5"/>
  <rect x="51" y="24" width="6" height="12" rx="2" fill="#6366F1"/>`,

  // 14. Lat pulldown station (wide overhead arch + protagonist wide indigo lat bar + bottom seat)
  'lat-pulldown.svg': `
  <rect x="8" y="6" width="48" height="6.5" rx="3" fill="#94A3B8"/>
  <rect x="29" y="6" width="6" height="17" rx="2.5" fill="#CBD5E1"/>
  <circle cx="32" cy="12" r="5" fill="#CBD5E1"/>
  <path d="M6 31 L16 22 H48 L58 31" stroke="#4F46E5" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 22 H48" stroke="#6366F1" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="18" y="45" width="28" height="8" rx="3" fill="#64748B"/>
  <rect x="28" y="51" width="8" height="8" rx="2.5" fill="#94A3B8"/>
  <rect x="12" y="54" width="40" height="5" rx="2.5" fill="#94A3B8"/>`,

  // 15. Seated cable row (low horizontal bench + angled footplate + horizontal indigo V-grip pull)
  'seated-row.svg': `
  <rect x="5" y="52" width="54" height="6" rx="3" fill="#64748B"/>
  <rect x="12" y="42" width="6" height="13" rx="2" fill="#94A3B8"/>
  <rect x="6" y="36" width="28" height="9" rx="3" fill="#64748B"/>
  <rect x="46" y="34" width="7" height="20" rx="2.5" transform="rotate(-18 46 34)" fill="#94A3B8"/>
  <rect x="52" y="20" width="7" height="35" rx="2.5" fill="#94A3B8"/>
  <line x1="52" y1="26" x2="34" y2="26" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M22 17 L35 26 L22 35" stroke="#4F46E5" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="35" cy="26" r="4.5" fill="#6366F1"/>`,

  // 16. Tricep cable pushdown / rope station (centered pulley housing + thick V rope + oversized indigo stoppers)
  'tricep-pushdown.svg': `
  <rect x="12" y="5" width="40" height="7" rx="3" fill="#94A3B8"/>
  <circle cx="32" cy="14" r="6" fill="#CBD5E1"/>
  <line x1="32" y1="18" x2="32" y2="30" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M32 29 L16 49 M32 29 L48 49" stroke="#94A3B8" stroke-width="6.5" stroke-linecap="round"/>
  <rect x="8" y="44" width="14" height="13" rx="4" fill="#4F46E5"/>
  <rect x="10" y="46" width="10" height="6" rx="2.5" fill="#6366F1"/>
  <rect x="42" y="44" width="14" height="13" rx="4" fill="#4F46E5"/>
  <rect x="44" y="46" width="10" height="6" rx="2.5" fill="#6366F1"/>`,

  // 17. Dual-stack cable crossover machine
  'cable-machine.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <rect x="6" y="7" width="11" height="48" rx="3" fill="#94A3B8"/>
  <rect x="47" y="7" width="11" height="48" rx="3" fill="#94A3B8"/>
  <rect x="6" y="7" width="52" height="6.5" rx="3" fill="#CBD5E1"/>
  <line x1="17" y1="19" x2="26" y2="35" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
  <line x1="47" y1="19" x2="38" y2="35" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
  <rect x="20" y="34" width="9" height="12" rx="3" fill="#4F46E5"/>
  <rect x="35" y="34" width="9" height="12" rx="3" fill="#4F46E5"/>
  <rect x="22" y="36" width="5" height="5" rx="1.5" fill="#6366F1"/>
  <rect x="37" y="36" width="5" height="5" rx="1.5" fill="#6366F1"/>`,

  // 18. Seated calf raise machine
  'calves.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <rect x="12" y="39" width="6" height="16" rx="2" fill="#94A3B8"/>
  <rect x="6" y="34" width="18" height="8.5" rx="3" fill="#64748B"/>
  <rect x="30" y="46" width="15" height="8" rx="2.5" fill="#94A3B8"/>
  <line x1="25" y1="22" x2="48" y2="34" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="21" y="16" width="17" height="9" rx="4" fill="#64748B"/>
  <circle cx="48" cy="35" r="11" fill="#4F46E5"/>
  <circle cx="48" cy="35" r="6" fill="#6366F1"/>
  <circle cx="48" cy="35" r="3" fill="#CBD5E1"/>`,

  // 19. Parallel bars / dip station (power tower)
  'power-tower.svg': `
  <rect x="7" y="53" width="50" height="6" rx="3" fill="#64748B"/>
  <rect x="14" y="14" width="6.5" height="41" rx="2.5" fill="#94A3B8"/>
  <rect x="43.5" y="14" width="6.5" height="41" rx="2.5" fill="#94A3B8"/>
  <rect x="14" y="38" width="36" height="5.5" rx="2" fill="#94A3B8"/>
  <rect x="24" y="11" width="16" height="19" rx="3" fill="#64748B"/>
  <rect x="5" y="19" width="18" height="8" rx="4" fill="#4F46E5"/>
  <rect x="7" y="20.5" width="14" height="3.5" rx="1.7" fill="#6366F1"/>
  <rect x="41" y="19" width="18" height="8" rx="4" fill="#4F46E5"/>
  <rect x="43" y="20.5" width="14" height="3.5" rx="1.7" fill="#6366F1"/>`,

  // 20. Multi-grip pull-up bar
  'pull-ups.svg': `
  <rect x="11" y="18" width="6.5" height="33" rx="2.5" fill="#94A3B8"/>
  <rect x="46.5" y="18" width="6.5" height="33" rx="2.5" fill="#94A3B8"/>
  <line x1="17" y1="39" x2="26" y2="23" stroke="#64748B" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="47" y1="39" x2="38" y2="23" stroke="#64748B" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M5 27 L14 19 H50 L59 27" stroke="#CBD5E1" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5 27 L14 19" stroke="#6366F1" stroke-width="7.5" stroke-linecap="round"/>
  <path d="M50 19 L59 27" stroke="#6366F1" stroke-width="7.5" stroke-linecap="round"/>
  <rect x="22" y="21" width="6" height="12" rx="3" fill="#4F46E5"/>
  <rect x="36" y="21" width="6" height="12" rx="3" fill="#4F46E5"/>`,

  // 21. Seated overhead shoulder press machine
  'shoulder-press.svg': `
  <rect x="8" y="53" width="48" height="6" rx="3" fill="#64748B"/>
  <rect x="24" y="16" width="16" height="26" rx="3" fill="#64748B"/>
  <rect x="19" y="44" width="26" height="8" rx="3" fill="#94A3B8"/>
  <path d="M24 27 H13 V15" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M40 27 H51 V15" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="5" y="10" width="17" height="8" rx="4" fill="#4F46E5"/>
  <rect x="7" y="11.5" width="13" height="3.5" rx="1.7" fill="#6366F1"/>
  <rect x="42" y="10" width="17" height="8" rx="4" fill="#4F46E5"/>
  <rect x="44" y="11.5" width="13" height="3.5" rx="1.7" fill="#6366F1"/>`,

  // 22. Seated converging chest press machine (torso)
  'torso.svg': `
  <rect x="6" y="53" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="43" y="9" width="13" height="46" rx="3" fill="#94A3B8"/>
  <rect x="30" y="19" width="9.5" height="23" rx="3" transform="rotate(-10 30 19)" fill="#64748B"/>
  <rect x="18" y="38" width="21" height="8.5" rx="3" fill="#64748B"/>
  <path d="M44 16 H20 V30 H12" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="6" y="22" width="10" height="17" rx="4" fill="#4F46E5"/>
  <rect x="8" y="24" width="5" height="9" rx="2" fill="#6366F1"/>`,

  // 23. Deadlift platform & floor-loaded Olympic barbell
  'deadlift.svg': `
  <rect x="4" y="48" width="56" height="10" rx="3" fill="#64748B"/>
  <rect x="19" y="48" width="26" height="10" fill="#94A3B8"/>
  <rect x="6" y="29" width="52" height="6" rx="3" fill="#CBD5E1"/>
  <rect x="12" y="12" width="8.5" height="38" rx="3" fill="#4F46E5"/>
  <rect x="5" y="16" width="6" height="30" rx="2.5" fill="#6366F1"/>
  <rect x="43.5" y="12" width="8.5" height="38" rx="3" fill="#4F46E5"/>
  <rect x="53" y="16" width="6" height="30" rx="2.5" fill="#6366F1"/>`,

  // 24. Pair of hex dumbbells (curls)
  'curls.svg': `
  <rect x="17" y="15.5" width="30" height="6" rx="2.5" fill="#CBD5E1"/>
  <rect x="8" y="7" width="9" height="23" rx="3" fill="#4F46E5"/>
  <rect x="47" y="7" width="9" height="23" rx="3" fill="#4F46E5"/>
  <rect x="10" y="9" width="5" height="10" rx="2" fill="#6366F1"/>
  <rect x="49" y="9" width="5" height="10" rx="2" fill="#6366F1"/>
  <rect x="15" y="42.5" width="34" height="6" rx="2.5" fill="#CBD5E1"/>
  <rect x="6" y="34" width="9" height="23" rx="3" fill="#6366F1"/>
  <rect x="49" y="34" width="9" height="23" rx="3" fill="#6366F1"/>
  <rect x="8" y="36" width="5" height="10" rx="2" fill="#818CF8"/>
  <rect x="51" y="36" width="5" height="10" rx="2" fill="#818CF8"/>`,

  // 25. Preacher curl bench (Banco Scott — biceps)
  'biceps.svg': `
  <rect x="6" y="53" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="13" y="38" width="6.5" height="17" rx="2.5" fill="#94A3B8"/>
  <rect x="42" y="21" width="6.5" height="34" rx="2.5" fill="#94A3B8"/>
  <rect x="7" y="34" width="18" height="8" rx="3" fill="#64748B"/>
  <rect x="24" y="23" width="22" height="9.5" rx="3" transform="rotate(-48 24 23)" fill="#64748B"/>
  <rect x="37" y="30" width="22" height="5" rx="2.5" fill="#CBD5E1"/>
  <circle cx="49" cy="32.5" r="9.5" fill="#4F46E5"/>
  <circle cx="49" cy="32.5" r="5.5" fill="#6366F1"/>
  <circle cx="49" cy="32.5" r="2.5" fill="#CBD5E1"/>`,

  // 26. French press bench & EZ bar (triceps)
  'triceps.svg': `
  <rect x="6" y="52" width="52" height="6" rx="3" fill="#64748B"/>
  <rect x="14" y="41" width="6.5" height="13" rx="2" fill="#94A3B8"/>
  <rect x="43.5" y="41" width="6.5" height="13" rx="2" fill="#94A3B8"/>
  <rect x="8" y="35" width="48" height="9" rx="3" fill="#64748B"/>
  <path d="M8 19 H19 L25 13 L30 23 H34 L39 13 L45 19 H56" stroke="#CBD5E1" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="8" y="7" width="7.5" height="24" rx="2.5" fill="#4F46E5"/>
  <rect x="48.5" y="7" width="7.5" height="24" rx="2.5" fill="#4F46E5"/>
  <rect x="10" y="9" width="3.5" height="10" rx="1.5" fill="#6366F1"/>
  <rect x="50.5" y="9" width="3.5" height="10" rx="1.5" fill="#6366F1"/>`,

  // 27. Olympic competition barbell & lifting platform (weightlifting)
  'weightlifting.svg': `
  <rect x="5" y="49" width="54" height="9" rx="3" fill="#64748B"/>
  <rect x="20" y="49" width="24" height="9" fill="#94A3B8"/>
  <rect x="4" y="23" width="56" height="5.5" rx="2.5" fill="#CBD5E1"/>
  <rect x="14" y="8" width="7.5" height="36" rx="2.5" fill="#4F46E5"/>
  <rect x="7" y="13" width="5.5" height="26" rx="2" fill="#6366F1"/>
  <rect x="42.5" y="8" width="7.5" height="36" rx="2.5" fill="#4F46E5"/>
  <rect x="51.5" y="13" width="5.5" height="26" rx="2" fill="#6366F1"/>`,

  // 28. Push-up parallettes / handles on mat (pushups — ZERO PEOPLE)
  'pushups.svg': `
  <rect x="4" y="47" width="56" height="9" rx="3" fill="#64748B"/>
  <path d="M11 47 V30 H28 V47" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M36 47 V30 H53 V47" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="7" y="24" width="23" height="9" rx="4.5" fill="#4F46E5"/>
  <rect x="10" y="26" width="17" height="3.5" rx="1.7" fill="#818CF8"/>
  <rect x="34" y="24" width="23" height="9" rx="4.5" fill="#6366F1"/>
  <rect x="37" y="26" width="17" height="3.5" rx="1.7" fill="#818CF8"/>`,

  // 29. Isometric core mat & forearm support blocks (plank — ZERO PEOPLE)
  'plank.svg': `
  <rect x="4" y="44" width="56" height="10" rx="3" fill="#64748B"/>
  <rect x="9" y="33" width="19" height="11" rx="3" fill="#94A3B8"/>
  <rect x="36" y="33" width="19" height="11" rx="3" fill="#94A3B8"/>
  <rect x="8" y="12" width="48" height="13" rx="4" fill="#64748B"/>
  <rect x="13" y="16" width="28" height="5" rx="2.5" fill="#6366F1"/>
  <circle cx="48" cy="18.5" r="3.5" fill="#CBD5E1"/>`,

  // 30. Decline ab bench & ab-wheel roller (abs — ZERO PEOPLE)
  'abs.svg': `
  <rect x="5" y="53" width="54" height="6" rx="3" fill="#64748B"/>
  <rect x="11" y="25" width="6.5" height="30" rx="2.5" fill="#94A3B8"/>
  <rect x="9" y="17" width="14" height="8" rx="4" fill="#CBD5E1"/>
  <rect x="16" y="26" width="29" height="9" rx="3" transform="rotate(28 16 26)" fill="#64748B"/>
  <circle cx="46" cy="41" r="13" fill="#4F46E5"/>
  <circle cx="46" cy="41" r="8" fill="#6366F1"/>
  <rect x="34" y="38.5" width="24" height="5" rx="2.5" fill="#CBD5E1"/>`,

  // 31. Mobility foam roller on mat (stretching — ZERO PEOPLE)
  'stretching.svg': `
  <rect x="4" y="46" width="56" height="9" rx="3" fill="#64748B"/>
  <rect x="8" y="15" width="48" height="26" rx="10" fill="#94A3B8"/>
  <ellipse cx="48" cy="28" rx="7" ry="13" fill="#64748B"/>
  <ellipse cx="48" cy="28" rx="3.5" ry="6.5" fill="#CBD5E1"/>
  <rect x="14" y="18" width="6" height="20" rx="3" fill="#4F46E5"/>
  <rect x="24" y="18" width="6" height="20" rx="3" fill="#6366F1"/>
  <rect x="34" y="18" width="6" height="20" rx="3" fill="#4F46E5"/>`,

  // 32. Stationary spin / air bike
  'bike.svg': `
  <rect x="6" y="53" width="52" height="6" rx="3" fill="#64748B"/>
  <line x1="18" y1="53" x2="21" y2="23" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round"/>
  <line x1="20" y1="38" x2="45" y2="41" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round"/>
  <line x1="45" y1="41" x2="48" y2="14" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round"/>
  <rect x="12" y="18" width="17" height="7" rx="3.5" fill="#64748B"/>
  <path d="M43 14 H54 L58 9" stroke="#CBD5E1" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="45" cy="41" r="13" fill="#4F46E5"/>
  <circle cx="45" cy="41" r="8" fill="#6366F1"/>
  <circle cx="45" cy="41" r="3.5" fill="#CBD5E1"/>
  <circle cx="22" cy="44" r="4" fill="#CBD5E1"/>`,

  // 33. Commercial treadmill
  'treadmill.svg': `
  <rect x="5" y="45" width="54" height="11" rx="4" fill="#64748B"/>
  <rect x="10" y="48.5" width="22" height="4" rx="2" fill="#6366F1"/>
  <rect x="43" y="38" width="16" height="10" rx="3" fill="#94A3B8"/>
  <line x1="51" y1="41" x2="55" y2="12" stroke="#94A3B8" stroke-width="6" stroke-linecap="round"/>
  <line x1="34" y1="26" x2="53" y2="23" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="37" y="8" width="21" height="10" rx="3" transform="rotate(-16 37 8)" fill="#64748B"/>
  <rect x="41" y="11" width="12" height="4" rx="2" transform="rotate(-16 41 11)" fill="#6366F1"/>`,

  // 34. Rolled & unrolled exercise mat (clean perspective roll + indigo strap — NOT tape measure)
  'yoga-mat.svg': `
  <rect x="6" y="42" width="52" height="10" rx="3" fill="#64748B"/>
  <rect x="8" y="14" width="48" height="24" rx="12" fill="#94A3B8"/>
  <ellipse cx="48" cy="26" rx="8" ry="12" fill="#64748B"/>
  <ellipse cx="48" cy="26" rx="4" ry="6.5" fill="#CBD5E1"/>
  <rect x="19" y="14" width="11" height="24" rx="2.5" fill="#4F46E5"/>
  <rect x="21.5" y="14" width="6" height="24" fill="#6366F1"/>
  <rect x="23" y="16" width="3" height="8" rx="1.5" fill="#818CF8"/>`,

  // 35. Gym interval stopwatch timer
  'timer.svg': `
  <rect x="25" y="4" width="14" height="6" rx="3" fill="#CBD5E1"/>
  <rect x="29" y="9" width="6" height="6" fill="#94A3B8"/>
  <circle cx="32" cy="36" r="23" fill="#64748B"/>
  <circle cx="32" cy="36" r="17.5" fill="#94A3B8"/>
  <path d="M32 21 A15 15 0 0 1 47 36" stroke="#6366F1" stroke-width="5.5" stroke-linecap="round"/>
  <line x1="32" y1="36" x2="32" y2="24" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
  <line x1="32" y1="36" x2="42" y2="36" stroke="#4F46E5" stroke-width="4" stroke-linecap="round"/>
  <circle cx="32" cy="36" r="4" fill="#6366F1"/>`,

  // 36. Gym shaker / hydration bottle
  'water.svg': `
  <rect x="24" y="4" width="16" height="6.5" rx="3" fill="#CBD5E1"/>
  <rect x="18" y="10" width="28" height="8" rx="3" fill="#94A3B8"/>
  <rect x="16" y="18" width="32" height="41" rx="5" fill="#64748B"/>
  <rect x="19" y="33" width="26" height="23" rx="3" fill="#4F46E5"/>
  <rect x="19" y="33" width="26" height="7" rx="2" fill="#6366F1"/>
  <rect x="37" y="23" width="7" height="3.5" rx="1.5" fill="#CBD5E1"/>`,

  // 37. Rest / recovery emblem (NO outer box — clean solid indigo crescent + 2 titanium accents)
  'rest.svg': `
  <path d="M37 8 A24 24 0 1 0 56 44 A19 19 0 1 1 37 8 Z" fill="#6366F1"/>
  <path d="M31 12 A21 21 0 0 0 13 38 A17 17 0 0 1 31 12 Z" fill="#818CF8"/>
  <rect x="40" y="12" width="15" height="5.5" rx="2.75" fill="#94A3B8"/>
  <rect x="45" y="22" width="12" height="5.5" rx="2.75" fill="#CBD5E1"/>`,

  // 38. Digital body weight scale
  'scale.svg': `
  <rect x="6" y="6" width="52" height="52" rx="10" fill="#94A3B8"/>
  <rect x="11" y="11" width="42" height="42" rx="6" fill="#64748B"/>
  <rect x="17" y="16" width="30" height="12" rx="3" fill="#4F46E5"/>
  <rect x="21" y="20" width="22" height="4" rx="2" fill="#CBD5E1"/>
  <rect x="16" y="34" width="13" height="14" rx="3" fill="#94A3B8"/>
  <rect x="35" y="34" width="13" height="14" rx="3" fill="#94A3B8"/>`,

  // 39. Workout calendar schedule
  'workout-calendar.svg': `
  <rect x="6" y="12" width="52" height="46" rx="6" fill="#64748B"/>
  <rect x="6" y="12" width="52" height="13" rx="5" fill="#94A3B8"/>
  <rect x="17" y="5" width="6" height="12" rx="3" fill="#CBD5E1"/>
  <rect x="41" y="5" width="6" height="12" rx="3" fill="#CBD5E1"/>
  <rect x="13" y="31" width="10" height="9" rx="2.5" fill="#6366F1"/>
  <rect x="27" y="31" width="10" height="9" rx="2.5" fill="#94A3B8"/>
  <rect x="41" y="31" width="10" height="9" rx="2.5" fill="#6366F1"/>
  <rect x="13" y="44" width="10" height="9" rx="2.5" fill="#94A3B8"/>
  <rect x="27" y="44" width="10" height="9" rx="2.5" fill="#4F46E5"/>
  <rect x="41" y="44" width="10" height="9" rx="2.5" fill="#94A3B8"/>`,
};

// Frozen, approved canonical SVGs (V3.2 base + definitive overrides for yoga-mat, hamstrings, leg-press).
// NEVER alter coordinates, colors, or attributes in these 12 entries.
const FROZEN_APPROVED_SVGS = {
  'bench-press.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="8" y="52" width="48" height="4.5" rx="2.25" fill="#64748B"/><rect x="16" y="13" width="5" height="40" rx="2" fill="#94A3B8"/><rect x="43" y="13" width="5" height="40" rx="2" fill="#94A3B8"/><rect x="15" y="16.5" width="7" height="3.5" rx="1.5" fill="#CBD5E1"/><rect x="42" y="16.5" width="7" height="3.5" rx="1.5" fill="#CBD5E1"/><rect x="29.5" y="40" width="5" height="13" rx="1.5" fill="#94A3B8"/><rect x="14" y="37" width="36" height="5.5" rx="2.5" fill="#64748B"/><rect x="15" y="37" width="34" height="2" rx="1" fill="#94A3B8"/><rect x="5" y="19.5" width="54" height="4" rx="2" fill="#CBD5E1"/><rect x="11.5" y="11" width="5.5" height="21" rx="2.2" fill="#6366F1"/><rect x="6.5" y="13.5" width="4.5" height="16" rx="1.8" fill="#4F46E5"/><rect x="47" y="11" width="5.5" height="21" rx="2.2" fill="#6366F1"/><rect x="53" y="13.5" width="4.5" height="16" rx="1.8" fill="#4F46E5"/></svg>',
  'lat-pulldown.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="8" y="53" width="48" height="4.5" rx="2.25" fill="#64748B"/><rect x="10" y="9" width="4.5" height="45" rx="2" fill="#94A3B8"/><rect x="49.5" y="9" width="4.5" height="45" rx="2" fill="#94A3B8"/><rect x="10" y="8" width="44" height="4.5" rx="2.2" fill="#94A3B8"/><circle cx="32" cy="13.5" r="3.2" fill="#CBD5E1"/><line x1="32" y1="16" x2="32" y2="23.5" stroke="#CBD5E1" stroke-width="2.6" stroke-linecap="round"/><path d="M17.5 29.5 L23 23.5 L41 23.5 L46.5 29.5" stroke="#6366F1" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="23.5" r="2.2" fill="#818CF8"/><rect x="29.5" y="37" width="5" height="17" rx="2" fill="#94A3B8"/><rect x="22" y="37.5" width="20" height="4" rx="2" fill="#CBD5E1"/><rect x="20" y="44.5" width="24" height="5" rx="2.5" fill="#64748B"/></svg>',
  'leg-press.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="6" y="50" width="52" height="5" rx="2.5" fill="#94A3B8"/><rect x="50" y="19" width="5.5" height="33" rx="2" fill="#94A3B8"/><rect x="11" y="33" width="5" height="19" rx="1.5" fill="#94A3B8"/><rect x="19" y="42" width="5" height="10" rx="1.5" fill="#94A3B8"/><line x1="29" y1="52" x2="53" y2="28" stroke="#64748B" stroke-width="3.5" stroke-linecap="round"/><line x1="24" y1="51" x2="52" y2="23" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/><path d="M11 32L19 43" stroke="#94A3B8" stroke-width="3.5" stroke-linecap="round"/><path d="M9 28L19 41.5" stroke="#64748B" stroke-width="6.5" stroke-linecap="round"/><path d="M19 42.5H28" stroke="#64748B" stroke-width="6.5" stroke-linecap="round"/><line x1="35" y1="20" x2="44" y2="30" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round"/><line x1="28" y1="13" x2="40" y2="25" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/><circle cx="44" cy="30" r="8" fill="#6366F1"/><circle cx="44" cy="30" r="5.2" fill="#4F46E5"/><path d="M39.8 25.8A6 6 0 0 1 48.2 25.8" stroke="#818CF8" stroke-width="1.8" stroke-linecap="round"/><circle cx="44" cy="30" r="2.2" fill="#CBD5E1"/></svg>',
  'dumbbell.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><g transform="rotate(-45 32 32)"><rect x="20" y="28.5" width="24" height="7" rx="2" fill="#CBD5E1"/><rect x="26" y="28.5" width="12" height="7" rx="1" fill="#94A3B8"/><rect x="19" y="25" width="3.5" height="14" rx="1.5" fill="#64748B"/><rect x="41.5" y="25" width="3.5" height="14" rx="1.5" fill="#64748B"/><rect x="7" y="17" width="12.5" height="30" rx="4" fill="#6366F1"/><rect x="15.5" y="19" width="4" height="26" rx="1.5" fill="#4F46E5"/><rect x="9.5" y="21" width="2.4" height="22" rx="1.2" fill="#818CF8"/><rect x="44.5" y="17" width="12.5" height="30" rx="4" fill="#6366F1"/><rect x="44.5" y="19" width="4" height="26" rx="1.5" fill="#4F46E5"/><rect x="52.1" y="21" width="2.4" height="22" rx="1.2" fill="#818CF8"/></g></svg>',
  'shoulder-press.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="7" y="52" width="50" height="4.5" rx="2.25" fill="#64748B"/><rect x="48" y="10" width="8" height="43" rx="2" fill="#94A3B8"/><rect x="49.5" y="14" width="5" height="34" rx="1.2" fill="#64748B"/><rect x="50" y="16" width="4" height="4" rx="1" fill="#6366F1"/><rect x="50" y="21.5" width="4" height="4" rx="1" fill="#6366F1"/><rect x="50" y="27" width="4" height="4" rx="1" fill="#CBD5E1"/><rect x="27" y="11" width="22" height="4.5" rx="2" fill="#94A3B8"/><path d="M29 14 L18 22 L12 22" stroke="#6366F1" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.5" y="18.5" width="6.5" height="7" rx="2.5" fill="#818CF8"/><circle cx="29" cy="13.5" r="3.6" fill="#CBD5E1"/><circle cx="29" cy="13.5" r="1.5" fill="#64748B"/><rect x="21" y="42" width="5.5" height="11" rx="2" fill="#94A3B8"/><rect x="35" y="24" width="4.5" height="29" rx="1.8" fill="#94A3B8"/><rect x="30" y="22.5" width="5.5" height="21" rx="2.5" fill="#64748B"/><rect x="13" y="39" width="21" height="5.5" rx="2.5" fill="#64748B"/><rect x="14" y="39" width="18" height="1.8" rx="0.9" fill="#94A3B8"/></svg>',
  'yoga-mat.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><path d="M15.5 47.5H47V52H15.5Z" fill="#94A3B8"/><path d="M47 47.5L59 29.5V34L47 52Z" fill="#64748B"/><path d="M15.5 47.5H47L59 29.5H27.5Z" fill="#6366F1"/><path d="M26 32.5H54L46.5 44H18.5Z" fill="#4F46E5" opacity="0.35"/><path d="M19 46H46L56.5 30.5" stroke="#818CF8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.8 35.7L18.8 17.7A10.5 10.5 0 1 1 36.2 29.3L24.2 47.3Z" fill="#94A3B8"/><path d="M11.5 33.5L22.5 17" stroke="#CBD5E1" stroke-width="3.2" stroke-linecap="round"/><circle cx="15.5" cy="41.5" r="10.5" fill="#CBD5E1"/><circle cx="15.5" cy="41.5" r="7.4" fill="#64748B"/><path d="M15.5 35.8A5.7 5.7 0 1 1 10.2 43.6" stroke="#6366F1" stroke-width="2.8" stroke-linecap="round"/><circle cx="15.5" cy="41.5" r="2.5" fill="#6366F1"/></svg>',
  'leg-extension.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="7" y="52" width="50" height="4.5" rx="2.25" fill="#64748B"/><rect x="43.5" y="12" width="5" height="41" rx="2" fill="#94A3B8"/><rect x="25" y="38" width="5" height="15" rx="2" fill="#94A3B8"/><rect x="49.5" y="18" width="6" height="30" rx="1.5" fill="#64748B"/><rect x="50.5" y="20" width="4" height="4" rx="1" fill="#6366F1"/><rect x="50.5" y="25.5" width="4" height="4" rx="1" fill="#6366F1"/><rect x="50.5" y="31" width="4" height="4" rx="1" fill="#CBD5E1"/><rect x="37" y="14" width="6.5" height="26" rx="2.5" fill="#64748B"/><rect x="19" y="33.5" width="24.5" height="6.5" rx="2.5" fill="#64748B"/><rect x="37" y="15" width="2" height="18.5" rx="1" fill="#94A3B8"/><rect x="20" y="33.5" width="17" height="2" rx="1" fill="#94A3B8"/><path d="M20 36.5 L12.5 47" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><circle cx="20" cy="36.5" r="3.8" fill="#CBD5E1"/><circle cx="20" cy="36.5" r="1.5" fill="#64748B"/><circle cx="12" cy="46.8" r="5.5" fill="#6366F1"/><circle cx="12" cy="46.8" r="2.2" fill="#CBD5E1"/></svg>',
  'hamstrings.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="6" y="53" width="52" height="5" rx="2.5" fill="#94A3B8"/><rect x="13" y="30" width="5.5" height="24" rx="2" fill="#94A3B8"/><rect x="37" y="27" width="6" height="27" rx="2" fill="#94A3B8"/><rect x="17" y="42" width="21" height="4" fill="#64748B"/><path d="M14 33L8 36V43" stroke="#CBD5E1" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 31.5L28 23.2L42 28.8" stroke="#94A3B8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 27.5L28 18.5L43 24.5" stroke="#64748B" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 26.5L28 18.5L41 23.7" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><line x1="40" y1="32" x2="51" y2="43" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/><circle cx="40" cy="32" r="4.5" fill="#CBD5E1"/><circle cx="40" cy="32" r="1.8" fill="#64748B"/><circle cx="51" cy="43" r="7" fill="#6366F1"/><circle cx="51" cy="43" r="4.8" fill="#4F46E5" opacity="0.5"/><path d="M47.4 39.2A5.2 5.2 0 0 1 54.6 39.2" stroke="#818CF8" stroke-width="1.8" stroke-linecap="round"/><circle cx="51" cy="43" r="2.2" fill="#CBD5E1"/></svg>',
  'seated-row.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="6" y="52" width="52" height="4.5" rx="2.25" fill="#64748B"/><rect x="10" y="40.5" width="4.5" height="12.5" rx="1.5" fill="#94A3B8"/><rect x="23" y="40.5" width="4.5" height="12.5" rx="1.5" fill="#94A3B8"/><rect x="8" y="38.5" width="21.5" height="3.5" rx="1.5" fill="#94A3B8"/><rect x="7.5" y="34.5" width="22.5" height="5" rx="2.5" fill="#64748B"/><path d="M34 52 L40 35" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/><path d="M36.5 46 L47 46" stroke="#64748B" stroke-width="3.5" stroke-linecap="round"/><rect x="47" y="11" width="9" height="42" rx="2.25" fill="#94A3B8"/><rect x="49" y="15" width="5" height="33" rx="1.2" fill="#64748B"/><rect x="49.5" y="17" width="4" height="4" rx="1" fill="#6366F1"/><rect x="49.5" y="22.5" width="4" height="4" rx="1" fill="#6366F1"/><rect x="49.5" y="28" width="4" height="4" rx="1" fill="#CBD5E1"/><path d="M44 30.8 L34 25.3" stroke="#CBD5E1" stroke-width="2.6" stroke-linecap="round"/><circle cx="45.5" cy="31.5" r="3.8" fill="#CBD5E1"/><circle cx="45.5" cy="31.5" r="1.5" fill="#64748B"/><path d="M33.5 25 L23.2 18.6 L23.2 31.4 Z" fill="none" stroke="#6366F1" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="33.5" cy="25" r="2" fill="#CBD5E1"/></svg>',
  'barbell.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="10" y="51" width="44" height="4.5" rx="2.25" fill="#64748B"/><rect x="5" y="28.5" width="54" height="5" rx="2.5" fill="#CBD5E1"/><rect x="23" y="28.5" width="18" height="5" rx="1" fill="#94A3B8"/><rect x="19" y="25" width="3.5" height="12" rx="1.5" fill="#64748B"/><rect x="41.5" y="25" width="3.5" height="12" rx="1.5" fill="#64748B"/><rect x="12.5" y="13.5" width="6" height="35" rx="2.5" fill="#6366F1"/><rect x="7" y="17.5" width="4.8" height="27" rx="2" fill="#4F46E5"/><rect x="14" y="16.5" width="2" height="29" rx="1" fill="#818CF8"/><rect x="45.5" y="13.5" width="6" height="35" rx="2.5" fill="#6366F1"/><rect x="52.2" y="17.5" width="4.8" height="27" rx="2" fill="#4F46E5"/><rect x="48" y="16.5" width="2" height="29" rx="1" fill="#818CF8"/></svg>',
  'bike.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><rect x="8" y="52" width="48" height="4.5" rx="2.25" fill="#64748B"/><path d="M18 52 L21 25" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><rect x="14" y="21" width="13.5" height="4.5" rx="2.25" fill="#64748B"/><path d="M44 52 L47 17" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><path d="M43 17 L53 14" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/><path d="M20 35 L43 40" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="43" r="3.8" fill="#CBD5E1"/><path d="M24 43 L29 48" stroke="#64748B" stroke-width="3.2" stroke-linecap="round"/><circle cx="43" cy="40" r="10.8" fill="#4F46E5"/><circle cx="43" cy="40" r="7.8" fill="#6366F1"/><circle cx="43" cy="40" r="2.8" fill="#CBD5E1"/></svg>',
  'rest.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision"><path d="M36.5 11.5 A21 21 0 1 0 51.5 44.5 A16.5 16.5 0 1 1 36.5 11.5 Z" fill="#6366F1"/><path d="M23.5 19 A16.5 16.5 0 0 0 26.5 45.5" stroke="#818CF8" stroke-width="2.6" stroke-linecap="round" fill="none"/><path d="M46 11 Q46.6 17.4 53 18 Q46.6 18.6 46 25 Q45.4 18.6 39 18 Q45.4 17.4 46 11 Z" fill="#CBD5E1"/><path d="M53.5 27 Q53.9 30.6 57.5 31 Q53.9 31.4 53.5 35 Q53.1 31.4 49.5 31 Q53.1 30.6 53.5 27 Z" fill="#94A3B8"/></svg>',
};

// Frozen, approved canonical SVGs — Tandas 2 a 5 (27 entries, cascade-merged BLOQUE_1 → BLOQUE_7).
// NEVER alter coordinates, colors, or attributes in these 27 entries.
const FROZEN_TANDAS_2_TO_5_SVGS = {
  // Tanda 2 (BLOQUE_1 + overrides BLOQUE_2: deadlift, ez-bar)
  'incline-bench-press.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="7" y="53" width="50" height="5" rx="2.5" fill="#64748B"/><rect x="14" y="18" width="6" height="36" rx="2" fill="#94A3B8"/><rect x="46" y="42" width="5" height="12" rx="2" fill="#94A3B8"/><line x1="29" y1="36" x2="29" y2="54" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><path d="M26 28L38 40" stroke="#64748B" stroke-width="7.5" stroke-linecap="round"/><path d="M26.5 26.5L38 38" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/><rect x="37" y="38" width="18" height="6.5" rx="3" fill="#64748B"/><rect x="38" y="38" width="16" height="2" rx="1" fill="#CBD5E1"/><circle cx="38" cy="41.5" r="2.2" fill="#94A3B8"/><rect x="12" y="16" width="10" height="5" rx="2" fill="#CBD5E1"/><circle cx="17" cy="17" r="10.5" fill="#6366F1"/><circle cx="17" cy="17" r="6.5" fill="#4F46E5"/><path d="M11 12.5A8 8 0 0 1 21 10.5" stroke="#818CF8" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="17" r="3" fill="#CBD5E1"/></svg>',
  'adjustable-bench.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="7" y="52" width="50" height="5" rx="2.5" fill="#64748B"/><rect x="13" y="40" width="5.5" height="13" rx="2" fill="#94A3B8"/><rect x="46" y="40" width="5.5" height="13" rx="2" fill="#94A3B8"/><rect x="13" y="40" width="38.5" height="5" rx="2" fill="#94A3B8"/><line x1="21" y1="42" x2="25" y2="25" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/><path d="M13 15L34 36" stroke="#64748B" stroke-width="8.5" stroke-linecap="round"/><path d="M14 13.5L34 33.5" stroke="#CBD5E1" stroke-width="2.2" stroke-linecap="round"/><path d="M38 38L54 35" stroke="#64748B" stroke-width="7.5" stroke-linecap="round"/><path d="M38.5 36L53.5 33.2" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/><rect x="16" y="37" width="10" height="10" rx="3" fill="#4F46E5"/><circle cx="21" cy="42" r="4.5" fill="#6366F1"/><circle cx="21" cy="42" r="1.8" fill="#818CF8"/><circle cx="36" cy="39" r="3.2" fill="#6366F1"/><circle cx="36" cy="39" r="1.4" fill="#CBD5E1"/></svg>',
  'squat-rack.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="9" y="54" width="46" height="5" rx="2.5" fill="#64748B"/><rect x="19" y="7" width="5.5" height="48" rx="2" fill="#94A3B8"/><rect x="39.5" y="7" width="5.5" height="48" rx="2" fill="#94A3B8"/><rect x="19" y="7" width="26" height="5" rx="2" fill="#64748B"/><rect x="20" y="7" width="24" height="2" rx="1" fill="#CBD5E1"/><rect x="24" y="40" width="5" height="4" rx="1.5" fill="#64748B"/><rect x="35" y="40" width="5" height="4" rx="1.5" fill="#64748B"/><rect x="18" y="25" width="7.5" height="4" rx="1.5" fill="#CBD5E1"/><rect x="38.5" y="25" width="7.5" height="4" rx="1.5" fill="#CBD5E1"/><rect x="5" y="21.5" width="54" height="4.5" rx="2" fill="#CBD5E1"/><rect x="16" y="19" width="3" height="9.5" rx="1.2" fill="#94A3B8"/><rect x="45" y="19" width="3" height="9.5" rx="1.2" fill="#94A3B8"/><rect x="10.5" y="12" width="5.5" height="23.5" rx="2.2" fill="#6366F1"/><rect x="11.5" y="14" width="2" height="19.5" rx="1" fill="#818CF8"/><rect x="5.5" y="15.5" width="4.5" height="16.5" rx="1.8" fill="#4F46E5"/><rect x="48" y="12" width="5.5" height="23.5" rx="2.2" fill="#6366F1"/><rect x="49" y="14" width="2" height="19.5" rx="1" fill="#818CF8"/><rect x="54" y="15.5" width="4.5" height="16.5" rx="1.8" fill="#4F46E5"/></svg>',
  'deadlift.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="5" y="53" width="54" height="6" rx="2.5" fill="#64748B"/>\n  <rect x="20" y="53" width="24" height="2.5" rx="1" fill="#94A3B8"/>\n  <path d="M32 7 L40 16 L35.5 16 L35.5 26 C35.5 27.1 34.6 28 33.5 28 L30.5 28 C29.4 28 28.5 27.1 28.5 26 L28.5 16 L24 16 Z" fill="#94A3B8"/>\n  <path d="M32 7 L40 16 L35.5 16 L32 12 L28.5 16 L24 16 Z" fill="#CBD5E1"/>\n  <rect x="5" y="36" width="54" height="4" rx="2" fill="#CBD5E1"/>\n  <rect x="5" y="34" width="3" height="8" rx="1.2" fill="#94A3B8"/>\n  <rect x="56" y="34" width="3" height="8" rx="1.2" fill="#94A3B8"/>\n  <rect x="9" y="25" width="5" height="28" rx="2" fill="#4F46E5"/>\n  <rect x="15" y="22" width="6.5" height="31" rx="2.5" fill="#6366F1"/>\n  <rect x="16.5" y="25.5" width="1.5" height="24" rx="0.75" fill="#818CF8"/>\n  <rect x="42.5" y="22" width="6.5" height="31" rx="2.5" fill="#6366F1"/>\n  <rect x="44" y="25.5" width="1.5" height="24" rx="0.75" fill="#818CF8"/>\n  <rect x="50" y="25" width="5" height="28" rx="2" fill="#4F46E5"/>\n</svg>',
  'ez-bar.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="4" y="30" width="13" height="4" rx="2" fill="#94A3B8"/>\n  <rect x="47" y="30" width="13" height="4" rx="2" fill="#94A3B8"/>\n  <path d="M16.5 32 C19.2 32 20.5 27.5 24 27.5 C27.5 27.5 28.5 36 32 36 C35.5 36 36.5 27.5 40 27.5 C43.5 27.5 44.8 32 47.5 32" stroke="#CBD5E1" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>\n  <rect x="6.5" y="21" width="3.5" height="22" rx="1.5" fill="#4F46E5"/>\n  <rect x="10.5" y="17" width="5" height="30" rx="2" fill="#6366F1"/>\n  <rect x="11.8" y="20" width="1.4" height="24" rx="0.7" fill="#818CF8"/>\n  <rect x="15.5" y="28.5" width="2.2" height="7" rx="1" fill="#94A3B8"/>\n  <rect x="46.3" y="28.5" width="2.2" height="7" rx="1" fill="#94A3B8"/>\n  <rect x="48.5" y="17" width="5" height="30" rx="2" fill="#6366F1"/>\n  <rect x="49.8" y="20" width="1.4" height="24" rx="0.7" fill="#818CF8"/>\n  <rect x="54" y="21" width="3.5" height="22" rx="1.5" fill="#4F46E5"/>\n</svg>',
  'curls.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="15" y="17" width="22" height="5" rx="2" fill="#CBD5E1"/><rect x="21" y="16.5" width="10" height="6" rx="1.8" fill="#94A3B8"/><rect x="6" y="8" width="10" height="23" rx="3" fill="#6366F1"/><rect x="7.5" y="10" width="2.5" height="19" rx="1.2" fill="#818CF8"/><rect x="14" y="11" width="3" height="17" rx="1.2" fill="#4F46E5"/><rect x="36" y="8" width="10" height="23" rx="3" fill="#6366F1"/><rect x="37.5" y="10" width="2.5" height="19" rx="1.2" fill="#818CF8"/><rect x="35" y="11" width="3" height="17" rx="1.2" fill="#4F46E5"/><rect x="27" y="42" width="22" height="5" rx="2" fill="#CBD5E1"/><rect x="33" y="41.5" width="10" height="6" rx="1.8" fill="#94A3B8"/><rect x="18" y="33" width="10" height="23" rx="3" fill="#6366F1"/><rect x="19.5" y="35" width="2.5" height="19" rx="1.2" fill="#818CF8"/><rect x="26" y="36" width="3" height="17" rx="1.2" fill="#4F46E5"/><rect x="48" y="33" width="10" height="23" rx="3" fill="#6366F1"/><rect x="49.5" y="35" width="2.5" height="19" rx="1.2" fill="#818CF8"/><rect x="47" y="36" width="3" height="17" rx="1.2" fill="#4F46E5"/></svg>',

  // Tanda 3 (BLOQUE_3 + overrides BLOQUE_4 + overrides BLOQUE_5)
  'pec-deck.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="10" y="54" width="44" height="5" rx="2.5" fill="#64748B"/>\n  <rect x="28" y="12" width="8" height="43" rx="2" fill="#94A3B8"/>\n  <rect x="10" y="9" width="44" height="5" rx="2.5" fill="#94A3B8"/>\n  <rect x="10" y="13" width="4" height="25" rx="2" fill="#CBD5E1"/>\n  <rect x="50" y="13" width="4" height="25" rx="2" fill="#CBD5E1"/>\n  <circle cx="12" cy="11.5" r="2.2" fill="#CBD5E1"/>\n  <circle cx="52" cy="11.5" r="2.2" fill="#CBD5E1"/>\n  <rect x="25" y="20" width="14" height="19" rx="3" fill="#64748B"/>\n  <rect x="22" y="43" width="20" height="5" rx="2.5" fill="#64748B"/>\n  <rect x="6" y="21" width="9" height="17" rx="3" fill="#6366F1"/>\n  <rect x="8" y="23" width="2.2" height="13" rx="1.1" fill="#818CF8"/>\n  <rect x="15" y="31" width="4" height="4" rx="1.5" fill="#4F46E5"/>\n  <rect x="49" y="21" width="9" height="17" rx="3" fill="#6366F1"/>\n  <rect x="53.8" y="23" width="2.2" height="13" rx="1.1" fill="#818CF8"/>\n  <rect x="45" y="31" width="4" height="4" rx="1.5" fill="#4F46E5"/>\n</svg>',
  'cable-machine.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="54" width="18" height="4.5" rx="2" fill="#64748B"/><rect x="42" y="54" width="18" height="4.5" rx="2" fill="#64748B"/><rect x="6" y="14" width="14" height="41" rx="2" fill="#94A3B8"/><rect x="44" y="14" width="14" height="41" rx="2" fill="#94A3B8"/><rect x="4" y="7" width="56" height="9" rx="2.5" fill="#94A3B8"/><rect x="14" y="10.25" width="36" height="2.5" rx="1.25" fill="#64748B"/><rect x="9" y="19" width="8" height="32" rx="1.5" fill="#64748B"/><rect x="47" y="19" width="8" height="32" rx="1.5" fill="#64748B"/><rect x="10" y="32" width="6" height="4.5" rx="1" fill="#6366F1"/><rect x="10" y="38.5" width="6" height="4.5" rx="1" fill="#6366F1"/><rect x="10" y="45" width="6" height="4.5" rx="1" fill="#4F46E5"/><rect x="48" y="32" width="6" height="4.5" rx="1" fill="#6366F1"/><rect x="48" y="38.5" width="6" height="4.5" rx="1" fill="#6366F1"/><rect x="48" y="45" width="6" height="4.5" rx="1" fill="#4F46E5"/><rect x="20" y="20" width="3.5" height="7" rx="1.5" fill="#64748B"/><rect x="40.5" y="20" width="3.5" height="7" rx="1.5" fill="#64748B"/><line x1="22.5" y1="24" x2="27" y2="36" stroke="#CBD5E1" stroke-width="2.5" stroke-linecap="round"/><line x1="41.5" y1="24" x2="37" y2="36" stroke="#CBD5E1" stroke-width="2.5" stroke-linecap="round"/><rect x="23" y="36" width="7" height="8" rx="3" stroke="#6366F1" stroke-width="3"/><rect x="34" y="36" width="7" height="8" rx="3" stroke="#6366F1" stroke-width="3"/></svg>',
  'tricep-pushdown.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="8" y="54" width="44" height="5" rx="2.5" fill="#64748B"/>\n  <rect x="10" y="6" width="17" height="49" rx="3" fill="#94A3B8"/>\n  <rect x="24" y="10" width="3" height="44" fill="#CBD5E1"/>\n  <rect x="13" y="16" width="9" height="34" rx="2" fill="#64748B"/>\n  <rect x="14" y="28" width="7" height="4" rx="1" fill="#CBD5E1"/>\n  <rect x="14" y="33.5" width="7" height="4" rx="1" fill="#94A3B8"/>\n  <rect x="14" y="39" width="7" height="4" rx="1" fill="#6366F1"/>\n  <rect x="14" y="44.5" width="7" height="4.5" rx="1" fill="#4F46E5"/>\n  <path d="M25.5 23 L37.5 13.5" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/>\n  <rect x="24" y="8" width="26" height="6.5" rx="3" fill="#CBD5E1"/>\n  <circle cx="45" cy="15.5" r="4.5" fill="#94A3B8"/>\n  <circle cx="45" cy="15.5" r="2" fill="#CBD5E1"/>\n  <rect x="43.8" y="19" width="2.4" height="10" fill="#CBD5E1"/>\n  <rect x="42.5" y="27.5" width="5" height="4.5" rx="2" fill="#94A3B8"/>\n  <path d="M44 31 L38.5 41" stroke="#6366F1" stroke-width="3.4" stroke-linecap="round"/>\n  <path d="M46 31 L51.5 41" stroke="#6366F1" stroke-width="3.4" stroke-linecap="round"/>\n  <rect x="35.2" y="39.5" width="6" height="4.2" rx="1.8" transform="rotate(28 38.2 41.6)" fill="#818CF8"/>\n  <rect x="48.8" y="39.5" width="6" height="4.2" rx="1.8" transform="rotate(-28 51.8 41.6)" fill="#818CF8"/>\n</svg>',
  'torso.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="14" y="54" width="36" height="4.5" rx="2" fill="#64748B"/><rect x="29.5" y="13" width="5" height="42" rx="1.5" fill="#94A3B8"/><rect x="13" y="9" width="38" height="5.5" rx="2.5" fill="#94A3B8"/><rect x="15" y="12" width="4.5" height="26" rx="2" fill="#94A3B8"/><rect x="44.5" y="12" width="4.5" height="26" rx="2" fill="#94A3B8"/><circle cx="17.25" cy="11.75" r="2" fill="#CBD5E1"/><circle cx="46.75" cy="11.75" r="2" fill="#CBD5E1"/><rect x="27.5" y="19" width="9" height="22" rx="3" fill="#64748B"/><rect x="20" y="44" width="24" height="5.5" rx="2.5" fill="#64748B"/><rect x="5" y="32.5" width="12" height="3.5" rx="1.5" fill="#CBD5E1"/><rect x="47" y="32.5" width="12" height="3.5" rx="1.5" fill="#CBD5E1"/><rect x="9.5" y="24" width="4.5" height="20.5" rx="2" fill="#6366F1"/><rect x="4.5" y="27.5" width="4" height="13.5" rx="1.75" fill="#4F46E5"/><rect x="50" y="24" width="4.5" height="20.5" rx="2" fill="#6366F1"/><rect x="55.5" y="27.5" width="4" height="13.5" rx="1.75" fill="#4F46E5"/><rect x="18" y="32.5" width="7" height="4.5" rx="2.25" fill="#6366F1"/><rect x="39" y="32.5" width="7" height="4.5" rx="2.25" fill="#6366F1"/></svg>',
  'hack-squat.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="6" y="54" width="50" height="5" rx="2.5" fill="#64748B"/>\n  <rect x="48" y="12" width="6" height="43" rx="2.5" fill="#94A3B8"/>\n  <rect x="46" y="10" width="9" height="4.5" rx="2" fill="#CBD5E1"/>\n  <polygon points="7,43 20,55 7,55" fill="#94A3B8"/>\n  <line x1="19" y1="54" x2="50" y2="15" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/>\n  <line x1="26" y1="54" x2="51" y2="23" stroke="#94A3B8" stroke-width="3.5" stroke-linecap="round"/>\n  <line x1="6" y1="40.5" x2="21.5" y2="54" stroke="#CBD5E1" stroke-width="5.5" stroke-linecap="round"/>\n  <rect x="33" y="30" width="9" height="9" rx="2" fill="#94A3B8"/>\n  <line x1="25" y1="40" x2="39" y2="22.5" stroke="#64748B" stroke-width="6.5" stroke-linecap="round"/>\n  <path d="M38 23.5 L29 16.5" stroke="#94A3B8" stroke-width="6.5" stroke-linecap="round"/>\n  <path d="M36 22 L29.5 17" stroke="#CBD5E1" stroke-width="2.8" stroke-linecap="round"/>\n  <circle cx="40.5" cy="35" r="8.5" fill="#6366F1"/>\n  <circle cx="40.5" cy="35" r="5.3" fill="#4F46E5"/>\n  <circle cx="40.5" cy="35" r="2.6" fill="#CBD5E1"/>\n</svg>',
  'seated-leg-curl.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="8" y="54" width="48" height="5" rx="2.5" fill="#64748B"/>\n  <rect x="46" y="10" width="9" height="45" rx="2.5" fill="#94A3B8"/>\n  <rect x="48.5" y="27" width="4" height="4.5" rx="1" fill="#64748B"/>\n  <rect x="48.5" y="33" width="4" height="4.5" rx="1" fill="#64748B"/>\n  <rect x="48.5" y="39" width="4" height="4.5" rx="1" fill="#64748B"/>\n  <rect x="29" y="38" width="5" height="17" rx="2" fill="#94A3B8"/>\n  <rect x="39" y="16" width="4.5" height="39" rx="2" fill="#94A3B8"/>\n  <rect x="34" y="15" width="6" height="24" rx="2.5" fill="#64748B"/>\n  <rect x="21" y="34" width="19" height="5.5" rx="2.5" fill="#64748B"/>\n  <path d="M23 36 L23 27 L31 27" stroke="#94A3B8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>\n  <rect x="22" y="24" width="11" height="5" rx="2.5" fill="#CBD5E1"/>\n  <line x1="23" y1="37" x2="12" y2="46" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round"/>\n  <circle cx="23" cy="36.5" r="3.5" fill="#94A3B8"/>\n  <circle cx="23" cy="36.5" r="1.5" fill="#CBD5E1"/>\n  <circle cx="12" cy="46" r="5.8" fill="#6366F1"/>\n  <circle cx="12" cy="46" r="2.6" fill="#4F46E5"/>\n  <path d="M8.5 43 A4.5 4.5 0 0 1 14 41.5" stroke="#818CF8" stroke-width="1.6" stroke-linecap="round"/>\n</svg>',
  'calves.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="5" y="54" width="54" height="4.5" rx="2.25" fill="#64748B"/><rect x="10" y="36" width="5.5" height="19" rx="1.5" fill="#94A3B8"/><rect x="7.5" y="35.5" width="10.5" height="2.5" rx="1" fill="#94A3B8"/><rect x="5" y="30" width="15.5" height="6" rx="3" fill="#64748B"/><rect x="26.5" y="48" width="7" height="7" rx="1.5" fill="#94A3B8"/><rect x="24" y="44.5" width="12" height="4" rx="2" fill="#CBD5E1"/><rect x="51.5" y="36" width="5.5" height="19" rx="2" fill="#94A3B8"/><line x1="54.25" y1="39" x2="29" y2="26" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/><rect x="27" y="23" width="4" height="5" rx="1" fill="#CBD5E1"/><rect x="22.5" y="18" width="13" height="5.5" rx="2.75" fill="#64748B"/><circle cx="54.25" cy="39" r="2.25" fill="#CBD5E1"/><circle cx="44" cy="33.75" r="8.25" fill="#6366F1"/><circle cx="44" cy="33.75" r="4.75" fill="#4F46E5"/><circle cx="44" cy="33.75" r="2.25" fill="#CBD5E1"/></svg>',

  // Tanda 4 (BLOQUE_6 + override BLOQUE_7: triceps)
  'power-tower.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="20" y="46" width="38" height="4.5" rx="2" fill="#64748B"/><rect x="23" y="13" width="5" height="35" rx="2" fill="#64748B"/><rect x="50" y="13" width="5" height="35" rx="2" fill="#64748B"/><rect x="21" y="11" width="36" height="5" rx="2.5" fill="#94A3B8"/><rect x="28" y="10" width="22" height="7" rx="3" fill="#4F46E5"/><path d="M13 55L24 48.5M42 55L53 48.5" stroke="#64748B" stroke-width="4" stroke-linecap="round"/><rect x="6" y="53" width="40" height="5" rx="2.5" fill="#94A3B8"/><rect x="10" y="23" width="6" height="32" rx="2" fill="#94A3B8"/><rect x="36" y="23" width="6" height="32" rx="2" fill="#94A3B8"/><rect x="14" y="42" width="24" height="4" rx="2" fill="#64748B"/><rect x="8" y="21" width="36" height="5.5" rx="2.5" fill="#CBD5E1"/><rect x="15" y="19.5" width="22" height="8" rx="3.5" fill="#6366F1"/><rect x="17" y="21" width="18" height="2.2" rx="1.1" fill="#818CF8"/></svg>',
  'pull-ups.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="5" y="53" width="16" height="5" rx="2.5" fill="#64748B"/><rect x="43" y="53" width="16" height="5" rx="2.5" fill="#64748B"/><rect x="10" y="14" width="6" height="41" rx="2" fill="#94A3B8"/><rect x="48" y="14" width="6" height="41" rx="2" fill="#94A3B8"/><path d="M16 26V16H25L16 26Z" fill="#64748B"/><path d="M48 26V16H39L48 26Z" fill="#64748B"/><rect x="15" y="42" width="8" height="4" rx="2" fill="#64748B"/><rect x="41" y="42" width="8" height="4" rx="2" fill="#64748B"/><rect x="6" y="11" width="52" height="5.5" rx="2.75" fill="#CBD5E1"/><rect x="16" y="9.5" width="10" height="8.5" rx="3" fill="#6366F1"/><rect x="17.5" y="11" width="7" height="2" rx="1" fill="#818CF8"/><rect x="38" y="9.5" width="10" height="8.5" rx="3" fill="#6366F1"/><rect x="39.5" y="11" width="7" height="2" rx="1" fill="#818CF8"/><rect x="27" y="15" width="4" height="10" rx="2" fill="#4F46E5"/><rect x="33" y="15" width="4" height="10" rx="2" fill="#4F46E5"/><rect x="26.5" y="21" width="5" height="6" rx="2" fill="#6366F1"/><rect x="32.5" y="21" width="5" height="6" rx="2" fill="#6366F1"/></svg>',
  'biceps.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="7" y="53" width="50" height="5" rx="2.5" fill="#64748B"/><rect x="45" y="41" width="6" height="13" rx="2" fill="#94A3B8"/><rect x="39" y="36" width="18" height="6.5" rx="3" fill="#64748B"/><rect x="41" y="37.5" width="14" height="2" rx="1" fill="#94A3B8"/><rect x="27" y="22" width="6" height="32" rx="2" fill="#94A3B8"/><rect x="13" y="37" width="5.5" height="17" rx="2" fill="#94A3B8"/><rect x="17" y="44" width="12" height="4.5" rx="2" fill="#64748B"/><g transform="translate(32 18) rotate(-42)"><rect x="-12" y="-4" width="24" height="7" rx="3" fill="#64748B"/><rect x="-11" y="2.5" width="22" height="3.5" rx="1.5" fill="#94A3B8"/></g><path d="M10 34V38C10 40 11.5 41 13.5 41H18C20 41 21.5 40 21.5 38V34" stroke="#CBD5E1" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.5" cy="30.5" r="8" fill="#6366F1"/><circle cx="15.5" cy="30.5" r="5" fill="#4F46E5"/><circle cx="15.5" cy="30.5" r="2.3" fill="#CBD5E1"/></svg>',
  'triceps.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="4" y="30" width="14" height="4" rx="1.5" fill="#CBD5E1"/>\n  <rect x="46" y="30" width="14" height="4" rx="1.5" fill="#CBD5E1"/>\n  <rect x="18" y="20" width="28" height="24" rx="7" stroke="#94A3B8" stroke-width="4"/>\n  <rect x="25.5" y="21" width="3" height="22" fill="#CBD5E1"/>\n  <rect x="35.5" y="21" width="3" height="22" fill="#CBD5E1"/>\n  <rect x="24.5" y="25" width="5" height="14" rx="2" fill="#6366F1"/>\n  <rect x="34.5" y="25" width="5" height="14" rx="2" fill="#6366F1"/>\n  <rect x="14" y="27" width="2.5" height="10" rx="1" fill="#64748B"/>\n  <rect x="47.5" y="27" width="2.5" height="10" rx="1" fill="#64748B"/>\n  <rect x="8.5" y="13" width="5" height="38" rx="2" fill="#6366F1"/>\n  <rect x="50.5" y="13" width="5" height="38" rx="2" fill="#6366F1"/>\n  <rect x="4" y="19" width="3.5" height="26" rx="1.5" fill="#4F46E5"/>\n  <rect x="56.5" y="19" width="3.5" height="26" rx="1.5" fill="#4F46E5"/>\n</svg>',
  'weightlifting.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="5" y="51" width="15" height="6.5" rx="2" fill="#64748B"/><rect x="44" y="51" width="15" height="6.5" rx="2" fill="#64748B"/><rect x="19" y="51" width="26" height="6.5" rx="1.5" fill="#94A3B8"/><rect x="21" y="51" width="22" height="2" rx="1" fill="#CBD5E1"/><rect x="19" y="23" width="5.5" height="29" rx="2" fill="#94A3B8"/><rect x="39.5" y="23" width="5.5" height="29" rx="2" fill="#94A3B8"/><path d="M14 51L19.5 41V51H14Z" fill="#64748B"/><path d="M50 51L44.5 41V51H50Z" fill="#64748B"/><rect x="5" y="20" width="54" height="4.5" rx="2.25" fill="#CBD5E1"/><rect x="26" y="20" width="12" height="4.5" rx="1" fill="#64748B"/><rect x="13" y="9" width="5" height="26.5" rx="2.2" fill="#6366F1"/><rect x="14.2" y="11" width="1.6" height="22.5" rx="0.8" fill="#818CF8"/><rect x="8.5" y="12" width="3.8" height="20.5" rx="1.8" fill="#4F46E5"/><rect x="4.8" y="15.5" width="3" height="13.5" rx="1.5" fill="#6366F1"/><rect x="46" y="9" width="5" height="26.5" rx="2.2" fill="#6366F1"/><rect x="47.2" y="11" width="1.6" height="22.5" rx="0.8" fill="#818CF8"/><rect x="51.7" y="12" width="3.8" height="20.5" rx="1.8" fill="#4F46E5"/><rect x="56.2" y="15.5" width="3" height="13.5" rx="1.5" fill="#6366F1"/></svg>',
  'pushups.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="5" y="51" width="54" height="5.5" rx="2.5" fill="#64748B"/><rect x="7" y="51" width="50" height="1.8" rx="0.9" fill="#94A3B8"/><rect x="7" y="47" width="8" height="4.5" rx="1.5" fill="#64748B"/><rect x="22" y="47" width="8" height="4.5" rx="1.5" fill="#64748B"/><path d="M11 48V24C11 21.5 13 20 15.5 20H21.5C24 20 26 21.5 26 24V48" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><rect x="11" y="16.5" width="15" height="8" rx="3.5" fill="#6366F1"/><rect x="13" y="18" width="11" height="2.2" rx="1.1" fill="#818CF8"/><rect x="34" y="47" width="8" height="4.5" rx="1.5" fill="#64748B"/><rect x="49" y="47" width="8" height="4.5" rx="1.5" fill="#64748B"/><path d="M38 48V24C38 21.5 40 20 42.5 20H48.5C51 20 53 21.5 53 24V48" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><rect x="38" y="16.5" width="15" height="8" rx="3.5" fill="#6366F1"/><rect x="40" y="18" width="11" height="2.2" rx="1.1" fill="#818CF8"/></svg>',
  'abs.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="6" y="53" width="52" height="5" rx="2.5" fill="#64748B"/><rect x="41" y="21" width="6" height="33" rx="2" fill="#94A3B8"/><path d="M33 53L41 42V53H33Z" fill="#64748B"/><rect x="10" y="42" width="6" height="12" rx="2" fill="#94A3B8"/><g transform="translate(26.5 31.5) rotate(-31)"><rect x="-21" y="-5.5" width="42" height="7" rx="3.2" fill="#64748B"/><rect x="-20" y="1.5" width="40" height="3.8" rx="1.5" fill="#94A3B8"/></g><rect x="42.5" y="13" width="4.5" height="11" rx="2" fill="#94A3B8"/><path d="M45 23L53.5 30" stroke="#94A3B8" stroke-width="4.5" stroke-linecap="round"/><circle cx="45" cy="13" r="5.5" fill="#6366F1"/><circle cx="45" cy="13" r="2" fill="#CBD5E1"/><circle cx="53.5" cy="30" r="5.5" fill="#6366F1"/><circle cx="53.5" cy="30" r="2" fill="#CBD5E1"/></svg>',

  // Tanda 5 (BLOQUE_7)
  'plank.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="5" y="47" width="54" height="6" rx="3" fill="#64748B"/>\n  <rect x="9" y="39" width="46" height="8" rx="2.5" fill="#94A3B8"/>\n  <rect x="11" y="18" width="5" height="22" rx="2" fill="#CBD5E1"/>\n  <rect x="10.5" y="13" width="6" height="12" rx="2.5" fill="#6366F1"/>\n  <rect x="19" y="30" width="21" height="9" rx="3.5" fill="#6366F1"/>\n  <rect x="22" y="32" width="15" height="2" rx="1" fill="#818CF8"/>\n  <path d="M44 39 L53 30 A2 2 0 0 1 56 31.5 V39 Z" fill="#CBD5E1"/>\n  <path d="M44 39 L51 32 L53 34 L48 39 Z" fill="#4F46E5"/>\n</svg>',
  'stretching.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="5" y="48" width="54" height="6" rx="3" fill="#64748B"/>\n  <rect x="7" y="18" width="38" height="30" rx="14" fill="#6366F1"/>\n  <rect x="14" y="21" width="4" height="24" rx="2" fill="#4F46E5"/>\n  <rect x="22" y="21" width="4" height="24" rx="2" fill="#4F46E5"/>\n  <rect x="30" y="21" width="4" height="24" rx="2" fill="#4F46E5"/>\n  <circle cx="45" cy="33" r="15" fill="#818CF8"/>\n  <circle cx="45" cy="33" r="11" fill="#CBD5E1"/>\n  <circle cx="45" cy="33" r="6" fill="#64748B"/>\n</svg>',
  'treadmill.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="6" y="51" width="11" height="4" rx="2" fill="#64748B"/>\n  <rect x="44" y="51" width="13" height="4" rx="2" fill="#64748B"/>\n  <rect x="6" y="45" width="46" height="7" rx="3.5" fill="#94A3B8"/>\n  <rect x="8" y="41" width="37" height="4.5" rx="2" fill="#6366F1"/>\n  <rect x="43" y="41" width="14" height="11" rx="3" fill="#64748B"/>\n  <path d="M51 43 L43 15" stroke="#94A3B8" stroke-width="5.5" stroke-linecap="round"/>\n  <path d="M46 26 L31 26" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>\n  <rect x="28" y="23.5" width="9" height="5" rx="2.5" fill="#6366F1"/>\n  <g transform="rotate(14 44 15)">\n    <rect x="34" y="10" width="20" height="9" rx="3" fill="#CBD5E1"/>\n    <rect x="36.5" y="12" width="15" height="5" rx="1.5" fill="#4F46E5"/>\n  </g>\n</svg>',
  'timer.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="29" y="10" width="6" height="6" fill="#64748B"/>\n  <rect x="24" y="6" width="16" height="5" rx="2.5" fill="#6366F1"/>\n  <rect x="47" y="14" width="6" height="6" rx="2" transform="rotate(42 50 17)" fill="#94A3B8"/>\n  <circle cx="32" cy="36" r="20" stroke="#94A3B8" stroke-width="5"/>\n  <path d="M32 16 A20 20 0 0 1 52 36" stroke="#6366F1" stroke-width="5.5" stroke-linecap="round"/>\n  <path d="M32 36 L42 26" stroke="#6366F1" stroke-width="4.5" stroke-linecap="round"/>\n  <circle cx="32" cy="36" r="4" fill="#CBD5E1" stroke="#64748B" stroke-width="2"/>\n</svg>',
  'water.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <path d="M44 13 H50 A3 3 0 0 1 53 16 V21 A3 3 0 0 1 50 24 H45" stroke="#94A3B8" stroke-width="3.5" stroke-linecap="round"/>\n  <rect x="24" y="5" width="12" height="6" rx="2.5" fill="#CBD5E1"/>\n  <rect x="15" y="10" width="30" height="8" rx="3" fill="#94A3B8"/>\n  <rect x="14" y="19" width="32" height="39" rx="6" fill="#64748B" stroke="#94A3B8" stroke-width="3.5"/>\n  <path d="M16 35 H44 V52 A4 4 0 0 1 40 56 H20 A4 4 0 0 1 16 52 Z" fill="#6366F1"/>\n  <rect x="16" y="34" width="28" height="3.5" rx="1.5" fill="#818CF8"/>\n  <rect x="35" y="25" width="6" height="3" rx="1.5" fill="#CBD5E1"/>\n  <rect x="35" y="40" width="6" height="3" rx="1.5" fill="#CBD5E1"/>\n  <rect x="35" y="48" width="6" height="3" rx="1.5" fill="#CBD5E1"/>\n</svg>',
  'scale.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="7" y="7" width="50" height="50" rx="9" fill="#94A3B8"/>\n  <rect x="11" y="11" width="42" height="42" rx="6" fill="#64748B"/>\n  <rect x="18" y="15" width="28" height="10" rx="3" fill="#CBD5E1"/>\n  <rect x="23" y="18.5" width="18" height="3" rx="1.5" fill="#4F46E5"/>\n  <rect x="15" y="30" width="14" height="19" rx="4" fill="#6366F1"/>\n  <rect x="35" y="30" width="14" height="19" rx="4" fill="#6366F1"/>\n  <rect x="18" y="33" width="8" height="2.5" rx="1.25" fill="#818CF8"/>\n  <rect x="38" y="33" width="8" height="2.5" rx="1.25" fill="#818CF8"/>\n</svg>',
  'workout-calendar.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">\n  <rect x="7" y="12" width="50" height="45" rx="7" fill="#94A3B8"/>\n  <rect x="10.5" y="24" width="43" height="29.5" rx="4" fill="#64748B"/>\n  <rect x="18" y="6" width="5" height="10" rx="2.5" fill="#CBD5E1"/>\n  <rect x="41" y="6" width="5" height="10" rx="2.5" fill="#CBD5E1"/>\n  <rect x="14" y="28" width="9" height="9" rx="2.5" fill="#6366F1"/>\n  <rect x="27.5" y="28" width="9" height="9" rx="2.5" fill="#CBD5E1"/>\n  <rect x="41" y="28" width="9" height="9" rx="2.5" fill="#6366F1"/>\n  <rect x="14" y="41" width="9" height="9" rx="2.5" fill="#CBD5E1"/>\n  <rect x="27.5" y="41" width="9" height="9" rx="2.5" fill="#6366F1"/>\n  <rect x="41" y="41" width="9" height="9" rx="2.5" fill="#CBD5E1"/>\n</svg>',
};

const ALL_FROZEN_SVGS = { ...FROZEN_APPROVED_SVGS, ...FROZEN_TANDAS_2_TO_5_SVGS };
const tanda1Keys = Object.keys(FROZEN_APPROVED_SVGS);
const tanda2To5Keys = Object.keys(FROZEN_TANDAS_2_TO_5_SVGS);

if (tanda1Keys.length !== 12) {
  throw new Error(`Expected 12 Tanda 1 SVGs, got ${tanda1Keys.length}`);
}
if (tanda2To5Keys.length !== 27) {
  throw new Error(`Expected 27 Tandas 2–5 SVGs, got ${tanda2To5Keys.length}`);
}
for (const key of tanda2To5Keys) {
  if (Object.prototype.hasOwnProperty.call(FROZEN_APPROVED_SVGS, key)) {
    throw new Error(`Overlap detected between Tanda 1 and Tandas 2–5: ${key}`);
  }
  if (!Object.prototype.hasOwnProperty.call(ICONS, key)) {
    throw new Error(`Unknown SVG key in Tandas 2–5: ${key}`);
  }
}

const FORBIDDEN_DARK_COLORS = ['#0F172A', '#1E293B', '#334155'];
let writtenCount = 0;
let skippedCount = 0;

for (const [fileName, body] of Object.entries(ICONS)) {
  const isFrozen = Object.prototype.hasOwnProperty.call(ALL_FROZEN_SVGS, fileName);
  const content = isFrozen
    ? `${ALL_FROZEN_SVGS[fileName].replace(/\r\n/g, '\n').trimEnd()}\n`
    : svgWrap(body);
  for (const forbidden of FORBIDDEN_DARK_COLORS) {
    if (content.toUpperCase().includes(forbidden)) {
      throw new Error(`${fileName} contains forbidden dark color ${forbidden}`);
    }
  }
  const targetPath = resolve(ICON_DIR, fileName);
  const isUnchanged = existsSync(targetPath) && readFileSync(targetPath, 'utf8') === content;
  if (!isUnchanged) {
    writeFileSync(targetPath, content, 'utf8');
    writtenCount += 1;
  } else {
    skippedCount += 1;
  }
  const sha = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex').slice(0, 12);
  const tag = isUnchanged ? 'UNCHANGED' : 'WRITTEN  ';
  console.log(`${tag} ${fileName} (${Buffer.byteLength(content, 'utf8')}B) sha256:${sha}`);
}
console.log(`Done: ${Object.keys(ICONS).length} canonical SVGs (12 Tanda 1 + 27 Tandas 2–5) — ${writtenCount} written, ${skippedCount} unchanged.`);
