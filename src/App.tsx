import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import NotFound from './routes/NotFound';

function SessionPlaceholder() {
  return <div>session</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/code/:sessionId" element={<SessionPlaceholder />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
