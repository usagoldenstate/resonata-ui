import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeGraph, estimatedNodeSize, exampleGraph } from '../lib/sales-flow.ts'

const q = (id, routes) => ({ id, text: id, variable: id, field: 'custom', position: { x: 0, y: 0 },
  routes: routes.map((target, i) => ({ id: `r${i}`, condition: i === routes.length - 1 ? null : `when ${i}`, target, answer_from: null })) })

// React Flow's default bezier for a bottom handle to a top handle, sampled.
function curve(flow, node, routeIndex) {
  const target = flow.nodes.find(n => n.id === node.routes[routeIndex].target)
  const a = estimatedNodeSize(node, node.id === flow.entry_id), b = estimatedNodeSize(target, target.id === flow.entry_id)
  const sx = node.position.x + a.width * (routeIndex + 0.5) / node.routes.length, sy = node.position.y + a.height
  const tx = target.position.x + b.width / 2, ty = target.position.y
  const dy = ty - sy, off = dy >= 0 ? 0.5 * dy : 0.25 * 25 * Math.sqrt(-dy)
  const pts = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, u = 1 - t
    pts.push([u ** 3 * sx + 3 * u * u * t * sx + 3 * u * t * t * tx + t ** 3 * tx,
      u ** 3 * sy + 3 * u * u * t * (sy + off) + 3 * u * t * t * (ty - off) + t ** 3 * ty])
  }
  return { from: node.id, to: target.id, pts }
}
const edgesOf = flow => flow.nodes.flatMap(n => n.routes.flatMap((r, i) => r.target ? [curve(flow, n, i)] : []))
function cross(p, q, r, s) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  return d(p, q, r) * d(p, q, s) < 0 && d(r, s, p) * d(r, s, q) < 0
}
function crossings(flow) {
  const edges = edgesOf(flow); let count = 0
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i].pts, b = edges[j].pts
    for (let x = 0; x + 1 < a.length; x++) for (let y = 0; y + 1 < b.length; y++) if (cross(a[x], a[x + 1], b[y], b[y + 1])) count++
  }
  return count
}
function throughBoxes(flow) {
  const hits = []
  for (const e of edgesOf(flow)) for (const n of flow.nodes) {
    if (n.id === e.from || n.id === e.to) continue
    const s = estimatedNodeSize(n, n.id === flow.entry_id)
    if (e.pts.some(([x, y]) => x > n.position.x - 10 && x < n.position.x + s.width + 10 && y > n.position.y && y < n.position.y + s.height)) hits.push(`${e.from}->${e.to} through ${n.id}`)
  }
  return hits
}
function check(flow) {
  const arranged = arrangeGraph(flow)
  assert.equal(crossings(arranged), 0)
  assert.deepEqual(throughBoxes(arranged), [])
  return arranged
}

test('a branch whose first route is listed second does not cross (screenshot 1)', () => {
  // Node order puts the fallback's target first; the canvas draws route 0 on the left.
  check({ version: 2, entry_id: 'existing', nodes: [
    q('existing', ['name_agent', 'event_type']), q('event_type', ['dates']), q('name_agent', ['notes']),
    q('dates', [null]), q('notes', [null]),
  ] })
})

test('a route that skips a question never runs through it (screenshot 2)', () => {
  const flow = check({ version: 2, entry_id: 'dates', nodes: [
    q('dates', ['alternates']), q('alternates', ['which', 'headcount']), q('which', ['headcount']), q('headcount', ['budget']), q('budget', [null]),
  ] })
  const x = id => flow.nodes.find(n => n.id === id).position.x
  assert.ok(x('which') < x('alternates'), 'the detour sits beside the straight path')
})

test('templates and wider branching arrange cleanly', () => {
  check(exampleGraph())
  check({ version: 2, entry_id: 'a', nodes: [
    q('a', ['b', 'c', 'd']), q('b', ['e']), q('c', ['e', 'f']), q('d', ['f']), q('e', ['g']), q('f', ['g']), q('g', [null]),
  ] })
})

test('arranging an invalid draft with a loop or an orphan still terminates', () => {
  const flow = arrangeGraph({ version: 2, entry_id: 'a', nodes: [q('a', ['b']), q('b', ['a']), q('orphan', [null])] })
  assert.ok(flow.nodes.every(n => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)))
})
