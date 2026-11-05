import test from 'node:test'
import assert from 'node:assert/strict'
import { LEAD_CREATION_CAVEAT, leadBadgeLabel, leadCanRetry, leadReasonText } from '../lib/lead-delivery-labels.ts'

const statuses = ['pending', 'sending', 'submitted', 'failed', 'gave_up', 'needs_review', 'skipped']

test('no state ever claims a lead was created or accepted', () => {
  for (const status of statuses) {
    const label = leadBadgeLabel({ status, provider_label: 'Salesforce' }) ?? ''
    assert.doesNotMatch(label, /created|accepted|delivered/i)
  }
  assert.equal(leadBadgeLabel({ status: 'submitted', provider_label: 'Salesforce' }), 'Submitted to Salesforce')
  assert.match(LEAD_CREATION_CAVEAT, /not confirmed/)
})

test('skipped has no list badge', () => {
  assert.equal(leadBadgeLabel({ status: 'skipped', provider_label: 'Salesforce' }), null)
})

test('labels come from the delivery\'s own provider, not a fixed name', () => {
  assert.equal(leadBadgeLabel({ status: 'sending', provider_label: 'Other CRM' }), 'Sending to Other CRM')
})

test('an unknown reason shows nothing rather than a raw code', () => {
  assert.equal(leadReasonText('some_new_code'), null)
  assert.equal(leadReasonText(null), null)
  assert.match(leadReasonText('existing_inquiry'), /existing inquiry/)
})

test('only unfinished states can be retried', () => {
  assert.deepEqual(statuses.filter(leadCanRetry), ['failed', 'gave_up', 'needs_review'])
})
