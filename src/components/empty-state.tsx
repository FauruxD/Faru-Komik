import { LinkButton } from "@cloudflare/kumo/components/button";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  title,
  description,
  href = "/jelajahi",
  action = "Jelajahi komik",
  icon = "book",
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
  icon?: IconName;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} width="30" height="30" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <LinkButton href={href} variant="primary" size="lg">
        {action}
        <Icon name="arrow" />
      </LinkButton>
    </div>
  );
}
