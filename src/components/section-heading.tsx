import Link from "next/link";
import { Icon } from "./icon";

export function SectionHeading({
  title,
  description,
  href,
  linkLabel = "Lihat semua",
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link href={href} className="text-link">
          {linkLabel}
          <Icon name="arrow" width="18" height="18" />
        </Link>
      )}
    </div>
  );
}
