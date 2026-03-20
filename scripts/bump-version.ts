#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const files = {
  packageJson: join(process.cwd(), 'package.json'),
  cargoToml: join(process.cwd(), 'src-tauri', 'Cargo.toml'),
  tauriConf: join(process.cwd(), 'src-tauri', 'tauri.conf.json'),
}

function readVersion(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')

  if (filePath.endsWith('.json')) {
    const data = JSON.parse(content)
    return data.version
  }

  if (filePath.endsWith('Cargo.toml')) {
    const match = content.match(/^version\s*=\s*"([^"]+)"/m)
    return match ? match[1] : '0.0.0'
  }

  return '0.0.0'
}

function bumpVersion(version: string, type: 'patch' | 'minor' | 'major'): string {
  const [major, minor, patch] = version.split('.').map(Number)

  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  if (type === 'major') return `${major + 1}.0.0`

  return version
}

function updateVersion(filePath: string, newVersion: string) {
  let content = readFileSync(filePath, 'utf-8')

  if (filePath.endsWith('.json')) {
    const data = JSON.parse(content)
    data.version = newVersion
    content = JSON.stringify(data, null, 2) + '\n'
  } else if (filePath.endsWith('Cargo.toml')) {
    content = content.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${newVersion}"`)
  }

  writeFileSync(filePath, content)
}

function main() {
  const args = process.argv.slice(2)

  let newVersion: string | null = null
  let bumpType: 'patch' | 'minor' | 'major' | null = null

  if (args.includes('--patch')) bumpType = 'patch'
  else if (args.includes('--minor')) bumpType = 'minor'
  else if (args.includes('--major')) bumpType = 'major'
  else if (args.length > 0 && !args[0].startsWith('--')) newVersion = args[0]
  else {
    console.error('Usage: bun run bump [--patch|--minor|--major|version]')
    console.error('Examples:')
    console.error('  bun run bump --patch    # 0.1.1 -> 0.1.2')
    console.error('  bun run bump --minor    # 0.1.1 -> 0.2.0')
    console.error('  bun run bump --major    # 0.1.1 -> 1.0.0')
    console.error('  bun run bump 0.2.0      # manual version')
    process.exit(1)
  }

  const currentVersion = readVersion(files.packageJson)

  if (bumpType) {
    newVersion = bumpVersion(currentVersion, bumpType)
  }

  if (!newVersion) {
    console.error('Invalid version')
    process.exit(1)
  }

  console.log(`Bumping version: ${currentVersion} -> ${newVersion}`)

  updateVersion(files.packageJson, newVersion)
  updateVersion(files.cargoToml, newVersion)
  updateVersion(files.tauriConf, newVersion)

  console.log('✓ Version updated in:')
  console.log(`  - package.json`)
  console.log(`  - src-tauri/Cargo.toml`)
  console.log(`  - src-tauri/tauri.conf.json`)
  console.log('\nReview changes in VS Code, then commit and run: bun run push-tag')
}

main()
