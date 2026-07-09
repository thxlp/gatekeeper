'use client';
import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Node, Edge, Controls, MiniMap, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plugin } from '@/types';
import PluginNode from './PluginNode';

const nodeTypes = { plugin: PluginNode };

interface Props {
  plugins: Plugin[];
  hubLabel?: string;
}

const edgeColor = (status: Plugin['status']) =>
  status === 'active' ? '#73A98C'
  : status === 'blocked' || status === 'revoked' ? '#D66D52'
  : status === 'quarantine' ? '#E0B976'
  : '#9C948A';

function buildGraph(plugins: Plugin[], hubLabel: string) {
  const gatewayNode: Node = {
    id: 'gateway',
    type: 'default',
    position: { x: 300, y: 200 },
    data: { label: `🔐 ${hubLabel}` },
    style: {
      background: '#FCFBF8',
      border: '3px solid #4A90E2',
      borderRadius: '14px',
      color: '#33302B',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '14px',
      fontWeight: '700',
      padding: '14px 22px',
      boxShadow: '0 4px 20px rgba(74,144,226,.18)',
    },
  };

  const angleStep = plugins.length > 0 ? (2 * Math.PI) / plugins.length : 0;
  const radius = Math.max(220, plugins.length * 50);

  const pluginNodes: Node[] = plugins.map((p, i) => ({
    id: p.id,
    type: 'plugin',
    position: {
      x: 300 + radius * Math.cos(angleStep * i - Math.PI / 2) - 104,
      y: 200 + radius * Math.sin(angleStep * i - Math.PI / 2) - 60,
    },
    data: p,
  }));

  const edges: Edge[] = plugins.map((p) => ({
    id: `e-${p.id}`,
    source: 'gateway',
    target: p.id,
    animated: p.status === 'active',
    style: { stroke: edgeColor(p.status), strokeWidth: 2, strokeDasharray: p.status === 'active' ? undefined : '4 4' },
  }));

  return { nodes: [gatewayNode, ...pluginNodes], edges };
}

export default function PluginGraphCanvas({ plugins, hubLabel = 'Gatekeeper' }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(plugins, hubLabel);
    setNodes(n);
    setEdges(e);
  }, [plugins, hubLabel]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#DDD8CC" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.id === 'gateway') return '#4A90E2';
            const p = plugins.find((p) => p.id === n.id);
            return p ? edgeColor(p.status) : '#9C948A';
          }}
        />
      </ReactFlow>
    </div>
  );
}
