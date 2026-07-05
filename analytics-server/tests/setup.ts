// Environment mocks for Node.js test runner
(globalThis as any).Image = class {
  src = ''
}

;(globalThis as any).performance = {
  now: () => Date.now(),
}
