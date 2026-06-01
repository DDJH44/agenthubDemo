import Image from "next/image";

export type BrandMascotVariant =
  | "hero"
  | "wave"
  | "working"
  | "rocket"
  | "shield"
  | "complete"
  | "happy"
  | "thinking"
  | "search";

const MASCOT_ASSETS: Record<BrandMascotVariant, { src: string; width: number; height: number; alt: string }> = {
  hero: { src: "/brand/mascot-hero.png", width: 540, height: 505, alt: "AgentHub mascot" },
  wave: { src: "/brand/mascot-wave.png", width: 274, height: 155, alt: "AgentHub mascot waving" },
  working: { src: "/brand/mascot-working.png", width: 276, height: 155, alt: "AgentHub mascot working" },
  rocket: { src: "/brand/mascot-rocket.png", width: 287, height: 155, alt: "AgentHub mascot accelerating" },
  shield: { src: "/brand/mascot-shield.png", width: 285, height: 155, alt: "AgentHub mascot protecting" },
  complete: { src: "/brand/mascot-complete.png", width: 291, height: 155, alt: "AgentHub mascot celebrating" },
  happy: { src: "/brand/mascot-happy.png", width: 152, height: 146, alt: "AgentHub happy mascot" },
  thinking: { src: "/brand/mascot-thinking.png", width: 152, height: 145, alt: "AgentHub thinking mascot" },
  search: { src: "/brand/mascot-search.png", width: 152, height: 145, alt: "AgentHub search mascot" },
};

interface BrandMascotProps {
  variant?: BrandMascotVariant;
  size?: number;
  className?: string;
  priority?: boolean;
}

export function BrandMascot({
  variant = "happy",
  size = 96,
  className,
  priority,
}: BrandMascotProps) {
  const asset = MASCOT_ASSETS[variant];
  const height = Math.round((size * asset.height) / asset.width);

  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-lg ${className ?? ""}`}
      style={{ width: size, height }}
    >
      <Image
        src={asset.src}
        alt={asset.alt}
        fill
        priority={priority}
        sizes={`${size}px`}
        style={{ objectFit: "contain" }}
      />
    </span>
  );
}
