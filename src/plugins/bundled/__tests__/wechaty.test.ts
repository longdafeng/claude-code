import { describe, expect, test } from 'bun:test'

// MACRO is a build-time define — set it for the test runtime
;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: 'test',
}

import { registerWechatyBuiltinPlugin } from '../wechaty.js'

describe('registerWechatyBuiltinPlugin', () => {
  test('exports a function', () => {
    expect(typeof registerWechatyBuiltinPlugin).toBe('function')
  })

  test('does not throw when called', () => {
    expect(() => registerWechatyBuiltinPlugin()).not.toThrow()
  })
})
