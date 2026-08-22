import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Lp from './Lp';
import './styles.css';

document.body.classList.add('js');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lp />
  </StrictMode>,
);
