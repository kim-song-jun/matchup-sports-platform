'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';
import { getGaMeasurementId, trackEvent, trackRoute } from '@/lib/analytics';

type WebVitalsMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

// Module-level on purpose: useReportWebVitals re-subscribes whenever the callback identity
// changes, and a re-subscription replays the buffered FCP/TTFB as duplicate events.
export function reportWebVitals(metric: WebVitalsMetric): void {
  trackEvent('web_vitals', {
    metric_name: metric.name,
    // CLS is a unitless score; scale it so every metric reports as an integer.
    metric_value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    metric_rating: metric.rating,
    metric_id: metric.id,
    navigation_type: metric.navigationType,
  });
}

export function GoogleAnalytics() {
  const measurementId = getGaMeasurementId();
  const pathname = usePathname();

  useEffect(() => {
    if (!measurementId) return;
    trackRoute(pathname);
  }, [measurementId, pathname]);

  useReportWebVitals(reportWebVitals);

  if (!measurementId) return null;

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />;
}
