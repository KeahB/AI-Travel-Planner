import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, Wind, Droplets } from 'lucide-react';
import { motion } from 'motion/react';

interface WeatherWidgetProps {
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
}

interface WeatherData {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weathercode: number[];
}

export function WeatherWidget({ lat, lon, startDate, endDate }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setLoading(true);
        // We'll fetch a 14-day forecast from Open-Meteo
        // If the trip is further out, this might not cover it, but it's a good approximation
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=14`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch weather data');
        }
        
        const data = await response.json();
        setWeather(data.daily);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load weather');
      } finally {
        setLoading(false);
      }
    };

    if (lat && lon) {
      fetchWeather();
    }
  }, [lat, lon]);

  if (loading) {
    return (
      <div className="bg-white/50 backdrop-blur-sm rounded-3xl p-6 border border-brand-sand/50 shadow-sm animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-24 h-32 bg-slate-100 rounded-2xl shrink-0"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return null;
  }

  // Filter weather data to match trip dates if possible, otherwise show next 5 days
  const tripStart = new Date(startDate);
  const tripEnd = new Date(endDate);
  
  let displayIndices: number[] = [];
  
  weather.time.forEach((timeStr, index) => {
    const date = new Date(timeStr);
    // Check if date is within trip range (ignoring time)
    if (date >= new Date(tripStart.setHours(0,0,0,0)) && date <= new Date(tripEnd.setHours(23,59,59,999))) {
      displayIndices.push(index);
    }
  });

  // If trip is too far in the future, just show the next 5 days
  if (displayIndices.length === 0) {
    displayIndices = [0, 1, 2, 3, 4];
  }

  // Limit to 7 days max to avoid scrolling too much
  displayIndices = displayIndices.slice(0, 7);

  const getWeatherIcon = (code: number) => {
    // WMO Weather interpretation codes (https://open-meteo.com/en/docs)
    if (code === 0) return <Sun className="w-8 h-8 text-amber-400" />;
    if (code === 1 || code === 2) return <CloudSun className="w-8 h-8 text-amber-400/80" />;
    if (code === 3) return <Cloud className="w-8 h-8 text-slate-400" />;
    if (code === 45 || code === 48) return <CloudFog className="w-8 h-8 text-slate-400" />;
    if (code >= 51 && code <= 57) return <CloudDrizzle className="w-8 h-8 text-blue-400" />;
    if (code >= 61 && code <= 67) return <CloudRain className="w-8 h-8 text-blue-500" />;
    if (code >= 71 && code <= 77) return <CloudSnow className="w-8 h-8 text-sky-200" />;
    if (code >= 80 && code <= 82) return <CloudRain className="w-8 h-8 text-blue-500" />;
    if (code >= 85 && code <= 86) return <CloudSnow className="w-8 h-8 text-sky-200" />;
    if (code >= 95) return <CloudLightning className="w-8 h-8 text-purple-500" />;
    
    return <Sun className="w-8 h-8 text-amber-400" />;
  };

  const getWeatherDescription = (code: number) => {
    if (code === 0) return 'Clear';
    if (code === 1 || code === 2) return 'Partly Cloudy';
    if (code === 3) return 'Overcast';
    if (code === 45 || code === 48) return 'Foggy';
    if (code >= 51 && code <= 57) return 'Drizzle';
    if (code >= 61 && code <= 67) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Showers';
    if (code >= 85 && code <= 86) return 'Snow Showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Clear';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    // Add timezone offset to prevent date shifting
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white/60 backdrop-blur-md rounded-3xl p-6 border border-brand-sand/50 shadow-sm mb-10">
      <div className="flex items-center gap-2 mb-6">
        <CloudSun className="w-6 h-6 text-brand-sunset" />
        <h3 className="text-xl font-bold text-slate-800">Weather Forecast</h3>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x scrollbar-hide">
        {displayIndices.map((index, i) => (
          <motion.div 
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center justify-between bg-white rounded-2xl p-4 min-w-[120px] shrink-0 snap-center shadow-sm border border-slate-100"
          >
            <span className="text-sm font-medium text-slate-500 mb-3">
              {formatDate(weather.time[index])}
            </span>
            
            <div className="mb-3">
              {getWeatherIcon(weather.weathercode[index])}
            </div>
            
            <div className="flex items-center gap-3 mb-2">
              <span className="text-lg font-bold text-slate-800">
                {Math.round(weather.temperature_2m_max[index])}°
              </span>
              <span className="text-sm font-medium text-slate-400">
                {Math.round(weather.temperature_2m_min[index])}°
              </span>
            </div>
            
            <span className="text-xs font-medium text-slate-500 text-center">
              {getWeatherDescription(weather.weathercode[index])}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
