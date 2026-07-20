import { registerRootComponent } from 'expo';

import App from './App';
// Registers the background location task (TaskManager.defineTask) at module scope — must
// happen here, unconditionally, rather than only when JourneyPlannerScreen mounts: the OS
// can relaunch the JS engine headlessly to deliver a background location update, and if the
// task isn't already defined by then, that update is silently dropped.
import './src/services/journeyNotification';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
