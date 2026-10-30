import React from 'react';

interface FinanceBalanceAtmosphereProps {
  className?: string;
  status?: 'healthy' | 'attention' | 'warning' | 'deficit';
}

/**
 * FinanceBalanceAtmosphere — Fondo abstracto de ondas y flujo violeta
 * Detalle decorativo puro integrado en el fondo derecho de FinanceHero (full variant).
 * Aporta atmósfera fintech, sensación de liquidez y movimiento sutil a través de
 * filamentos curvos y bandas laminares superpuestas en la gama violeta/índigo de LifeOS (#4F46E5),
 * sin orbes, sin nodos y sin competir con las cifras ni los controles.
 */
export const FinanceBalanceAtmosphere: React.FC<FinanceBalanceAtmosphereProps> = ({
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none hidden sm:block absolute right-0 inset-y-0 w-[280px] md:w-[380px] lg:w-[460px] overflow-hidden select-none z-0 transition-opacity ${className}`}
    >
      {/* =====================================================================
          DARK MODE — Ondas y filamentos luminosos sutiles (Violeta / Índigo)
         ===================================================================== */}
      <svg
        aria-hidden="true"
        focusable="false"
        className="hidden dark:block h-full w-full"
        viewBox="0 0 460 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMaxYMid slice"
      >
        <defs>
          {/* Brillo ambiental tenue violeta/índigo en la zona superior derecha */}
          <radialGradient
            id="fin-wave-dark-glow"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(360 100) rotate(-15) scale(150 110)"
          >
            <stop offset="0" stopColor="#4F46E5" stopOpacity="0.16" />
            <stop offset="0.55" stopColor="#3730A3" stopOpacity="0.06" />
            <stop offset="1" stopColor="#1E1B4B" stopOpacity="0" />
          </radialGradient>

          {/* Gradiente lineal para la cinta profunda (Ribbon 1) */}
          <linearGradient id="fin-wave-dark-ribbon-1" x1="200" y1="120" x2="440" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4F46E5" stopOpacity="0" />
            <stop offset="0.6" stopColor="#4F46E5" stopOpacity="0.06" />
            <stop offset="1" stopColor="#6366F1" stopOpacity="0.1" />
          </linearGradient>

          {/* Gradiente lineal para la cinta intermedia (Ribbon 2) */}
          <linearGradient id="fin-wave-dark-ribbon-2" x1="230" y1="140" x2="450" y2="130" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="0.5" stopColor="#4F46E5" stopOpacity="0.05" />
            <stop offset="1" stopColor="#312E81" stopOpacity="0.12" />
          </linearGradient>

          {/* Gradientes para los trazos de los filamentos de flujo */}
          <linearGradient id="fin-wave-dark-line-1" x1="220" y1="130" x2="460" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#A5B4FC" stopOpacity="0" />
            <stop offset="0.35" stopColor="#A5B4FC" stopOpacity="0.35" />
            <stop offset="0.8" stopColor="#818CF8" stopOpacity="0.5" />
            <stop offset="1" stopColor="#6366F1" stopOpacity="0.25" />
          </linearGradient>

          <linearGradient id="fin-wave-dark-line-2" x1="200" y1="150" x2="460" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#818CF8" stopOpacity="0" />
            <stop offset="0.4" stopColor="#6366F1" stopOpacity="0.4" />
            <stop offset="0.85" stopColor="#4F46E5" stopOpacity="0.55" />
            <stop offset="1" stopColor="#4F46E5" stopOpacity="0.2" />
          </linearGradient>

          <linearGradient id="fin-wave-dark-line-3" x1="250" y1="160" x2="460" y2="130" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="0.5" stopColor="#818CF8" stopOpacity="0.28" />
            <stop offset="1" stopColor="#4F46E5" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* 1. Brillo difuso de fondo */}
        <ellipse cx="360" cy="100" rx="150" ry="110" transform="rotate(-15 360 100)" fill="url(#fin-wave-dark-glow)" />

        {/* 2. Cintas onduladas translúcidas superpuestas (Layered wave ribbons) */}
        {/* Cinta 1: Onda amplia de fondo */}
        <path
          d="M 460 15 C 375 30 305 75 235 118 C 195 142 215 175 285 195 C 335 210 395 215 460 210 Z"
          fill="url(#fin-wave-dark-ribbon-1)"
        />

        {/* Cinta 2: Contracorriente intermedia */}
        <path
          d="M 460 55 C 385 68 315 108 250 148 C 220 168 245 192 320 205 C 370 215 420 220 460 220 Z"
          fill="url(#fin-wave-dark-ribbon-2)"
        />

        {/* Cinta 3: Velo superior suave */}
        <path
          d="M 460 -15 C 380 8 320 42 265 82 C 235 105 245 128 310 148 C 370 168 420 178 460 180 Z"
          fill="#4F46E5"
          fillOpacity="0.04"
        />

        {/* 3. Filamentos curvos de movimiento (Harmonic low-contrast motion lines) */}
        {/* Filamento superior de proyección */}
        <path
          d="M 460 -5 C 390 15 325 55 270 95 C 235 120 250 145 325 168 C 385 186 430 192 460 195"
          stroke="url(#fin-wave-dark-line-1)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />

        {/* Filamento central principal (liquidez y flujo) */}
        <path
          d="M 460 30 C 375 45 305 85 245 125 C 210 150 228 178 305 200 C 365 215 420 218 460 218"
          stroke="url(#fin-wave-dark-line-2)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Filamento de acompañamiento armónico */}
        <path
          d="M 460 70 C 395 80 335 115 280 150 C 255 168 270 190 345 208 C 395 218 435 220 460 220"
          stroke="url(#fin-wave-dark-line-3)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Trazo secundario de cadencia baja */}
        <path
          d="M 460 110 C 410 118 365 142 320 172 C 295 188 310 205 380 218 C 420 222 445 220 460 218"
          stroke="#4F46E5"
          strokeOpacity="0.22"
          strokeWidth="0.9"
          strokeLinecap="round"
        />

        {/* Resplandor tenue en cresta alta */}
        <path
          d="M 460 5 C 395 22 345 52 300 85"
          stroke="#C7D2FE"
          strokeOpacity="0.28"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>

      {/* =====================================================================
          LIGHT MODE — Ondas y filamentos sutiles para superficie clara (Lavanda / Periwinkle / Violeta)
         ===================================================================== */}
      <svg
        aria-hidden="true"
        focusable="false"
        className="block dark:hidden h-full w-full"
        viewBox="0 0 460 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMaxYMid slice"
      >
        <defs>
          {/* Brillo ambiental suave lavanda/periwinkle */}
          <radialGradient
            id="fin-wave-light-glow"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(360 100) rotate(-15) scale(150 110)"
          >
            <stop offset="0" stopColor="#C7D2FE" stopOpacity="0.45" />
            <stop offset="0.6" stopColor="#E0E7FF" stopOpacity="0.2" />
            <stop offset="1" stopColor="#EEF2FF" stopOpacity="0" />
          </radialGradient>

          {/* Gradiente lineal para la cinta profunda (Ribbon 1) */}
          <linearGradient id="fin-wave-light-ribbon-1" x1="200" y1="120" x2="440" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#EEF2FF" stopOpacity="0" />
            <stop offset="0.55" stopColor="#E0E7FF" stopOpacity="0.45" />
            <stop offset="1" stopColor="#C7D2FE" stopOpacity="0.5" />
          </linearGradient>

          {/* Gradiente lineal para la cinta intermedia (Ribbon 2) */}
          <linearGradient id="fin-wave-light-ribbon-2" x1="230" y1="140" x2="450" y2="130" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#EEF2FF" stopOpacity="0" />
            <stop offset="0.5" stopColor="#E0E7FF" stopOpacity="0.35" />
            <stop offset="1" stopColor="#C7D2FE" stopOpacity="0.38" />
          </linearGradient>

          {/* Gradientes para los trazos de los filamentos */}
          <linearGradient id="fin-wave-light-line-1" x1="220" y1="130" x2="460" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4F46E5" stopOpacity="0" />
            <stop offset="0.35" stopColor="#4F46E5" stopOpacity="0.25" />
            <stop offset="0.8" stopColor="#6366F1" stopOpacity="0.38" />
            <stop offset="1" stopColor="#818CF8" stopOpacity="0.2" />
          </linearGradient>

          <linearGradient id="fin-wave-light-line-2" x1="200" y1="150" x2="460" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4F46E5" stopOpacity="0" />
            <stop offset="0.4" stopColor="#4F46E5" stopOpacity="0.3" />
            <stop offset="0.85" stopColor="#6366F1" stopOpacity="0.45" />
            <stop offset="1" stopColor="#6366F1" stopOpacity="0.18" />
          </linearGradient>

          <linearGradient id="fin-wave-light-line-3" x1="250" y1="160" x2="460" y2="130" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="0.5" stopColor="#818CF8" stopOpacity="0.22" />
            <stop offset="1" stopColor="#A5B4FC" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* 1. Brillo difuso de fondo */}
        <ellipse cx="360" cy="100" rx="150" ry="110" transform="rotate(-15 360 100)" fill="url(#fin-wave-light-glow)" />

        {/* 2. Cintas onduladas translúcidas superpuestas */}
        <path
          d="M 460 15 C 375 30 305 75 235 118 C 195 142 215 175 285 195 C 335 210 395 215 460 210 Z"
          fill="url(#fin-wave-light-ribbon-1)"
        />

        <path
          d="M 460 55 C 385 68 315 108 250 148 C 220 168 245 192 320 205 C 370 215 420 220 460 220 Z"
          fill="url(#fin-wave-light-ribbon-2)"
        />

        <path
          d="M 460 -15 C 380 8 320 42 265 82 C 235 105 245 128 310 148 C 370 168 420 178 460 180 Z"
          fill="#EEF2FF"
          fillOpacity="0.5"
        />

        {/* 3. Filamentos curvos de movimiento */}
        <path
          d="M 460 -5 C 390 15 325 55 270 95 C 235 120 250 145 325 168 C 385 186 430 192 460 195"
          stroke="url(#fin-wave-light-line-1)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />

        <path
          d="M 460 30 C 375 45 305 85 245 125 C 210 150 228 178 305 200 C 365 215 420 218 460 218"
          stroke="url(#fin-wave-light-line-2)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        <path
          d="M 460 70 C 395 80 335 115 280 150 C 255 168 270 190 345 208 C 395 218 435 220 460 220"
          stroke="url(#fin-wave-light-line-3)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        <path
          d="M 460 110 C 410 118 365 142 320 172 C 295 188 310 205 380 218 C 420 222 445 220 460 218"
          stroke="#6366F1"
          strokeOpacity="0.18"
          strokeWidth="0.9"
          strokeLinecap="round"
        />

        {/* Resplandor tenue en cresta alta */}
        <path
          d="M 460 5 C 395 22 345 52 300 85"
          stroke="#FFFFFF"
          strokeOpacity="0.75"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
