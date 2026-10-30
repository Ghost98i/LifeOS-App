import React, { useState, useEffect } from 'react';

interface WeatherData {
  temp: number;
  maxTemp?: number;
  minTemp?: number;
  weatherCode: number;
  windSpeed: number;
  locationName: string;
}

const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: 'Despejado', icon: '☀️' },
  1: { label: 'Principalmente despejado', icon: '🌤' },
  2: { label: 'Parcialmente nublado', icon: '⛅' },
  3: { label: 'Nublado', icon: '☁️' },
  45: { label: 'Niebla', icon: '🌫' },
  48: { label: 'Niebla con escarcha', icon: '🌫' },
  51: { label: 'Llovizna ligera', icon: '🌦' },
  53: { label: 'Llovizna moderada', icon: '🌦' },
  55: { label: 'Llovizna densa', icon: '🌧' },
  61: { label: 'Lluvia leve', icon: '🌧' },
  63: { label: 'Lluvia moderada', icon: '🌧' },
  65: { label: 'Lluvia fuerte', icon: '🌧' },
  71: { label: 'Nieve leve', icon: '🌨' },
  73: { label: 'Nieve moderada', icon: '❄️' },
  75: { label: 'Nieve fuerte', icon: '❄️' },
  80: { label: 'Chubascos suaves', icon: '🌦' },
  81: { label: 'Chubascos moderados', icon: '🌧' },
  82: { label: 'Chubascos violentos', icon: '⛈' },
  95: { label: 'Tormenta eléctrica', icon: '🌩' },
  96: { label: 'Tormenta con granizo', icon: '⛈' },
};

export const WeatherWidget: React.FC = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityInput, setCityInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const fetchWeather = async (lat: number, lon: number, locationName: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
      );
      if (!res.ok) throw new Error('Error al obtener datos meteorológicos.');
      const data = await res.json();

      const current = data.current_weather;
      const daily = data.daily;

      const wData: WeatherData = {
        temp: Math.round(current.temperature),
        maxTemp: daily?.temperature_2m_max?.[0] ? Math.round(daily.temperature_2m_max[0]) : undefined,
        minTemp: daily?.temperature_2m_min?.[0] ? Math.round(daily.temperature_2m_min[0]) : undefined,
        weatherCode: current.weathercode,
        windSpeed: Math.round(current.windspeed),
        locationName,
      };

      setWeather(wData);
      localStorage.setItem('lifeos_last_weather', JSON.stringify({ ...wData, lat, lon }));
    } catch {
      setError('No se pudo cargar el clima.');
    } finally {
      setLoading(false);
    }
  };

  const getLocationAndFetch = () => {
    if (!navigator.geolocation) {
      setError('La geolocalización no está soportada por el navegador.');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetchWeather(lat, lon, 'Ubicación actual');
      },
      (err) => {
        console.warn('Geolocation denied/error:', err);
        // Fallback or default city: Melo, Cerro Largo (-32.3683, -54.1681)
        const saved = localStorage.getItem('lifeos_last_weather');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            fetchWeather(parsed.lat, parsed.lon, parsed.locationName || 'Melo, Cerro Largo');
            return;
          } catch {}
        }
        // Default to Melo, Cerro Largo (-32.3683, -54.1681)
        fetchWeather(-32.3683, -54.1681, 'Melo, Cerro Largo');
      },
      { timeout: 8000 }
    );
  };

  const handleSearchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          cityInput.trim()
        )}&count=1&language=es`
      );
      if (!res.ok) throw new Error('Ciudad no encontrada.');
      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        setError('No se encontró la ciudad.');
        setLoading(false);
        return;
      }
      const city = data.results[0];
      const name = `${city.name}${city.country ? `, ${city.country}` : ''}`;
      await fetchWeather(city.latitude, city.longitude, name);
      setIsSearching(false);
      setCityInput('');
    } catch {
      setError('Error al buscar la ciudad.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('lifeos_last_weather');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.lat && parsed.lon) {
          fetchWeather(parsed.lat, parsed.lon, parsed.locationName || 'Melo, Cerro Largo');
        } else {
          setWeather(parsed);
        }
      } catch {
        fetchWeather(-32.3683, -54.1681, 'Melo, Cerro Largo');
      }
    } else {
      // Default to Melo, Cerro Largo permanently
      fetchWeather(-32.3683, -54.1681, 'Melo, Cerro Largo');
    }
  }, []);

  const info = weather
    ? WEATHER_CODES[weather.weatherCode] || { label: 'Variable', icon: '🌡️' }
    : { label: 'Cargando...', icon: '🌤' };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)] rounded-2xl p-3 shadow-2xs transition-all relative overflow-hidden group">
      {/* Subtle ambient gradient overlay */}
      <div className="absolute -right-8 -top-8 w-24 h-24 bg-gradient-to-br from-blue-500/8 via-indigo-500/4 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-110 transition-transform duration-300" />

      <div className="flex items-center justify-between gap-2.5 relative z-10">
        {/* Left info: Icon, Location, Temp & State */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-xl shrink-0 shadow-2xs">
            {info.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-[11px] text-[var(--text)] tracking-tight truncate max-w-[120px] sm:max-w-[180px]">
                {weather?.locationName || 'Melo, Cerro Largo'}
              </span>
              <button
                type="button"
                onClick={() => setIsSearching(!isSearching)}
                className="p-0.5 text-[10px] text-[var(--blue)] hover:bg-[var(--blue-soft)] rounded transition-colors cursor-pointer"
                title="Buscar o cambiar ciudad / más detalles"
              >
                🔍
              </button>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-[var(--text)] tracking-tight tabular-nums">
                {weather ? `${weather.temp}°C` : '—'}
              </span>
              <span className="text-[11px] text-[var(--text-soft)] font-medium truncate">
                {info.label}
              </span>
            </div>
          </div>
        </div>

        {/* Right info: Max / Min & subtle location trigger */}
        <div className="text-right flex flex-col items-end gap-1 shrink-0">
          {weather?.maxTemp != null && weather?.minTemp != null && (
            <div className="flex items-center gap-1 text-[10px] tabular-nums">
              <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold rounded-md border border-rose-500/20">
                ↑{weather.maxTemp}°
              </span>
              <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold rounded-md border border-blue-500/20">
                ↓{weather.minTemp}°
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={getLocationAndFetch}
            disabled={loading}
            title="Actualizar ubicación"
            className="text-[9px] font-semibold text-[var(--text-faint)] hover:text-[var(--blue)] hover:underline flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? '🔄 Cargando...' : '📍 Ubicación'}
          </button>
        </div>
      </div>

      {/* Optional Search / Extended Info Drawer */}
      {isSearching && (
        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] space-y-2 animate-in fade-in duration-150">
          <form onSubmit={handleSearchCity} className="flex gap-2">
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Buscar ciudad (Ej: Melo, Montevideo, Buenos Aires...)"
              className="flex-1 px-2.5 py-1 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden transition-all text-[var(--text)]"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
            >
              Buscar
            </button>
          </form>
          {weather?.windSpeed != null && (
            <div className="flex items-center justify-between text-[10px] text-[var(--text-soft)] px-1">
              <span>💨 Viento: {weather.windSpeed} km/h</span>
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[9px] text-[var(--text-faint)] hover:underline"
              >
                Open-Meteo
              </a>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-amber-500 mt-1.5 font-medium">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
};
