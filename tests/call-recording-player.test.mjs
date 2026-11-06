/* global Blob, URL */
import test, { afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { act, create } from 'react-test-renderer'
import ts from 'typescript'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const mounted = []
afterEach(async () => {
  for (const tree of mounted.splice(0)) await act(async () => tree.unmount())
  mock.timers.reset()
  mock.restoreAll()
})

class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status} for /api/v1/public/sales-recordings/secret-token`)
    this.status = status
    this.body = body
  }
}

// Compile the real player and run it on real SWR; only the API and icons are stubbed.
function loadPlayer() {
  const filename = fileURLToPath(new URL('../components/call-recording-player.tsx', import.meta.url))
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const mod = new Module(filename)
  mod.require = id => {
    if (id === '@/lib/api') return { ApiError, fetchCallRecording: async () => new Blob() }
    if (id === 'lucide-react') return new Proxy({}, { get: () => () => null })
    return require(id)
  }
  mod._compile(compiled, filename)
  return mod.exports
}

const textOf = node => typeof node === 'string' ? node : (node.children ?? []).map(textOf).join('')
const rendered = tree => tree.root.children.map(textOf).join('')
const processing = new ApiError(404, { detail: 'Still processing', reason: 'processing' })
let nextKey = 0

async function play(responses) {
  mock.timers.enable({ apis: ['setTimeout'] })
  const { RecordingPlayer } = loadPlayer()
  const calls = { count: 0 }
  const load = async () => {
    const response = responses[Math.min(calls.count++, responses.length - 1)]
    if (response instanceof Error) throw response
    return response
  }
  let tree
  await act(async () => {
    tree = create(React.createElement(RecordingPlayer, { cacheKey: [`recording-${nextKey++}`], load }))
  })
  mounted.push(tree)
  return { tree, calls }
}

async function advance(ms) {
  await act(async () => {
    mock.timers.tick(ms)
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
}

test('processing, then a 429, then the audio plays with no user action', async () => {
  const { tree, calls } = await play([processing, new ApiError(429, { error: 'Rate limit exceeded' }), new Blob(['audio'])])
  assert.equal(rendered(tree), 'Still processing')

  await advance(10_000)
  assert.equal(calls.count, 2)
  assert.equal(rendered(tree), 'Waiting to retry loading the recording…')
  assert.doesNotMatch(rendered(tree), /secret-token/)

  await advance(60_000)
  assert.equal(calls.count, 3)
  assert.equal(tree.root.findAllByType('audio').length, 1)
})

test('a permanent error stops retrying', async () => {
  const { tree, calls } = await play([new ApiError(404, { detail: 'Gone', reason: 'gone' })])
  await advance(300_000)
  assert.equal(calls.count, 1)
  assert.equal(rendered(tree), 'Gone')
})

test('rate limit delays grow with jitter and stay within 60 seconds', () => {
  const { rateLimitRetryDelay } = loadPlayer()
  mock.method(Math, 'random', () => 0)
  assert.equal(rateLimitRetryDelay(1), 5_000)
  assert.equal(rateLimitRetryDelay(20), 30_000)
  mock.method(Math, 'random', () => 0.999999)
  assert.ok(rateLimitRetryDelay(1) <= 10_000)
  assert.ok(rateLimitRetryDelay(20) <= 60_000)
})
