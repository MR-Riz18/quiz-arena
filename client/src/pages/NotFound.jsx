import { Link } from 'react-router-dom';
import { Ghost } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-800">
        <Ghost className="h-8 w-8 text-slate-500" />
      </div>
      <h1 className="page-title mb-2">404 — Lost in the arena</h1>
      <p className="muted mb-6">This page doesn't exist. Let's get you back to the action.</p>
      <Link to="/" className="btn-primary">Back home</Link>
    </div>
  );
}
