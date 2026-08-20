import { useParams } from 'react-router-dom';
import AppBar from '../components/AppBar';

/** Placeholder — WS-D replaces this with the printable plan document. */
export default function PlanDocument() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <AppBar />
      <main className="nrx-page">
        <h1>Plan document</h1>
        <p className="nrx-page-note">Patient {id}</p>
      </main>
    </>
  );
}
