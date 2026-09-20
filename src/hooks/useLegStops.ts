import { useEffect, useState } from 'react';
import { getStopsAlongLeg } from '../services/routeStops';
import { Stop, TransitStep } from '../types';

// --- Journey Stop List ---
// Every stop each transit leg of a route passes through, keyed by the leg's index in `steps`.
// A leg whose stops can't be resolved (not in the bundled timetable) is simply absent from the
// map. Shared by the route map (stop markers) and the step list (per-leg stop list) so they
// always agree, and — via getStopsAlongLeg's own cache — only resolve each leg once.
export function useLegStops(steps: TransitStep[] | undefined): Map<number, Stop[]> {
  const [legStops, setLegStops] = useState<Map<number, Stop[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setLegStops(new Map());
    steps?.forEach((step, index) => {
      if (step.kind !== 'transit') return;
      getStopsAlongLeg(step)
        .then((stops) => {
          if (!cancelled && stops.length > 0) {
            setLegStops((prev) => new Map(prev).set(index, stops));
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [steps]);

  return legStops;
}
