import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SwitchModeProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** Controlled dark-mode state (`true` = dark, `false` = light). */
  checked?: boolean;
  /** Initial state when uncontrolled. */
  defaultChecked?: boolean;
  /** Called with the next dark-mode boolean when toggled. */
  onCheckedChange?: (isDark: boolean) => void;
  /** Track width in px. */
  width?: number;
  /** Track height in px. */
  height?: number;
  /** Track background color in dark mode. */
  darkColor?: string;
  /** Track background color in light mode. */
  lightColor?: string;
  /** Knob background color in dark mode. */
  knobDarkColor?: string;
  /** Knob background color in light mode. */
  knobLightColor?: string;
  /** Track border color in dark mode. */
  borderDarkColor?: string;
  /** Track border color in light mode. */
  borderLightColor?: string;
}

/**
 * Pill-shaped light/dark mode switch with an animated sliding knob
 * and proportional sun/moon iconography.
 */
export function SwitchMode({
  checked,
  defaultChecked = false,
  onCheckedChange,
  width = 180,
  height = 90,
  darkColor = "#111",
  lightColor = "#F9F9F9",
  knobDarkColor = "#1C1C1C",
  knobLightColor = "#F3F3F7",
  borderDarkColor = "#444",
  borderLightColor = "#DDD",
  className,
  onClick,
  ...props
}: SwitchModeProps) {
  const [internalDark, setInternalDark] = React.useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isDark = isControlled ? checked : internalDark;

  const padding = Math.max(3, Math.round(height * 0.08));
  const knobSize = Math.max(12, height - padding * 2);
  const travelDistance = Math.max(0, width - knobSize - padding * 2);
  const iconSize = Math.max(12, Math.round(knobSize * 0.48));
  const trackIconSize = Math.max(10, Math.round(knobSize * 0.36));

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next = !isDark;
    if (!isControlled) {
      setInternalDark(next);
    }
    onCheckedChange?.(next);
    onClick?.(event);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={props["aria-label"] ?? `Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={handleClick}
      style={{
        width,
        height,
        padding,
        backgroundColor: isDark ? darkColor : lightColor,
        borderColor: isDark ? borderDarkColor : borderLightColor,
      }}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none",
        className,
      )}
      {...props}
    >
      {/* Ambient track icons (opposite side of active knob) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-between"
        style={{ paddingInline: padding + Math.round(knobSize * 0.24) }}
      >
        <Sun
          style={{ width: trackIconSize, height: trackIconSize }}
          className={cn(
            "transition-all duration-300",
            isDark ? "scale-90 text-amber-300/45 opacity-100" : "scale-75 opacity-0",
          )}
        />
        <Moon
          style={{ width: trackIconSize, height: trackIconSize }}
          className={cn(
            "transition-all duration-300",
            isDark ? "scale-75 opacity-0" : "scale-90 text-slate-400/70 opacity-100",
          )}
        />
      </span>

      {/* Sliding knob */}
      <span
        aria-hidden="true"
        style={{
          width: knobSize,
          height: knobSize,
          backgroundColor: isDark ? knobDarkColor : knobLightColor,
          transform: `translateX(${isDark ? travelDistance : 0}px)`,
          boxShadow: isDark
            ? "0 2px 8px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08)"
            : "0 2px 8px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        }}
        className="relative z-10 flex items-center justify-center rounded-full transition-[transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      >
        <Sun
          style={{ width: iconSize, height: iconSize }}
          className={cn(
            "absolute text-amber-500 transition-all duration-300",
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
        />
        <Moon
          style={{ width: iconSize, height: iconSize }}
          className={cn(
            "absolute text-indigo-300 transition-all duration-300",
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
          )}
        />
      </span>
    </button>
  );
}
