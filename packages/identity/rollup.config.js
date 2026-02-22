import typescript from '@rollup/plugin-typescript'

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript({
      exclude: ['**/*.test.ts']
    })
  ],
  external: [/^@harmony\//, /^@noble\//, /^@scure\//, /^discord\.js/, /^express/, /^zod/, /^cors/, /^dotenv/]
}
