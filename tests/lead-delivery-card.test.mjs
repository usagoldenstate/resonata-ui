import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { act, create } from 'react-test-renderer'
import ts from 'typescript'
import { leadReasonText } from '../lib/lead-delivery-labels.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const mounted = []
afterEach(async () => { for (const tree of mounted.splice(0)) await act(async () => tree.unmount()) })
const config = {
  provider: 'salesforce_web_to_lead', enabled: false, org_id: '00Dfm000001szCX',
  lead_source: 'Phone inquiry', extra_fields: [],
}

// Render the real component and React hooks. Stub only its presentation
// primitives and network boundary, so these tests do not need Clerk or a server.
function loadCard(api) {
  const filename = fileURLToPath(new URL('../components/lead-delivery-card.tsx', import.meta.url))
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const mod = new Module(filename)
  const primitive = name => ({ children, ...props }) => React.createElement(name, props, children)
  mod.require = id => {
    if (id === '@/lib/api') return { ApiError: class extends Error {}, ...api }
    if (id === '@/lib/lead-delivery-labels') return { leadReasonText }
    if (id === 'sonner') return { toast: { success() {}, error() {} } }
    if (id === 'lucide-react') return new Proxy({}, { get: () => () => null })
    if (id.startsWith('@/components/ui/')) return new Proxy({}, { get: (_, name) => {
      if (name === 'Dialog') return ({ open, children }) => open ? children : null
      return primitive(name === 'Button' ? 'button' : name === 'Input' ? 'input' : name === 'Switch' ? 'switch' : 'div')
    } })
    return require(id)
  }
  mod._compile(compiled, filename)
  return mod.exports.LeadDeliveryCard
}
const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('')
const button = (tree, label) => tree.root.findAllByType('button').find(node => textOf(node) === label)
const input = (tree, id) => tree.root.findByProps({ id })
async function harness(overrides = {}) {
  let saves = []
  const api = {
    updateHotelPlatformSettings: async (_hotelId, body) => { saves.push(body); return { lead_delivery: body.lead_delivery } },
    fetchLeadDeliveryTestPreview: async () => ({ test_id: 'test-1', destination_fingerprint: 'f'.repeat(64), fields: {} }),
    sendLeadDeliveryTest: async () => ({ status: 'submitted' }),
    ...overrides,
  }
  const Card = loadCard(api)
  let tree
  let props = { hotelId: 'h1', saved: structuredClone(config), onSaved: detail => {
    props = { ...props, saved: detail.lead_delivery }
    tree.update(React.createElement(Card, props))
  } }
  await act(async () => { tree = create(React.createElement(Card, props)) })
  mounted.push(tree)
  return { tree, saves, update: async next => {
    props = { ...props, ...next }
    await act(async () => tree.update(React.createElement(Card, props)))
  } }
}

test('unrelated refresh preserves unsaved fields; own save persists and clears draft', async () => {
  const { tree, update, saves } = await harness()
  await act(async () => input(tree, 'leadDeliverySource').props.onChange({ target: { value: 'Events' } }))
  await update({ saved: structuredClone(config) })
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'Events')
  assert.equal(button(tree, 'Save lead delivery').props.disabled, false)
  await act(async () => button(tree, 'Save lead delivery').props.onClick())
  assert.equal(saves.length, 1)
  assert.equal(saves[0].lead_delivery.lead_source, 'Events')
  assert.equal(button(tree, 'Save lead delivery').props.disabled, true)
})

test('changed server settings preserve dirty edits until explicit conflict resolution', async () => {
  const { tree, update } = await harness()
  await act(async () => input(tree, 'leadDeliverySource').props.onChange({ target: { value: 'My draft' } }))
  await update({ saved: { ...config, lead_source: 'Other admin' } })
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'My draft')
  assert.equal(button(tree, 'Save lead delivery').props.disabled, true)
  await act(async () => button(tree, 'Keep my edits').props.onClick())
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'My draft')
  assert.equal(button(tree, 'Save lead delivery').props.disabled, false)
  await update({ saved: { ...config, lead_source: 'Latest server value' } })
  await act(async () => button(tree, 'Load saved settings').props.onClick())
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'Latest server value')
  assert.equal(button(tree, 'Save lead delivery').props.disabled, true)
})

test('clean form adopts server updates and a hotel switch discards the previous hotel draft', async () => {
  const { tree, update } = await harness()
  await update({ saved: { ...config, lead_source: 'Updated' } })
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'Updated')
  await act(async () => input(tree, 'leadDeliverySource').props.onChange({ target: { value: 'Local draft' } }))
  await update({ hotelId: 'h2', saved: { ...config, lead_source: 'Second hotel' } })
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'Second hotel')
})

test('two handler invocations while a test is in flight send only one request', async () => {
  let resolve
  let sends = 0
  const pending = new Promise(done => { resolve = done })
  const { tree } = await harness({ sendLeadDeliveryTest: () => { sends++; return pending } })
  await act(async () => button(tree, 'Preview test lead').props.onClick())
  const send = button(tree, 'Send test lead').props.onClick
  await act(async () => { send(); send() })
  assert.equal(sends, 1)
  assert.equal(button(tree, 'Send test lead').props.disabled, true)
  await act(async () => { resolve({ status: 'submitted' }); await pending })
  assert.equal(button(tree, 'Send test lead'), undefined)
  // The guard releases after completion; a deliberate new test is permitted.
  await act(async () => button(tree, 'Preview test lead').props.onClick())
  await act(async () => button(tree, 'Send test lead').props.onClick())
  assert.equal(sends, 2)
})

test('failed test releases the guard so a new preview can be requested', async () => {
  let previews = 0
  const { tree } = await harness({
    fetchLeadDeliveryTestPreview: async () => { previews++; return { test_id: 'x', destination_fingerprint: 'f'.repeat(64), fields: {} } },
    sendLeadDeliveryTest: async () => { throw new Error('Network unavailable') },
  })
  await act(async () => button(tree, 'Preview test lead').props.onClick())
  await act(async () => button(tree, 'Send test lead').props.onClick())
  await act(async () => button(tree, 'Preview test lead').props.onClick())
  assert.equal(previews, 2)
})


test('an old hotel save finishing after a hotel switch cannot overwrite the new hotel', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { tree, update } = await harness({ updateHotelPlatformSettings: () => pending })
  await act(async () => input(tree, 'leadDeliverySource').props.onChange({ target: { value: 'Old hotel draft' } }))
  await act(async () => button(tree, 'Save lead delivery').props.onClick())
  await update({ hotelId: 'h2', saved: { ...config, lead_source: 'Second hotel' } })
  await act(async () => { resolve({ lead_delivery: { ...config, lead_source: 'Old hotel draft' } }); await pending })
  assert.equal(input(tree, 'leadDeliverySource').props.value, 'Second hotel')
})
