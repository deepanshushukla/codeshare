import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import Landing from './routes/Landing';
import JavaScriptCompiler from './routes/JavaScriptCompiler';
import ReactPlayground from './routes/ReactPlayground';
import NotFound from './routes/NotFound';
import SessionRoute from './routes/SessionRoute';
import { ThemeProvider } from './features/theme/ThemeProvider';
import ScanlineOverlay from './features/theme/ScanlineOverlay';
import { RoomTransitionProvider } from './features/transition/RoomTransitionProvider';
import RoomTransitionOverlay from './features/transition/RoomTransitionOverlay';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ScanlineOverlay />
        <RoomTransitionProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/javascript-compiler" element={<JavaScriptCompiler />} />
            <Route path="/react-playground" element={<ReactPlayground />} />
            <Route path="/code/:sessionId" element={<SessionRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <RoomTransitionOverlay />
        </RoomTransitionProvider>
      </ThemeProvider>
      <Analytics />
    </BrowserRouter>
  );
}
