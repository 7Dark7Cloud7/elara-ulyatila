import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * Sistema unificado de ícones SVG da Elara Ulyatila.
 *
 * Todos os glifos partilham a mesma grelha geométrica 24×24, traço mínimo
 * equilibrado (1.85 px por omissão), pontas arredondadas e precisão óptica
 * consistente — adaptando-se automaticamente ao tema claro (ameixa/tinta) e
 * escuro (ouro champanhe/branco pérola) via `currentColor`.
 */
export interface ElaraIconProps {
  className?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}

interface SvgBaseProps extends ElaraIconProps {
  children: ReactNode;
}

function Svg({ className, strokeWidth = 1.85, 'aria-hidden': ariaHidden = true, children }: SvgBaseProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      aria-hidden={ariaHidden}
      className={cn('h-5 w-5 shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/* ── Navegação, janelas e controlos ───────────────────────────────────────── */

export function SunIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.1" fill="currentColor" fillOpacity="0.14" />
      <path d="M12 2.75v2.1M12 19.15v2.1M4.93 4.93l1.48 1.48M17.59 17.59l1.48 1.48M2.75 12h2.1M19.15 12h2.1M4.93 19.07l1.48-1.48M17.59 6.41l1.48-1.48" />
    </Svg>
  );
}

export function MoonIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M20.2 14.2A8.1 8.1 0 0 1 9.8 3.8a8.2 8.2 0 1 0 10.4 10.4Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
    </Svg>
  );
}

export function CloseIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

export function ChevronRightIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </Svg>
  );
}

export function ChevronDownIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

export function ChevronUpIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m6 14.5 6-6 6 6" />
    </Svg>
  );
}

export function ArrowRightIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12h14.5M13.5 6.5 19 12l-5.5 5.5" />
    </Svg>
  );
}

export function SwapVerticalIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3" />
    </Svg>
  );
}

export function SearchIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.75" />
      <path d="m20 20-4.1-4.1" />
    </Svg>
  );
}

export function ExternalLinkIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 4.5h5v5M19.5 4.5 11 13" />
      <path d="M18.5 13.5v4.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V7.3a1.8 1.8 0 0 1 1.8-1.8h4.2" />
    </Svg>
  );
}

export function PlusIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CheckIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m5.5 12.5 4.2 4.2 8.8-9.2" />
    </Svg>
  );
}

export function CheckCircleIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.12" />
      <path d="m8.3 12.3 2.5 2.5 5-5.3" />
    </Svg>
  );
}

export function XCircleIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.1" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </Svg>
  );
}

export function SpinnerIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" strokeOpacity="0.22" />
      <path d="M20.5 12A8.5 8.5 0 0 0 12 3.5" />
    </Svg>
  );
}

export function RefreshIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2L19.5 9" />
      <path d="M19.5 4.5V9H15" />
    </Svg>
  );
}

export function RepeatIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.1-5.2L4.5 9" />
      <path d="M4.5 4.5V9H9" />
    </Svg>
  );
}

/* ── Mobilidade, mapa e categorias de frota ───────────────────────────────── */

export function LocateIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
      <path d="M12 2.8v2.5M12 18.7v2.5M2.8 12h2.5M18.7 12h2.5" />
    </Svg>
  );
}

export function PinIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 20.8s6.4-5.45 6.4-10.3a6.4 6.4 0 1 0-12.8 0c0 4.85 6.4 10.3 6.4 10.3Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <circle cx="12" cy="10.4" r="2.2" />
    </Svg>
  );
}

export function RouteIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M7.6 18.2h4.9a3.1 3.1 0 0 0 0-6.2h-1a3.1 3.1 0 0 1 0-6.2h4.7" />
      <circle cx="5.4" cy="18.2" r="2.1" fill="currentColor" fillOpacity="0.18" />
      <circle cx="18.4" cy="5.8" r="2.1" fill="currentColor" />
    </Svg>
  );
}

export function NavigationIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="m19.6 4.4-7.2 15.6-2.1-6.3-6.3-2.1 15.6-7.2Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
    </Svg>
  );
}

export function CompassIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.8" fill="currentColor" fillOpacity="0.08" />
      <path d="m15.4 8.6-2 5.2-5.2 2 2-5.2 5.2-2Z" fill="currentColor" fillOpacity="0.2" />
    </Svg>
  );
}

export function ClockIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.8" fill="currentColor" fillOpacity="0.08" />
      <path d="M12 7.2v5l3.2 2" />
    </Svg>
  );
}

export function CarFrontIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5.5 11.2 7 6.8A2 2 0 0 1 8.9 5.5h6.2A2 2 0 0 1 17 6.8l1.5 4.4"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <rect x="3.5" y="11" width="17" height="6" rx="2" fill="currentColor" fillOpacity="0.1" />
      <path d="M6 17v1.8M18 17v1.8M7.2 14h.01M16.8 14h.01" />
    </Svg>
  );
}

export function BikeIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.2" cy="16.4" r="3" />
      <circle cx="17.8" cy="16.4" r="3" />
      <path d="M6.2 16.4 10.2 10h4.2l3.4 6.4M10.2 10l2.2 6.4M14 7.5h2.6" />
    </Svg>
  );
}

export function SeatIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M7 11V6.8A2.3 2.3 0 0 1 9.3 4.5h5.4A2.3 2.3 0 0 1 17 6.8V11" fill="currentColor" fillOpacity="0.12" />
      <path d="M4.5 12.2a1.7 1.7 0 0 1 3.4 0v2.3h8.2v-2.3a1.7 1.7 0 0 1 3.4 0V16a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-3.8Z" />
      <path d="M7 18v1.8M17 18v1.8" />
    </Svg>
  );
}

export function UsersIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.2" cy="8.4" r="3" fill="currentColor" fillOpacity="0.12" />
      <path d="M3.8 19c0-2.9 2.4-4.8 5.4-4.8s5.4 1.9 5.4 4.8" />
      <circle cx="16.5" cy="9.2" r="2.3" />
      <path d="M16.5 14.6c2 0 3.7 1.3 3.7 3.7" />
    </Svg>
  );
}

export function VanIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3.5 15.8V8.5a2 2 0 0 1 2-2h9.8a2 2 0 0 1 1.7.95l2.7 4.05c.5.75.8 1.62.8 2.52v1.78a1 1 0 0 1-1 1h-1.2"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path d="M9.5 16.8h5.2M3.5 12h15.6M11 6.5V12" />
      <circle cx="7.2" cy="16.8" r="2.1" />
      <circle cx="16.8" cy="16.8" r="2.1" />
    </Svg>
  );
}

export function BusIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="4" width="15" height="13.5" rx="2.4" fill="currentColor" fillOpacity="0.1" />
      <path d="M4.5 11.2h15M8 14.4h.01M16 14.4h.01M7 17.5v2M17 17.5v2" />
    </Svg>
  );
}

export function TruckIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h9.5v10.5H3V7.5Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M14 9.5h4.2l2.8 3.2v3.8h-2M9.2 16.5h5.2" />
      <circle cx="7" cy="16.8" r="2.1" />
      <circle cx="16.8" cy="16.8" r="2.1" />
    </Svg>
  );
}

export function GaugeIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.2 16.5a8.5 8.5 0 1 1 15.6 0" fill="currentColor" fillOpacity="0.08" />
      <path d="m12 13.8 3.6-4.2" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* ── Pagamentos e carteira ────────────────────────────────────────────────── */

export function CashIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2.4" fill="currentColor" fillOpacity="0.1" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 9.5v5M17.5 9.5v5" />
    </Svg>
  );
}

export function CardIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.4" fill="currentColor" fillOpacity="0.1" />
      <path d="M3 10h18M7 14.5h3.5" />
    </Svg>
  );
}

export function WalletGlyphIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M18.6 7.4V6a1.5 1.5 0 0 0-1.5-1.5H5.6A2.4 2.4 0 0 0 3.2 6.9v10.2a2.4 2.4 0 0 0 2.4 2.4h13.2a2 2 0 0 0 2-2V9.4a2 2 0 0 0-2-2H5.6A2.2 2.2 0 0 1 3.4 6.7"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <rect x="15.2" y="11.6" width="5.6" height="3.6" rx="1.8" />
      <circle cx="17.2" cy="13.4" r="0.7" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function TopUpIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.8" fill="currentColor" fillOpacity="0.12" />
      <path d="M12 8.2v7.6M8.8 12.6 12 15.8l3.2-3.2" />
    </Svg>
  );
}

export function WithdrawIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.8" fill="currentColor" fillOpacity="0.12" />
      <path d="M12 15.8V8.2M8.8 11.4 12 8.2l3.2 3.2" />
    </Svg>
  );
}

export function ReceiptIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6 3.5h12v17l-2.2-1.4L13.5 20.5 12 19.1l-1.5 1.4-2.3-1.4L6 20.5v-17Z"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path d="M9.2 8.5h5.6M9.2 12h5.6M9.2 15.3h3.4" />
    </Svg>
  );
}

export function TrendUpIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m4 16.5 5.5-5.5 3.6 3.6L20 7.5" />
      <path d="M15.2 7.5H20v4.8" />
    </Svg>
  );
}

export function TrendDownIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="m4 7.5 5.5 5.5 3.6-3.6L20 16.5" />
      <path d="M15.2 16.5H20v-4.8" />
    </Svg>
  );
}

/* ── Segurança, conta, ecossistema e acções ───────────────────────────────── */

export function SosShieldIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3.2 5 6.2v5.4c0 4.6 3 8.1 7 9.4 4-1.3 7-4.8 7-9.4V6.2l-7-3Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M12 8.5v4.2" />
      <circle cx="12" cy="15.8" r="0.85" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ShieldCheckIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 3.2 5 6.2v5.4c0 4.6 3 8.1 7 9.4 4-1.3 7-4.8 7-9.4V6.2l-7-3Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="m9 12 2.1 2.1 4-4.2" />
    </Svg>
  );
}

export function PhoneIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6.4 4.5h3.1l1.2 3.5-1.8 1.5a11.5 11.5 0 0 0 5.6 5.6l1.5-1.8 3.5 1.2v3.1a1.9 1.9 0 0 1-2.1 1.9C9.8 18.8 5.2 14.2 4.5 6.6a1.9 1.9 0 0 1 1.9-2.1Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </Svg>
  );
}

export function HelpRingIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.8" fill="currentColor" fillOpacity="0.08" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m6.2 6.2 3.2 3.2M14.6 14.6l3.2 3.2M17.8 6.2l-3.2 3.2M9.4 14.6l-3.2 3.2" />
    </Svg>
  );
}

export function DataDocIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6.5 3.5h7.3L18.5 8.2v11.3a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19.5V5a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path d="M13.5 3.5v5h5M8.5 13h7M8.5 16.5h4.5" />
    </Svg>
  );
}

export function PackageIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7L12 3.5Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M12 12v8.5M19.5 7.7 12 12 4.5 7.7M15.8 5.6 8.3 9.9" />
    </Svg>
  );
}

export function ShareIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="17.5" cy="5.8" r="2.3" fill="currentColor" fillOpacity="0.16" />
      <circle cx="6.5" cy="12" r="2.3" fill="currentColor" fillOpacity="0.16" />
      <circle cx="17.5" cy="18.2" r="2.3" fill="currentColor" fillOpacity="0.16" />
      <path d="m8.6 10.9 6.8-3.9M8.6 13.1l6.8 3.9" />
    </Svg>
  );
}

export function DemoFlaskIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M9.2 3.8h5.6M10.4 3.8v4.8L5.4 17a2.2 2.2 0 0 0 1.9 3.3h9.4a2.2 2.2 0 0 0 1.9-3.3l-5-8.4V3.8" />
      <path d="M7.6 15.2h8.8" fill="currentColor" fillOpacity="0.16" />
    </Svg>
  );
}

export function LoginIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
      <path d="M4.5 12h10.2M10.8 8.2 14.7 12l-3.9 3.8" />
    </Svg>
  );
}

export function LogoutIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10" />
      <path d="M9.5 12h10M15.8 8.2 19.5 12l-3.7 3.8" />
    </Svg>
  );
}

export function MailIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <rect x="3.2" y="5.5" width="17.6" height="13" rx="2.2" fill="currentColor" fillOpacity="0.08" />
      <path d="m4.2 7.2 7.8 5.4 7.8-5.4" />
    </Svg>
  );
}

export function LockIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.4" fill="currentColor" fillOpacity="0.1" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </Svg>
  );
}

export function EyeIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 12s3.4-5.8 9.2-5.8 9.2 5.8 9.2 5.8-3.4 5.8-9.2 5.8S2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" fillOpacity="0.16" />
    </Svg>
  );
}

export function EyeOffIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 3.5 20.5 20.5" />
      <path d="M10.4 6.4A9.2 9.2 0 0 1 12 6.2c5.8 0 9.2 5.8 9.2 5.8a15.3 15.3 0 0 1-3.1 3.7M6.3 8.1A15.4 15.4 0 0 0 2.8 12s3.4 5.8 9.2 5.8c1.1 0 2.1-.2 3-.5" />
    </Svg>
  );
}

export function FlagIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 4.2v16.3" />
      <path
        d="M5.5 5h10.8a1.2 1.2 0 0 1 1 1.85l-1.55 2.4 1.55 2.4a1.2 1.2 0 0 1-1 1.85H5.5"
        fill="currentColor"
        fillOpacity="0.14"
      />
    </Svg>
  );
}

export function StarIcon({ filled, ...props }: ElaraIconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="m12 3.8 2.45 5 5.55.8-4 3.9.95 5.5L12 16.4 7.05 19 8 13.5l-4-3.9 5.55-.8L12 3.8Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  );
}

export function TrashIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 6.8h15M9.5 6.8V5a1.2 1.2 0 0 1 1.2-1.2h2.6A1.2 1.2 0 0 1 14.5 5v1.8" />
      <path d="M6.8 6.8 7.6 18.6a1.8 1.8 0 0 0 1.8 1.7h5.2a1.8 1.8 0 0 0 1.8-1.7l.8-11.8" />
      <path d="M10.2 11v5M13.8 11v5" />
    </Svg>
  );
}

export function KeyIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="8.5" cy="14.5" r="4" fill="currentColor" fillOpacity="0.14" />
      <path d="m11.4 11.6 7.4-7.4M16.2 6.8l2.3 2.3M14 9l1.8 1.8" />
    </Svg>
  );
}

export function BookmarkIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6.5 4.8a1.6 1.6 0 0 1 1.6-1.6h7.8a1.6 1.6 0 0 1 1.6 1.6v15.4L12 16.5l-5.5 3.7V4.8Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </Svg>
  );
}

export function UserPlusIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="9.6" cy="8.2" r="3.2" fill="currentColor" fillOpacity="0.12" />
      <path d="M3.8 19.2c0-3 2.6-5 5.8-5s5.8 2 5.8 5" />
      <path d="M18.5 8.5v5M16 11h5" />
    </Svg>
  );
}

export function SendIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="m20 4-7.4 16-2.4-6.2L4 11.4 20 4Z"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <path d="M20 4 10.2 13.8" />
    </Svg>
  );
}

export function MessageIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5.5 5h13A2 2 0 0 1 20.5 7v8.2a2 2 0 0 1-2 2H9.8L5.2 20.5v-3.3H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        fill="currentColor"
        fillOpacity="0.1"
      />
    </Svg>
  );
}

export function PowerIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.8v7.4" />
      <path d="M7.2 6.8a7.4 7.4 0 1 0 9.6 0" />
    </Svg>
  );
}

export function RadioIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </Svg>
  );
}

export function BellIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <path
        d="M6.2 15.8h11.6l-1.4-2.1v-3.5a4.4 4.4 0 0 0-8.8 0v3.5l-1.4 2.1Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M10 18.4a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

export function CalendarIcon(props: ElaraIconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.2" fill="currentColor" fillOpacity="0.08" />
      <path d="M8 3.5v3.5M16 3.5v3.5M4 10h16" />
    </Svg>
  );
}
