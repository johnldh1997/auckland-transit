import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform, Vibration } from 'react-native';
import { loadActiveJourney } from './activeJourney';
import { STORAGE_KEY as SETTINGS_STORAGE_KEY } from '../context/SettingsContext';
import { translate } from '../i18n/useTranslation';
import { getCurrentStepIndex } from './journeyTracking';
import { getVehiclesForRoutes } from './liveVehicleMatch';
import { getNextStopForTrip } from './realtime';
import { getStopsAlongLeg } from './routeStops';
import { Language, TransitStep } from '../types';

const LOCATION_TASK_NAME = 'auckland-transit-journey-location';
const NOTIFICATION_ID = 'auckland-transit-active-journey';
const CHANNEL_ID = 'journey-tracking';
const ALERT_CHANNEL_ID = 'journey-alerts';
const ALERTED_EVENTS_STORAGE_KEY = 'auckland-transit:journey-alerted-events';

// Set independently of notifications.ts's own handler (rather than relying on that file
// having already been imported by whichever screen the user happened to visit first) —
// this module needs to be usable standalone from a cold background launch.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function readLanguage(): Promise<Language> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return 'en';
    return (JSON.parse(raw).language as Language) ?? 'en';
  } catch {
    return 'en';
  }
}

// Which board/alight events have already fired a vibration+alert this journey, keyed by
// e.g. "alight-2" — persisted (not just an in-memory Set) since the background task below
// can run in a fresh, separate JS context each time and would otherwise have no memory of
// what it already alerted for, re-firing the same alert on every subsequent poll.
async function hasAlerted(key: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ALERTED_EVENTS_STORAGE_KEY);
  const alerted: string[] = raw ? JSON.parse(raw) : [];
  return alerted.includes(key);
}

async function markAlerted(key: string): Promise<void> {
  const raw = await AsyncStorage.getItem(ALERTED_EVENTS_STORAGE_KEY);
  const alerted: string[] = raw ? JSON.parse(raw) : [];
  if (!alerted.includes(key)) {
    alerted.push(key);
    await AsyncStorage.setItem(ALERTED_EVENTS_STORAGE_KEY, JSON.stringify(alerted));
  }
}

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // LOW (not HIGH/DEFAULT): this notification is re-posted with the same identifier on
  // every position update (every ~15-20s) to keep its content current — reported live that
  // a HIGH-importance channel re-alerts (heads-up popup) on every single one of those
  // updates, effectively spamming a fresh popup every time the step/wait text changes.
  // LOW still shows the icon in the status bar and stays visible (updating silently) in the
  // notification shade — you see the latest info by pulling it down, without the popups.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Active journey tracking',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
  });
  // Separate, higher-importance channel for the rare, one-shot "get on/off now" alerts —
  // unlike the channel above, these genuinely warrant interrupting the user.
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: 'Boarding/alighting alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
  });
}

interface NotificationContent {
  title: string;
  body: string;
}

// How close to a transit leg's own boarding/alighting moment before the app's own ongoing
// notification appears at all — reported live: the app was posting this continuously
// alongside the OS's own always-on foreground-service notification (the one guaranteed
// non-dismissable while the background location task is running), which was one
// permanently-visible notification too many. Now this one only shows up around the actual
// moments it's useful for ("time to get on/off the bus"), and is dismissed the rest of the
// time — the foreground-service notification alone covers "journey in progress" otherwise.
const PRE_EVENT_MINUTES = 3;
const POST_EVENT_MINUTES = 1;

function isNearTransitEvent(steps: TransitStep[], now: Date): boolean {
  const nowMs = now.getTime();
  for (const step of steps) {
    if (step.kind !== 'transit') continue;
    for (const timestamp of [step.departureTimestamp, step.arrivalTimestamp]) {
      if (!timestamp) continue;
      const eventMs = new Date(timestamp).getTime();
      if (nowMs >= eventMs - PRE_EVENT_MINUTES * 60_000 && nowMs <= eventMs + POST_EVENT_MINUTES * 60_000) {
        return true;
      }
    }
  }
  return false;
}

// Builds the ongoing notification's text from the same schedule-vs-GPS step matching the
// on-screen step list already uses (getCurrentStepIndex) — kept purely schedule/GPS-driven
// (no network call) so this works identically whether it's called from the foreground GPS
// watch or from the background task, and doesn't add extra AT API traffic on top of what's
// already polled elsewhere.
function buildContent(steps: TransitStep[], now: Date, position: { latitude: number; longitude: number } | undefined, language: Language): NotificationContent {
  const appName = translate(language, 'home.title');
  const index = getCurrentStepIndex(steps, now, position);
  const step = steps[index];
  if (!step) return { title: appName, body: translate(language, 'journey.notifTracking') };

  if (step.kind === 'walk') {
    return { title: translate(language, 'journey.notifWalking'), body: step.instruction };
  }

  const title = step.headsign ? `${step.lineName ?? '?'} → ${step.headsign}` : (step.lineName ?? appName);

  if (step.departureTimestamp) {
    const departureMs = new Date(step.departureTimestamp).getTime();
    if (now.getTime() < departureMs) {
      const minutes = Math.max(0, Math.round((departureMs - now.getTime()) / 60_000));
      return { title, body: translate(language, 'journey.notifBoardsIn', { line: step.lineName ?? '?', minutes }) };
    }
  }
  if (step.arrivalTimestamp) {
    const minutes = Math.max(0, Math.round((new Date(step.arrivalTimestamp).getTime() - now.getTime()) / 60_000));
    return { title, body: translate(language, 'journey.notifArrivesIn', { minutes }) };
  }
  return { title, body: translate(language, 'journey.notifTracking') };
}

// Fires once per event (guarded by markAlerted) — a standalone, un-identified notification
// (not reusing NOTIFICATION_ID) so it isn't silently overwritten by the next routine
// ongoing-status update, plus a device vibration since this is the one moment in the
// journey worth physically getting the user's attention for.
async function fireEventAlert(step: TransitStep, kind: 'board' | 'alight'): Promise<void> {
  Vibration.vibrate(kind === 'alight' ? [0, 400, 200, 400] : [0, 400]);
  const language = await readLanguage();
  const title = translate(language, kind === 'alight' ? 'journey.alertAlightTitle' : 'journey.alertBoardTitle');
  const body = translate(language, kind === 'alight' ? 'journey.alertAlightBody' : 'journey.alertBoardBody', {
    line: step.lineName ?? '?',
  });
  await Notifications.scheduleNotificationAsync({
    content: { title, body, priority: Notifications.AndroidNotificationPriority.HIGH, sound: 'default' },
    trigger: { channelId: ALERT_CHANNEL_ID },
  });
}

// "Next stop is where you get off" — fires once, schedule-driven off the same
// arrivalTimestamp the step list already shows, the moment we're both actually riding this
// leg (GPS/schedule-matched as the current step) and close to its scheduled arrival.
function findAlightingEvent(steps: TransitStep[], currentIndex: number, now: Date): number | null {
  const step = steps[currentIndex];
  if (!step || step.kind !== 'transit' || !step.arrivalTimestamp) return null;
  const minutesToArrival = (new Date(step.arrivalTimestamp).getTime() - now.getTime()) / 60_000;
  if (minutesToArrival <= PRE_EVENT_MINUTES && minutesToArrival >= -POST_EVENT_MINUTES) return currentIndex;
  return null;
}

// "The bus you have to get on arrived at the previous stop" — unlike the schedule-based
// alighting check above, this wants a genuinely live signal (buses run early/late enough
// that a static ETA isn't a reliable "it's basically here" cue), so it looks at real AT
// realtime data: is any live vehicle on this leg's route now reporting the *boarding stop
// itself* as its next stop (i.e. it just left the stop before it and is on its way in)?
// Only runs the extra lookups (leg's real stop sequence + live vehicle positions) inside
// the same near-departure window already used for the ongoing notification, so this
// doesn't add AT API traffic for the rest of the journey.
async function findBoardingArrival(steps: TransitStep[], now: Date): Promise<number | null> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.kind !== 'transit' || !step.lineName || !step.departureTimestamp) continue;
    const minutesToDeparture = (new Date(step.departureTimestamp).getTime() - now.getTime()) / 60_000;
    if (minutesToDeparture < 0 || minutesToDeparture > PRE_EVENT_MINUTES) continue;

    const legStops = await getStopsAlongLeg(step);
    const boardingStop = legStops[0];
    if (!boardingStop) continue;

    const vehicles = await getVehiclesForRoutes([step.lineName]);
    for (const vehicle of vehicles) {
      if (!vehicle.tripId) continue;
      const nextStop = await getNextStopForTrip(vehicle.tripId);
      if (nextStop && nextStop.stopId === boardingStop.id) return i;
    }
  }
  return null;
}

// Re-posting with the same identifier replaces the existing notification in place instead
// of stacking a new one — called both from the screen's own foreground GPS watch (so it
// updates immediately while the app is open) and from the background task below (so it
// keeps updating with the screen off/app backgrounded, when background location permission
// was granted). Outside the boarding/alighting window this dismisses instead of posting, so
// it isn't sitting there permanently alongside the OS's own foreground-service notification.
export async function updateJourneyNotification(
  steps: TransitStep[],
  position?: { latitude: number; longitude: number }
): Promise<void> {
  const now = new Date();
  const currentIndex = getCurrentStepIndex(steps, now, position);

  const alightIndex = findAlightingEvent(steps, currentIndex, now);
  if (alightIndex !== null) {
    const key = `alight-${alightIndex}`;
    if (!(await hasAlerted(key))) {
      await markAlerted(key);
      await fireEventAlert(steps[alightIndex], 'alight');
    }
  }

  const boardIndex = await findBoardingArrival(steps, now);
  if (boardIndex !== null) {
    const key = `board-${boardIndex}`;
    if (!(await hasAlerted(key))) {
      await markAlerted(key);
      await fireEventAlert(steps[boardIndex], 'board');
    }
  }

  if (!isNearTransitEvent(steps, now)) {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
    return;
  }
  const language = await readLanguage();
  const { title, body } = buildContent(steps, now, position, language);
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title, body, priority: Notifications.AndroidNotificationPriority.LOW },
    // A ChannelAwareTriggerInput ({ channelId }, no type/date) delivers immediately like
    // `trigger: null` does, but also routes the notification to CHANNEL_ID on Android.
    trigger: { channelId: CHANNEL_ID },
  });
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;
  const active = await loadActiveJourney();
  if (!active) return;
  await updateJourneyNotification(active.route.steps, { latitude: latest.coords.latitude, longitude: latest.coords.longitude });
});

// Posts the initial notification and — best-effort — starts background location delivery
// so the notification keeps updating with the screen off. Background delivery requires
// "Allow all the time" location access; if that's denied, the notification still gets
// posted and still updates whenever the screen's own foreground GPS watch calls
// updateJourneyNotification directly, it just won't refresh while backgrounded. The caller
// is responsible for persisting the route via activeJourney.ts's saveActiveJourney before
// calling this (or already having done so, when resuming after an app restart).
export async function startJourneyTracking(steps: TransitStep[]): Promise<void> {
  await ensureChannels();

  const { status: notifStatus } = await Notifications.requestPermissionsAsync();
  if (notifStatus === 'granted') {
    await updateJourneyNotification(steps);
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return;
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') return;

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) return;

  const language = await readLanguage();
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 20_000,
    distanceInterval: 25,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: translate(language, 'home.title'),
      notificationBody: translate(language, 'journey.notifTracking'),
      notificationColor: '#0B4F6C',
    },
  });
}

// Caller is responsible for clearing the persisted route via activeJourney.ts's
// clearActiveJourney — kept separate so JourneyPlannerScreen owns exactly when a journey
// starts/ends rather than this module silently doing it as a side effect.
export async function stopJourneyTracking(): Promise<void> {
  await AsyncStorage.removeItem(ALERTED_EVENTS_STORAGE_KEY);
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
}
