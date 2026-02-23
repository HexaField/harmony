#!/usr/bin/env node
// @harmony/cli-app — CLI entrypoint
// Uses tsx for TypeScript execution at runtime
import { createProgram } from '../src/program.ts'

const program = createProgram()
program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
