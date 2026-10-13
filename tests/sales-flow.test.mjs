import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeGraph, exampleGraph, newQuestion, validateGraph } from '../lib/sales-flow.ts'

test('existing and new inquiry paths are disjoint and end independently', () => {
  const flow = exampleGraph()
  assert.deepEqual(validateGraph(flow), [])
  const entry = flow.nodes.find(n => n.id === flow.entry_id)
  function path(route) {
    const visited = []
    let next = route.target
    while (next) {
      visited.push(next)
      next = flow.nodes.find(n => n.id === next).routes[0].target
    }
    return visited
  }
  assert.deepEqual(path(entry.routes[0]), ['inquiry_reference', 'follow_up_reason'])
  assert.deepEqual(path(entry.routes[1]), ['new_event_type', 'preferred_dates', 'new_inquiry_callback'])
})

test('loops, disconnected questions and duplicate variables cannot be saved', () => {
  const flow = exampleGraph()
  flow.nodes[1].routes[0].target = flow.entry_id
  assert.ok(validateGraph(flow).some(e => e.includes('loop')))
  const orphan = exampleGraph()
  orphan.nodes.push({...newQuestion(orphan), text:'Who is the contact?'})
  assert.ok(validateGraph(orphan).some(e => e.includes('Connect all')))
  const duplicate = exampleGraph()
  duplicate.nodes[1].variable = duplicate.nodes[0].variable
  assert.ok(validateGraph(duplicate).some(e => e.includes('more than once')))
})

test('natural-language routes require text and a fallback', () => {
  const flow = exampleGraph()
  flow.nodes[0].routes[0].condition = '   '
  assert.ok(validateGraph(flow).some(e => e.includes('Describe the meaning')))
  flow.nodes[0].routes.pop()
  assert.ok(validateGraph(flow).some(e => e.includes('fallback')))
})

test('layout preserves routes and answer variables', () => {
  const original = exampleGraph()
  const result = arrangeGraph(original)
  assert.deepEqual(result.nodes.map(({position,...n}) => n), original.nodes.map(({position,...n}) => n))
  assert.ok(result.nodes.every(n => Number.isFinite(n.position.x) && Number.isFinite(n.position.y)))
})

test('new question variable is unique and an empty graph is valid', () => {
  const flow = exampleGraph()
  flow.nodes[0].variable = 'answer_1'
  assert.equal(newQuestion(flow).variable, 'answer_2')
  assert.deepEqual(validateGraph({version:2,entry_id:null,nodes:[]}), [])
})
