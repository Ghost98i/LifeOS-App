/**
 * Merchant and Service Identity Registry
 * Local mapping of recognizable services and vendors to badges and domain icons.
 * 100% offline, robust fallback to category defaults.
 */

export interface MerchantIdentity {
  name: string;
  icon: string;
  iconChar?: string;
  color: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
  categoryDefault?: string;
}

interface RawMerchantDef {
  name: string;
  icon: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  categoryDefault?: string;
}

const KNOWN_MERCHANTS: Record<string, RawMerchantDef> = {
  spotify: { name: 'Spotify', icon: '🎵', color: '#1DB954', badgeBg: 'rgba(29, 185, 84, 0.12)', badgeBorder: 'rgba(29, 185, 84, 0.3)', categoryDefault: 'Streaming' },
  netflix: { name: 'Netflix', icon: '🎬', color: '#E50914', badgeBg: 'rgba(229, 9, 20, 0.12)', badgeBorder: 'rgba(229, 9, 20, 0.3)', categoryDefault: 'Streaming' },
  youtube: { name: 'YouTube', icon: '▶️', color: '#FF0000', badgeBg: 'rgba(255, 0, 0, 0.12)', badgeBorder: 'rgba(255, 0, 0, 0.3)', categoryDefault: 'Streaming' },
  amazon: { name: 'Amazon', icon: '📦', color: '#FF9900', badgeBg: 'rgba(255, 153, 0, 0.12)', badgeBorder: 'rgba(255, 153, 0, 0.3)', categoryDefault: 'Admin/Hogar' },
  google: { name: 'Google', icon: '🌐', color: '#4285F4', badgeBg: 'rgba(66, 133, 244, 0.12)', badgeBorder: 'rgba(66, 133, 244, 0.3)', categoryDefault: 'Suscripciones' },
  apple: { name: 'Apple', icon: '🍎', color: '#64748B', badgeBg: 'rgba(100, 116, 139, 0.12)', badgeBorder: 'rgba(100, 116, 139, 0.3)', categoryDefault: 'Suscripciones' },
  uber: { name: 'Uber', icon: '🚗', color: '#0F172A', badgeBg: 'rgba(15, 23, 42, 0.12)', badgeBorder: 'rgba(15, 23, 42, 0.3)', categoryDefault: 'Transporte' },
  antel: { name: 'Antel', icon: '📡', color: '#005CA9', badgeBg: 'rgba(0, 92, 169, 0.12)', badgeBorder: 'rgba(0, 92, 169, 0.3)', categoryDefault: 'Suscripciones' },
  ute: { name: 'UTE', icon: '⚡', color: '#D97706', badgeBg: 'rgba(217, 119, 6, 0.12)', badgeBorder: 'rgba(217, 119, 6, 0.3)', categoryDefault: 'Admin/Hogar' },
  ose: { name: 'OSE', icon: '💧', color: '#0284C7', badgeBg: 'rgba(2, 132, 199, 0.12)', badgeBorder: 'rgba(2, 132, 199, 0.3)', categoryDefault: 'Admin/Hogar' },
  pedidosya: { name: 'PedidosYa', icon: '🛵', color: '#EA0029', badgeBg: 'rgba(234, 0, 41, 0.12)', badgeBorder: 'rgba(234, 0, 41, 0.3)', categoryDefault: 'Comida' },
  rappi: { name: 'Rappi', icon: '🛍️', color: '#FF441F', badgeBg: 'rgba(255, 68, 31, 0.12)', badgeBorder: 'rgba(255, 68, 31, 0.3)', categoryDefault: 'Comida' },
  disco: { name: 'Disco', icon: '🛒', color: '#DC2626', badgeBg: 'rgba(220, 38, 38, 0.12)', badgeBorder: 'rgba(220, 38, 38, 0.3)', categoryDefault: 'Comida' },
  devoto: { name: 'Devoto', icon: '🛒', color: '#2563EB', badgeBg: 'rgba(37, 99, 235, 0.12)', badgeBorder: 'rgba(37, 99, 235, 0.3)', categoryDefault: 'Comida' },
  tiendainglesa: { name: 'Tienda Inglesa', icon: '🛒', color: '#B91C1C', badgeBg: 'rgba(185, 28, 28, 0.12)', badgeBorder: 'rgba(185, 28, 28, 0.3)', categoryDefault: 'Comida' },
  mercadolibre: { name: 'Mercado Libre', icon: '🤝', color: '#CA8A04', badgeBg: 'rgba(202, 138, 4, 0.12)', badgeBorder: 'rgba(202, 138, 4, 0.3)', categoryDefault: 'Admin/Hogar' },
  github: { name: 'GitHub', icon: '🐙', color: '#334155', badgeBg: 'rgba(51, 65, 85, 0.12)', badgeBorder: 'rgba(51, 65, 85, 0.3)', categoryDefault: 'Estudio' },
  chatgpt: { name: 'ChatGPT', icon: '✦', color: '#10A37F', badgeBg: 'rgba(16, 163, 127, 0.12)', badgeBorder: 'rgba(16, 163, 127, 0.3)', categoryDefault: 'Suscripciones' },
};

export function identifyMerchant(text?: string | null): MerchantIdentity | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();

  for (const [key, raw] of Object.entries(KNOWN_MERCHANTS)) {
    if (clean.includes(key)) {
      return {
        name: raw.name,
        icon: raw.icon,
        iconChar: raw.icon,
        color: raw.color,
        badgeBg: raw.badgeBg,
        badgeColor: raw.color,
        badgeBorder: raw.badgeBorder,
        categoryDefault: raw.categoryDefault,
      };
    }
  }

  return null;
}
