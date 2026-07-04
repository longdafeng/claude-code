import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearPermissionStateForTests,
  consumePendingPermission,
  extractPermissionReply,
  getActivePermissionChat,
  savePendingPermission,
  setActivePermissionChat,
} from '../server.js'

afterEach(() => {
  clearPermissionStateForTests()
})

describe('extractPermissionReply', () => {
  test('detects "yes" reply', () => {
    const result = extractPermissionReply('yes abcde')
    expect(result).toEqual({ requestId: 'abcde', behavior: 'allow' })
  })

  test('detects "y" reply', () => {
    const result = extractPermissionReply('y xyzab')
    expect(result).toEqual({ requestId: 'xyzab', behavior: 'allow' })
  })

  test('detects "no" reply', () => {
    const result = extractPermissionReply('no fghij')
    expect(result).toEqual({ requestId: 'fghij', behavior: 'deny' })
  })

  test('detects "n" reply', () => {
    // Note: pattern uses [a-km-z] (excludes 'l'), so use 'kmnop' not 'klmno'
    const result = extractPermissionReply('n kmnop')
    expect(result).toEqual({ requestId: 'kmnop', behavior: 'deny' })
  })

  test('case insensitive', () => {
    const result = extractPermissionReply('YES ABCDE')
    expect(result).toEqual({ requestId: 'abcde', behavior: 'allow' })
  })

  test('handles leading and trailing whitespace', () => {
    const result = extractPermissionReply('   yes abcde  ')
    expect(result).toEqual({ requestId: 'abcde', behavior: 'allow' })
  })

  test('returns null for non-matching text', () => {
    expect(extractPermissionReply('hello world')).toBeNull()
    expect(extractPermissionReply('')).toBeNull()
    expect(extractPermissionReply('yes')).toBeNull()
    expect(extractPermissionReply('abcde')).toBeNull()
  })

  test('returns null for text with extra content after', () => {
    expect(extractPermissionReply('yes abcde extra')).toBeNull()
  })

  test('returns null for text with prefix before', () => {
    expect(extractPermissionReply('prefix yes abcde')).toBeNull()
  })

  test('returns null for ID containing letter l', () => {
    // The pattern [a-km-z] intentionally excludes 'l' to avoid visual ambiguity
    expect(extractPermissionReply('yes albcd')).toBeNull()
  })
})

describe('permission state', () => {
  test('tracks active permission chat', () => {
    setActivePermissionChat('user-1', 'ctx-1')
    expect(getActivePermissionChat()).toEqual({
      chatId: 'user-1',
      contextToken: 'ctx-1',
    })
  })

  test('getActivePermissionChat returns null initially', () => {
    expect(getActivePermissionChat()).toBeNull()
  })

  test('savePendingPermission and consumePendingPermission', () => {
    savePendingPermission('abcde', 'user-1')

    // Wrong user ID should fail
    expect(consumePendingPermission('abcde', 'user-2')).toBeNull()

    // Correct user ID should succeed
    const result = consumePendingPermission('abcde', 'user-1')
    expect(result).toEqual({
      request_id: 'abcde',
      chatId: 'user-1',
    })

    // Consumed — should be null now
    expect(consumePendingPermission('abcde', 'user-1')).toBeNull()
  })

  test('consumePendingPermission is case-sensitive on request ID', () => {
    savePendingPermission('abcde', 'user-1')
    // Different case should not match
    expect(consumePendingPermission('ABCDE', 'user-1')).toBeNull()
    // Original case should match
    expect(consumePendingPermission('abcde', 'user-1')).not.toBeNull()
  })

  test('clearPermissionStateForTests resets all state', () => {
    setActivePermissionChat('user-1')
    savePendingPermission('abcde', 'user-1')

    clearPermissionStateForTests()

    expect(getActivePermissionChat()).toBeNull()
    expect(consumePendingPermission('abcde', 'user-1')).toBeNull()
  })

  test('setActivePermissionChat overwrites previous value', () => {
    setActivePermissionChat('user-1', 'ctx-1')
    setActivePermissionChat('user-2', 'ctx-2')
    expect(getActivePermissionChat()).toEqual({
      chatId: 'user-2',
      contextToken: 'ctx-2',
    })
  })

  test('multiple pending permissions tracked independently', () => {
    savePendingPermission('abcde', 'user-1')
    savePendingPermission('fghij', 'user-2')

    expect(consumePendingPermission('fghij', 'user-2')).toEqual({
      request_id: 'fghij',
      chatId: 'user-2',
    })
    expect(consumePendingPermission('abcde', 'user-1')).toEqual({
      request_id: 'abcde',
      chatId: 'user-1',
    })
  })
})
