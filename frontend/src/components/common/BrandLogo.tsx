import React from "react";

/**
 * The single institutional logo used across the whole system.
 *
 * Source of truth: `images/techspirecollege.png`, copied into
 * `frontend/public/brand/` so Vite serves it as a static asset.
 */
export const BRAND_LOGO_SRC = "/brand/techspirecollege.png";

export const BRAND_NAME = "TechspireCollege";

export interface BrandLogoProps {
  /** Rendered width/height in pixels. The artwork is square. */
  size?: number;
  /** Extra classes merged onto the `<img>`. */
  className?: string;
  /** Alternative text. Pass an empty string for decorative placements. */
  alt?: string;
  /** Draw a subtle ring around the artwork for light backgrounds. */
  bordered?: boolean;
}

/**
 * Renders the TechspireCollege logo. Every brand surface (navbar, login
 * screen, campus signage, favicons) goes through this component so the
 * artwork stays consistent across the system.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 40,
  className = "",
  alt = BRAND_NAME,
  bordered = false,
}) => (
  <img
    src={BRAND_LOGO_SRC}
    alt={alt}
    width={size}
    height={size}
    draggable={false}
    className={`shrink-0 select-none object-contain ${
      bordered ? "ring-1 ring-slate-200" : ""
    } ${className}`}
    style={{ width: size, height: size }}
  />
);

export default BrandLogo;
