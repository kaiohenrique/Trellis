import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useNavigate } from 'react-router-dom';
import type { Edge, Node } from '@kb/shared';
import { useWorkspaceId } from '../context/WorkspaceContext';
import { useDomains } from '../hooks/useDomains';
import { hashedColor } from '../lib/domain-color';

interface Props {
  nodes: Pick<Node, 'id' | 'title' | 'domain'>[];
  edges: Pick<Edge, 'from' | 'to' | 'relation' | 'weight'>[];
  highlight?: Set<string>;
  height?: number;
  mini?: boolean;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  domain: string;
  degree: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  relation: string;
  weight: number;
}

export function GraphCanvas({ nodes, edges, highlight, height = 600, mini = false }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const navigate = useNavigate();
  const ws = useWorkspaceId();
  const { data: domains } = useDomains();
  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of domains ?? []) if (d.color) map.set(d.id, d.color);
    return (domain: string) => map.get(domain) ?? hashedColor(domain);
  }, [domains]);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select<SVGSVGElement, unknown>(ref.current);
    svg.selectAll('*').remove();
    if (nodes.length === 0) return;

    const width = ref.current.clientWidth || 800;
    const h = height;

    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }

    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      domain: n.domain,
      degree: degree.get(n.id) ?? 0,
    }));
    const simEdges: SimEdge[] = edges
      .filter((e) => simNodes.some((n) => n.id === e.from) && simNodes.some((n) => n.id === e.to))
      .map((e) => ({ source: e.from, target: e.to, relation: e.relation, weight: e.weight }));

    const g = svg
      .attr('width', width)
      .attr('height', h)
      .attr('viewBox', `0 0 ${width} ${h}`)
      .append('g');

    if (!mini) {
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => g.attr('transform', event.transform.toString()));
      svg.call(zoom);
    }

    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 14)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8');

    const link = g
      .append('g')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-opacity', 0.6)
      .selectAll<SVGLineElement, SimEdge>('line')
      .data(simEdges)
      .join('line')
      .attr('stroke-width', (d) => 0.8 + d.weight * 1.5)
      .attr('marker-end', 'url(#arrow)');

    const linkLabel = g
      .append('g')
      .attr('fill', '#64748b')
      .attr('font-size', mini ? 8 : 10)
      .style('opacity', 0)
      .selectAll<SVGTextElement, SimEdge>('text')
      .data(simEdges)
      .join('text')
      .text((d) => d.relation);

    const node = g
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_e, d) => navigate(`/workspaces/${ws}/wiki/${d.id}`))
      .on('mouseover', (_e, d) => {
        linkLabel.filter((l) => (l.source as SimNode).id === d.id || (l.target as SimNode).id === d.id).style('opacity', 1);
      })
      .on('mouseout', () => linkLabel.style('opacity', 0));

    node
      .append('circle')
      .attr('r', (d) => 4 + Math.sqrt(d.degree) * 3)
      .attr('fill', (d) => colorFor(d.domain))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('opacity', (d) => (highlight && !highlight.has(d.id) ? 0.2 : 1));

    if (!mini) {
      node
        .append('text')
        .text((d) => d.title)
        .attr('x', 10)
        .attr('y', 4)
        .attr('font-size', 11)
        .attr('fill', '#0f172a')
        .style('pointer-events', 'none')
        .style('opacity', (d) => (highlight && !highlight.has(d.id) ? 0.2 : 1));
    }

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3.forceLink<SimNode, SimEdge>(simEdges).id((d) => d.id).distance(mini ? 60 : 100),
      )
      .force('charge', d3.forceManyBody().strength(mini ? -100 : -250))
      .force('center', d3.forceCenter(width / 2, h / 2))
      .force('collide', d3.forceCollide().radius(20));

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);
      linkLabel
        .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2);
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(drag);

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, highlight, height, mini, navigate]);

  return <svg ref={ref} className={mini ? 'graph-canvas-mini' : 'graph-canvas'} />;
}
