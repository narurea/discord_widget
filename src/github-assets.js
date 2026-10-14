// Publishes the banner to a dedicated branch so Discord can load it from raw.githubusercontent.com.
// The branch is force-updated to a single parentless commit, so it never accumulates history.
const API = 'https://api.github.com';

async function github(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'valorant-store-discord-widget',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

async function githubJson(token, method, path, body) {
  const response = await github(token, method, path, body);
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub ${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function publishToBranch({ repository, token, branch, fileName, content }) {
  const blob = await githubJson(token, 'POST', `/repos/${repository}/git/blobs`, {
    content: content.toString('base64'),
    encoding: 'base64',
  });
  const tree = await githubJson(token, 'POST', `/repos/${repository}/git/trees`, {
    tree: [{ path: fileName, mode: '100644', type: 'blob', sha: blob.sha }],
  });
  const commit = await githubJson(token, 'POST', `/repos/${repository}/git/commits`, {
    message: `Update store banner (${fileName})`,
    tree: tree.sha,
    parents: [],
  });

  const update = await github(token, 'PATCH', `/repos/${repository}/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: true,
  });
  if (!update.ok) {
    // The branch does not exist yet on the first run.
    await githubJson(token, 'POST', `/repos/${repository}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    });
  }

  return `https://raw.githubusercontent.com/${repository}/${branch}/${fileName}`;
}
