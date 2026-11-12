import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="container">
      <h1>Page unavailable</h1>
      <p>This address is not available in the current build.</p>
      <Link href="/">Return to the application</Link>
    </main>
  );
}
