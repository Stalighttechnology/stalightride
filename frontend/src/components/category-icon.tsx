import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { name: "car" | "ev" | "motorcycle" | "scooter" | "bike" };

/** Distinct, hand-tuned line icons per vehicle category (no duplicates). */
export function CategoryIcon({ name, ...rest }: Props) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 48 48",
    ...rest,
  };
  switch (name) {
    case "car":
      return (
        <svg {...common}>
          <path d="M8 30v-4l3-8a4 4 0 0 1 3.8-2.7h18.4A4 4 0 0 1 37 18l3 8v4" />
          <path d="M6 30h36v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2H14v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          <circle cx="14" cy="30" r="2.5" />
          <circle cx="34" cy="30" r="2.5" />
          <path d="M11 22h26" />
        </svg>
      );
    case "ev":
      return (
        <svg {...common}>
          <path d="M8 30v-4l3-8a4 4 0 0 1 3.8-2.7h18.4A4 4 0 0 1 37 18l3 8v4" />
          <path d="M6 30h36v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2H14v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          <circle cx="14" cy="30" r="2.5" />
          <circle cx="34" cy="30" r="2.5" />
          <path d="M25 17l-4 6h4l-2 5 6-7h-4l3-4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "motorcycle":
    case "bike":
      return (
        <svg {...common}>
          <circle cx="11" cy="33" r="6" />
          <circle cx="37" cy="33" r="6" />
          <path d="M14 33l7-11h6l3 5h7" />
          <path d="M21 22l-3-5h-4" />
          <path d="M30 27l-5-5" />
          <path d="M34 15h5" />
        </svg>
      );
    case "scooter":
      return (
        <svg {...common}>
          <circle cx="10" cy="35" r="5" />
          <circle cx="38" cy="35" r="5" />
          <path d="M15 35h5l5-14h6" />
          <path d="M31 21l4 12" />
          <path d="M26 21h8" />
          <path d="M31 21V13h5" />
        </svg>
      );
  }
}
