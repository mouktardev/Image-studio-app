#!/usr/bin/env bun
import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const packageJsonPath = join(process.cwd(), 'package.json')

function getVersion(): string {
  const content = readFileSync(packageJsonPath, 'utf-8')
  const data = JSON.parse(content)
  return data.version
}

function main() {
  const version = getVersion()
  const tag = `v${version}`

  console.log(`Creating and pushing tag: ${tag}`)

  try {
    execSync(`git tag ${tag}`, { stdio: 'inherit' })
    console.log(`✓ Created tag: ${tag}`)

    execSync(`git push origin ${tag}`, { stdio: 'inherit' })
    console.log(`✓ Pushed tag to origin: ${tag}`)
    console.log(`\nGitHub Actions workflow triggered!`)
    console.log(`Check: https://github.com/${process.env.GITHUB_REPOSITORY || 'your-repo'}/actions`)
  } catch (error) {
    console.error('\n✗ Failed to push tag')
    console.error('Make sure you have committed your version bump first!')
    process.exit(1)
  }
}

main()
