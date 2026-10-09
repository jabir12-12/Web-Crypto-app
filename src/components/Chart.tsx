'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, IChartApi, ISeriesApi, CrosshairMode, Time } from 'lightweight-charts';
import { ChartCandle, useMarketStore } from '../store/useMarketStore';

interface ChartProps {
  interval: '1s' | '5s';
  history: ChartCandle[];
}

export default function Chart({ interval, history }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const [hoverInfo, setHoverInfo] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  const { activeCandle1s, activeCandle5s } = useMarketStore();
  const activeCandle = interval === '1s' ? activeCandle1s : activeCandle5s;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#8a919e',
      },
      grid: {
        vertLines: { color: '#2a2e39', style: 1 },
        horzLines: { color: '#2a2e39', style: 1 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#2a2e39',
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#8a919e',
          width: 1,
          style: 1,
          labelBackgroundColor: '#2962ff',
        },
        horzLine: {
          color: '#8a919e',
          width: 1,
          style: 1,
          labelBackgroundColor: '#2962ff',
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    series.setData(history.map((candle) => ({ ...candle, time: candle.time as Time })));
    
    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainerRef.current!.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainerRef.current!.clientHeight
      ) {
        setHoverInfo(null);
      } else {
        const data = param.seriesData.get(series);
        if (data && 'open' in data && 'high' in data && 'low' in data && 'close' in data) {
          const date = new Date((param.time as number) * 1000);
          setHoverInfo({
            time: date.toLocaleTimeString([], { hour12: false }),
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
          });
        }
      }
    });

    chart.subscribeClick((param) => {
      const data = param.seriesData.get(series);
      if (param.time && data && 'open' in data && 'high' in data && 'low' in data && 'close' in data) {
        const date = new Date((param.time as number) * 1000);
        setHoverInfo({
          time: date.toLocaleTimeString([], { hour12: false }),
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        });
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [history, interval]); 

  useEffect(() => {
    if (seriesRef.current && activeCandle) {
      seriesRef.current.update({
      time: Math.floor(activeCandle.timestamp / 1000) as Time,
        open: activeCandle.open,
        high: activeCandle.high,
        low: activeCandle.low,
        close: activeCandle.close,
      });
    }
  }, [activeCandle]);

  return (
    <div className="w-full h-full relative">
      {hoverInfo && (
        <div className="absolute top-2 left-2 z-10 flex gap-4 text-xs font-mono bg-[#131722]/90 px-2 py-1 rounded border border-[#2a2e39] pointer-events-none">
          <span className="text-gray-400">{hoverInfo.time}</span>
          <span><span className="text-gray-500">O </span><span className="text-gray-200">{hoverInfo.open.toFixed(2)}</span></span>
          <span><span className="text-gray-500">H </span><span className="text-gray-200">{hoverInfo.high.toFixed(2)}</span></span>
          <span><span className="text-gray-500">L </span><span className="text-gray-200">{hoverInfo.low.toFixed(2)}</span></span>
          <span><span className="text-gray-500">C </span><span className="text-gray-200">{hoverInfo.close.toFixed(2)}</span></span>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
