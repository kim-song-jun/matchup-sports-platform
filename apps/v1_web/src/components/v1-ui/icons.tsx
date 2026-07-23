import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function SvgIcon({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 11 L12 3 L21 11 V21 H3 Z" />
    </SvgIcon>
  );
}

export function MatchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3 L15 9 L21 10 L16 14 L18 21 L12 17 L6 21 L8 14 L3 10 L9 9 Z" />
    </SvgIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5 V19" />
      <path d="M5 12 H19" />
    </SvgIcon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M14 5 H19 V10" />
      <path d="M19 5 L12 12" />
      <path d="M11 6 H7 A2 2 0 0 0 5 8 V17 A2 2 0 0 0 7 19 H16 A2 2 0 0 0 18 17 V13" />
    </SvgIcon>
  );
}

export function TeamMatchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 8h16v10H4z M8 8V6h8v2 M8 18v2h8v-2 M8 12h8" />
    </SvgIcon>
  );
}

export function TeamsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9 11 A4 4 0 1 0 9 3 A4 4 0 0 0 9 11 M2 21 A7 7 0 0 1 16 21 M17 11 A3 3 0 1 0 17 5 A3 3 0 0 0 17 11 M17 15 A5 5 0 0 1 22 20" />
    </SvgIcon>
  );
}

export function MyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12 M4 21 A8 8 0 0 1 20 21" />
    </SvgIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </SvgIcon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 6 H20" />
      <path d="M7 12 H17" />
      <path d="M10 18 H14" />
    </SvgIcon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20 11 A8 8 0 0 0 6.5 5.2" />
      <path d="M6 3 V6 H9" />
      <path d="M4 13 A8 8 0 0 0 17.5 18.8" />
      <path d="M18 21 V18 H15" />
    </SvgIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M18 8 A6 6 0 0 0 6 8 C6 15 3 16 3 18 H21 C21 16 18 15 18 8" />
      <path d="M10 21 H14" />
    </SvgIcon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 5 H19 A2 2 0 0 1 21 7 V15 A2 2 0 0 1 19 17 H9 L5 21 V17 H5 A2 2 0 0 1 3 15 V7 A2 2 0 0 1 5 5 Z" />
      <path d="M8 10 H16" />
      <path d="M8 13 H13" />
    </SvgIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m15 6-6 6 6 6" />
    </SvgIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </SvgIcon>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 2 H18 V10 A6 6 0 0 1 6 10 Z" />
      <path d="M6 2 H3 V6 A3 3 0 0 0 6 9" />
      <path d="M18 2 H21 V6 A3 3 0 0 1 18 9" />
      <path d="M12 16 V12" />
      <path d="M8 22 H16" />
      <path d="M12 16 A3 3 0 0 0 9 19 H15 A3 3 0 0 0 12 16 Z" />
    </SvgIcon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M2 12 C4 7 8 4.5 12 4.5 C16 4.5 20 7 22 12 C20 17 16 19.5 12 19.5 C8 19.5 4 17 2 12 Z" />
      <circle cx="12" cy="12" r="3" />
    </SvgIcon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M2 12 C4 7 8 4.5 12 4.5 C16 4.5 20 7 22 12 C20 17 16 19.5 12 19.5 C8 19.5 4 17 2 12 Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4 L20 20" />
    </SvgIcon>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3 L22 20 H2 Z" />
      <path d="M12 9.5 V13.5" />
      <path d="M12 16.8 V17" />
    </SvgIcon>
  );
}

export function InfoCircleIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11 V16.5" />
      <path d="M12 7.5 V7.7" />
    </SvgIcon>
  );
}
