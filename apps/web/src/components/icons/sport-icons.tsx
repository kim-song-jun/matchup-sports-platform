interface IconProps {
  size?: number;
  className?: string;
}

export function FutsalIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2C12 2 14.5 6 14.5 8.5C14.5 11 12 12 12 12C12 12 9.5 11 9.5 8.5C9.5 6 12 2 12 2Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 8.5L8.5 11" stroke="currentColor" strokeWidth="1.2" />
      <path d="M20.5 8.5L15.5 11" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 19L9.5 15" stroke="currentColor" strokeWidth="1.2" />
      <path d="M19 19L14.5 15" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function BasketballIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2V22" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 12H22" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 4.5C7.5 7 9 9.5 9 12C9 14.5 7.5 17 4.5 19.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M19.5 4.5C16.5 7 15 9.5 15 12C15 14.5 16.5 17 19.5 19.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function BadmintonIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3L15 10H9L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 10L15 10" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 7L14 7" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="10" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="19.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function IceHockeyIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 4L12 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 20C12 20 16 20 18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function FigureSkatingIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.5V14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 10L12 8.5L15 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 14L12 14L14 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14L10 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 20H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ShortTrackIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <ellipse cx="12" cy="16" rx="9" ry="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.5V12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 9L15 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 14L17 14" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeDasharray="2 2" />
    </svg>
  );
}

export function SoccerIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="12,7 15,9.5 14,13 10,13 9,9.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <line x1="12" y1="2" x2="12" y2="7" stroke="currentColor" strokeWidth="0.8" />
      <line x1="22" y1="12" x2="15" y2="9.5" stroke="currentColor" strokeWidth="0.8" />
      <line x1="19" y1="19" x2="14" y2="13" stroke="currentColor" strokeWidth="0.8" />
      <line x1="5" y1="19" x2="10" y2="13" stroke="currentColor" strokeWidth="0.8" />
      <line x1="2" y1="12" x2="9" y2="9.5" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  );
}

export const SportIconMap: Record<string, React.FC<IconProps>> = {
  soccer: SoccerIcon,
  futsal: FutsalIcon,
  basketball: BasketballIcon,
  badminton: BadmintonIcon,
  ice_hockey: IceHockeyIcon,
  figure_skating: FigureSkatingIcon,
  short_track: ShortTrackIcon,
};
