import { Navigate, Route, Routes } from 'react-router-dom';
import Roster from './pages/Roster';
import Intake from './pages/Intake';
import PlanDocument from './pages/PlanDocument';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Roster />} />
      <Route path="/patient/:id/edit" element={<Intake />} />
      <Route path="/patient/:id/plan" element={<PlanDocument />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
