'use client';
import { useCallback, useEffect, useState } from 'react';
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
  onSelectPlugin: (p: Plugin) => void;
}

function buildGraph(plugins: Plugin[], onSelect: (p: Plugin) => void) {
  // Gateway node ตรงกลาง
  const gatewayNode: Node = {
    id: 'gateway',
    type: 'default',
    position: { x: 300, y: 200 },
    data: { label: '🔐 Gatekeeper' },
    style: {
      background: '#161b22',
      border: '2px solid #58a6ff',
      borderRadius: '12px',
      color: '#e6edf3',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '13px',
      fontWeight: '600',
      padding: '12px 20px',
      boxShadow: '0 0 20px rgba(88,166,255,0.15)',
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
    data: { ...p, onSelect },
  }));

  const edges: Edge[] = plugins.map(p => ({
    id: `e-${p.id}`,
    source: 'gateway',
    target: p.id,
    animated: p.status === 'active',
    style: {
      stroke: p.status === 'active' ? '#3fb950'
            : p.status === 'blocked' || p.status === 'revoked' ? '#f85149'
            : p.status === 'quarantine' ? '#d29922'
            : '#30363d',
      strokeWidth: 2,
      strokeDasharray: p.status === 'active' ? undefined : '4 4',
    },
    label: p.status === 'blocked' ? '✕' : p.status === 'active' ? '✓' : undefined,
    labelStyle: { fill: '#8b949e', fontSize: 10 },
  }));

  return { nodes: [gatewayNode, ...pluginNodes], edges };
}

export default function PluginGraphCanvas({ plugins, onSelectPlugin }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(plugins, onSelectPlugin);
    setNodes(n);
    setEdges(e);
  }, [plugins, onSelectPlugin]);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="w-full h-full">
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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#21262d" />
        <Controls />
        <MiniMap
          nodeColor={n => {
            if (n.id === 'gateway') return '#58a6ff';
            const p = plugins.find(p => p.id === n.id);
            if (!p) return '#30363d';
            return p.status === 'active' ? '#3fb950'
                 : p.status === 'blocked' || p.status === 'revoked' ? '#f85149'
                 : p.status === 'quarantine' ? '#d29922'
                 : '#30363d';
          }}
        />
      </ReactFlow>
    </div>
  );
}
