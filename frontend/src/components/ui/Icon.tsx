import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface IconProps {
  icon: IconDefinition;
  className?: string;
  "aria-hidden"?: boolean;
}

export const Icon: React.FC<IconProps> = ({ icon, className = "text-base", "aria-hidden": ariaHidden = true }) => (
  <FontAwesomeIcon icon={icon} className={className} aria-hidden={ariaHidden} />
);

export default Icon;