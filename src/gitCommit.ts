import { simpleGit } from 'simple-git'
import { execSync } from 'child_process'

export async function ensureBranch(repoPath: string, branch: string): Promise<void> {
  const git = simpleGit(repoPath)
  const branches = await git.branchLocal()
  if (!branches.all.includes(branch)) {
    // Branch cannot be created without an initial commit
    const status = await git.status()
    if (status.files.length === 0) {
      await git.commit('initial', { '--allow-empty': null })
    }
    await git.checkoutLocalBranch(branch)
  } else {
    await git.checkout(branch)
  }
}

export type CommitType = 'bootstrap' | 'reforma' | 'nueva' | 'derogacion'

interface CommitOptions {
  repoPath: string
  filePath: string
  content: string
  commitType: CommitType
  title: string
  authorDate: string
  sourceId: string   // law_revision_id
  normId: string     // law_id
}

const COMMITTER_NAME = 'Legalize'
const COMMITTER_EMAIL = 'legalize@legalize.dev'

function buildCommitMessage(commitType: CommitType, title: string, sourceId: string, normId: string): string {
  return `[${commitType}] ${title}\n\nSource-Id: ${sourceId}\nSource-Date: ${sourceId.split('_')[1] ?? ''}\nNorm-Id: ${normId}`
}

function resolveDate(authorDate: string): string {
  const date = new Date(authorDate.length === 10 ? `${authorDate}T00:00:00Z` : authorDate)
  const year = date.getFullYear()
  return year >= 1970 && year < 2100 ? date.toISOString() : new Date().toISOString()
}

export async function commitRevision(opts: CommitOptions): Promise<void> {
  const { repoPath, filePath, content, commitType, title, authorDate, sourceId, normId } = opts
  const git = simpleGit(repoPath)
  const fs = await import('fs/promises')
  const path = await import('path')

  const fullPath = path.join(repoPath, filePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf-8')

  await git.add(filePath)

  const useDate = resolveDate(authorDate)
  const message = buildCommitMessage(commitType, title, sourceId, normId)

  const env = {
    GIT_AUTHOR_DATE: useDate,
    GIT_COMMITTER_DATE: useDate,
    GIT_COMMITTER_NAME: COMMITTER_NAME,
    GIT_COMMITTER_EMAIL: COMMITTER_EMAIL,
  }

  await git.env(env).commit(message)
}

export async function createFuturePR(
  repoPath: string,
  baseBranch: string,
  branchName: string,
  filePath: string,
  content: string,
  message: string,
  authorDate: string,
  enforcedAt: string,
): Promise<void> {
  const git = simpleGit(repoPath)
  const fs = await import('fs/promises')
  const path = await import('path')

  // Skip if branch already exists
  const branches = await git.branchLocal()
  if (branches.all.includes(branchName)) return

  // Create new branch from base
  await git.checkout(baseBranch)
  await git.checkoutLocalBranch(branchName)

  const fullPath = path.join(repoPath, filePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf-8')

  await git.add(filePath)

  const date = new Date(authorDate.length === 10 ? `${authorDate}T00:00:00Z` : authorDate)
  const year = date.getFullYear()
  const useDate = year >= 1970 && year < 2100 ? date.toISOString() : new Date().toISOString()
  const env = { GIT_AUTHOR_DATE: useDate, GIT_COMMITTER_DATE: useDate }
  await git.env(env).commit(message)

  // Return to base branch
  await git.checkout(baseBranch)

  // Create GitHub PR (requires gh CLI and remote to be set)
  try {
    execSync(
      `gh pr create --repo $(git -C ${repoPath} remote get-url origin) --base ${baseBranch} --head ${branchName} --title "${message}" --body "Enforced on: ${enforcedAt}"`,
      { stdio: 'pipe' },
    )
  } catch {
    // Silently skip if gh CLI is unavailable or remote is not configured
  }
}
