import console from 'node:console'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function argument(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

function parseChangedLines(diff) {
  const changed = new Map()
  let file = null

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6)
      if (!changed.has(file)) changed.set(file, new Set())
      continue
    }

    if (!file || !line.startsWith('@@')) continue
    const match = /\+(\d+)(?:,(\d+))?/.exec(line)
    if (!match) continue

    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    for (let offset = 0; offset < count; offset += 1) {
      changed.get(file).add(start + offset)
    }
  }

  return changed
}

function parseLcov(lcovPath) {
  const packageRoot = dirname(dirname(resolve(root, lcovPath)))
  const coverage = new Map()
  let file = null

  for (const line of readFileSync(resolve(root, lcovPath), 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      const source = line.slice(3)
      const absoluteSource = resolve(packageRoot, source)
      file = relative(root, absoluteSource).split(sep).join('/')
      if (!coverage.has(file)) {
        coverage.set(file, createFileCoverage())
      }
      continue
    }

    if (!file) continue
    const fileCoverage = coverage.get(file)

    if (line.startsWith('DA:')) {
      addLineCoverage(fileCoverage, line)
    } else if (line.startsWith('BRDA:')) {
      addBranchCoverage(fileCoverage, line)
    }
  }

  return coverage
}

function createFileCoverage() {
  return { lines: new Map(), branches: new Map() }
}

function addLineCoverage(fileCoverage, record) {
  const [lineNumber, hits] = record.slice(3).split(',').map(Number)
  fileCoverage.lines.set(lineNumber, hits)
}

function addBranchCoverage(fileCoverage, record) {
  const [lineNumber, , , taken] = record.slice(5).split(',')
  const branchLine = Number(lineNumber)
  const hits = taken === '-' ? 0 : Number(taken)
  const branchHits = fileCoverage.branches.get(branchLine) ?? []
  branchHits.push(hits)
  fileCoverage.branches.set(branchLine, branchHits)
}

function summarizeCoverage(changedLines, coverage) {
  const summary = {
    executable: 0,
    covered: 0,
    conditions: 0,
    coveredConditions: 0,
    uncovered: [],
    uncoveredConditionLines: new Set(),
  }

  for (const [file, lines] of changedLines) {
    const fileCoverage = coverage.get(file)
    if (!fileCoverage) continue

    for (const line of lines) {
      recordCoverage(summary, file, line, fileCoverage)
    }
  }

  return summary
}

function recordCoverage(summary, file, line, fileCoverage) {
  if (!fileCoverage.lines.has(line)) return

  summary.executable += 1
  if (fileCoverage.lines.get(line) > 0) {
    summary.covered += 1
  } else {
    summary.uncovered.push(`${file}:${line}`)
  }

  const branchHits = fileCoverage.branches.get(line) ?? []
  summary.conditions += branchHits.length
  summary.coveredConditions += branchHits.filter((hits) => hits > 0).length
  if (branchHits.includes(0)) {
    summary.uncoveredConditionLines.add(`${file}:${line}`)
  }
}

const baseLabel = argument('--base-label', process.env.COVERAGE_BASE ?? 'provided diff')
const threshold = Number(argument('--threshold', process.env.COVERAGE_THRESHOLD ?? '80'))
const lcovPaths = [
  'apps/backend/coverage/lcov.info',
  'apps/frontend/coverage/lcov.info',
]

for (const lcovPath of lcovPaths) {
  if (!existsSync(resolve(root, lcovPath))) {
    throw new Error(`Coverage report not found: ${lcovPath}. Run npm run sonar:coverage first.`)
  }
}

const diff = readFileSync(0, 'utf8')
const changedLines = parseChangedLines(diff)
const coverage = new Map(
  lcovPaths.flatMap((lcovPath) => [...parseLcov(lcovPath).entries()]),
)
const summary = summarizeCoverage(changedLines, coverage)
const { executable, covered, conditions, coveredConditions, uncovered, uncoveredConditionLines } =
  summary

if (executable === 0) {
  console.log(`Changed-line coverage: no executable source lines changed since ${baseLabel}.`)
} else {
  const percentage = ((covered + coveredConditions) / (executable + conditions)) * 100
  const details = `${covered}/${executable} lines, ${coveredConditions}/${conditions} conditions`
  console.log(
    `New-code coverage since ${baseLabel}: ${percentage.toFixed(2)}% (${details}).`,
  )

  if (uncovered.length > 0) {
    const uncoveredList = uncovered.map((line) => `  ${line}`).join('\n')
    console.log(`Uncovered changed lines:\n${uncoveredList}`)
  }

  if (uncoveredConditionLines.size > 0) {
    const conditionList = [...uncoveredConditionLines].map((line) => `  ${line}`).join('\n')
    console.log(`Changed lines with uncovered conditions:\n${conditionList}`)
  }

  if (percentage < threshold) {
    console.error(`Coverage gate failed: ${percentage.toFixed(2)}% is below ${threshold}%.`)
    process.exitCode = 1
  }
}
