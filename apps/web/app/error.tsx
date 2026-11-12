'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="container">
      <h1>This page could not load</h1>
      <p>Try loading the page again. Your saved records have not been changed.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
