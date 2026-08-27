import { redirect } from 'next/navigation';

// Middleware already redirects '/' based on session state before this ever
// renders — this is just a defensive fallback so the route is well-formed.
export default function RootPage() {
  redirect('/login');
}
