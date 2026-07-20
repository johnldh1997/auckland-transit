import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Departure } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationSetup(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('departure-reminders', {
      name: 'Departure reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  return true;
}

export async function scheduleDepartureReminder(
  stopName: string,
  departure: Departure,
  minutesBefore: number
): Promise<string | null> {
  const departureTime = new Date(departure.estimatedTime).getTime();
  const fireAt = new Date(departureTime - minutesBefore * 60_000);
  if (fireAt.getTime() <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${departure.routeShortName} to ${departure.headsign}`,
      body: `Leaves ${stopName} in ${minutesBefore} min`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

export async function cancelReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
