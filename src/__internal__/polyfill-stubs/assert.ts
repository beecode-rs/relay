class AssertionError extends Error {
  actual: unknown
  expected: unknown
  operator: string

  constructor(options: { actual?: unknown; expected?: unknown; message?: string; operator?: string }) {
    super(options.message ?? 'Assertion failed')
    this.name = 'AssertionError'
    this.actual = options.actual
    this.expected = options.expected
    this.operator = options.operator ?? 'fail'
  }
}

const ok = (value: unknown, message?: string): void => {
  if (!value) {
    throw new AssertionError({ message, operator: 'ok' })
  }
}

const equal = (actual: unknown, expected: unknown, message?: string): void => {
  // eslint-disable-next-line eqeqeq -- node assert.equal is loose equality by contract
  if (actual != expected) {
    throw new AssertionError({ actual, expected, message, operator: '==' })
  }
}

const notEqual = (actual: unknown, expected: unknown, message?: string): void => {
  // eslint-disable-next-line eqeqeq -- node assert.notEqual is loose equality by contract
  if (actual == expected) {
    throw new AssertionError({ actual, expected, message, operator: '!=' })
  }
}

const strictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (actual !== expected) {
    throw new AssertionError({ actual, expected, message, operator: '===' })
  }
}

const notStrictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (actual === expected) {
    throw new AssertionError({ actual, expected, message, operator: '!==' })
  }
}

const fail = (message?: string): void => {
  throw new AssertionError({ message, operator: 'fail' })
}

const ifError = (err: unknown): void => {
  if (err) {
    throw err as Error
  }
}

const captureError = (fn: () => void): unknown => {
  try {
    fn()

    return undefined
  } catch (error) {
    return error
  }
}

const throws = (fn: () => void, message?: string): void => {
  if (captureError(fn) === undefined) {
    throw new AssertionError({ message, operator: 'throws' })
  }
}

const doesNotThrow = (fn: () => void, message?: string): void => {
  const error = captureError(fn)
  if (error !== undefined) {
    throw new AssertionError({ message, operator: 'doesNotThrow' })
  }
}

const assert = Object.assign(ok, {
  AssertionError,
  doesNotThrow,
  equal,
  fail,
  ifError,
  notEqual,
  notStrictEqual,
  ok,
  strictEqual,
  throws,
})

module.exports = assert
