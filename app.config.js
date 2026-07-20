module.exports = {
  expo: {
    name: 'auckland-transit',
    slug: 'auckland-transit',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    plugins: [
      'expo-notifications',
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_KEY,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Allow Auckland Transit to use your location to plan journeys from where you are.',
          locationAlwaysAndWhenInUsePermission:
            'Allow Auckland Transit to keep tracking your journey in the background so your live journey notification stays up to date.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-task-manager',
      'expo-sqlite',
      'expo-asset',
    ],
	extra: {
      eas: {
        projectId: "bbdb7242-c1b0-40d6-88cf-e8b32a699130"
      }
    },
    updates: {
      url: 'https://u.expo.dev/bbdb7242-c1b0-40d6-88cf-e8b32a699130',
    },
    runtimeVersion: {
      policy: 'fingerprint',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.aucklandtransit.app',
      infoPlist: {
        UIBackgroundModes: ['location'],
      },
    },
    android: {
      package: 'com.aucklandtransit.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
  },
};
