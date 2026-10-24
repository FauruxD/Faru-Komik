export default function Loading() {
  return (
    <div
      className="container loading-page"
      aria-busy="true"
      aria-label="Memuat perpustakaan"
    >
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-copy" />
      <div className="comic-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <div className="skeleton skeleton-cover" />
            <div className="skeleton skeleton-copy" />
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Memuat cerita untukmu...
      </span>
    </div>
  );
}
