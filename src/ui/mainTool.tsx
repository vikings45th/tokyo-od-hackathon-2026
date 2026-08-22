import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Tool from './Tool';
import './styles.css';

document.body.classList.add('js');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tool />
  </StrictMode>,
);
