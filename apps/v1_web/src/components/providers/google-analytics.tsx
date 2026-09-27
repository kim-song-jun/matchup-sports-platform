'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';
import { getGaMeasurementId, trackEvent, trackRoute } from '@/lib/analytics';

export function GoogleAnalytics() {
  const measurementId = getGaMeasurementId();
  const pathname = usePathname();

  useEffect(() => {
    if (!measurementId) return;
    trackRoute(pathname);
  }, [measurementId, pathname]);

  useReportWebVitals((metric) => {
    if (!measurementId) return;
    trackEvent('web_vitals', {
      metric_name: metric.name,
      // CLS is a unitless score; scale it so every metric reports as an integer.
      metric_value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      metric_rating: metric.rating,
      metric_id: metric.id,
      navigation_type: metric.navigationType,
    });
  });

  if (!measurementId) return null;

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />;
}
