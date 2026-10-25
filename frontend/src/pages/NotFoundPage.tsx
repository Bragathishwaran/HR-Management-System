import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="not-found">
      <span className="not-found-icon">
        <Compass size={28} />
      </span>
      <span className="eyebrow">404 · Off the map</span>
      <h1>This page isn’t in the workspace.</h1>
      <p>The link may be outdated, or the page may have moved somewhere else.</p>
      <Link to="/" className="btn btn-primary btn-md">
        <ArrowLeft size={16} /> Back to dashboard
      </Link>
    </div>
  );
}
