import Svg, { Path } from 'react-native-svg';

// ShareIcon — flecha curva de compartir (mismo SVG que la web). Outline por
// defecto (fill=none) para combinar con los iconos finos de lucide.
type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
};

export function ShareIcon({ size = 25, color = '#fff', strokeWidth = 1.1, filled = false }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <Path d="M21.6 12 L12.8 4.4 V8.6 C7.4 8.9 3.7 11.9 2.4 19 C5 15.2 8.2 13.9 12.8 13.9 V18.1 Z" />
    </Svg>
  );
}

export default ShareIcon;
