import type { Node } from "@xyflow/react"
import type { SalesGraphFlow, SalesGraphNode } from "./api"

export type SalesCanvasNode = Node<{
  question: SalesGraphNode
  start: boolean
  unreachable: boolean
}, "question">

// Script edits must retain React Flow's measured dimensions and drag state.
// Dropping measured on a controlled node resets its handles and initialization.
export function reconcileSalesCanvasNodes(
  graph: SalesGraphFlow,
  selected: string | null,
  previous: SalesCanvasNode[],
): SalesCanvasNode[] {
  const byId = new Map(previous.map(node => [node.id, node]))
  const questions = new Map(graph.nodes.map(node => [node.id, node]))
  const reachable = new Set<string>()
  const pending = graph.entry_id ? [graph.entry_id] : []
  while (pending.length) {
    const id = pending.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    questions.get(id)?.routes.forEach(route => {
      if (route.target) pending.push(route.target)
    })
  }
  return graph.nodes.map(question => ({
    ...byId.get(question.id),
    id: question.id,
    type: "question",
    position: question.position,
    selected: question.id === selected,
    data: { question, start: question.id === graph.entry_id, unreachable: !reachable.has(question.id) },
  }))
}
