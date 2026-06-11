import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent llama a AppRegistry.registerComponent('main', () => App)
// y configura el entorno tanto en Expo Go como en una build nativa.
registerRootComponent(App);
