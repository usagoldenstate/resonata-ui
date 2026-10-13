import type { SalesGraphFlow, SalesGraphNode } from "@/lib/api"

export const answerFields = {
  custom: "Custom variable only", event_type: "Event type", event_dates_text: "Event dates",
  dates_flexible: "Flexible dates", headcount_text: "Party size", needs_guest_rooms: "Guest rooms needed",
  caller_name: "Caller name", callback_phone: "Callback number", email: "Email address",
  budget_text: "Budget", notes: "Notes",
}

export function validateGraph(flow: SalesGraphFlow): string[] {
  const errors: string[] = []
  const nodes = new Map(flow.nodes.map(n => [n.id, n]))
  if (flow.nodes.length > 60) errors.push("Use up to 60 nodes.")
  if (!nodes.size) return flow.entry_id ? ["Choose a valid starting question."] : []
  if (!flow.entry_id || !nodes.has(flow.entry_id)) errors.push("Choose a starting question.")
  const variables = new Set<string>()
  for (const node of flow.nodes) {
    if (!node.text.trim() || [...node.text].length > 300) errors.push("Every question needs text of up to 300 characters.")
    if (!node.variable || !/^[a-z][a-z0-9_]{0,63}$/.test(node.variable) || ["constructor", "prototype", "__proto__"].includes(node.variable)) errors.push("Variable names must start with a lowercase letter and use letters, numbers, or underscores (up to 64 characters).")
    else if (variables.has(node.variable)) errors.push(`The variable “${node.variable}” is used more than once.`)
    if (node.variable) variables.add(node.variable)
    if (node.routes.length < 1 || node.routes.length > 6 || node.routes.filter(r => r.condition === null).length !== 1 || node.routes.at(-1)?.condition !== null) errors.push("Every question needs one fallback route, after its conditional routes (up to six routes total).")
    for (const route of node.routes) {
      if (route.target && !nodes.has(route.target)) errors.push("Reconnect a route that points to a removed question.")
      if (route.condition !== null && (!route.condition.trim() || [...route.condition].length > 300)) errors.push("Describe the meaning of each route condition (up to 300 characters).")
      if (route.answer_from && !nodes.has(route.answer_from)) errors.push("A condition references a removed answer. Choose its source again.")
    }
  }
  const visited = new Set<string>(), active = new Set<string>()
  function walk(id: string) {
    if (active.has(id)) { errors.push("A connection creates a loop. Each path must move forward."); return }
    if (visited.has(id)) return
    visited.add(id); active.add(id)
    nodes.get(id)?.routes.forEach(r => { if (r.target) walk(r.target) })
    active.delete(id)
  }
  if (flow.entry_id) walk(flow.entry_id)
  if (flow.nodes.some(n => !visited.has(n.id))) errors.push("Connect all questions to the starting question, or remove unused questions.")
  if (!errors.some(e => e.includes("loop"))) {
    for (const node of flow.nodes) for (const route of node.routes) {
      if (!route.answer_from || route.answer_from === node.id) continue
      const pending = [route.answer_from], seen = new Set<string>()
      while (pending.length) { const id = pending.pop()!; if (seen.has(id)) continue; seen.add(id); nodes.get(id)?.routes.forEach(r => { if (r.target) pending.push(r.target) }) }
      if (!seen.has(node.id)) errors.push("Conditions can only reference this question or an earlier question on a connected path.")
    }
  }
  return [...new Set(errors)]
}

export function newQuestion(flow: SalesGraphFlow, position = { x: 0, y: 0 }): SalesGraphNode {
  const id = `q_${crypto.randomUUID()}`
  let i = 1
  while (flow.nodes.some(n => n.variable === `answer_${i}`)) i++
  return { id, text: "", variable: `answer_${i}`, field: "custom", position, routes: [{ id: "next", condition: null, target: null, answer_from: null }] }
}

// Layered ("Sugiyama") layout for the conversation canvas:
//   1. layers   — longest path from the starting question, so every edge points down;
//   2. lanes    — an edge that skips layers gets a placeholder ("dummy") in each layer
//                 it crosses, which reserves a gap so the line never runs through a box;
//   3. ordering — barycenter sweeps that respect each question's route ports (left to
//                 right, in route order), keeping the ordering with the fewest crossings;
//   4. x        — iterative weighted averaging toward connected ports, resolved per layer
//                 with an exact ordered least-squares fit, so long lanes stay straight.

export type NodeSize = { width: number; height: number }

const NODE_WIDTH = 290
const LAYER_GAP = 130
const NODE_GAP = 70
const LANE_GAP = 40
const LANE_WIDTH = 40
const LABELED_LANE_WIDTH = 210

export function estimatedNodeSize(node: SalesGraphNode, start: boolean): NodeSize {
  return { width: NODE_WIDTH, height: 165 + 41 * node.routes.length + (start ? 30 : 0) + (node.variable ? 0 : -40) }
}

type Vertex = { id: string; layer: number; width: number; height: number; real: boolean; order: number; x: number }
type Segment = { from: number; to: number; port: number; ports: number; weight: number }

export function arrangeGraph(flow: SalesGraphFlow, sizes?: Map<string, NodeSize>): SalesGraphFlow {
  if (!flow.nodes.length) return flow
  const index = new Map(flow.nodes.map((n, i) => [n.id, i]))
  const edges = flow.nodes.flatMap((node, from) => node.routes.flatMap((route, port) => {
    const to = route.target === null ? undefined : index.get(route.target)
    return to === undefined || to === from ? [] : [{ from, to, port, ports: node.routes.length, labeled: node.routes.length > 1 }]
  }))

  // Drop back edges (only an invalid draft has loops) so layering terminates.
  const entry = flow.entry_id === null ? undefined : index.get(flow.entry_id)
  const roots = [...(entry === undefined ? [] : [entry]), ...flow.nodes.map((_, i) => i)]
  const state = new Array<number>(flow.nodes.length).fill(0)
  const forward = new Set<number>()
  for (const root of roots) {
    if (state[root]) continue
    const stack: [number, number][] = [[root, 0]]
    state[root] = 1
    while (stack.length) {
      const top = stack[stack.length - 1]
      const out = edges.map((e, i) => [e, i] as const).filter(([e]) => e.from === top[0])
      if (top[1] >= out.length) { state[top[0]] = 2; stack.pop(); continue }
      const [edge, edgeIndex] = out[top[1]++]
      if (state[edge.to] === 1) continue
      forward.add(edgeIndex)
      if (!state[edge.to]) { state[edge.to] = 1; stack.push([edge.to, 0]) }
    }
  }
  const dag = edges.filter((_, i) => forward.has(i))

  // Longest-path layers: the reachable flow first, anything disconnected below it.
  const reachable = new Set<number>()
  if (entry !== undefined) {
    const pending = [entry]
    while (pending.length) {
      const id = pending.pop()!
      if (reachable.has(id)) continue
      reachable.add(id)
      dag.forEach(e => { if (e.from === id) pending.push(e.to) })
    }
  }
  const layer = new Array<number>(flow.nodes.length).fill(-1)
  function assignLayers(members: Set<number>, base: number) {
    const indegree = new Map([...members].map(id => [id, 0]))
    const inner = dag.filter(e => members.has(e.from) && members.has(e.to))
    inner.forEach(e => indegree.set(e.to, indegree.get(e.to)! + 1))
    const queue = [...members].filter(id => !indegree.get(id))
    queue.forEach(id => { layer[id] = base })
    while (queue.length) {
      const id = queue.shift()!
      for (const e of inner) {
        if (e.from !== id) continue
        layer[e.to] = Math.max(layer[e.to], layer[id] + 1)
        indegree.set(e.to, indegree.get(e.to)! - 1)
        if (!indegree.get(e.to)) queue.push(e.to)
      }
    }
  }
  assignLayers(reachable, 0)
  const rest = new Set(flow.nodes.map((_, i) => i).filter(i => !reachable.has(i)))
  if (rest.size) assignLayers(rest, reachable.size ? Math.max(...[...reachable].map(i => layer[i])) + 1 : 0)

  // Real vertices first (same index as flow.nodes), then one dummy per crossed layer.
  const vertices: Vertex[] = flow.nodes.map((node, i) => {
    const size = sizes?.get(node.id) ?? estimatedNodeSize(node, i === entry)
    return { id: node.id, layer: layer[i], width: size.width, height: size.height, real: true, order: 0, x: 0 }
  })
  const segments: Segment[] = []
  for (const e of dag) {
    if (layer[e.to] <= layer[e.from]) continue
    let from = e.from, port = e.port, ports = e.ports
    for (let l = layer[e.from] + 1; l < layer[e.to]; l++) {
      const dummy = vertices.push({ id: "", layer: l, width: e.labeled ? LABELED_LANE_WIDTH : LANE_WIDTH, height: 0, real: false, order: 0, x: 0 }) - 1
      segments.push({ from, to: dummy, port, ports, weight: vertices[from].real ? 2 : 8 })
      from = dummy; port = 0; ports = 1
    }
    segments.push({ from, to: e.to, port, ports, weight: vertices[from].real ? 1 : 2 })
  }
  const down = vertices.map(() => [] as Segment[]), up = vertices.map(() => [] as Segment[])
  segments.forEach(s => { down[s.from].push(s); up[s.to].push(s) })
  down.forEach(list => list.sort((a, b) => a.port - b.port))

  // Initial order: depth-first in route order, so the first route's subtree sits left.
  const depth = Math.max(...vertices.map(v => v.layer)) + 1
  let layers: number[][] = Array.from({ length: depth }, () => [])
  const placed = new Set<number>()
  function visit(v: number) {
    if (placed.has(v)) return
    placed.add(v); layers[vertices[v].layer].push(v)
    down[v].forEach(s => visit(s.to))
  }
  roots.forEach(visit)
  vertices.forEach((_, v) => visit(v))

  const portShift = (s: Segment) => ((s.port + 0.5) / s.ports - 0.5) * 0.9
  const setOrder = () => layers.forEach(list => list.forEach((v, i) => { vertices[v].order = i }))
  function crossings() {
    let total = 0
    for (let l = 0; l + 1 < depth; l++) {
      const between = layers[l].flatMap(v => down[v])
      for (let i = 0; i < between.length; i++) for (let j = i + 1; j < between.length; j++) {
        const a = between[i], b = between[j]
        const top = vertices[a.from].order + portShift(a) - vertices[b.from].order - portShift(b)
        const bottom = vertices[a.to].order - vertices[b.to].order
        if (top * bottom < 0) total++
      }
    }
    return total
  }
  setOrder()
  let best = layers.map(list => [...list]), fewest = crossings()
  for (let sweep = 0; sweep < 24 && fewest > 0; sweep++) {
    const downward = sweep % 2 === 0
    for (let step = 1; step < depth; step++) {
      const l = downward ? step : depth - 1 - step
      const key = new Map(layers[l].map(v => {
        const links = downward ? up[v] : down[v]
        if (!links.length) return [v, vertices[v].order]
        const sum = links.reduce((total, s) => total + (downward ? vertices[s.from].order + portShift(s) : vertices[s.to].order - portShift(s)), 0)
        return [v, sum / links.length]
      }))
      layers[l].sort((a, b) => key.get(a)! - key.get(b)! || vertices[a].order - vertices[b].order)
      layers[l].forEach((v, i) => { vertices[v].order = i })
    }
    const count = crossings()
    if (count < fewest) { fewest = count; best = layers.map(list => [...list]) }
  }
  layers = best
  setOrder()

  // Horizontal positions.
  const gapBetween = (a: Vertex, b: Vertex) => (a.width + b.width) / 2 + (a.real && b.real ? NODE_GAP : LANE_GAP)
  const portX = (s: Segment) => vertices[s.from].x + (vertices[s.from].real ? ((s.port + 0.5) / s.ports - 0.5) * vertices[s.from].width : 0)
  function place(list: number[], desired: number[], weights: number[]) {
    // Ordered weighted least squares (pool-adjacent-violators) on x minus cumulative spacing.
    const offsets = [0]
    for (let i = 1; i < list.length; i++) offsets.push(offsets[i - 1] + gapBetween(vertices[list[i - 1]], vertices[list[i]]))
    const blocks: { value: number; weight: number; count: number }[] = []
    list.forEach((_, i) => {
      blocks.push({ value: desired[i] - offsets[i], weight: weights[i], count: 1 })
      while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
        const b = blocks.pop()!, a = blocks.pop()!
        const weight = a.weight + b.weight
        blocks.push({ value: (a.value * a.weight + b.value * b.weight) / weight, weight, count: a.count + b.count })
      }
    })
    let i = 0
    for (const block of blocks) for (let k = 0; k < block.count; k++, i++) vertices[list[i]].x = block.value + offsets[i]
  }
  layers.forEach(list => place(list, list.map(() => 0), list.map(() => 1)))
  for (let iteration = 0; iteration < 40; iteration++) {
    const order = iteration % 2 === 0 ? layers : [...layers].reverse()
    for (const list of order) {
      const desired: number[] = [], weights: number[] = []
      for (const v of list) {
        let sum = 0, weight = 0
        for (const s of up[v]) { sum += portX(s) * s.weight; weight += s.weight }
        for (const s of down[v]) { sum += (vertices[s.to].x - (portX(s) - vertices[v].x)) * s.weight; weight += s.weight }
        desired.push(weight ? sum / weight : vertices[v].x)
        weights.push(Math.max(weight, 1))
      }
      place(list, desired, weights)
    }
  }

  const origin = entry === undefined ? 0 : vertices[entry].x
  const tops: number[] = []
  for (let l = 0, y = 0; l < depth; l++) {
    tops.push(y)
    y += Math.max(0, ...layers[l].map(v => vertices[v].height)) + LAYER_GAP
  }
  return { ...flow, nodes: flow.nodes.map((node, i) => ({
    ...node,
    position: { x: Math.round(vertices[i].x - origin - vertices[i].width / 2), y: tops[vertices[i].layer] },
  })) }
}

export function exampleGraph(): SalesGraphFlow {
  const question = (id: string, text: string, field: SalesGraphNode["field"], target: string | null): SalesGraphNode => ({id, text, variable:id, field, position:{x:0,y:0},routes:[{id:"next",condition:null,target,answer_from:null}]})
  const entry = question("existing_inquiry", "Are you calling about an existing sales inquiry?", "custom", "new_event_type")
  entry.routes.unshift({id:"existing",condition:"They are following up on an inquiry they already made",target:"inquiry_reference",answer_from:null})
  return arrangeGraph({version:2,entry_id:entry.id,nodes:[entry,
    question("inquiry_reference", "Do you have a reference number or the name on the inquiry?", "custom", "follow_up_reason"),
    question("follow_up_reason", "What would you like me to pass along about your existing inquiry?", "notes", null),
    question("new_event_type", "What kind of event are you planning?", "event_type", "preferred_dates"),
    question("preferred_dates", "What dates do you have in mind?", "event_dates_text", "new_inquiry_callback"),
    question("new_inquiry_callback", "What's the best number for a call back?", "callback_phone", null),
  ]})
}
