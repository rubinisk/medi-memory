import { Link } from "react-router-dom";
import { Logo } from "../components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-2xl font-bold text-navy">Page not found</h1>
      <p className="text-sm text-muted">The page you’re looking for doesn’t exist.</p>
      <Link to="/" className="btn-primary">Go home</Link>
    </div>
  );
}
