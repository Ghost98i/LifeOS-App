import fs from 'node:fs';
import path from 'node:path';

const PILOT_DIR = path.resolve('artifacts', 'design-exploration', 'gym-art-pilot');
if (!fs.existsSync(PILOT_DIR)) fs.mkdirSync(PILOT_DIR, { recursive: true });

// Read the 6 baseline SVGs from public/gym-icons/v1/
const BASELINE_FILES = {
  bench: 'bench-press.svg',
  military: 'shoulder-press.svg',
  dumbbell: 'dumbbell.svg',
  cable: 'lat-pulldown.svg',
  legs: 'leg-press.svg',
  muscle: 'squat-rack.svg', // Reused in current app for muscular/general routines
};

const baselineSvgs = {};
for (const [key, filename] of Object.entries(BASELINE_FILES)) {
  const filePath = path.resolve('public', 'gym-icons', 'v1', filename);
  if (fs.existsSync(filePath)) {
    baselineSvgs[key] = fs.readFileSync(filePath, 'utf8')
      .replace(/<\?xml[^>]*\?>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .trim();
  } else {
    baselineSvgs[key] = `<svg viewBox="0 0 24 24"><text y="15">N/A</text></svg>`;
  }
}

// Direction 1: Ingeniería Técnica / Apparatus Precision
// 64x64 viewBox, strict mechanical stroke hierarchy (2.5 structural, 1.5 detail, 1.2 dashed guides), chamfered joints, knurling
const dir1Svgs = {
  bench: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir1-svg">
  <!-- Ground Line -->
  <line x1="8" y1="56" x2="56" y2="56" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <!-- Bench Base Frame -->
  <path d="M14 56V40M50 56V26" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="12" y1="40" x2="52" y2="40" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Padded Bench Surface with Chamfer -->
  <rect x="11" y="34" width="36" height="6" rx="2" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <!-- Upright Bar Support Columns & J-Cup -->
  <path d="M48 40V18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M45 22H51M45 18H51" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
  <path d="M46 20H48V16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <!-- Barbell Shaft resting on J-Cup -->
  <line x1="38" y1="17" x2="58" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Olympic Plate Stack & Sleeve -->
  <rect x="51" y="7" width="3.5" height="20" rx="1" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"/>
  <rect x="55.5" y="10" width="2.5" height="14" rx="0.8" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.4"/>
  <rect x="49.5" y="14" width="1.5" height="6" rx="0.5" fill="currentColor"/>
  <!-- Technical Vertical Force Vector (Dashed measurement) -->
  <line x1="28" y1="33" x2="28" y2="14" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M26 17L28 13L30 17" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Center Axis Pivot Indicator -->
  <circle cx="28" cy="40" r="1.5" fill="var(--gym-accent, #3b82f6)"/>
</svg>`,

  military: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir1-svg">
  <!-- Power Rack Base & Ground Plates -->
  <line x1="6" y1="56" x2="58" y2="56" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <!-- Dual Structural Columns -->
  <line x1="16" y1="56" x2="16" y2="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="48" y1="56" x2="48" y2="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Top Crossmember -->
  <line x1="14" y1="12" x2="50" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Precision Westside Pin Hole Ticks -->
  <line x1="14" y1="20" x2="18" y2="20" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="14" y1="26" x2="18" y2="26" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="14" y1="32" x2="18" y2="32" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="46" y1="20" x2="50" y2="20" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="46" y1="26" x2="50" y2="26" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="46" y1="32" x2="50" y2="32" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <!-- Olympic Barbell Locked Overhead -->
  <line x1="6" y1="18" x2="58" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Left Olympic Weight Stack -->
  <rect x="7" y="9" width="3.5" height="18" rx="1" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"/>
  <rect x="11.5" y="11" width="2.5" height="14" rx="0.8" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.4"/>
  <!-- Right Olympic Weight Stack -->
  <rect x="53.5" y="9" width="3.5" height="18" rx="1" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"/>
  <rect x="50" y="11" width="2.5" height="14" rx="0.8" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.4"/>
  <!-- Center Vertical Lockout Axis (Accent) -->
  <line x1="32" y1="46" x2="32" y2="22" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M30 25L32 21L34 25" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="46" r="2" fill="var(--gym-accent, #3b82f6)"/>
</svg>`,

  dumbbell: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir1-svg">
  <!-- Center Knurled Handle -->
  <rect x="23" y="29.5" width="18" height="5" rx="1.5" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2"/>
  <!-- Knurling Precision Hatching -->
  <line x1="27" y1="30" x2="27" y2="34" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <line x1="32" y1="30" x2="32" y2="34" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <line x1="37" y1="30" x2="37" y2="34" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <!-- Left Hex Head (Faceted Geometry) -->
  <polygon points="12,18 21,22 23,32 21,42 12,46 7,32" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
  <line x1="12" y1="18" x2="12" y2="46" stroke="currentColor" stroke-width="1.2" opacity="0.4"/>
  <circle cx="15" cy="32" r="1.5" fill="var(--gym-accent, #3b82f6)"/>
  <!-- Right Hex Head (Faceted Geometry) -->
  <polygon points="52,18 43,22 41,32 43,42 52,46 57,32" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
  <line x1="52" y1="18" x2="52" y2="46" stroke="currentColor" stroke-width="1.2" opacity="0.4"/>
  <circle cx="49" cy="32" r="1.5" fill="var(--gym-accent, #3b82f6)"/>
  <!-- Circular Curvature / Radial Range Vector -->
  <path d="M22 14C28 10 36 10 42 14" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M40 12L43 14.5L40 16" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  cable: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir1-svg">
  <!-- Tower Structure Frame -->
  <rect x="10" y="8" width="14" height="48" rx="2" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2.2"/>
  <!-- Stack Weight Plates -->
  <line x1="13" y1="28" x2="21" y2="28" stroke="currentColor" stroke-width="1.5"/>
  <line x1="13" y1="33" x2="21" y2="33" stroke="currentColor" stroke-width="1.5"/>
  <line x1="13" y1="38" x2="21" y2="38" stroke="currentColor" stroke-width="1.5"/>
  <line x1="13" y1="43" x2="21" y2="43" stroke="currentColor" stroke-width="1.5"/>
  <line x1="13" y1="48" x2="21" y2="48" stroke="currentColor" stroke-width="1.5"/>
  <!-- Magnetic Selector Pin Indicator -->
  <circle cx="17" cy="38" r="2" fill="var(--gym-accent, #3b82f6)"/>
  <!-- Top Pulley Arm Assembly -->
  <path d="M17 8V6H38L48 10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Low-friction Bearing Pulleys -->
  <circle cx="20" cy="14" r="3" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
  <circle cx="48" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.2"/>
  <!-- Cable Tension Path -->
  <path d="M20 28V14C20 12 36 12 48 12V24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Wide Lat Pulldown Bar -->
  <path d="M34 26C41 27.5 48 27.5 55 26" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <!-- Downward Traction Vector -->
  <line x1="48" y1="28" x2="48" y2="44" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M46 41L48 45L50 41" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  legs: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir1-svg">
  <!-- Ground Frame Base -->
  <line x1="8" y1="56" x2="56" y2="56" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <!-- 45-Degree High-Rigidity Guide Rail System -->
  <line x1="16" y1="52" x2="52" y2="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="20" y1="56" x2="56" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <!-- Reclined Ergonomic Seat & Backrest -->
  <path d="M14 52L22 46M22 46L16 28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="13" y="27" width="5" height="19" rx="1.5" transform="rotate(-15 13 27)" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.8"/>
  <!-- 45-Degree Sled with Olympic Weight Posts -->
  <rect x="34" y="26" width="12" height="8" rx="1.5" transform="rotate(45 34 26)" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/>
  <!-- Olympic Weight Plate on Sled -->
  <line x1="36" y1="22" x2="48" y2="34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <circle cx="42" cy="28" r="4.5" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1"/>
  <!-- Heavy Duty Footplate -->
  <line x1="46" y1="12" x2="56" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <!-- 45-Degree Drive Vector (Force Line) -->
  <line x1="30" y1="38" x2="42" y2="26" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M39 25L43 25L43 29" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  muscle: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir1-svg">
  <!-- CAD Coordinate Grid Frame -->
  <rect x="10" y="8" width="44" height="48" rx="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.3"/>
  <line x1="32" y1="8" x2="32" y2="56" stroke="currentColor" stroke-width="1" opacity="0.25"/>
  <line x1="10" y1="32" x2="54" y2="32" stroke="currentColor" stroke-width="1" opacity="0.25"/>
  <!-- Anatomic Wireframe Chest & Shoulder Contours -->
  <path d="M22 18C26 16 38 16 42 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M18 22C16 26 15 32 17 38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M46 22C48 26 49 32 47 38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <!-- Pectoral / Ribcage Geometric Wireframe -->
  <path d="M22 24C28 24 31 28 32 34C31 28 34 24 42 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M22 34C26 36 31 35 32 34C33 35 38 36 42 34" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Biometric Anchor Crosshairs -->
  <circle cx="26" cy="28" r="4" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" fill="var(--gym-accent, #3b82f6)" fill-opacity="0.15"/>
  <circle cx="38" cy="28" r="4" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" fill="var(--gym-accent, #3b82f6)" fill-opacity="0.15"/>
  <circle cx="32" cy="44" r="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.5 1.5"/>
  <!-- Target Crosshair Lines -->
  <line x1="26" y1="22" x2="26" y2="34" stroke="var(--gym-accent, #3b82f6)" stroke-width="1"/>
  <line x1="38" y1="22" x2="38" y2="34" stroke="var(--gym-accent, #3b82f6)" stroke-width="1"/>
</svg>`,
};

// Direction 2: Anatomía Cinética / Kinetic Functional Biomechanics
// 64x64 viewBox, human silhouette with natural kinesiology, target motor group filled in semantic accent, apparatus in subtle background line
const dir2Svgs = {
  bench: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir2-svg">
  <!-- Minimal Bench Outline (Subtle apparatus) -->
  <line x1="10" y1="42" x2="52" y2="42" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <line x1="14" y1="42" x2="14" y2="54" stroke="currentColor" stroke-width="2" opacity="0.3"/>
  <line x1="48" y1="42" x2="48" y2="54" stroke="currentColor" stroke-width="2" opacity="0.3"/>
  <!-- Athletic Head Resting on Bench -->
  <circle cx="46" cy="36" r="3.5" fill="currentColor" opacity="0.6"/>
  <!-- Body Silhouette (Torso Supine Arc & Planted Leg) -->
  <path d="M43 38C38 36 29 35 24 39L18 40L14 46V54" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
  <!-- Arm & Press Lever System -->
  <path d="M38 35L33 42L33 22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Barbell in Hands -->
  <line x1="24" y1="20" x2="46" y2="20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="42" y="11" width="3" height="18" rx="1" fill="currentColor" opacity="0.4"/>
  <!-- Primary Target Muscle Activation: PECTORALIS MAJOR (Semantic Accent) -->
  <path d="M36 34C33 32 30 33 29 36C31 38 35 37 37 35Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Secondary Triceps Accent -->
  <path d="M34 38L34 42" stroke="var(--gym-accent, #3b82f6)" stroke-width="2" stroke-linecap="round"/>
  <!-- Concentric Drive Arrow -->
  <path d="M33 16L33 12M31 14L33 12L35 14" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  military: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir2-svg">
  <!-- Standing Human Silhouette in Full Lockout Extension -->
  <!-- Stable Feet & Ground Base -->
  <line x1="20" y1="56" x2="44" y2="56" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.3"/>
  <path d="M26 56V44L30 36M38 56V44L34 36" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
  <!-- Core & Spine Solid Neutral Posture -->
  <path d="M30 36V28M34 36V28" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
  <!-- Head Cleanly Cleared Under the Bar -->
  <circle cx="32" cy="22" r="3.2" fill="currentColor" opacity="0.6"/>
  <!-- Upward Reaching Arms / Kinetic Lockout -->
  <path d="M27 26L24 13M37 26L40 13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Olympic Barbell Overhead -->
  <line x1="14" y1="12" x2="50" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="15" y="5" width="3" height="14" rx="1" fill="currentColor" opacity="0.4"/>
  <rect x="46" y="5" width="3" height="14" rx="1" fill="currentColor" opacity="0.4"/>
  <!-- Target Muscle Group: DELTOIDS & TRAPEZIUS (Semantic Accent) -->
  <path d="M26 24C24 25 24 28 27 27Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5"/>
  <path d="M38 24C40 25 40 28 37 27Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5"/>
  <path d="M29 25C31 23 33 23 35 25" stroke="var(--gym-accent, #3b82f6)" stroke-width="2" stroke-linecap="round"/>
  <!-- Overhead Vertical Kinetic Line -->
  <line x1="32" y1="9" x2="32" y2="5" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M30 7L32 5L34 7" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  dumbbell: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir2-svg">
  <!-- Human Athletic Arm in Concentric Curl Motion -->
  <!-- Torso & Shoulder Anchor -->
  <path d="M16 16C21 16 24 20 25 26L25 46" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.4"/>
  <!-- Forearm in Concentric Flexion (60-Degree Lever) -->
  <path d="M25 40L42 26" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Hand Grip Holding Dumbbell -->
  <circle cx="42" cy="25" r="2.5" fill="currentColor" opacity="0.8"/>
  <!-- Styled Dumbbell at Optimum Contraction Angle -->
  <g transform="rotate(-30 42 25)">
    <line x1="34" y1="25" x2="50" y2="25" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="33" y="19" width="3" height="12" rx="1" fill="currentColor" opacity="0.5"/>
    <rect x="48" y="19" width="3" height="12" rx="1" fill="currentColor" opacity="0.5"/>
  </g>
  <!-- Primary Target Muscle Activation: BICEPS BRACHII (Semantic Accent Peak) -->
  <path d="M25 31C28 27 33 28 36 32C33 36 29 36 25 35Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.8" stroke-linejoin="round"/>
  <!-- Kinetic Tension Ring Wave -->
  <path d="M31 22C36 20 42 21 46 25" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M44 23L46.5 25L44 27" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  cable: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir2-svg">
  <!-- Pulley Cable & Wide Grip Bar (Apparatus Context) -->
  <line x1="32" y1="4" x2="32" y2="15" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <path d="M16 16C24 18 40 18 48 16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Athlete Posterior (Back View) in Mid-Traction -->
  <circle cx="32" cy="22" r="3.2" fill="currentColor" opacity="0.6"/>
  <!-- Raised Arms Pulling Downward -->
  <path d="M19 16L24 28M45 16L40 28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- V-Taper Torso & Spine -->
  <path d="M27 34L30 48M37 34L34 48" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  <!-- Primary Target Muscle Group: LATISSIMUS DORSI & UPPER BACK (Semantic Accent) -->
  <path d="M26 27C30 29 32 30 32 36C30 34 27 32 26 27Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5"/>
  <path d="M38 27C34 29 32 30 32 36C34 34 37 32 38 27Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5"/>
  <!-- Lateral Width Expansion Vectors -->
  <path d="M24 33L21 35M40 33L43 35" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Downward Elbow Adduction Arrows -->
  <path d="M23 29L22 33L25 33" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M41 29L42 33L39 33" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  legs: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir2-svg">
  <!-- Athlete Leg Drive Geometry (90-Degree Power Angle) -->
  <!-- Ground Line / Footplate Platform -->
  <line x1="38" y1="54" x2="54" y2="54" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
  <!-- Torso & Hip Fold -->
  <path d="M16 28L25 36" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.5"/>
  <!-- Thigh / Femur (Horizontal Power Plane) -->
  <line x1="25" y1="36" x2="42" y2="38" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Shin / Tibia in Athletic Plant -->
  <line x1="42" y1="38" x2="44" y2="54" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="44" cy="54" r="2" fill="currentColor" opacity="0.7"/>
  <!-- Primary Target Muscle Activation: QUADRICEPS & GLUTEUS (Semantic Accent) -->
  <path d="M27 34C31 31 38 32 41 36C37 39 31 38 27 34Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M22 34C24 32 27 33 27 37C24 38 22 36 22 34Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" opacity="0.8"/>
  <!-- Heel Power Vector (Drive Line) -->
  <line x1="32" y1="46" x2="44" y2="46" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-dasharray="2 2" stroke-linecap="round"/>
  <path d="M42 44L45 46L42 48" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  muscle: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="gym-art-svg dir2-svg">
  <!-- Athletic Torso Silhouette (Greek Ratio Kinesiology) -->
  <circle cx="32" cy="12" r="3.5" fill="currentColor" opacity="0.6"/>
  <!-- Clavicle & Shoulder Frame -->
  <path d="M22 19C28 17 36 17 42 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  <path d="M19 22L17 34M45 22L47 34" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
  <!-- Core & Waist Taper -->
  <path d="M24 38L26 48L32 50L38 48L40 38" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
  <!-- Primary Activated Muscle Group: PECTORALS & UPPER CORE (Target Heatmap) -->
  <path d="M23 23C28 22 31 25 31 31C28 32 23 31 23 23Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M41 23C36 22 33 25 33 31C36 32 41 31 41 23Z" fill="var(--gym-accent, #3b82f6)" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Deltoid Caps Activation -->
  <path d="M21 21C18 23 18 27 20 28" stroke="var(--gym-accent, #3b82f6)" stroke-width="2" stroke-linecap="round"/>
  <path d="M43 21C46 23 46 27 44 28" stroke="var(--gym-accent, #3b82f6)" stroke-width="2" stroke-linecap="round"/>
  <!-- Abdominal Segment Ticks -->
  <line x1="29" y1="36" x2="35" y2="36" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <line x1="29" y1="41" x2="35" y2="41" stroke="var(--gym-accent, #3b82f6)" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
</svg>`,
};

const PILOT_ITEMS = [
  {
    id: 'bench',
    name: 'Press de banca plano',
    type: 'Pecho / Barra',
    baselineId: 'bench-press.svg',
    context: 'Empuje horizontal con barra olímpica en banco plano',
    descBaseline: 'Silueta tosca de 536 viewBox, barra flotante desproporcionada que invadía el título por 26px.',
    descDir1: 'Construcción ortogonal con J-hooks, discos con reborde, banco chamfered y cota de empuje vertical.',
    descDir2: 'Atleta supino con arco lumbar natural, palanca articular del codo a 75° y pectoral mayor resaltado en acento.',
  },
  {
    id: 'military',
    name: 'Press militar de pie',
    type: 'Hombros / Barra olímpica',
    baselineId: 'shoulder-press.svg',
    context: 'Empuje vertical estricto sobre la cabeza',
    descBaseline: 'Glifo asimétrico con líneas deformadas y trazos microscópicos en torre.',
    descDir1: 'Power rack con perforaciones Westside a escala, bloqueo simétrico y eje axial de empuje.',
    descDir2: 'Silueta humana en extensión completa (lockout), core compacto y deltoides/trapecios en contracción motora.',
  },
  {
    id: 'dumbbell',
    name: 'Ejercicio con mancuernas',
    type: 'Brazos / Mancuerna',
    baselineId: 'dumbbell.svg',
    context: 'Trabajo unilateral y aislamiento (Curl / Elevación)',
    descBaseline: 'Mancuerna diagonal genérica sin proporción anatómica ni indicación funcional.',
    descDir1: 'Mancuerna hexagonal de uretano con agarre moleteado en diamante y cota de arco de recorrido.',
    descDir2: 'Brazo atlético en contracción concéntrica a 60° con pico de activación en bíceps braquial.',
  },
  {
    id: 'cable',
    name: 'Ejercicio con polea',
    type: 'Espalda / Polea alta',
    baselineId: 'lat-pulldown.svg',
    context: 'Tracción vertical en polea (Jalón al pecho)',
    descBaseline: 'Cables extremadamente finos que colapsaban a 24px; sin sensación de carga ni recorrido.',
    descDir1: 'Torre industrial con placas calibradas, poleas de rodamiento y vector de tracción descendente.',
    descDir2: 'Atleta visto de espaldas con expansión lateral de dorsales anchos (V-taper) y codos descendentes.',
  },
  {
    id: 'legs',
    name: 'Ejercicio de piernas',
    type: 'Piernas / Prensa 45°',
    baselineId: 'leg-press.svg',
    context: 'Empuje inferior con flexión de cadera y rodillas',
    descBaseline: 'Mancha inclinada opaca e irreconocible a tamaños de móvil.',
    descDir1: 'Prensa a 45° de alta rigidez con carro deslizante, rodamientos lineales y plataforma de potencia.',
    descDir2: 'Mecánica atlética de flexión a 90° con cadena posterior y cuádriceps en tensión concéntrica.',
  },
  {
    id: 'muscle',
    name: 'Identificación muscular',
    type: 'Grupo muscular / Anatomía',
    baselineId: 'squat-rack.svg (reutilizado)',
    context: 'Ficha de grupo muscular y mapa de enfoque',
    descBaseline: 'Inexistente en la biblioteca actual. Se reutilizaban iconos de máquinas para grupos anatómicos.',
    descDir1: 'Blueprint esquemático CAD con retícula ortogonal, coordenadas de torso y dianas biométricas.',
    descDir2: 'Atlas anatómico estilizado con proporción clásica y mapa de calor de activación muscular selectiva.',
  },
];

const htmlContent = `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LifeOS — Experimento 03: Laboratorio de Identidad Gráfica de Gimnasio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card: #0f141f;
      --card-muted: #141c2c;
      --surface-elevated: #1a2336;
      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.16);
      --text: #f1f5f9;
      --text-soft: #94a3b8;
      --text-faint: #64748b;
      --blue: #3b82f6;
      --blue-hover: #2563eb;
      --blue-glow: rgba(59, 130, 246, 0.2);
      --gym-accent: #3b82f6;
      --accent-rgb: 59, 130, 246;
      --emerald: #10b981;
      --amber: #f59e0b;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.5);
      --shadow-lg: 0 12px 32px rgba(0,0,0,0.6);
    }

    html.light {
      --bg: #f8fafc;
      --card: #ffffff;
      --card-muted: #f1f5f9;
      --surface-elevated: #e2e8f0;
      --border: rgba(0, 0, 0, 0.08);
      --border-strong: rgba(0, 0, 0, 0.16);
      --text: #0f172a;
      --text-soft: #475569;
      --text-faint: #94a3b8;
      --blue: #2563eb;
      --blue-hover: #1d4ed8;
      --blue-glow: rgba(37, 99, 235, 0.15);
      --gym-accent: #2563eb;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --shadow-lg: 0 12px 28px rgba(0,0,0,0.12);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1360px;
      margin: 0 auto;
      padding: 2rem 1.5rem 5rem;
    }

    /* Top Bar */
    header.header {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 2rem;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: rgba(var(--accent-rgb), 0.12);
      border: 1px solid rgba(var(--accent-rgb), 0.3);
      color: var(--blue);
    }

    h1 {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      color: var(--text);
      margin-top: 0.5rem;
    }

    .subtitle {
      font-size: 1rem;
      color: var(--text-soft);
      max-width: 760px;
      margin-top: 0.35rem;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .btn-toggle {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.6rem 1rem;
      border-radius: 0.85rem;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.15s ease;
      box-shadow: var(--shadow-sm);
    }

    .btn-toggle:hover {
      border-color: var(--border-strong);
      background: var(--card-muted);
    }

    .btn-toggle.active {
      background: var(--blue);
      border-color: var(--blue);
      color: #fff;
    }

    /* Tabs Bar */
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      background: var(--card);
      border: 1px solid var(--border);
      padding: 0.35rem;
      border-radius: 1rem;
      overflow-x: auto;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-soft);
      padding: 0.6rem 1.1rem;
      border-radius: 0.75rem;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--text);
    }

    .tab-btn.active {
      background: var(--surface-elevated);
      color: var(--text);
      box-shadow: var(--shadow-sm);
    }

    /* Editorial Pillars Section */
    .pillars-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }

    .pillar-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
    }

    .pillar-card.dir1 {
      border-top: 3px solid var(--blue);
    }

    .pillar-card.dir2 {
      border-top: 3px solid var(--emerald);
    }

    .pillar-card.baseline {
      border-top: 3px solid var(--text-faint);
      opacity: 0.85;
    }

    .pillar-tag {
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--blue);
      margin-bottom: 0.5rem;
      display: block;
    }

    .pillar-card.dir2 .pillar-tag { color: var(--emerald); }
    .pillar-card.baseline .pillar-tag { color: var(--text-faint); }

    .pillar-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.5rem;
    }

    .pillar-desc {
      font-size: 0.85rem;
      color: var(--text-soft);
      line-height: 1.5;
    }

    .pillar-traits {
      margin-top: 1rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .trait-chip {
      background: var(--card-muted);
      border: 1px solid var(--border);
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 0.5rem;
      color: var(--text-soft);
    }

    /* Matrix View */
    .matrix-section {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .exercise-row-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 1.75rem;
      box-shadow: var(--shadow-sm);
      transition: border-color 0.15s ease;
    }

    .exercise-row-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .exercise-meta-title {
      font-size: 1.3rem;
      font-weight: 800;
      letter-spacing: -0.015em;
    }

    .exercise-meta-type {
      font-size: 0.78rem;
      color: var(--blue);
      font-weight: 700;
      background: rgba(var(--accent-rgb), 0.1);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      margin-left: 0.6rem;
      vertical-align: middle;
    }

    .exercise-context {
      font-size: 0.85rem;
      color: var(--text-soft);
      margin-top: 0.25rem;
    }

    /* 3-Column Comparison Grid */
    .variants-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }

    @media (max-width: 960px) {
      .variants-grid {
        grid-template-columns: 1fr;
      }
    }

    .variant-col {
      background: var(--card-muted);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      position: relative;
    }

    .variant-col-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .variant-col-badge {
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 0.2rem 0.6rem;
      border-radius: 0.5rem;
    }

    .col-baseline .variant-col-badge {
      background: var(--surface-elevated);
      color: var(--text-faint);
    }

    .col-dir1 .variant-col-badge {
      background: rgba(59, 130, 246, 0.15);
      color: var(--blue);
    }

    .col-dir2 .variant-col-badge {
      background: rgba(16, 185, 129, 0.15);
      color: var(--emerald);
    }

    /* Artwork Canvas Stage */
    .artwork-stage {
      height: 160px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
    }

    /* SVG Sizing */
    .gym-art-svg {
      width: 96px;
      height: 96px;
      display: block;
      color: var(--text);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .artwork-stage:hover .gym-art-svg {
      transform: scale(1.06);
    }

    /* Baseline SVG mask emulation to represent actual current render */
    .baseline-wrapper {
      width: 96px;
      height: 96px;
      display: grid;
      place-items: center;
    }

    .baseline-wrapper svg {
      width: 80px;
      height: 80px;
      color: var(--text);
      fill: currentColor;
    }

    .variant-desc {
      font-size: 0.8rem;
      color: var(--text-soft);
      line-height: 1.45;
      min-height: 48px;
    }

    /* Micro Size Strip inside Col */
    .size-strip {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: var(--card);
      border: 1px solid var(--border);
      padding: 0.65rem 0.85rem;
      border-radius: 0.75rem;
    }

    .size-strip-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-faint);
    }

    .size-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    .size-item-tag {
      font-size: 0.62rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-faint);
    }

    .icon-24 svg, .icon-24 .gym-art-svg { width: 24px !important; height: 24px !important; }
    .icon-36 svg, .icon-36 .gym-art-svg { width: 36px !important; height: 36px !important; }
    .icon-48 svg, .icon-48 .gym-art-svg { width: 48px !important; height: 48px !important; }
    .zoom-box svg, .zoom-box .gym-art-svg { width: 100% !important; height: 100% !important; }
    .mock-art-badge svg, .mock-art-badge .gym-art-svg { width: 1.875rem !important; height: 1.875rem !important; }
    .routine-icon-mock svg, .routine-icon-mock .gym-art-svg { width: 1.4rem !important; height: 1.4rem !important; }
    .bio-artwork-frame svg, .bio-artwork-frame .gym-art-svg { width: 84px !important; height: 84px !important; }

    /* REAL CONTEXTS VIEW (Cockpit, Routines, Switcher, Expanded) */
    .contexts-section {
      display: none;
      flex-direction: column;
      gap: 3rem;
    }

    .context-block {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.75rem;
      padding: 2rem;
    }

    .context-title {
      font-size: 1.35rem;
      font-weight: 800;
      margin-bottom: 0.35rem;
    }

    .context-desc {
      font-size: 0.88rem;
      color: var(--text-soft);
      margin-bottom: 1.5rem;
    }

    .context-compare-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }

    @media (max-width: 900px) {
      .context-compare-row {
        grid-template-columns: 1fr;
      }
    }

    /* Simulation Component: Real Cockpit Badge Simulation */
    .cockpit-preview-box {
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      background: var(--card-muted);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .cockpit-header-mock {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
    }

    .mock-art-badge {
      width: 3rem;
      height: 3rem;
      border-radius: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: color-mix(in srgb, var(--card) 85%, var(--blue) 15%);
      border: 1px solid color-mix(in srgb, var(--border) 72%, var(--blue) 28%);
      overflow: hidden;
      position: relative;
    }

    .mock-art-badge svg {
      width: 1.875rem;
      height: 1.875rem;
      max-width: 100%;
      max-height: 100%;
    }

    .mock-meta {
      min-width: 0;
      flex: 1;
    }

    .mock-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mock-sub {
      font-size: 0.72rem;
      color: var(--text-soft);
      margin-top: 0.15rem;
    }

    /* Routine Chip Simulation */
    .routine-card-mock {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
    }

    .routine-icon-mock {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.75rem;
      background: var(--surface-elevated);
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .routine-icon-mock svg {
      width: 1.4rem;
      height: 1.4rem;
    }

    /* Expanded Biomechanics Card Simulation */
    .bio-card-mock {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
      text-align: center;
    }

    .bio-artwork-frame {
      width: 120px;
      height: 120px;
      border-radius: 1.25rem;
      background: var(--card-muted);
      border: 1px solid var(--border);
      display: grid;
      place-items: center;
      box-shadow: inset 0 2px 6px rgba(0,0,0,0.2);
    }

    .bio-artwork-frame svg {
      width: 84px;
      height: 84px;
    }

    .bio-title {
      font-size: 1.05rem;
      font-weight: 800;
    }

    .bio-badge {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--blue);
      background: rgba(var(--accent-rgb), 0.1);
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
    }

    /* Zoom Inspector View */
    .zoom-section {
      display: none;
      flex-direction: column;
      gap: 2rem;
    }

    .zoom-exercise-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 1.75rem;
    }

    .zoom-scale-row {
      display: flex;
      gap: 2rem;
      align-items: flex-end;
      flex-wrap: wrap;
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border);
    }

    .zoom-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .zoom-box {
      border: 1px dashed var(--border-strong);
      border-radius: 0.75rem;
      display: grid;
      place-items: center;
      background: var(--card-muted);
      transition: all 0.2s ease;
    }

    .zoom-box:hover {
      border-color: var(--blue);
      background: var(--surface-elevated);
    }

    .zoom-tag {
      font-size: 0.7rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-soft);
    }

    /* Evaluation Rubric / Score Table */
    .rubric-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      padding: 2rem;
      margin-top: 3rem;
    }

    .rubric-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.85rem;
    }

    .rubric-table th, .rubric-table td {
      padding: 0.85rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .rubric-table th {
      color: var(--text-faint);
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
    }

    .score-badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      border-radius: 0.4rem;
      font-weight: 700;
      font-size: 0.75rem;
    }

    .score-high { background: rgba(16, 185, 129, 0.15); color: var(--emerald); }
    .score-mid { background: rgba(245, 158, 11, 0.15); color: var(--amber); }
    .score-low { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

    footer.footer {
      margin-top: 4rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-faint);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-top">
        <div>
          <span class="badge-pill">LifeOS · Experimento 03</span>
          <h1>Nueva Identidad Gráfica de Gimnasio</h1>
          <p class="subtitle">
            Exploración y validación de dos sistemas vectoriales de alta fidelidad frente a la biblioteca actual (22 SVGs heterogéneos con máscara negra).
          </p>
        </div>
        <div class="header-controls">
          <button type="button" class="btn-toggle" id="theme-toggle" aria-label="Cambiar tema claro/oscuro">
            <span id="theme-icon">🌙</span> <span id="theme-text">Modo Oscuro</span>
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <nav class="tabs-nav" aria-label="Vistas del laboratorio">
        <button type="button" class="tab-btn active" data-tab="matrix">1. Matriz Comparativa (6 Pilotos)</button>
        <button type="button" class="tab-btn" data-tab="contexts">2. Contextos Reales de Uso</button>
        <button type="button" class="tab-btn" data-tab="zoom">3. Inspección por Escalas (24px a 160px)</button>
        <button type="button" class="tab-btn" data-tab="rubric">4. Rúbrica & Evaluación de Criterios</button>
      </nav>
    </header>

    <!-- Editorial Pillars -->
    <section class="pillars-grid">
      <div class="pillar-card baseline">
        <span class="pillar-tag">Línea de Base Actual</span>
        <h3 class="pillar-title">Máscara Monocroma Heterogénea</h3>
        <p class="pillar-desc">
          22 SVGs recolectados de repositorios externos dispares (Noun Project, etc.). Trazos y viewboxes incompatibles (desde 22 hasta 54,000 unidades). Se renderizan mediante CSS mask-image como una silueta negra sólida, borrando todo detalle interno.
        </p>
        <div class="pillar-traits">
          <span class="trait-chip">Alpha mask único</span>
          <span class="trait-chip">Sin kinesiología</span>
          <span class="trait-chip">Deuda de licencia</span>
        </div>
      </div>

      <div class="pillar-card dir1">
        <span class="pillar-tag">Dirección A</span>
        <h3 class="pillar-title">Ingeniería Técnica / Apparatus Precision</h3>
        <p class="pillar-desc">
          El gimnasio como laboratorio de precisión industrial. Enfoque en dibujo de patente deportiva, ensamblaje de equipamiento de competición (Eleiko, Hammer Strength), pernos Westside, moleteado de mangos y vectores mecánicos de fuerza.
        </p>
        <div class="pillar-traits">
          <span class="trait-chip">Cuadrícula 64×64</span>
          <span class="trait-chip">Jerarquía 2.5 / 1.5px</span>
          <span class="trait-chip">Cotas de recorrido</span>
          <span class="trait-chip">Legibilidad extrema</span>
        </div>
      </div>

      <div class="pillar-card dir2">
        <span class="pillar-tag">Dirección B</span>
        <h3 class="pillar-title">Anatomía Cinética / Kinetic Biomechanics</h3>
        <p class="pillar-desc">
          El entrenamiento como biomecánica humana viva. Silueta atlética dinámica de proporción griega sobria combinada con mapa cromático de activación motora primaria (pecho, deltoides, bíceps, dorsales, cuádriceps) y vectores concéntricos.
        </p>
        <div class="pillar-traits">
          <span class="trait-chip">Kinesiología viva</span>
          <span class="trait-chip">Músculo diana en acento</span>
          <span class="trait-chip">Identidad orgánica</span>
          <span class="trait-chip">Valor didáctico</span>
        </div>
      </div>
    </section>

    <!-- TAB 1: MATRIX COMPARISON -->
    <main class="matrix-section" id="tab-matrix">
      ${PILOT_ITEMS.map((item, idx) => `
        <article class="exercise-row-card" data-exercise="${item.id}">
          <div class="exercise-row-header">
            <div>
              <span class="exercise-meta-title">0${idx + 1}. ${item.name}</span>
              <span class="exercise-meta-type">${item.type}</span>
              <p class="exercise-context">${item.context}</p>
            </div>
          </div>

          <div class="variants-grid">
            <!-- Baseline Column -->
            <div class="variant-col col-baseline">
              <div class="variant-col-header">
                <span class="variant-col-badge">Baseline Actual</span>
                <span style="font-size: 0.68rem; color: var(--text-faint); font-family: monospace;">${item.baselineId}</span>
              </div>
              <div class="artwork-stage">
                <div class="baseline-wrapper">
                  ${baselineSvgs[item.id]}
                </div>
              </div>
              <p class="variant-desc">${item.descBaseline}</p>
              <div class="size-strip">
                <span class="size-strip-label">Escalas:</span>
                <div class="size-item icon-24">${baselineSvgs[item.id]}<span class="size-item-tag">24</span></div>
                <div class="size-item icon-36">${baselineSvgs[item.id]}<span class="size-item-tag">36</span></div>
                <div class="size-item icon-48">${baselineSvgs[item.id]}<span class="size-item-tag">48</span></div>
              </div>
            </div>

            <!-- Direction 1: Precision Industrial -->
            <div class="variant-col col-dir1">
              <div class="variant-col-header">
                <span class="variant-col-badge">A · Ingeniería Técnica</span>
                <span style="font-size: 0.68rem; color: var(--blue); font-weight: 700;">64×64 Vector</span>
              </div>
              <div class="artwork-stage">
                ${dir1Svgs[item.id]}
              </div>
              <p class="variant-desc">${item.descDir1}</p>
              <div class="size-strip">
                <span class="size-strip-label">Escalas:</span>
                <div class="size-item icon-24">${dir1Svgs[item.id]}<span class="size-item-tag">24</span></div>
                <div class="size-item icon-36">${dir1Svgs[item.id]}<span class="size-item-tag">36</span></div>
                <div class="size-item icon-48">${dir1Svgs[item.id]}<span class="size-item-tag">48</span></div>
              </div>
            </div>

            <!-- Direction 2: Kinetic Biomechanics -->
            <div class="variant-col col-dir2">
              <div class="variant-col-header">
                <span class="variant-col-badge">B · Anatomía Cinética</span>
                <span style="font-size: 0.68rem; color: var(--emerald); font-weight: 700;">Activación Motora</span>
              </div>
              <div class="artwork-stage">
                ${dir2Svgs[item.id]}
              </div>
              <p class="variant-desc">${item.descDir2}</p>
              <div class="size-strip">
                <span class="size-strip-label">Escalas:</span>
                <div class="size-item icon-24">${dir2Svgs[item.id]}<span class="size-item-tag">24</span></div>
                <div class="size-item icon-36">${dir2Svgs[item.id]}<span class="size-item-tag">36</span></div>
                <div class="size-item icon-48">${dir2Svgs[item.id]}<span class="size-item-tag">48</span></div>
              </div>
            </div>
          </div>
        </article>
      `).join('')}
    </main>

    <!-- TAB 2: REAL CONTEXTS SIMULATION -->
    <section class="contexts-section" id="tab-contexts">
      <!-- Context 1: Cockpit Active Workout Badge (3rem / 48px) -->
      <div class="context-block">
        <h2 class="context-title">Contexto 1: Cabecera del Cockpit de Entrenamiento Activo (48px)</h2>
        <p class="context-desc">
          En la sesión activa, el badge de 48px (.c-art-badge) acompaña al título del ejercicio. Debe identificarse instantáneamente a 50cm de distancia con sudor y fatiga.
        </p>

        <div class="context-compare-row">
          <!-- Baseline in Cockpit -->
          <div class="cockpit-preview-box">
            <span class="variant-col-badge col-baseline" style="align-self: flex-start;">Baseline Actual</span>
            <div class="cockpit-header-mock">
              <div class="mock-art-badge">
                ${baselineSvgs.bench}
              </div>
              <div class="mock-meta">
                <div class="mock-title">Press de banca plano con barra</div>
                <div class="mock-sub">Pecho · Serie 1 de 4 · 80 kg</div>
              </div>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-soft);">
              Mancha negra sin relieve; postes y barra se funden en una masa opaca.
            </p>
          </div>

          <!-- Dir 1 in Cockpit -->
          <div class="cockpit-preview-box" style="border-color: rgba(59, 130, 246, 0.4);">
            <span class="variant-col-badge" style="background: rgba(59,130,246,0.15); color: var(--blue); align-self: flex-start;">A · Ingeniería Técnica</span>
            <div class="cockpit-header-mock">
              <div class="mock-art-badge" style="border-color: rgba(59, 130, 246, 0.4); background: color-mix(in srgb, var(--card) 80%, var(--blue) 20%);">
                ${dir1Svgs.bench}
              </div>
              <div class="mock-meta">
                <div class="mock-title">Press de banca plano con barra</div>
                <div class="mock-sub">Pecho · Serie 1 de 4 · 80 kg</div>
              </div>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-soft);">
              Diseño nítido de banco y barra con discos claros; vector azul de empuje vertical aporta carácter de cabina.
            </p>
          </div>

          <!-- Dir 2 in Cockpit -->
          <div class="cockpit-preview-box" style="border-color: rgba(16, 185, 129, 0.4);">
            <span class="variant-col-badge" style="background: rgba(16,185,129,0.15); color: var(--emerald); align-self: flex-start;">B · Anatomía Cinética</span>
            <div class="cockpit-header-mock">
              <div class="mock-art-badge" style="border-color: rgba(16, 185, 129, 0.4); background: color-mix(in srgb, var(--card) 80%, var(--emerald) 20%);">
                ${dir2Svgs.bench}
              </div>
              <div class="mock-meta">
                <div class="mock-title">Press de banca plano con barra</div>
                <div class="mock-sub">Pecho · Serie 1 de 4 · 80 kg</div>
              </div>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-soft);">
              Lectura biomecánica directa: el pectoral mayor resaltado en color confirma el objetivo del movimiento al instante.
            </p>
          </div>
        </div>
      </div>

      <!-- Context 2: Routine List & Exercise Selector (24px - 32px chips) -->
      <div class="context-block">
        <h2 class="context-title">Contexto 2: Selector de Rutina y Fila de Ejercicio (28px - 36px)</h2>
        <p class="context-desc">
          En la lista de rutinas semanales o selector de ejercicios, el espacio es compacto. El glifo no debe empastarse ni perder legibilidad.
        </p>

        <div class="context-compare-row">
          <!-- Baseline Routine Card -->
          <div class="cockpit-preview-box">
            <span class="variant-col-badge col-baseline" style="align-self: flex-start;">Baseline Actual</span>
            <div class="routine-card-mock">
              <div class="routine-icon-mock">${baselineSvgs.military}</div>
              <div class="mock-meta">
                <div class="mock-title">Press militar de pie</div>
                <div class="mock-sub">3 series efectivas · Hombros</div>
              </div>
            </div>
          </div>

          <!-- Dir 1 Routine Card -->
          <div class="cockpit-preview-box">
            <span class="variant-col-badge" style="background: rgba(59,130,246,0.15); color: var(--blue); align-self: flex-start;">A · Ingeniería Técnica</span>
            <div class="routine-card-mock">
              <div class="routine-icon-mock" style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2);">${dir1Svgs.military}</div>
              <div class="mock-meta">
                <div class="mock-title">Press militar de pie</div>
                <div class="mock-sub">3 series efectivas · Hombros</div>
              </div>
            </div>
          </div>

          <!-- Dir 2 Routine Card -->
          <div class="cockpit-preview-box">
            <span class="variant-col-badge" style="background: rgba(16,185,129,0.15); color: var(--emerald); align-self: flex-start;">B · Anatomía Cinética</span>
            <div class="routine-card-mock">
              <div class="routine-icon-mock" style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2);">${dir2Svgs.military}</div>
              <div class="mock-meta">
                <div class="mock-title">Press militar de pie</div>
                <div class="mock-sub">3 series efectivas · Hombros</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Context 3: Expanded Biomechanical Modal / Card (120px) -->
      <div class="context-block">
        <h2 class="context-title">Contexto 3: Ficha Biomecánica Ampliada e Historial (96px - 120px)</h2>
        <p class="context-desc">
          En la vista detallada de biomecánica, historial de marcas o técnica, la ilustración se amplía para mostrar riqueza visual y precisión anatómica.
        </p>

        <div class="context-compare-row">
          <!-- Baseline Bio Card -->
          <div class="bio-card-mock">
            <span class="variant-col-badge col-baseline">Baseline Actual</span>
            <div class="bio-artwork-frame">${baselineSvgs.cable}</div>
            <div class="bio-title">Jalón al pecho en polea</div>
            <span class="bio-badge">Espalda / Polea</span>
            <p style="font-size: 0.8rem; color: var(--text-soft);">
              Al ampliarse, la máquina revela trazos toscos y cables sin tensión ni detalle anatómico.
            </p>
          </div>

          <!-- Dir 1 Bio Card -->
          <div class="bio-card-mock">
            <span class="variant-col-badge" style="background: rgba(59,130,246,0.15); color: var(--blue);">A · Ingeniería Técnica</span>
            <div class="bio-artwork-frame" style="border-color: rgba(59,130,246,0.3);">${dir1Svgs.cable}</div>
            <div class="bio-title">Jalón al pecho en polea</div>
            <span class="bio-badge">Ingeniería de Polea Alta</span>
            <p style="font-size: 0.8rem; color: var(--text-soft);">
              Presenta la torre de placas, el selector magnético, las poleas de baja fricción y el vector de tracción.
            </p>
          </div>

          <!-- Dir 2 Bio Card -->
          <div class="bio-card-mock">
            <span class="variant-col-badge" style="background: rgba(16,185,129,0.15); color: var(--emerald);">B · Anatomía Cinética</span>
            <div class="bio-artwork-frame" style="border-color: rgba(16,185,129,0.3);">${dir2Svgs.cable}</div>
            <div class="bio-title">Jalón al pecho en polea</div>
            <span class="bio-badge">Kinesiología de Dorsales</span>
            <p style="font-size: 0.8rem; color: var(--text-soft);">
              Ilustra la postura dorsal en V-taper, la depresión escapular y el reclutamiento del dorsal mayor en acento.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 3: ZOOM INSPECTION -->
    <section class="zoom-section" id="tab-zoom">
      <div class="zoom-exercise-card">
        <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem;">Inspección de Legibilidad Multi-Escala</h2>
        <p style="font-size: 0.88rem; color: var(--text-soft);">
          Evaluación de retención de silueta y detalle a 24px (micro-chip), 36px (selector), 48px (cockpit badge), 96px (tarjeta media) y 160px (vista en alta resolución).
        </p>

        ${PILOT_ITEMS.slice(0, 3).map((item) => `
          <div style="margin-top: 2rem;">
            <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.75rem;">${item.name} (${item.type})</h3>

            <!-- Dir 1 Scale Row -->
            <div style="margin-bottom: 1.5rem;">
              <span style="font-size: 0.78rem; font-weight: 800; color: var(--blue); text-transform: uppercase;">A · Ingeniería Técnica</span>
              <div class="zoom-scale-row">
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 32px; height: 32px;">
                    <div style="width: 24px; height: 24px;">${dir1Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">24px</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 48px; height: 48px;">
                    <div style="width: 36px; height: 36px;">${dir1Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">36px</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 64px; height: 64px;">
                    <div style="width: 48px; height: 48px;">${dir1Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">48px (Badge)</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 112px; height: 112px;">
                    <div style="width: 96px; height: 96px;">${dir1Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">96px</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 176px; height: 176px;">
                    <div style="width: 160px; height: 160px;">${dir1Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">160px</span>
                </div>
              </div>
            </div>

            <!-- Dir 2 Scale Row -->
            <div>
              <span style="font-size: 0.78rem; font-weight: 800; color: var(--emerald); text-transform: uppercase;">B · Anatomía Cinética</span>
              <div class="zoom-scale-row">
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 32px; height: 32px;">
                    <div style="width: 24px; height: 24px;">${dir2Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">24px</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 48px; height: 48px;">
                    <div style="width: 36px; height: 36px;">${dir2Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">36px</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 64px; height: 64px;">
                    <div style="width: 48px; height: 48px;">${dir2Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">48px (Badge)</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 112px; height: 112px;">
                    <div style="width: 96px; height: 96px;">${dir2Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">96px</span>
                </div>
                <div class="zoom-item">
                  <div class="zoom-box" style="width: 176px; height: 176px;">
                    <div style="width: 160px; height: 160px;">${dir2Svgs[item.id]}</div>
                  </div>
                  <span class="zoom-tag">160px</span>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- TAB 4: RUBRIC & CRITERIA EVALUATION -->
    <section class="rubric-card" id="tab-rubric" style="display: none;">
      <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem;">Rúbrica de Evaluación de Calidad Gráfica</h2>
      <p style="font-size: 0.88rem; color: var(--text-soft);">
        Ponderación técnica de las tres alternativas frente a los criterios rectores de LifeOS.
      </p>

      <table class="rubric-table">
        <thead>
          <tr>
            <th>Criterio Rector</th>
            <th>Línea Base Actual</th>
            <th>Dirección A (Ingeniería Técnica)</th>
            <th>Dirección B (Anatomía Cinética)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Reconocimiento de Movimiento</strong></td>
            <td><span class="score-badge score-low">Bajo (4/10)</span><br><small style="color: var(--text-faint);">Solo muestra máquinas vacías</small></td>
            <td><span class="score-badge score-mid">Medio-Alto (7.5/10)</span><br><small style="color: var(--text-faint);">Identifica la máquina y vector</small></td>
            <td><span class="score-badge score-high">Excelente (9.5/10)</span><br><small style="color: var(--text-faint);">Muestra la postura y acción humana</small></td>
          </tr>
          <tr>
            <td><strong>Mapeo Muscular</strong></td>
            <td><span class="score-badge score-low">Nulo (1/10)</span><br><small style="color: var(--text-faint);">Reutiliza máquinas sin anatomía</small></td>
            <td><span class="score-badge score-mid">Medio (6.5/10)</span><br><small style="color: var(--text-faint);">Blueprint de coordenadas esquemáticas</small></td>
            <td><span class="score-badge score-high">Sobresaliente (9.5/10)</span><br><small style="color: var(--text-faint);">Músculo diana en color de acento</small></td>
          </tr>
          <tr>
            <td><strong>Escalabilidad a 24px (Micro-Chips)</strong></td>
            <td><span class="score-badge score-mid">Regular (5/10)</span><br><small style="color: var(--text-faint);">Silueta tosca que se apelmaza</small></td>
            <td><span class="score-badge score-high">Impecable (9.5/10)</span><br><small style="color: var(--text-faint);">Geometría ortogonal resistente a reducción</small></td>
            <td><span class="score-badge score-mid">Bueno (8/10)</span><br><small style="color: var(--text-faint);">Silueta limpia, foco en masa principal</small></td>
          </tr>
          <tr>
            <td><strong>Calidad & Coherencia del Sistema</strong></td>
            <td><span class="score-badge score-low">Pésima (3/10)</span><br><small style="color: var(--text-faint);">ViewBoxes dispares de 22 a 54.000</small></td>
            <td><span class="score-badge score-high">Máxima (10/10)</span><br><small style="color: var(--text-faint);">Cuadrícula 64×64 estricta, grosores normados</small></td>
            <td><span class="score-badge score-high">Alta (9/10)</span><br><small style="color: var(--text-faint);">Cuadrícula 64×64, paleta semántica dual</small></td>
          </tr>
          <tr>
            <td><strong>Mantenibilidad & Cero AI-Slop</strong></td>
            <td><span class="score-badge score-low">Deuda técnica (4/10)</span><br><small style="color: var(--text-faint);">Atribuciones Noun Project pendientes</small></td>
            <td><span class="score-badge score-high">Propiedad 100% (10/10)</span><br><small style="color: var(--text-faint);">Vectores puros SVG limpios y editables</small></td>
            <td><span class="score-badge score-high">Propiedad 100% (10/10)</span><br><small style="color: var(--text-faint);">Vectores anatómicos precisos sin distorsión</small></td>
          </tr>
          <tr>
            <td><strong>Integración en Cockpit y Modo Oscuro</strong></td>
            <td><span class="score-badge score-mid">Regular (6/10)</span><br><small style="color: var(--text-faint);">Solo máscara monocroma</small></td>
            <td><span class="score-badge score-high">Excepcional (9.5/10)</span><br><small style="color: var(--text-faint);">Estética de instrumentación de cabina</small></td>
            <td><span class="score-badge score-high">Muy Fuerte (9/10)</span><br><small style="color: var(--text-faint);">Acentos bioluminiscentes sobre fondo oscuro</small></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <p>LifeOS — Experimento 03 · Laboratorio de Exploración de Identidad Gráfica</p>
      <p style="margin-top: 0.35rem;">Desarrollado para evaluación visual y decisión del fundador. No desplegar en producción.</p>
    </footer>
  </div>

  <script>
    // Tab switching logic
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = {
      matrix: document.getElementById('tab-matrix'),
      contexts: document.getElementById('tab-contexts'),
      zoom: document.getElementById('tab-zoom'),
      rubric: document.getElementById('tab-rubric'),
    };

    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tabKey = btn.dataset.tab;
        Object.entries(sections).forEach(([key, el]) => {
          if (el) el.style.display = (key === tabKey) ? (key === 'rubric' ? 'block' : 'flex') : 'none';
        });
      });
    });

    // Theme toggle logic
    const themeBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    let isDark = true;

    themeBtn.addEventListener('click', () => {
      isDark = !isDark;
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        themeIcon.textContent = '🌙';
        themeText.textContent = 'Modo Oscuro';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        themeIcon.textContent = '☀️';
        themeText.textContent = 'Modo Claro';
      }
    });
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(PILOT_DIR, 'index.html'), htmlContent, 'utf8');
console.log('[Builder] Successfully created gym-art-pilot/index.html');
