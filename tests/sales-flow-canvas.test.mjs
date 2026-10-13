import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNodeChanges } from '@xyflow/react'
import { adoptUserNodes } from '@xyflow/system'
import { exampleGraph } from '../lib/sales-flow.ts'
import { reconcileSalesCanvasNodes } from '../lib/sales-flow-canvas.ts'

test('measured nodes remain initialized through repeated drags and script edits', () => {
  let graph = exampleGraph()
  let nodes = reconcileSalesCanvasNodes(graph, graph.entry_id, [])
  nodes = applyNodeChanges(nodes.map(node => ({
    id: node.id, type: 'dimensions', dimensions: { width: 290, height: 240 },
  })), nodes)
  const lookup = new Map()
  const parents = new Map()
  assert.equal(adoptUserNodes(nodes, lookup, parents).nodesInitialized, true)

  for (let step = 1; step <= 20; step++) {
    const position = { x: 30 * step, y: 15 * step }
    nodes = applyNodeChanges([{ id: graph.entry_id, type: 'position', position, dragging: step < 20 }], nodes)
    graph = { ...graph, nodes: graph.nodes.map(n => n.id === graph.entry_id ? { ...n, position } : n) }
    nodes = reconcileSalesCanvasNodes(graph, graph.entry_id, nodes)
    assert.equal(adoptUserNodes(nodes, lookup, parents).nodesInitialized, true)
    assert.deepEqual(nodes[0].measured, { width: 290, height: 240 })
    assert.equal(nodes[0].dragging, step < 20)
    assert.deepEqual(lookup.get(graph.entry_id).internals.positionAbsolute, position)
  }

  graph = { ...graph, nodes: graph.nodes.map(n => ({ ...n, text: n.text + '?' })) }
  nodes = reconcileSalesCanvasNodes(graph, graph.nodes[1].id, nodes)
  assert.equal(adoptUserNodes(nodes, lookup, parents).nodesInitialized, true)
  assert.equal(nodes[1].selected, true)
  assert.equal(nodes[0].selected, false)
  assert.equal(nodes[0].data.question.text, graph.nodes[0].text)
  assert.equal(JSON.stringify(graph).includes('measured'), false)
})

test('undo restores positions while retaining measurements; deleted nodes leave the canvas', () => {
  const original = exampleGraph()
  let nodes = reconcileSalesCanvasNodes(original, original.entry_id, [])
  nodes = applyNodeChanges([{ id: original.entry_id, type: 'dimensions', dimensions: { width: 290, height: 280 } },
    { id: original.entry_id, type: 'position', position: { x: 500, y: 500 }, dragging: false }], nodes)
  nodes = reconcileSalesCanvasNodes(original, original.entry_id, nodes)
  assert.deepEqual(nodes[0].position, original.nodes[0].position)
  assert.deepEqual(nodes[0].measured, { width: 290, height: 280 })
  const reduced = { ...original, nodes: original.nodes.slice(0, -1) }
  assert.equal(reconcileSalesCanvasNodes(reduced, reduced.entry_id, nodes).length, reduced.nodes.length)
})
