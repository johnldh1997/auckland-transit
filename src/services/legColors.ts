import { ThemeColors } from '../theme';
import { TransitStep } from '../types';

// Each transit leg gets its own color from this palette (cycling if there are more legs
// than colors), rather than just one color per mode — so e.g. a transfer from one bus
// route to another bus route is still visually obvious as two distinct legs on the map.
function getLegColorPalette(colors: ThemeColors): string[] {
  return [
    colors.busLine,
    colors.trainLine,
    colors.ferryLine,
    '#8E44AD',
    '#F39C12',
    '#16A085',
    '#C0392B',
    '#2E86DE',
  ];
}

// Shared by the map (polyline color) and the step list (badge color) so a given leg
// looks the same color in both places. Walk steps aren't "legs" — always neutral.
export function getLegColor(steps: TransitStep[], index: number, colors: ThemeColors): string {
  if (steps[index]?.kind === 'walk') return colors.textMuted;

  let transitLegIndex = -1;
  for (let i = 0; i <= index; i++) {
    if (steps[i].kind === 'transit') transitLegIndex++;
  }
  const palette = getLegColorPalette(colors);
  return palette[transitLegIndex % palette.length];
}
