import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {FeedbackProvider} from './context/FeedbackContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <FeedbackProvider>
    <App />
  </FeedbackProvider>
);
