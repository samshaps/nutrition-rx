import { useParams } from 'react-router-dom';
import AppBar from '../components/AppBar';

/** Placeholder — WS-C replaces this with the full intake form. */
export default function Intake() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <AppBar />
      <main className="nrx-page">
        <h1>Patient intake</h1>
        <p className="nrx-page-note">Patient {id}</p>
      </main>
    </>
  );
}
