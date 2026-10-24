import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import * as SolidIcons from '@fortawesome/free-solid-svg-icons';

export interface IconProps {
  icon: IconDefinition;
  className?: string;
  size?: 'xs' | 'sm' | 'lg' | '1x' | '2x' | '3x';
  spin?: boolean;
}

export const Icon: React.FC<IconProps> = ({ icon, className = '', size, spin = false }) => {
  return <FontAwesomeIcon icon={icon} className={className} size={size} spin={spin} />;
};

// Common icon exports for clean imports across the project
export {
  SolidIcons
};
