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
    <div className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all relative overflow-hidden group">
      {/* Subtle ambient gradient overlay */}
      <div className="absolute -right-8 -top-8 w-28 h-28 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />

      <div className="flex items-center justify-between gap-3 relative z-10">
        {/* Left info: Location & Temp */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-2xl shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            {info.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-[var(--text)] tracking-tight">
                {weather?.locationName || 'Melo, Cerro Largo'}
              </span>
              <button
                onClick={() => setIsSearching(!isSearching)}
                className="p-1 text-[10px] text-[var(--blue)] hover:bg-[var(--blue-soft)] rounded-lg transition-colors cursor-pointer"
                title="Buscar o cambiar ciudad"
              >
                🔍
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-[var(--text)] tracking-tight">
                {weather ? `${weather.temp}°C` : '—'}
              </span>
              <span className="text-xs text-[var(--text-soft)] font-semibold">
                {info.label}
              </span>
            </div>
          </div>
        </div>

        {/* Right info: Max / Min / Wind */}
        <div className="text-right flex flex-col items-end gap-1.5 text-xs">
          {weather?.maxTemp != null && weather?.minTemp != null && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold rounded-lg border border-rose-500/20">
                Max: {weather.maxTemp}°
              </span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold rounded-lg border border-blue-500/20">
                Min: {weather.minTemp}°
              </span>
            </div>
          )}
          {weather?.windSpeed != null && (
            <span className="text-[11px] text-[var(--text-soft)] font-medium">
              💨 Viento: {weather.windSpeed} km/h
            </span>
          )}
          <button
            onClick={getLocationAndFetch}
            disabled={loading}
            title="Solo se solicita permiso al tocar este botón. La ubicación se envía a Open-Meteo para consultar el clima."
            className="text-[10px] font-semibold text-[var(--blue)] hover:underline flex items-center gap-1 cursor-pointer transition-opacity disabled:opacity-50"
          >
            {loading ? '🔄 Actualizando...' : '📍 Ubicación (opcional)'}
          </button>
        </div>
      </div>

      {/* Optional Search Input Drawer */}
      {isSearching && (
        <form
          onSubmit={handleSearchCity}
          className="mt-3 pt-3 border-t border-[var(--border)] flex gap-2 animate-in fade-in duration-200"
        >
          <input
            type="text"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Buscar ciudad (Ej: Melo, Montevideo, Madrid...)"
            className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-hidden transition-all text-[var(--text)]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
          >
            Buscar
          </button>
        </form>
      )}

      {error && (
        <p className="text-[11px] text-amber-500 mt-2 font-medium">
          ⚠️ {error}
        </p>
      )}
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        className="relative z-10 mt-2 inline-block text-[9px] font-medium text-[var(--text-faint)] hover:text-[var(--blue)]"
      >
        Datos del clima: Open-Meteo
      </a>
    </div>
  );
};
