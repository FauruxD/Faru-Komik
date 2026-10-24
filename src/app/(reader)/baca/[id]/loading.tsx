export default function LoadingReader() {
  return (
    <main id="main" className="reader-loading" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <p role="status">Menyiapkan chapter untukmu...</p>
      <div className="skeleton reader-loading-sheet" />
    </main>
  );
}
