interface Props {
  domain: string;
}

export function DomainBadge({ domain }: Props) {
  return <span className="domain-badge" data-domain={domain}>{domain}</span>;
}
