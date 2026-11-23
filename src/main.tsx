import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerCoffeeNaduServiceWorker} from './pwa/registerSW.ts';

registerCoffeeNaduServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);
