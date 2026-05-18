import { useDomains } from '../hooks/useDomains';
import { domainBadgeColors } from '../lib/domain-color';

interface Props {
  domain: string;
}

export function DomainBadge({ domain }: Props) {
  const { data: domains } = useDomains();
  const entity = domains?.find((d) => d.id === domain);
  const { fg, bg } = domainBadgeColors(entity?.color ?? null, domain);
  const label = entity?.label ?? domain;
  return (
    <span className="domain-badge" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}
