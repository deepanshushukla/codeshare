import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import NotFound from './routes/NotFound';
import SessionRoute from './routes/SessionRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/code/:sessionId" element={<SessionRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
