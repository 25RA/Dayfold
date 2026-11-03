import React from 'react';

interface DayfoldLogoProps {
  variant?: 'full' | 'icon' | 'compact' | 'monochrome';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTagline?: boolean;
  monochromeColor?: string; // Optional custom color in monochrome mode
}

export const DayfoldLogo: React.FC<DayfoldLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  showTagline = false,
  monochromeColor,
}) => {
  // Size dimensions
  const iconSizes = {
    xs: 18,
    sm: 24,
    md: 32,
    lg: 42,
    xl: 56,
  };

  const textSizes = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const px = iconSizes[size];
  const isMono = variant === 'monochrome';

  // Unique ID prefix to avoid SVG gradient collisions if multiple logos render
  const id = React.useId().replace(/:/g, '');

  // The Unfolding Mark:
  // An origami-folded continuous ribbon forming an architectural, modern 'D'.
  // Grounded left pillar, unfolding sunrise canopy (Ember to Coral), and deep Tide foundation tuck.
  const Emblem = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-300 hover:scale-105"
      role="img"
      aria-label="Dayfold Logo"
    >
      <defs>
        {/* 1. Left Pillar / Spine Gradient (Ember Core to Deep Warmth) */}
        <linearGradient id={`${id}-spine`} x1="22" y1="18" x2="42" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A50" />
          <stop offset="50%" stopColor="#F26A3D" />
          <stop offset="100%" stopColor="#D95325" />
        </linearGradient>

        {/* 2. Top Unfolding Canopy (Sunrise Coral to Ember) */}
        <linearGradient id={`${id}-canopy`} x1="38" y1="18" x2="84" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFA67F" />
          <stop offset="60%" stopColor="#F26A3D" />
          <stop offset="100%" stopColor="#C74E22" />
        </linearGradient>

        {/* 3. Outer Sweeping Loop (Ember to Deep Coral) */}
        <linearGradient id={`${id}-outer-loop`} x1="60" y1="36" x2="88" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFA67F" />
          <stop offset="40%" stopColor="#F26A3D" />
          <stop offset="100%" stopColor="#D95325" />
        </linearGradient>

        {/* 4. Tide Foundation Underfold (Calm Depth) */}
        <linearGradient id={`${id}-tide`} x1="36" y1="62" x2="72" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1B7F83" />
          <stop offset="100%" stopColor="#12575A" />
        </linearGradient>

        {/* Subtle Drop Shadow for tactile paper depth */}
        <filter id={`${id}-paper-shadow`} x="-15%" y="-15%" width="130%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#0B0D12" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Background Rounded Squircle Shield */}
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="22"
        fill="currentColor"
        className="text-[#15181F]/[0.04] dark:text-white/[0.06]"
      />

      <g filter={isMono ? undefined : `url(#${id}-paper-shadow)`}>
        {/* Facet A: Grounded Vertical Spine (The Present Hour Anchor) */}
        <path
          d="M24 24C24 20.686 26.686 18 30 18H40V82H30C26.686 82 24 79.314 24 76V24Z"
          fill={isMono ? (monochromeColor || 'currentColor') : `url(#${id}-spine)`}
        />

        {/* Facet B: Top Unfolding Facet (Sunrise Canopy) */}
        <path
          d="M38 18H58C73.464 18 86 30.536 86 46C86 52.8 83.5 59.1 79.3 64L60 48L40 32V18H38Z"
          fill={isMono ? (monochromeColor || 'currentColor') : `url(#${id}-canopy)`}
          opacity={isMono ? 0.9 : 1}
        />

        {/* Facet C: Lower Outer Ribbon Curve */}
        <path
          d="M79.3 64C74.6 69.5 67.2 73 59 73L40 56L60 48L79.3 64Z"
          fill={isMono ? (monochromeColor || 'currentColor') : `url(#${id}-outer-loop)`}
          opacity={isMono ? 0.8 : 1}
        />

        {/* Facet D: Tide Depth Underfold (The Foundation of the Day) */}
        <path
          d="M38 82H59C63.2 82 67.1 80.8 70.4 78.8L54 66H38V82Z"
          fill={isMono ? (monochromeColor || 'currentColor') : `url(#${id}-tide)`}
          opacity={isMono ? 0.7 : 1}
        />

        {/* Facet E: Origami Cut Line (Distinct Negative Gap in Monochrome & High Contrast) */}
        <path
          d="M40 34L58 48L38 64"
          stroke={isMono ? '#FBF9F5' : 'rgba(251, 249, 245, 0.4)'}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Facet F: 4-Point Clarity Spark (Focus & Intelligent Planning) */}
        <path
          d="M58 24L59.2 27.6L63 28.8L59.2 30L58 33.6L56.8 30L53 28.8L56.8 27.6L58 24Z"
          fill="#FFFFFF"
          opacity={isMono ? 0.95 : 0.9}
        />
      </g>
    </svg>
  );

  if (variant === 'icon') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{Emblem}</div>;
  }

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {Emblem}

      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-sans tracking-tight font-bold text-[#15181F] dark:text-[#ECEFF4] ${textSizes[size]}`}
            style={{ letterSpacing: '-0.035em' }}
          >
            Dayfold
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#F26A3D]" />
        </div>

        {showTagline && (
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#5A6070] dark:text-[#A0A8B6] mt-1 font-medium">
            The Unfolding Day
          </span>
        )}
      </div>
    </div>
  );
};
