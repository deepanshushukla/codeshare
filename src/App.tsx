import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Placeholder({ label }: { label: string }) {
  return <div>{label}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder label="landing" />} />
        <Route path="/code/:sessionId" element={<Placeholder label="session" />} />
        <Route path="*" element={<Placeholder label="not-found" />} />
      </Routes>
    </BrowserRouter>
  );
}
